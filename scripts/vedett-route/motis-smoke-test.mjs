// Valós routing smoke teszt a helyben futó MOTIS ellen.
//
// Futtatás (a te Windows géped PowerShell-jéből, a MOTIS konténer futása
// közben):
//   node scripts/vedett-route/motis-smoke-test.mjs
//
// Eredmény: motis-data/reports/smoke-test-result.json és .md — ezeket a
// Claude olvassa vissza, hogy a MOTIS_GO_LIVE_REPORT.md-be valós adatokat
// írjon. Semmilyen kitalált/becsült eredményt nem tartalmaz — ha egy teszt
// hibázik vagy nem talál útvonalat, az is pontosan úgy kerül a riportba.

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.MOTIS_BASE_URL || "http://localhost:8080";

async function geocode(text) {
  const res = await fetch(`${BASE}/api/v1/geocode?${new URLSearchParams({ text, numResults: "1" })}`);
  if (!res.ok) return null;
  const arr = await res.json();
  return arr[0] ?? null;
}

async function plan(params) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/v6/plan?${new URLSearchParams(params)}`);
  const ms = Date.now() - started;
  if (!res.ok) return { ok: false, status: res.status, ms };
  const data = await res.json();
  return { ok: true, data, ms };
}

const CASES = [
  {
    name: "Egy megálló, azonos vonal (Deák Ferenc tér -> Blaha Lujza tér, M2)",
    from: "Deak Ferenc ter",
    to: "Blaha Lujza ter",
  },
  {
    name: "Hosszabb, átszállásos útvonal (Kelenföld vasútállomás -> Örs vezér tere)",
    from: "Kelenfold vasutallomas",
    to: "Ors vezer tere",
  },
  {
    name: "Metrómentes (BUS/TRAM/RAIL) stratégia ugyanarra a párra",
    from: "Deak Ferenc ter",
    to: "Blaha Lujza ter",
    extraParams: { transitModes: "BUS,TRAM,RAIL" },
  },
  {
    name: "Jövőbeli időpontra tervezés (holnap reggel 8:00)",
    from: "Nyugati palyaudvar",
    to: "Keleti palyaudvar",
    timeOffsetHours: 24,
  },
  {
    name: "Nem létező / feloldhatatlan célpont — graceful hiba várt",
    from: "Deak Ferenc ter",
    to: "Ez a hely biztosan nem letezik xyzxyz 12345",
    expectNoRoute: true,
  },
];

const results = [];

for (const c of CASES) {
  const fromGeo = await geocode(c.from);
  const toGeo = c.expectNoRoute ? null : await geocode(c.to);

  if (!fromGeo || (!toGeo && !c.expectNoRoute)) {
    results.push({ name: c.name, ok: false, note: "Geokódolás sikertelen (nem MOTIS routing hiba)." });
    continue;
  }

  if (c.expectNoRoute) {
    const stillNoTarget = await geocode(c.to);
    results.push({
      name: c.name,
      ok: true,
      note: stillNoTarget ? "A célszöveg váratlanul talált geokódolási találatot." : "Helyesen nem talált feloldható célpontot — nincs kitalált útvonal.",
    });
    continue;
  }

  const time = c.timeOffsetHours
    ? new Date(Date.now() + c.timeOffsetHours * 3600_000).toISOString()
    : undefined;

  const params = {
    fromPlace: fromGeo.id ?? `${fromGeo.lat},${fromGeo.lon}`,
    toPlace: toGeo.id ?? `${toGeo.lat},${toGeo.lon}`,
    ...(time ? { time } : {}),
    ...(c.extraParams ?? {}),
  };

  const planResult = await plan(params);
  if (!planResult.ok) {
    results.push({ name: c.name, ok: false, note: `HTTP ${planResult.status}`, ms: planResult.ms });
    continue;
  }

  const itineraries = planResult.data.itineraries ?? [];
  results.push({
    name: c.name,
    ok: true,
    ms: planResult.ms,
    itineraryCount: itineraries.length,
    firstItinerary: itineraries[0]
      ? {
          durationMinutes: Math.round(itineraries[0].duration / 60),
          transfers: itineraries[0].transfers,
          modes: itineraries[0].legs.map((l) => l.mode),
        }
      : null,
    fromResolved: fromGeo.name,
    toResolved: toGeo?.name,
  });
}

const outDir = path.join(process.cwd(), "motis-data", "reports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "smoke-test-result.json"), JSON.stringify(results, null, 2), "utf-8");

const md = [
  `# MOTIS routing smoke teszt eredménye`,
  ``,
  `Futtatva: ${new Date().toISOString()}`,
  ``,
  ...results.map(
    (r) =>
      `## ${r.name}\n\n- Sikeres: ${r.ok}\n` +
      (r.ms !== undefined ? `- Válaszidő: ${r.ms} ms\n` : "") +
      (r.itineraryCount !== undefined ? `- Talált útvonal-alternatívák: ${r.itineraryCount}\n` : "") +
      (r.firstItinerary
        ? `- Első alternatíva: ${r.firstItinerary.durationMinutes} perc, ${r.firstItinerary.transfers} átszállás, módok: ${r.firstItinerary.modes.join(", ")}\n`
        : "") +
      (r.note ? `- Megjegyzés: ${r.note}\n` : "")
  ),
].join("\n");
fs.writeFileSync(path.join(outDir, "smoke-test-result.md"), md, "utf-8");

console.log(md);
console.log(`\nJSON mentve: ${path.join(outDir, "smoke-test-result.json")}`);
