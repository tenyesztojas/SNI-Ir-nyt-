// Közvetlen koordinátás MOTIS routing teszt (MAP_PICKED routing diagnosztika,
// 2026-09-11) — a meglévő motis-smoke-test.mjs mintáját követi, de SZÁNDÉKOSAN
// KIHAGYJA a Nominatim/MOTIS geokódolást: közvetlenül a te (pl. a térképen
// kijelölt) koordinátáiddal hívja a MOTIS /api/v6/plan végpontot,
// pontosan úgy, ahogy a valós orchestrator.ts is felépíti a
// fromPlace/toPlace paramétert ("lat,lon" string). Ez eldönti a MAP_PICKED
// routing diagnosztika A/B kérdését:
//   A) MOTIS erre a koordinátapárra AD itinerary-t → kliens/API adatátadási
//      hiba (a koordináta valahol útközben megsérül/elveszik).
//   B) MOTIS erre a koordinátapárra IS 0 itinerary-t ad → MOTIS/adat/
//      gyaloglás-hozzáférés/routing probléma (nem az alkalmazás kódjában
//      van a hiba).
//
// Futtatás (a te Windows géped PowerShell-jéből, a MOTIS konténer futása
// közben, VAGY ROUTE_SERVICE_URL-lel a staging route service ellen):
//   node scripts/vedett-route/motis-coordinate-test.mjs <fromLat> <fromLon> <toLat> <toLon> [isoDepartAt]
//
// Példa (a paraméterek helyére írd be a ténylegesen vizsgált, pl. a
// térképen kijelölt kiindulási és célkoordinátákat):
//   node scripts/vedett-route/motis-coordinate-test.mjs <fromLat> <fromLon> <toLat> <toLon>
//
// Env változók (ugyanazok, mint amiket a valós motisClient.ts használ):
//   MOTIS_BASE_URL          — közvetlen, fejlesztői MOTIS elérés (pl. http://localhost:8080)
//   ROUTE_SERVICE_URL       — production/staging route service URL (ha ezt adod meg, ROUTE_SERVICE_AUTH_TOKEN is kell)
//   ROUTE_SERVICE_AUTH_TOKEN
//
// PRIVACY: ez a script KIZÁRÓLAG a parancssorban explicit megadott
// koordinátákat használja — nem olvas be semmilyen felhasználói adatot,
// nem ír adatbázisba, nem küld semmit sehova a MOTIS/route service hívásán
// kívül. A kimenet a konzolra és egy helyi JSON fájlba kerül (nem production
// logba).

import fs from "node:fs";
import path from "node:path";

const [, , fromLatArg, fromLonArg, toLatArg, toLonArg, departAtArg] = process.argv;

if (!fromLatArg || !fromLonArg || !toLatArg || !toLonArg) {
  console.error(
    "Használat: node scripts/vedett-route/motis-coordinate-test.mjs <fromLat> <fromLon> <toLat> <toLon> [isoDepartAt]"
  );
  process.exit(1);
}

const fromLat = Number(fromLatArg);
const fromLon = Number(fromLonArg);
const toLat = Number(toLatArg);
const toLon = Number(toLonArg);

for (const [label, value] of [
  ["fromLat", fromLat],
  ["fromLon", fromLon],
  ["toLat", toLat],
  ["toLon", toLon],
]) {
  if (Number.isNaN(value)) {
    console.error(`Érvénytelen szám: ${label} = "${process.argv[process.argv.indexOf(String(value))] ?? "?"}"`);
    process.exit(1);
  }
}

const departAt = departAtArg ?? new Date(Date.now() + 5 * 60_000).toISOString();

// Ugyanaz a célválasztási logika, mint motisClient.ts resolveRouteTarget()-
// je: route service elsőbbséget élvez, ha konfigurálva van, különben a
// közvetlen MOTIS_BASE_URL fejlesztői fallback.
const routeServiceUrl = process.env.ROUTE_SERVICE_URL;
const routeServiceToken = process.env.ROUTE_SERVICE_AUTH_TOKEN;
const legacyMotisBaseUrl = process.env.MOTIS_BASE_URL || "http://localhost:8080";

const useRouteService = Boolean(routeServiceUrl && routeServiceToken);
const baseUrl = useRouteService ? routeServiceUrl : legacyMotisBaseUrl;
const headers = useRouteService ? { Authorization: `Bearer ${routeServiceToken}`, Accept: "application/json" } : {};

// PONTOSAN ugyanaz a "lat,lon" formátum, mint amit orchestrator.ts épít fel
// (searchVedettRoutes: `${request.from.lat},${request.from.lon}`) — ez a
// script szándékosan a valós kódéval BIT-AZONOS string-összeállítást
// használja, hogy a teszt ténylegesen azt bizonyítsa, amit a 4. pont kér.
const fromPlace = `${fromLat},${fromLon}`;
const toPlace = `${toLat},${toLon}`;

async function plan(params, label) {
  const started = Date.now();
  const url = `${baseUrl}/api/v6/plan?${new URLSearchParams(params)}`;
  console.log(`\n[${label}] GET ${url.replace(/Authorization=[^&]+/i, "Authorization=REDACTED")}`);
  try {
    const res = await fetch(url, { headers });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, ms };
    }
    const data = await res.json();
    return { ok: true, data, ms };
  } catch (err) {
    return { ok: false, networkError: true, error: err instanceof Error ? err.message : String(err) };
  }
}

const cases = [
  { label: "ALAP (6 itinerary, minden mód)", params: { fromPlace, toPlace, time: departAt, numItineraries: "6" } },
  {
    label: "METRÓMENTES (BUS/TRAM/RAIL/COACH, 4 itinerary)",
    params: { fromPlace, toPlace, time: departAt, numItineraries: "4", transitModes: "BUS,TRAM,RAIL,COACH" },
  },
];

const results = [];
for (const c of cases) {
  const r = await plan(c.params, c.label);
  if (!r.ok) {
    const note = r.networkError ? `Hálózati hiba: ${r.error}` : `HTTP ${r.status}`;
    console.log(`  -> SIKERTELEN — ${note}`);
    results.push({ label: c.label, ok: false, note });
    continue;
  }
  const itineraries = r.data.itineraries ?? [];
  const direct = r.data.direct ?? [];
  console.log(`  -> ${itineraries.length} itinerary, ${direct.length} direct, ${r.ms} ms`);
  results.push({
    label: c.label,
    ok: true,
    ms: r.ms,
    itineraryCount: itineraries.length,
    directCount: direct.length,
    firstItinerary: itineraries[0]
      ? {
          durationMinutes: Math.round(itineraries[0].duration / 60),
          transfers: itineraries[0].transfers,
          modes: itineraries[0].legs?.map((l) => l.mode) ?? [],
        }
      : null,
  });
}

const totalItineraries = results.reduce((sum, r) => sum + (r.itineraryCount ?? 0) + (r.directCount ?? 0), 0);

console.log("\n=== ÖSSZEGZÉS ===");
console.log(`fromPlace: ${fromPlace}`);
console.log(`toPlace:   ${toPlace}`);
console.log(`departAt:  ${departAt}`);
console.log(`target:    ${useRouteService ? "route service (" + baseUrl + ")" : "közvetlen MOTIS (" + baseUrl + ")"}`);
if (totalItineraries > 0) {
  console.log(
    `\nA) MOTIS ERRE A KOORDINÁTAPÁRRA AD itinerary-t (összesen ${totalItineraries}) → a hiba valószínűleg a kliens/API adatátadásban van (a koordináta útközben megsérül/eltér a ténylegesen kijelölttől).`
  );
} else if (results.some((r) => r.ok)) {
  console.log(
    "\nB) MOTIS ERRE A KOORDINÁTAPÁRRA IS 0 itinerary-t ad (de a hívás magas HTTP szinten sikeres volt) → valószínűleg MOTIS/adat/gyaloglás-hozzáférés/routing probléma, NEM az alkalmazás kódjában van a hiba. Érdemes ELLENŐRIZNI: van-e gyalogosan elérhető megálló a koordináta közelében (OSM pedestrian access), és hogy a koordináta nem esik-e vízbe/parkba/lefedetlen területre."
  );
} else {
  console.log("\nA hívás(ok) sikertelenek voltak (hálózat/HTTP hiba) — lásd fent a részleteket, ez nem A/B kérdés, hanem elérhetőségi probléma.");
}

const outDir = path.join(process.cwd(), "motis-data", "reports");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "coordinate-test-result.json");
fs.writeFileSync(outPath, JSON.stringify({ fromPlace, toPlace, departAt, results }, null, 2), "utf-8");
console.log(`\nJSON mentve: ${outPath}`);
