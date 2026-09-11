// VÉDETT ÚTVONAL — AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C)
//
// Ez a teszt-suite a feature specifikáció 12. pontjának (minimum tesztek)
// pontos lefedésére törekszik. A pipeline egyes rétegeit KÜLÖN teszteljük:
//
//   1) accessibility.ts — tiszta, adatforrás-független klasszifikáló és
//      kombináló függvények (GTFS mező-adapterek, "leggyengébb szakasz"
//      szabály, UNKNOWN-safe logika).
//   2) orchestrator.ts — a stepFreeRequired kapcsoló bekötése: false esetén
//      BYTE-RA változatlan MOTIS kérés/eredmény; true esetén a klasszifikáció
//      a Sensory Engine ELŐTT fut, és a JELENLEGI adathelyzet mellett
//      (nincs bekötött GTFS wheelchair mező sehol) minden journey
//      PARTIALLY_UNKNOWN-t kap, SOSEM automatikusan KNOWN_ACCESSIBLE-t.
//   3) schemas.ts / route.ts — a stepFreeRequired mező elfogadása és a
//      cache-kulcsba kerülése.
//   4) VedettUtvonalSearchForm.tsx — a UI-toggle alapértéke, szövege, és az
//      eredmény-badge forráskód-szintű, strukturális jelenléte.
//
// Nincs jsdom/@testing-library/react ebben a projektben — a UI-réteg
// ellenőrzése a projekt már meglévő mintáját követve forráskód-szintű,
// strukturális regresszió-teszt.
//
//   node --test __tests__/vedett-route/accessibility-mvp.test.ts

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyWheelchairBoarding,
  classifyWheelchairAccessible,
  classifyStationPathwayAccessibility,
  combineAccessibilityStatuses,
  combineLegAccessibility,
  combineJourneyAccessibility,
  toAccessibilityResultStatus,
  isEligibleForStepFreeResults,
  ACCESSIBILITY_RESULT_STATUS_LABELS_HU,
  type AccessibilityStatus,
} from "../../lib/vedett-route/accessibility.ts";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import { journeySearchSchema } from "../../lib/vedett-route/schemas.ts";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const ORCHESTRATOR_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "orchestrator.ts");
const orchestratorSrc = readFileSync(ORCHESTRATOR_PATH, "utf-8");

const SENSORY_ENGINE_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "sensoryEngine.ts");
const sensoryEngineSrc = readFileSync(SENSORY_ENGINE_PATH, "utf-8");

const MOTIS_TYPES_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "motisTypes.ts");
const motisTypesSrc = readFileSync(MOTIS_TYPES_PATH, "utf-8");

const MOTIS_CLIENT_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "motisClient.ts");
const motisClientSrc = readFileSync(MOTIS_CLIENT_PATH, "utf-8");

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

// -----------------------------------------------------------------------
// 1) accessibility.ts — GTFS mező-adapterek
// -----------------------------------------------------------------------

describe("GTFS mező-adapterek — wheelchair_boarding (megálló/peron)", () => {
  test("wheelchair_boarding=1 -> KNOWN_ACCESSIBLE", () => {
    assert.equal(classifyWheelchairBoarding(1), "KNOWN_ACCESSIBLE");
  });
  test("wheelchair_boarding=2 -> KNOWN_NOT_ACCESSIBLE", () => {
    assert.equal(classifyWheelchairBoarding(2), "KNOWN_NOT_ACCESSIBLE");
  });
  test("wheelchair_boarding=0 -> UNKNOWN (0 SOHA nem accessible)", () => {
    assert.equal(classifyWheelchairBoarding(0), "UNKNOWN");
  });
  test("wheelchair_boarding='' (üres) -> UNKNOWN", () => {
    assert.equal(classifyWheelchairBoarding(""), "UNKNOWN");
  });
  test("wheelchair_boarding=undefined/null (mező hiányzik) -> UNKNOWN", () => {
    assert.equal(classifyWheelchairBoarding(undefined), "UNKNOWN");
    assert.equal(classifyWheelchairBoarding(null), "UNKNOWN");
  });
  test("wheelchair_boarding érvénytelen/nem dokumentált érték -> UNKNOWN (defenzív, SOHA nem dob hibát)", () => {
    assert.equal(classifyWheelchairBoarding(99), "UNKNOWN");
    assert.equal(classifyWheelchairBoarding("nem szám"), "UNKNOWN");
  });
});

describe("GTFS mező-adapterek — wheelchair_accessible (jármű/járat)", () => {
  test("wheelchair_accessible=1 -> KNOWN_ACCESSIBLE (jármű)", () => {
    assert.equal(classifyWheelchairAccessible(1), "KNOWN_ACCESSIBLE");
  });
  test("wheelchair_accessible=2 -> KNOWN_NOT_ACCESSIBLE (jármű)", () => {
    assert.equal(classifyWheelchairAccessible(2), "KNOWN_NOT_ACCESSIBLE");
  });
  test("wheelchair_accessible=0/üres -> UNKNOWN (jármű)", () => {
    assert.equal(classifyWheelchairAccessible(0), "UNKNOWN");
    assert.equal(classifyWheelchairAccessible(""), "UNKNOWN");
    assert.equal(classifyWheelchairAccessible(undefined), "UNKNOWN");
  });
});

describe("GTFS pathways.txt pathway_mode — station-szintű lépcsőmentességi minősítés", () => {
  test("nincs pathway adat -> UNKNOWN", () => {
    assert.equal(classifyStationPathwayAccessibility([]), "UNKNOWN");
  });
  test("kizárólag stairs (2) pathway, nincs alternatív accessible -> KNOWN_NOT_ACCESSIBLE", () => {
    assert.equal(classifyStationPathwayAccessibility([2]), "KNOWN_NOT_ACCESSIBLE");
    assert.equal(classifyStationPathwayAccessibility([2, 2]), "KNOWN_NOT_ACCESSIBLE");
  });
  test("van elevator (5) alternatíva a stairs mellett -> KNOWN_ACCESSIBLE", () => {
    assert.equal(classifyStationPathwayAccessibility([2, 5]), "KNOWN_ACCESSIBLE");
  });
  test("csak walkway (1) -> KNOWN_ACCESSIBLE", () => {
    assert.equal(classifyStationPathwayAccessibility([1]), "KNOWN_ACCESSIBLE");
  });
  test("csak fare gate (6)/exit gate (7) -> UNKNOWN (nem mond semmit lépcsőmentességről)", () => {
    assert.equal(classifyStationPathwayAccessibility([6, 7]), "UNKNOWN");
  });
});

// -----------------------------------------------------------------------
// 1b) accessibility.ts — kombináló szabályok (spec 6/7. pont)
// -----------------------------------------------------------------------

describe("combineAccessibilityStatuses — 'leggyengébb bizonyított szakasz' szabály, UNKNOWN-safe", () => {
  test("UNKNOWN SOHA nem válik KNOWN_ACCESSIBLE-lé — bármilyen kombinációban, ha van UNKNOWN és nincs KNOWN_NOT_ACCESSIBLE, az eredmény UNKNOWN marad", () => {
    const combos: AccessibilityStatus[][] = [
      ["UNKNOWN"],
      ["KNOWN_ACCESSIBLE", "UNKNOWN"],
      ["UNKNOWN", "KNOWN_ACCESSIBLE", "KNOWN_ACCESSIBLE"],
      ["UNKNOWN", "UNKNOWN"],
    ];
    for (const combo of combos) {
      assert.equal(combineAccessibilityStatuses(combo), "UNKNOWN", `combo=${JSON.stringify(combo)}`);
    }
  });

  test("egyetlen KNOWN_NOT_ACCESSIBLE elég ahhoz, hogy a teljes kombináció KNOWN_NOT_ACCESSIBLE legyen, MÉG accessible/unknown társak mellett is", () => {
    assert.equal(combineAccessibilityStatuses(["KNOWN_ACCESSIBLE", "KNOWN_NOT_ACCESSIBLE"]), "KNOWN_NOT_ACCESSIBLE");
    assert.equal(combineAccessibilityStatuses(["UNKNOWN", "KNOWN_NOT_ACCESSIBLE"]), "KNOWN_NOT_ACCESSIBLE");
    assert.equal(combineAccessibilityStatuses(["KNOWN_NOT_ACCESSIBLE"]), "KNOWN_NOT_ACCESSIBLE");
  });

  test("csak akkor KNOWN_ACCESSIBLE, ha MINDEN komponens KNOWN_ACCESSIBLE", () => {
    assert.equal(combineAccessibilityStatuses(["KNOWN_ACCESSIBLE"]), "KNOWN_ACCESSIBLE");
    assert.equal(combineAccessibilityStatuses(["KNOWN_ACCESSIBLE", "KNOWN_ACCESSIBLE"]), "KNOWN_ACCESSIBLE");
  });

  test("üres tömb -> UNKNOWN (defenzív alapérték, sosem accessible)", () => {
    assert.equal(combineAccessibilityStatuses([]), "UNKNOWN");
  });
});

describe("combineLegAccessibility — megálló (stop) + jármű (vehicle) KÜLÖN bizonyított állapotának kombinációja (spec 7. pont)", () => {
  test("accessible jármű + inaccessible megálló -> NEM accessible (a megálló dominál)", () => {
    assert.equal(combineLegAccessibility("KNOWN_NOT_ACCESSIBLE", "KNOWN_ACCESSIBLE"), "KNOWN_NOT_ACCESSIBLE");
  });
  test("accessible megálló + unknown jármű -> UNKNOWN (nem 'erősíthető fel' accessible-lé az accessible megálló által)", () => {
    assert.equal(combineLegAccessibility("KNOWN_ACCESSIBLE", "UNKNOWN"), "UNKNOWN");
  });
  test("accessible megálló + inaccessible jármű -> NEM accessible (a jármű dominál)", () => {
    assert.equal(combineLegAccessibility("KNOWN_ACCESSIBLE", "KNOWN_NOT_ACCESSIBLE"), "KNOWN_NOT_ACCESSIBLE");
  });
  test("mindkét komponens accessible -> KNOWN_ACCESSIBLE", () => {
    assert.equal(combineLegAccessibility("KNOWN_ACCESSIBLE", "KNOWN_ACCESSIBLE"), "KNOWN_ACCESSIBLE");
  });
  test("mindkét mező hiányzik (undefined) -> UNKNOWN", () => {
    assert.equal(combineLegAccessibility(undefined, undefined), "UNKNOWN");
  });
});

describe("toAccessibilityResultStatus + isEligibleForStepFreeResults — felhasználó felé menő minősítés (spec 6. pont)", () => {
  test("minden komponens (minden láb) accessible -> a teljes journey KNOWN_ACCESSIBLE, és felajánlható", () => {
    const legStatuses: AccessibilityStatus[] = ["KNOWN_ACCESSIBLE", "KNOWN_ACCESSIBLE"];
    const resultStatus = toAccessibilityResultStatus(combineJourneyAccessibility(legStatuses));
    assert.equal(resultStatus, "KNOWN_ACCESSIBLE");
    assert.equal(isEligibleForStepFreeResults(resultStatus), true);
  });

  test("legalább egy UNKNOWN komponens (más lábak accessible-ek) -> PARTIALLY_UNKNOWN, a felhasználói szöveg figyelmeztetést ad, DE a journey megjelenhet", () => {
    const legStatuses: AccessibilityStatus[] = ["KNOWN_ACCESSIBLE", "UNKNOWN"];
    const resultStatus = toAccessibilityResultStatus(combineJourneyAccessibility(legStatuses));
    assert.equal(resultStatus, "PARTIALLY_UNKNOWN");
    assert.equal(isEligibleForStepFreeResults(resultStatus), true);
    assert.equal(ACCESSIBILITY_RESULT_STATUS_LABELS_HU.PARTIALLY_UNKNOWN, "Az akadálymentesség egy része nem igazolt");
  });

  test("legalább egy bizonyítottan KNOWN_NOT_ACCESSIBLE komponens -> a teljes journey KNOWN_NOT_ACCESSIBLE, és SOHA nem ajánlható fel akadálymentes eredményként", () => {
    const legStatuses: AccessibilityStatus[] = ["KNOWN_ACCESSIBLE", "KNOWN_NOT_ACCESSIBLE"];
    const resultStatus = toAccessibilityResultStatus(combineJourneyAccessibility(legStatuses));
    assert.equal(resultStatus, "KNOWN_NOT_ACCESSIBLE");
    assert.equal(isEligibleForStepFreeResults(resultStatus), false);
  });

  test("KNOWN_ACCESSIBLE felhasználói szövege pontosan a spec 6. pont szerinti", () => {
    assert.equal(ACCESSIBILITY_RESULT_STATUS_LABELS_HU.KNOWN_ACCESSIBLE, "Az elérhető adatok alapján lépcsőmentes");
  });
});

// -----------------------------------------------------------------------
// 2) orchestrator.ts integráció — mockolt fetch
// -----------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const originalMotisBaseUrl = process.env.MOTIS_BASE_URL;
const originalRouteServiceUrl = process.env.ROUTE_SERVICE_URL;
const originalRouteServiceToken = process.env.ROUTE_SERVICE_AUTH_TOKEN;

beforeEach(() => {
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  process.env.MOTIS_BASE_URL = "http://localhost:8080";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalMotisBaseUrl === undefined) delete process.env.MOTIS_BASE_URL;
  else process.env.MOTIS_BASE_URL = originalMotisBaseUrl;
  if (originalRouteServiceUrl === undefined) delete process.env.ROUTE_SERVICE_URL;
  else process.env.ROUTE_SERVICE_URL = originalRouteServiceUrl;
  if (originalRouteServiceToken === undefined) delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  else process.env.ROUTE_SERVICE_AUTH_TOKEN = originalRouteServiceToken;
});

function itinerary(id: string) {
  return {
    duration: 900,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:15:00+02:00",
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        from: { name: `from-${id}`, lat: 47.5, lon: 19.05 },
        to: { name: `to-${id}`, lat: 47.51, lon: 19.06 },
        duration: 900,
        startTime: "2026-09-11T10:00:00+02:00",
        endTime: "2026-09-11T10:15:00+02:00",
      },
    ],
  };
}

function installMockFetch(): { url: string }[] {
  const calls: { url: string }[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push({ url });
    return {
      ok: true,
      status: 200,
      json: async () => ({ itineraries: [itinerary("a")] }),
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

const baseRequest = {
  from: { name: "kiindulópont", lat: 47.4813, lon: 19.0559 },
  to: { name: "célpont", lat: 47.4389, lon: 19.1706 },
  departAt: "2026-09-11T10:00:00+02:00",
};

describe("searchVedettRoutes — stepFreeRequired=false (vagy hiányzó) -> a jelenlegi routing működés SEMMILYEN módon nem változik (spec 3. pont)", () => {
  test("stepFreeRequired hiányzik -> a MOTIS kérésekben NINCS pedestrianProfile/wheelchair/radius paraméter, és a journey-ken NINCS accessibilityStatus mező", async () => {
    const calls = installMockFetch();
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.journeys.length > 0);
      for (const ranked of result.journeys) {
        assert.equal(ranked.journey.accessibilityStatus, undefined);
      }
    }
    for (const call of calls) {
      assert.doesNotMatch(call.url, /pedestrianProfile/i);
      assert.doesNotMatch(call.url, /wheelchair/i);
      assert.doesNotMatch(call.url, /radius=/);
    }
  });

  test("stepFreeRequired: false explicit -> ugyanaz, mint a hiányzó mező (nincs eltérő ág)", async () => {
    installMockFetch();
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: false });
    assert.equal(result.ok, true);
    if (result.ok) {
      for (const ranked of result.journeys) {
        assert.equal(ranked.journey.accessibilityStatus, undefined);
      }
    }
  });
});

describe("searchVedettRoutes — stepFreeRequired=true, JELENLEGI adathelyzet (nincs bekötött GTFS wheelchair mező sehol)", () => {
  test("minden journey PARTIALLY_UNKNOWN minősítést kap (SOHA nem automatikus KNOWN_ACCESSIBLE, mert nincs bizonyító adat), és a journey NEM esik ki", async () => {
    installMockFetch();
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.journeys.length > 0, "a jelenlegi adathiány NEM ürítheti ki az eredményhalmazt — PARTIALLY_UNKNOWN még megjelenhet");
      for (const ranked of result.journeys) {
        assert.equal(ranked.journey.accessibilityStatus, "PARTIALLY_UNKNOWN");
      }
    }
  });

  // FRISSÍTVE (Task C2, 2026-09-11): a felhasználó saját VPS runtime tesztje
  // AZÓTA bizonyította a pedestrianProfile=WHEELCHAIR/useRoutedTransfers/
  // timetableView paraméter-hármas tényleges MOTIS v2.11.2 elfogadását —
  // ez a Task C-beli teszt ("SEM jelenik meg semmilyen wheelchair paraméter")
  // MOST SZÁNDÉKOSAN FORDÍTOTTJÁRA cserélve. A teljes, részletes MOTIS
  // REQUEST/VEHICLE/STOP/IDS/PATHWAYS/JOURNEY/REGRESSION lefedés az ÚJ
  // __tests__/vedett-route/accessibility-runtime.test.ts fájlban él.
  test("stepFreeRequired=true esetén MINDHÁROM proven MOTIS paraméter megjelenik (lásd accessibility-runtime.test.ts a teljes lefedésért)", async () => {
    const calls = installMockFetch();
    await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    for (const call of calls) {
      assert.match(call.url, /pedestrianProfile=WHEELCHAIR/);
      assert.match(call.url, /useRoutedTransfers=true/);
      assert.match(call.url, /timetableView=false/);
    }
  });
});

// -----------------------------------------------------------------------
// 3) schemas.ts / route.ts
// -----------------------------------------------------------------------

describe("journeySearchSchema — stepFreeRequired elfogadása", () => {
  test("stepFreeRequired: true érvényes bemenet", () => {
    const parsed = journeySearchSchema.safeParse({ from: "Kelenföld", to: "Deák Ferenc tér", stepFreeRequired: true });
    assert.equal(parsed.success, true);
  });
  test("stepFreeRequired hiányzik -> továbbra is érvényes (opcionális, alapérték false a hívó oldalon)", () => {
    const parsed = journeySearchSchema.safeParse({ from: "Kelenföld", to: "Deák Ferenc tér" });
    assert.equal(parsed.success, true);
  });
  test("stepFreeRequired nem-boolean érték -> érvénytelen bemenet", () => {
    const parsed = journeySearchSchema.safeParse({ from: "Kelenföld", to: "Deák Ferenc tér", stepFreeRequired: "yes" });
    assert.equal(parsed.success, false);
  });
});

describe("route.ts — a stepFreeRequired preferencia a cache-kulcs RÉSZE", () => {
  test("buildRouteCacheKey hívás tartalmazza a stepFreeRequired mezőt", () => {
    assert.match(routeSrc, /buildRouteCacheKey\(\{[\s\S]{0,300}?stepFreeRequired: stepFree,?[\s\S]{0,20}?\}\)/);
  });
  test("a searchVedettRoutes() hívás továbbadja a stepFreeRequired-et a JourneySearchRequest-ben", () => {
    assert.match(routeSrc, /departAt,\s*\n\s*stepFreeRequired: stepFree,/);
  });
});

// -----------------------------------------------------------------------
// 4) UI — VedettUtvonalSearchForm.tsx
// -----------------------------------------------------------------------

describe("UI toggle — '♿ Lépcsőmentes útvonal BÉTA' (spec 4. pont)", () => {
  test("stepFreeRequired UI-state alapértéke false", () => {
    assert.match(formSrc, /const \[stepFreeRequired, setStepFreeRequired\] = useState\(false\);/);
  });

  test("a checkbox a stepFreeRequired state-hez van kötve (checked + onChange)", () => {
    assert.match(formSrc, /checked=\{stepFreeRequired\}/);
    assert.match(formSrc, /onChange=\{\(e\) => setStepFreeRequired\(e\.target\.checked\)\}/);
  });

  test("a felirat pontosan '♿ Lépcsőmentes útvonal' + 'BÉTA' jelvény, a kért magyarázó szöveggel", () => {
    assert.match(formSrc, /Lépcsőmentes útvonal/);
    assert.match(formSrc, />\s*BÉTA\s*</);
    assert.match(formSrc, /Az ismert akadálymentességi adatok alapján keressük a lépcsőmentesebb lehetőségeket\./);
    assert.match(formSrc, /Az akadálymentességi adatok nem minden megállónál és útvonalszakasznál teljesek\./);
  });

  test("a szöveg SOHA nem ígér garanciát ('garantáltan akadálymentes'/'biztosan használható kerekesszékkel' TILOS)", () => {
    assert.doesNotMatch(formSrc, /garantáltan akadálymentes/i);
    assert.doesNotMatch(formSrc, /biztosan használható kerekesszékkel/i);
  });

  test("a submit body tartalmazza a stepFreeRequired mezőt (mindig explicit boolean-ként megy)", () => {
    assert.match(formSrc, /\n\s*stepFreeRequired,\s*\n\s*\};/);
  });

  test("a checkbox legalább 44px magas érintési terület (min-h-[44px] a label-en)", () => {
    const labelMatch = formSrc.match(/<label className="flex min-h-\[44px\][^"]*">[\s\S]{0,600}?type="checkbox"/);
    assert.ok(labelMatch, "meg kell találni a min-h-[44px] label-t, ami tartalmazza a checkbox-ot");
  });
});

describe("UI eredmény-badge — KNOWN_ACCESSIBLE/PARTIALLY_UNKNOWN megjelenítése (spec 6. pont), KNOWN_NOT_ACCESSIBLE SOHA", () => {
  test("a badge szöveg pontosan a spec 6. pont felhasználói nyelvét használja", () => {
    assert.match(formSrc, /KNOWN_ACCESSIBLE: \{ text: "♿ Az elérhető adatok alapján lépcsőmentes"/);
    assert.match(formSrc, /PARTIALLY_UNKNOWN: \{ text: "♿ Az akadálymentesség egy része nem igazolt"/);
  });

  test("a badge-tábla (ACCESSIBILITY_RESULT_META) SOHA nem tartalmaz KNOWN_NOT_ACCESSIBLE kulcsot — a szerver már kiszűrte, a UI ezt sosem jelenítheti meg listaelemként", () => {
    assert.doesNotMatch(formSrc, /KNOWN_NOT_ACCESSIBLE: \{ text:/);
  });

  test("a badge renderelés explicit kizárja a KNOWN_NOT_ACCESSIBLE-t (védekező, kétszeres biztosítás)", () => {
    assert.match(formSrc, /journey\.accessibilityStatus && journey\.accessibilityStatus !== "KNOWN_NOT_ACCESSIBLE"/);
  });
});

// -----------------------------------------------------------------------
// Regresszió: accessibility KÜLÖN marad a Sensory Engine-től (spec 10. pont)
// -----------------------------------------------------------------------

describe("Accessibility KÜLÖN dimenzió, NEM sensory score (spec 10. pont)", () => {
  test("sensoryEngine.ts NEM importál semmit az accessibility.ts-ből, és a 'vehicleAccessibility' faktor továbbra is mindig unavailable", () => {
    assert.doesNotMatch(sensoryEngineSrc, /from ".\/accessibility/);
    assert.match(sensoryEngineSrc, /key: "vehicleAccessibility",\s*\n\s*available: false,/);
  });

  test("orchestrator.ts-ben az akadálymentességi klasszifikáció/szűrés a computeSensoryScore() hívás ELŐTT történik a forráskódban (spec 10. pont: 'Accessibility filter/minősítés előbb történjen')", () => {
    const accessibilityBlockIndex = orchestratorSrc.indexOf("if (request.stepFreeRequired)");
    const sensoryCallIndex = orchestratorSrc.indexOf("computeSensoryScore(journey, weights)");
    assert.ok(accessibilityBlockIndex > -1, "meg kell találni az accessibility szűrés blokkot");
    assert.ok(sensoryCallIndex > -1, "meg kell találni a computeSensoryScore hívást");
    assert.ok(accessibilityBlockIndex < sensoryCallIndex, "az accessibility blokknak a Sensory Engine hívás ELŐTT kell állnia a forráskódban");
  });
});

// -----------------------------------------------------------------------
// Regresszió: last-mile fallback (radius=1500) — a KONSTANS és a trigger-
// logika NEM változott Task C2-ben; a wheelchair-paraméterek FELTÉTELES
// bekötését lásd accessibility-runtime.test.ts (részletes MOTIS REQUEST
// lefedés, mockolt fetch-csel).
// -----------------------------------------------------------------------

describe("Last-mile fallback (radius=1500) regresszió — a konstans és a trigger-feltétel változatlan (spec 11. pont)", () => {
  test("a LAST_MILE_FALLBACK_RADIUS_METERS konstans változatlanul 1500", async () => {
    const { LAST_MILE_FALLBACK_RADIUS_METERS } = await import("../../lib/vedett-route/orchestrator.ts");
    assert.equal(LAST_MILE_FALLBACK_RADIUS_METERS, 1500);
  });

  // FRISSÍTVE (Task C2, 2026-09-11): a felhasználó saját VPS runtime tesztje
  // bizonyította a pedestrianProfile=WHEELCHAIR/useRoutedTransfers/
  // timetableView paraméter-hármas tényleges MOTIS v2.11.2 elfogadását —
  // ez MOST feltételesen (stepFreeRequired alapján) MINDHÁROM MOTIS hívásra
  // (a két normál stratégiára ÉS a fallback-hívásra) bekötve van, lásd
  // orchestrator.ts STEP_FREE_MOTIS_PARAMS + a fallback fetchMotisPlan()
  // hívás `...stepFreeMotisParams` szórása. A pontos, mockolt fetch-es
  // viselkedési tesztet lásd accessibility-runtime.test.ts "Last-mile
  // fallback" leírásában — itt csak a forráskód-szintű, strukturális
  // bekötést ellenőrizzük.
  test("a fallback-hívás forráskódja ténylegesen szétszórja a stepFreeMotisParams-ot (ugyanazt a forrást, mint a két normál kérés)", () => {
    const fallbackCallMatch = orchestratorSrc.match(/const fallbackResult = await fetchMotisPlan\(\{[\s\S]{0,700}?\}\);/);
    assert.ok(fallbackCallMatch, "meg kell találni a fallback fetchMotisPlan hívást");
    assert.match(fallbackCallMatch![0], /\.\.\.stepFreeMotisParams/);
    assert.match(fallbackCallMatch![0], /radius: LAST_MILE_FALLBACK_RADIUS_METERS/);
  });

  test("motisTypes.ts MotisPlanParams-ban VAN pedestrianProfile/useRoutedTransfers/timetableView mező, VPS runtime-teszttel bizonyítottként dokumentálva (spec 1. pont)", () => {
    assert.match(motisTypesSrc, /pedestrianProfile\?:\s*"WHEELCHAIR"/);
    assert.match(motisTypesSrc, /useRoutedTransfers\?:\s*boolean/);
    assert.match(motisTypesSrc, /timetableView\?:\s*boolean/);
  });

  test("motisClient.ts buildQuery() feltételesen állítja be a wheelchair/pedestrianProfile paramétereket (csak ha az orchestrator ténylegesen átadja)", () => {
    assert.match(motisClientSrc, /if \(params\.pedestrianProfile !== undefined\) q\.set\("pedestrianProfile", params\.pedestrianProfile\);/);
    assert.match(motisClientSrc, /if \(params\.useRoutedTransfers !== undefined\) q\.set\("useRoutedTransfers"/);
    assert.match(motisClientSrc, /if \(params\.timetableView !== undefined\) q\.set\("timetableView"/);
  });
});
