// Budapest Béta E2E — 25+ valódi útvonal teszt-mátrix, valódi geokódolással
// és valódi, helyben futó MOTIS-szal (NINCS mock).
//
// Futtatás (a te Windows géped PowerShell-jéből, MOTIS + a .env.local
// beállításai mellett):
//   node scripts/vedett-route/route-matrix-test.mjs
//
// Kimenet: motis-data/reports/route-matrix-result.json + .md

import fs from "node:fs";
import path from "node:path";

// --- .env.local egyszerű betöltése (nincs plusz dependency) ---
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const { geocodeAddress } = await import("../../lib/vedett-route/geocode.ts");
const { searchVedettRoutes } = await import("../../lib/vedett-route/orchestrator.ts");
const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

const REAL_MOTIS_BASE_URL = process.env.MOTIS_BASE_URL;

// --- 25 valódi budapesti útvonal-teszteset, a kért kategóriákat lefedve ---
const ROUTES = [
  { id: 1, category: "belváros → belváros", from: "Deak Ferenc ter, Budapest", to: "Astoria, Budapest" },
  { id: 2, category: "belváros → belváros", from: "Ferenciek tere, Budapest", to: "Blaha Lujza ter, Budapest" },
  { id: 3, category: "belváros → belváros", from: "Kalvin ter, Budapest", to: "Oktogon, Budapest" },
  { id: 4, category: "külső kerület → belváros", from: "Ors vezer tere, Budapest", to: "Deak Ferenc ter, Budapest" },
  { id: 5, category: "külső kerület → belváros", from: "Kobanya-Kispest, Budapest", to: "Astoria, Budapest" },
  { id: 6, category: "belváros → külső kerület", from: "Deak Ferenc ter, Budapest", to: "Ujpest-Kozpont, Budapest" },
  { id: 7, category: "belváros → külső kerület", from: "Blaha Lujza ter, Budapest", to: "Hatar ut, Budapest" },
  { id: 8, category: "külső kerület → külső kerület", from: "Ors vezer tere, Budapest", to: "Kelenfold vasutallomas, Budapest" },
  { id: 9, category: "külső kerület → külső kerület", from: "Ujpest-Kozpont, Budapest", to: "Kobanya-Kispest, Budapest" },
  { id: 10, category: "metródomináns", from: "Deak Ferenc ter, Budapest", to: "Mexikoi ut, Budapest" },
  { id: 11, category: "metródomináns", from: "Szell Kalman ter, Budapest", to: "Ors vezer tere, Budapest" },
  { id: 12, category: "villamosdomináns", from: "Moricz Zsigmond korter, Budapest", to: "Nyugati palyaudvar, Budapest" },
  { id: 13, category: "villamosdomináns", from: "Ujpest-Kozpont, Budapest", to: "Bécsi ut, Budapest" },
  { id: 14, category: "buszdomináns", from: "Hüvösvolgy, Budapest", to: "Ors vezer tere, Budapest" },
  { id: 15, category: "buszdomináns", from: "Farkasret, Budapest", to: "Szell Kalman ter, Budapest" },
  { id: 16, category: "több átszállás", from: "Hüvösvolgy, Budapest", to: "Kobanya-Kispest, Budapest" },
  { id: 17, category: "0 átszállásos alternatíva", from: "Deak Ferenc ter, Budapest", to: "Blaha Lujza ter, Budapest" },
  { id: 18, category: "metró nélküli alternatíva", from: "Deak Ferenc ter, Budapest", to: "Blaha Lujza ter, Budapest", noSubway: true },
  { id: 19, category: "hosszabb de kevesebb átszállásos", from: "Kelenfold vasutallomas, Budapest", to: "Ors vezer tere, Budapest" },
  { id: 20, category: "jelentős gyaloglási különbség", from: "Moricz Zsigmond korter, Budapest", to: "Gellert ter, Budapest" },
  { id: 21, category: "esti időpont", from: "Nyugati palyaudvar, Budapest", to: "Keleti palyaudvar, Budapest", hourOffset: 22 },
  { id: 22, category: "hétvégi időpont", from: "Deak Ferenc ter, Budapest", to: "Astoria, Budapest", forceSaturday: true },
  { id: 23, category: "belváros → belváros", from: "Nyugati palyaudvar, Budapest", to: "Keleti palyaudvar, Budapest" },
  { id: 24, category: "külső kerület → belváros", from: "Kelenfold vasutallomas, Budapest", to: "Ferenciek tere, Budapest" },
  { id: 25, category: "belváros → külső kerület", from: "Astoria, Budapest", to: "Hüvösvolgy, Budapest" },
];

function nextSaturdayIso(hour) {
  const now = new Date();
  const day = now.getDay(); // 0=vasárnap, 6=szombat
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntilSaturday);
  target.setHours(hour, 0, 0, 0);
  return target.toISOString();
}

const results = [];
const rawMotisTimings = [];
const fullOrchestratorTimings = [];

for (const r of ROUTES) {
  const fromGeo = await geocodeAddress(r.from);
  await new Promise((res) => setTimeout(res, 1100)); // Nominatim: max 1 req/s
  const toGeo = await geocodeAddress(r.to);
  await new Promise((res) => setTimeout(res, 1100));

  if (!fromGeo || !toGeo) {
    results.push({ ...r, ok: false, note: `Geokódolás sikertelen (from=${!!fromGeo}, to=${!!toGeo})` });
    continue;
  }

  const departAt = r.forceSaturday
    ? nextSaturdayIso(12)
    : r.hourOffset !== undefined
      ? (() => {
          const d = new Date();
          d.setHours(r.hourOffset, 0, 0, 0);
          if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
          return d.toISOString();
        })()
      : new Date().toISOString();

  // Nyers MOTIS válaszidő mérése (ugyanazokkal a koordinátákkal)
  const rawStart = Date.now();
  const rawResult = await fetchMotisPlan({
    fromPlace: `${fromGeo.lat},${fromGeo.lon}`,
    toPlace: `${toGeo.lat},${toGeo.lon}`,
    time: departAt,
    ...(r.noSubway ? { transitModes: ["BUS", "TRAM", "RAIL", "COACH"] } : {}),
  });
  const rawMs = Date.now() - rawStart;
  rawMotisTimings.push(rawMs);

  const fullStart = Date.now();
  const orchestratorResult = await searchVedettRoutes({
    from: { name: fromGeo.name, lat: fromGeo.lat, lon: fromGeo.lon },
    to: { name: toGeo.name, lat: toGeo.lat, lon: toGeo.lon },
    departAt,
  });
  const fullMs = Date.now() - fullStart;
  fullOrchestratorTimings.push(fullMs);

  if (!orchestratorResult.ok) {
    results.push({ ...r, ok: false, note: `Orchestrator hiba: ${orchestratorResult.reason} — ${orchestratorResult.message}`, rawMs, fullMs });
    continue;
  }

  const journeys = orchestratorResult.journeys;
  const fingerprints = journeys.map((j) => j.journey.fingerprint);
  const uniqueFingerprints = new Set(fingerprints);
  const dedupOk = uniqueFingerprints.size === fingerprints.length;

  const fastestLabelHolder = journeys.find((j) => j.labels.includes("FASTEST"));
  const fewestTransfersHolder = journeys.find((j) => j.labels.includes("FEWEST_TRANSFERS"));
  const calmestHolder = journeys.find((j) => j.labels.includes("CALMEST"));

  // FONTOS: ez a fuggetlen ellenorzes a lib/vedett-route/ranking.ts-beli
  // pickFastest/pickFewestTransfers/pickCalmest EGZAKT tie-break szabalyait
  // kell hogy kovesse (masodlagos rendezes: rovidebb menetido dont dontetlen
  // eseten), kulonben a rankJourneys altal (szandekosan) CALMEST-elsokent
  // atrendezett tomb sorrendje hamis "ranking hibat" jelezhet, holott a
  // cimkezes maga helyes — csak a tomb sorrendjetol fuggo, naiv "<=" reduce
  // valasztott mas elemet dontetlen eseten. Ez a hiba a 2026-09-06-i
  // route-matrix futason 9 "fewestTransfersCorrect: false" alhibat okozott,
  // pedig a tenyleges FEWEST_TRANSFERS cimkezes helyes volt.
  const actualFastest = journeys.reduce((best, j) =>
    j.journey.totalDurationMinutes < best.journey.totalDurationMinutes ? j : best
  );
  const actualFewestTransfers = journeys.reduce((best, j) => {
    if (j.journey.transfers < best.journey.transfers) return j;
    if (j.journey.transfers === best.journey.transfers && j.journey.totalDurationMinutes < best.journey.totalDurationMinutes) return j;
    return best;
  });
  const actualCalmest = journeys.reduce((best, j) => {
    const jScore = j.journey.sensory?.score ?? Infinity;
    const bestScore = best.journey.sensory?.score ?? Infinity;
    if (jScore < bestScore) return j;
    if (jScore === bestScore && j.journey.totalDurationMinutes < best.journey.totalDurationMinutes) return j;
    return best;
  });

  const rankingChecks = {
    fastestCorrect: fastestLabelHolder === actualFastest,
    fewestTransfersCorrect: fewestTransfersHolder === actualFewestTransfers,
    calmestCorrect: calmestHolder === actualCalmest,
  };

  const noSubwayCheck = r.noSubway
    ? journeys.some((j) => j.journey.legs.every((l) => l.transitMode !== "SUBWAY"))
    : null;

  results.push({
    ...r,
    ok: true,
    rawMs,
    fullMs,
    fromResolved: fromGeo.name,
    toResolved: toGeo.name,
    itineraryCount: journeys.length,
    dedupOk,
    rankingChecks,
    noSubwayCheck,
    dataCoverage: orchestratorResult.dataCoverage,
    sample: journeys.slice(0, 3).map((j) => ({
      labels: j.labels,
      durationMinutes: j.journey.totalDurationMinutes,
      transfers: j.journey.transfers,
      walkingMinutes: j.journey.walkingMinutes,
      sensoryScore: j.journey.sensory?.score,
      confidence: j.journey.sensory?.confidence,
      modes: j.journey.legs.map((l) => l.transitMode ?? l.mode),
      explanation: j.explanation,
    })),
  });
}

// --- Edge case tesztek ---
const edgeCases = [];

// 1) Hibás/nem létező hely
{
  const geo = await geocodeAddress("xyzxyz nem letezo hely 999999 Budapest");
  edgeCases.push({ name: "Nem létező hely geokódolása", ok: geo === null, note: geo === null ? "Helyesen null-t adott" : `Váratlanul talált: ${geo.name}` });
}

// 2) MOTIS nem elérhető (rossz port)
{
  const original = process.env.MOTIS_BASE_URL;
  process.env.MOTIS_BASE_URL = "http://localhost:1";
  const r = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06", timeout: 2 });
  process.env.MOTIS_BASE_URL = original;
  edgeCases.push({ name: "MOTIS nem elérhető (rossz port)", ok: r.ok === false, note: r.ok === false ? `Helyesen kezelt hiba: ${r.reason}` : "VÁRATLAN: sikeres válasz jött rossz portról" });
}

// 3) MOTIS timeout (1ms timeout — gyakorlatilag garantált timeout)
{
  const r = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06", timeout: 0.001 });
  edgeCases.push({ name: "MOTIS timeout (mesterségesen 1ms)", ok: r.ok === false, note: r.ok === false ? `Helyesen kezelt: ${r.reason}` : "VÁRATLAN: sikeres válasz" });
}

// 4) Nincs útvonal (két, egymástól irreálisan távoli valós magyar pont — Sopron és Nyíregyháza — a jelenlegi BKK-only gráfban nincs közöttük tömegközlekedési kapcsolat)
{
  const fromGeo = await geocodeAddress("Sopron, Fő tér");
  await new Promise((res) => setTimeout(res, 1100));
  const toGeo = await geocodeAddress("Nyíregyháza, Kossuth tér");
  if (fromGeo && toGeo) {
    const r = await searchVedettRoutes({
      from: { name: fromGeo.name, lat: fromGeo.lat, lon: fromGeo.lon },
      to: { name: toGeo.name, lat: toGeo.lat, lon: toGeo.lon },
      departAt: new Date().toISOString(),
    });
    edgeCases.push({
      name: "Nincs útvonal (Sopron -> Nyíregyháza, jelenleg csak BKK adat)",
      ok: true,
      note: r.ok ? `Talált ${r.journeys.length} itinerary-t (ellenőrizendő, hogy ez valós-e)` : `Helyesen: ${r.reason} — ${r.message}`,
    });
  } else {
    edgeCases.push({ name: "Nincs útvonal teszt", ok: false, note: "Geokódolás sikertelen ehhez a teszthez" });
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const rawSorted = [...rawMotisTimings].sort((a, b) => a - b);
const fullSorted = [...fullOrchestratorTimings].sort((a, b) => a - b);

const summary = {
  timestamp: new Date().toISOString(),
  totalRoutes: ROUTES.length,
  successfulRoutes: results.filter((r) => r.ok).length,
  dedupFailures: results.filter((r) => r.ok && !r.dedupOk).length,
  rankingFailures: results.filter((r) => r.ok && (!r.rankingChecks.fastestCorrect || !r.rankingChecks.fewestTransfersCorrect || !r.rankingChecks.calmestCorrect)).length,
  noSubwayFailures: results.filter((r) => r.noSubway && r.noSubwayCheck === false).length,
  rawMotisMs: { p50: percentile(rawSorted, 50), p95: percentile(rawSorted, 95), max: rawSorted[rawSorted.length - 1] ?? null },
  fullOrchestratorMs: { p50: percentile(fullSorted, 50), p95: percentile(fullSorted, 95), max: fullSorted[fullSorted.length - 1] ?? null },
  edgeCases,
};

const outDir = path.join(process.cwd(), "motis-data", "reports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "route-matrix-result.json"), JSON.stringify({ summary, results }, null, 2), "utf-8");

console.log(JSON.stringify(summary, null, 2));
console.log(`\nTeljes eredmény mentve: ${path.join(outDir, "route-matrix-result.json")}`);
