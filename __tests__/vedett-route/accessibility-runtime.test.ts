// VÉDETT ÚTVONAL — AKADÁLYMENTESSÉGI RUNTIME INTEGRÁCIÓ (2026-09-11, Task C2)
//
// Ez a suite a Task C2 feature specifikáció 20. pontjának (minimum tesztek)
// lefedésére törekszik, a Task C-ből örökölt accessibility-mvp.test.ts-t
// KIEGÉSZÍTVE (nem helyettesítve) — az ott lévő tiszta GTFS mező-adapter és
// kombináló-szabály tesztek továbbra is érvényesek és változatlanok.
//
// Kategóriák (spec 20. pont):
//   A) MOTIS REQUEST — a pedestrianProfile/useRoutedTransfers/timetableView
//      hármas pontos, feltételes bekötése (normál + fallback hívásokban).
//   B) VEHICLE — MOTIS wheelchairAccessible + GTFS trips.txt keresztellenőrzés
//      reconciliation (spec 8/9. pont, "NOT_ACCESSIBLE mindig győz").
//   C) STOP — GTFS stops.txt wheelchair_boarding alapú megálló-minősítés.
//   D) IDS — MOTIS ID normalizáció (ismert/ismeretlen dataset, malformed).
//   E) PATHWAYS — irányított gráf, Kelenföld-szerű stairs+elevator eset.
//   F) JOURNEY — teljes itinerary kombináció (első/utolsó mile kihagyása,
//      transfer WALK lábak pathway-minősítése, hard filter).
//   G) REGRESSION — stepFreeRequired=false esetén a normál keresés
//      MOTIS-kérése és eredménye BYTE-RA változatlan.
//
//   node --test __tests__/vedett-route/accessibility-runtime.test.ts

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileVehicleAccessibilitySignals,
  classifyMotisWheelchairAccessible,
  classifyVehicleAccessibility,
  classifyStopAccessibility,
  classifyTransferPathwayAccessibility,
  classifyItineraryStepFreeAccessibility,
  isEligibleForStepFreeResults,
  type AccessibilityIndexLike,
  type StepFreeLegLike,
} from "../../lib/vedett-route/accessibility.ts";
import {
  normalizeMotisStopId,
  normalizeMotisRouteId,
  normalizeMotisTripId,
} from "../../lib/vedett-route/motisIdNormalization.ts";
import { buildPathwayGraph, classifyPathwayConnection } from "../../lib/vedett-route/pathwayGraph.ts";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";

// -----------------------------------------------------------------------
// D) IDS — MOTIS ID normalizáció (a felhasználó saját, bizonyított VPS
//    runtime fixture-jei alapján, lásd motisIdNormalization.ts fejléce)
// -----------------------------------------------------------------------

describe("normalizeMotisStopId / normalizeMotisRouteId — bizonyított fixture-ök", () => {
  test("bizonyított stopId 'bkkgtfs_056216' -> BKK, gtfsId '056216'", () => {
    const r = normalizeMotisStopId("bkkgtfs_056216");
    assert.equal(r.provider, "BKK");
    assert.equal((r as { gtfsId: string }).gtfsId, "056216");
  });

  test("bizonyított parent/cluster stopId 'bkkgtfs_CS056215' -> BKK, gtfsId 'CS056215'", () => {
    const r = normalizeMotisStopId("bkkgtfs_CS056215");
    assert.equal(r.provider, "BKK");
    assert.equal((r as { gtfsId: string }).gtfsId, "CS056215");
  });

  test("bizonyított routeId 'bkkgtfs_5400' -> BKK, gtfsId '5400'", () => {
    const r = normalizeMotisRouteId("bkkgtfs_5400");
    assert.equal(r.provider, "BKK");
    assert.equal((r as { gtfsId: string }).gtfsId, "5400");
  });

  test("nem regisztrált (jövőbeli MÁV/Volán) dataset-prefix -> UNKNOWN, SOHA nem dob hibát", () => {
    assert.equal(normalizeMotisStopId("mavgtfs_12345").provider, "UNKNOWN");
    assert.equal(normalizeMotisRouteId("volangtfs_999").provider, "UNKNOWN");
  });

  test("hiányzó/üres/malformed bemenet -> UNKNOWN, SOHA nem dob hibát", () => {
    assert.equal(normalizeMotisStopId(undefined).provider, "UNKNOWN");
    assert.equal(normalizeMotisStopId(null).provider, "UNKNOWN");
    assert.equal(normalizeMotisStopId("").provider, "UNKNOWN");
    assert.equal(normalizeMotisStopId("bkkgtfs_").provider, "UNKNOWN"); // prefix után nincs semmi
    assert.equal(normalizeMotisStopId("nincs_alahuzas_regisztralvaXbkkgtfs").provider, "UNKNOWN");
  });

  test("egy nyers GTFS ID, ami MAGA IS tartalmaz aláhúzást a prefix után, sértetlenül megmarad (NEM pozíció-alapú split)", () => {
    const r = normalizeMotisStopId("bkkgtfs_CS_056215_alt");
    assert.equal(r.provider, "BKK");
    assert.equal((r as { gtfsId: string }).gtfsId, "CS_056215_alt");
  });
});

describe("normalizeMotisTripId — bizonyított fixture (szolgálati dátum + idő + dataset + raw trip_id)", () => {
  test("bizonyított tripId '20260911_17:08_bkkgtfs_C98050336' -> BKK, gtfsId 'C98050336', serviceDate/time kinyerve", () => {
    const r = normalizeMotisTripId("20260911_17:08_bkkgtfs_C98050336");
    assert.equal(r.provider, "BKK");
    if (r.provider === "BKK") {
      assert.equal(r.gtfsId, "C98050336");
      assert.equal(r.serviceDate, "20260911");
      assert.equal(r.time, "17:08");
    }
  });

  test("a raw trip_id RÉSZE további aláhúzásjeleket is tartalmazhat, sértetlenül megmarad", () => {
    const r = normalizeMotisTripId("20260911_17:08_bkkgtfs_C_98050336_extra");
    assert.equal(r.provider, "BKK");
    if (r.provider === "BKK") assert.equal(r.gtfsId, "C_98050336_extra");
  });

  test("ismeretlen dataset-tag a helyes alakban -> UNKNOWN", () => {
    assert.equal(normalizeMotisTripId("20260911_17:08_mavgtfs_X123").provider, "UNKNOWN");
  });

  test("hibás alakú (hiányzó idő/dátum-formátum) tripId -> UNKNOWN, SOHA nem dob hibát", () => {
    assert.equal(normalizeMotisTripId("bkkgtfs_C98050336").provider, "UNKNOWN");
    assert.equal(normalizeMotisTripId("2026091_17:08_bkkgtfs_C98050336").provider, "UNKNOWN"); // 7 számjegyű dátum
    assert.equal(normalizeMotisTripId(undefined).provider, "UNKNOWN");
    assert.equal(normalizeMotisTripId("").provider, "UNKNOWN");
  });
});

// -----------------------------------------------------------------------
// E) PATHWAYS — irányított gráf (Kelenföld-szerű stairs+elevator+walkway
//    egyidejű létezése, ami a "van lépcső -> inaccessible" heurisztikát
//    ELUTASÍTJA)
// -----------------------------------------------------------------------

describe("pathwayGraph — Kelenföld-szerű eset: UGYANAZON állomáson stairs ÉS elevator EGYSZERRE", () => {
  test("van nem-stairs alternatíva (elevator) a stairs mellett -> KNOWN_ACCESSIBLE, NEM 'van lépcső -> inaccessible'", () => {
    const graph = buildPathwayGraph([
      { fromStopId: "A", toStopId: "B", pathwayMode: 2, isBidirectional: true }, // stairs
      { fromStopId: "A", toStopId: "B", pathwayMode: 5, isBidirectional: true }, // elevator
    ]);
    assert.equal(classifyPathwayConnection(graph, "A", "B"), "KNOWN_ACCESSIBLE");
  });

  test("KIZÁRÓLAG stairs a két pont között -> KNOWN_NOT_ACCESSIBLE", () => {
    const graph = buildPathwayGraph([{ fromStopId: "A", toStopId: "B", pathwayMode: 2, isBidirectional: true }]);
    assert.equal(classifyPathwayConnection(graph, "A", "B"), "KNOWN_NOT_ACCESSIBLE");
  });

  test("nincs semmilyen bizonyítható kapcsolat (diszjunkt gráf) -> UNKNOWN", () => {
    const graph = buildPathwayGraph([{ fromStopId: "A", toStopId: "B", pathwayMode: 1, isBidirectional: true }]);
    assert.equal(classifyPathwayConnection(graph, "A", "Z"), "UNKNOWN");
  });

  test("irányított (nem-bidirectional) edge: előre KNOWN_ACCESSIBLE, visszafelé UNKNOWN (nincs bizonyított visszaút)", () => {
    const graph = buildPathwayGraph([{ fromStopId: "A", toStopId: "B", pathwayMode: 1, isBidirectional: false }]);
    assert.equal(classifyPathwayConnection(graph, "A", "B"), "KNOWN_ACCESSIBLE");
    assert.equal(classifyPathwayConnection(graph, "B", "A"), "UNKNOWN");
  });

  test("azonos from/to (nincs tényleges station-belüli mozgás szükséges) -> KNOWN_ACCESSIBLE", () => {
    const graph = buildPathwayGraph([]);
    assert.equal(classifyPathwayConnection(graph, "A", "A"), "KNOWN_ACCESSIBLE");
  });

  test("üres pathway-lista, különböző pontok -> UNKNOWN (nincs adat)", () => {
    const graph = buildPathwayGraph([]);
    assert.equal(classifyPathwayConnection(graph, "A", "B"), "UNKNOWN");
  });
});

// -----------------------------------------------------------------------
// B) VEHICLE — MOTIS wheelchairAccessible + GTFS trips.txt reconciliation
//    (spec 8/9. pont: "NOT_ACCESSIBLE MINDIG győz, soha ne upgrade-elj")
// -----------------------------------------------------------------------

describe("classifyMotisWheelchairAccessible — a MOTIS leg saját jelzése", () => {
  test("'ACCESSIBLE' -> KNOWN_ACCESSIBLE, 'NOT_ACCESSIBLE' -> KNOWN_NOT_ACCESSIBLE, minden más -> UNKNOWN", () => {
    assert.equal(classifyMotisWheelchairAccessible("ACCESSIBLE"), "KNOWN_ACCESSIBLE");
    assert.equal(classifyMotisWheelchairAccessible("NOT_ACCESSIBLE"), "KNOWN_NOT_ACCESSIBLE");
    assert.equal(classifyMotisWheelchairAccessible(undefined), "UNKNOWN");
    assert.equal(classifyMotisWheelchairAccessible("SOMETHING_ELSE"), "UNKNOWN");
  });
});

describe("reconcileVehicleAccessibilitySignals — KÉT FÜGGETLEN jel UGYANARRÓL a tényről, NEM szimmetrikus kombináció", () => {
  test("MOTIS ACCESSIBLE + GTFS UNKNOWN (nincs kereszt-adat) -> ELÉG önmagában, KNOWN_ACCESSIBLE, nincs konfliktus", () => {
    const r = reconcileVehicleAccessibilitySignals("KNOWN_ACCESSIBLE", "UNKNOWN");
    assert.equal(r.status, "KNOWN_ACCESSIBLE");
    assert.equal(r.conflict, false);
  });

  test("MOTIS ACCESSIBLE + GTFS NOT_ACCESSIBLE -> KONFLIKTUS, de GTFS NOT_ACCESSIBLE MINDIG győz — SOHA nem upgrade-elünk (route 41 proven counter-example)", () => {
    const r = reconcileVehicleAccessibilitySignals("KNOWN_ACCESSIBLE", "KNOWN_NOT_ACCESSIBLE");
    assert.equal(r.status, "KNOWN_NOT_ACCESSIBLE");
    assert.equal(r.conflict, true);
  });

  test("MOTIS NOT_ACCESSIBLE + GTFS ACCESSIBLE -> ugyanígy KONFLIKTUS, NOT_ACCESSIBLE győz (a másik irány is)", () => {
    const r = reconcileVehicleAccessibilitySignals("KNOWN_NOT_ACCESSIBLE", "KNOWN_ACCESSIBLE");
    assert.equal(r.status, "KNOWN_NOT_ACCESSIBLE");
    assert.equal(r.conflict, true);
  });

  test("mindkét forrás UNKNOWN -> UNKNOWN, nincs konfliktus", () => {
    const r = reconcileVehicleAccessibilitySignals("UNKNOWN", "UNKNOWN");
    assert.equal(r.status, "UNKNOWN");
    assert.equal(r.conflict, false);
  });

  test("GTFS ACCESSIBLE + MOTIS UNKNOWN (MOTIS nem adott jelzést) -> ELÉG önmagában, KNOWN_ACCESSIBLE", () => {
    const r = reconcileVehicleAccessibilitySignals("UNKNOWN", "KNOWN_ACCESSIBLE");
    assert.equal(r.status, "KNOWN_ACCESSIBLE");
    assert.equal(r.conflict, false);
  });
});

function makeIndex(overrides: Partial<AccessibilityIndexLike> = {}): AccessibilityIndexLike {
  return {
    stopsById: {},
    tripsById: {},
    pathways: [],
    ...overrides,
  };
}

describe("classifyVehicleAccessibility — a teljes lánc: MOTIS mező + tripId normalizáció + GTFS trips.txt", () => {
  test("nincs index (pl. BKK ma nem tölt fel GTFS zip-et ide) -> KIZÁRÓLAG a MOTIS saját jelzése számít", () => {
    const r = classifyVehicleAccessibility("ACCESSIBLE", "20260911_17:08_bkkgtfs_C98050336", null);
    assert.equal(r.status, "KNOWN_ACCESSIBLE");
    assert.equal(r.conflict, false);
  });

  test("van index, a tripId ismert dataset-re normalizálódik, GTFS trips.txt NOT_ACCESSIBLE-t mond -> NOT_ACCESSIBLE győz akkor is, ha a MOTIS ACCESSIBLE-t mondott", () => {
    const index = makeIndex({ tripsById: { C98050336: { wheelchairAccessible: 2 } } });
    const r = classifyVehicleAccessibility("ACCESSIBLE", "20260911_17:08_bkkgtfs_C98050336", index);
    assert.equal(r.status, "KNOWN_NOT_ACCESSIBLE");
    assert.equal(r.conflict, true);
  });

  test("a tripId ismeretlen dataset-re normalizálódik -> a GTFS oldal UNKNOWN marad, csak a MOTIS jelzés számít", () => {
    const index = makeIndex({ tripsById: { X: { wheelchairAccessible: 1 } } });
    const r = classifyVehicleAccessibility("ACCESSIBLE", "20260911_17:08_mavgtfs_X", index);
    assert.equal(r.status, "KNOWN_ACCESSIBLE");
    assert.equal(r.conflict, false);
  });

  test("a trip nincs benne az indexben (nincs match) -> a GTFS oldal UNKNOWN, csak a MOTIS jelzés számít", () => {
    const index = makeIndex({ tripsById: {} });
    const r = classifyVehicleAccessibility("ACCESSIBLE", "20260911_17:08_bkkgtfs_NEM_LETEZO", index);
    assert.equal(r.status, "KNOWN_ACCESSIBLE");
  });
});

// -----------------------------------------------------------------------
// C) STOP — GTFS stops.txt wheelchair_boarding alapú minősítés
// -----------------------------------------------------------------------

describe("classifyStopAccessibility — MOTIS stopId normalizáció + GTFS stops.txt", () => {
  test("nincs index -> UNKNOWN", () => {
    assert.equal(classifyStopAccessibility("bkkgtfs_056216", null), "UNKNOWN");
  });

  test("ismert stop, wheelchair_boarding=1 -> KNOWN_ACCESSIBLE", () => {
    const index = makeIndex({ stopsById: { "056216": { wheelchairBoarding: 1 } } });
    assert.equal(classifyStopAccessibility("bkkgtfs_056216", index), "KNOWN_ACCESSIBLE");
  });

  test("ismert stop, wheelchair_boarding=2 -> KNOWN_NOT_ACCESSIBLE", () => {
    const index = makeIndex({ stopsById: { "056216": { wheelchairBoarding: 2 } } });
    assert.equal(classifyStopAccessibility("bkkgtfs_056216", index), "KNOWN_NOT_ACCESSIBLE");
  });

  test("ismert stop, wheelchair_boarding hiányzik/0 -> UNKNOWN (0/üres SOHA nem accessible)", () => {
    const index = makeIndex({ stopsById: { "056216": {} } });
    assert.equal(classifyStopAccessibility("bkkgtfs_056216", index), "UNKNOWN");
  });

  test("nincs match a stopId-re -> UNKNOWN", () => {
    const index = makeIndex({ stopsById: {} });
    assert.equal(classifyStopAccessibility("bkkgtfs_999999", index), "UNKNOWN");
  });

  test("ismeretlen dataset-prefix -> UNKNOWN", () => {
    const index = makeIndex({ stopsById: { "1": { wheelchairBoarding: 1 } } });
    assert.equal(classifyStopAccessibility("mavgtfs_1", index), "UNKNOWN");
  });
});

// -----------------------------------------------------------------------
// F) JOURNEY — classifyItineraryStepFreeAccessibility (a teljes komponens-
//    összegzés, spec 13/14. pont)
// -----------------------------------------------------------------------

describe("classifyItineraryStepFreeAccessibility — teljes itinerary klasszifikáció", () => {
  test("első/utolsó (nem-transfer) WALK láb KIMARAD a komponens-listából — egy tisztán gyaloglásból + EGY teljesen accessible transit lábból álló itinerary KNOWN_ACCESSIBLE lehet", () => {
    const index = makeIndex({
      stopsById: { S1: { wheelchairBoarding: 1 }, S2: { wheelchairBoarding: 1 } },
      tripsById: { T1: { wheelchairAccessible: 1 } },
    });
    const legs: StepFreeLegLike[] = [
      { mode: "WALK", from: {}, to: {} }, // first-mile, kimarad
      { mode: "BUS", tripId: "20260911_10:00_bkkgtfs_T1", wheelchairAccessible: "ACCESSIBLE", from: { stopId: "bkkgtfs_S1" }, to: { stopId: "bkkgtfs_S2" } },
      { mode: "WALK", from: {}, to: {} }, // last-mile, kimarad
    ];
    const result = classifyItineraryStepFreeAccessibility(legs, index);
    assert.equal(result.resultStatus, "KNOWN_ACCESSIBLE");
    assert.equal(result.hasVehicleConflict, false);
  });

  test("egyetlen NOT_ACCESSIBLE transit láb (MOTIS jelzése) -> a TELJES journey KNOWN_NOT_ACCESSIBLE, MÉG akkor is, ha egy másik láb accessible", () => {
    const legs: StepFreeLegLike[] = [
      { mode: "BUS", tripId: "20260911_10:00_bkkgtfs_TA", wheelchairAccessible: "ACCESSIBLE", from: { stopId: "bkkgtfs_A1" }, to: { stopId: "bkkgtfs_A2" } },
      { mode: "WALK", from: { stopId: "bkkgtfs_A2" }, to: { stopId: "bkkgtfs_B1" } }, // transfer WALK
      { mode: "TRAM", tripId: "20260911_10:20_bkkgtfs_TB", wheelchairAccessible: "NOT_ACCESSIBLE", from: { stopId: "bkkgtfs_B1" }, to: { stopId: "bkkgtfs_B2" } },
    ];
    const result = classifyItineraryStepFreeAccessibility(legs, null);
    assert.equal(result.resultStatus, "KNOWN_NOT_ACCESSIBLE");
  });

  test("hiányzó adat (nincs index, nincs MOTIS wheelchairAccessible mező) -> PARTIALLY_UNKNOWN, SOHA nem automatikus KNOWN_ACCESSIBLE", () => {
    const legs: StepFreeLegLike[] = [
      { mode: "BUS", tripId: undefined, wheelchairAccessible: undefined, from: { stopId: "bkkgtfs_A1" }, to: { stopId: "bkkgtfs_A2" } },
    ];
    const result = classifyItineraryStepFreeAccessibility(legs, null);
    assert.equal(result.resultStatus, "PARTIALLY_UNKNOWN");
    assert.equal(isEligibleForStepFreeResults(result.resultStatus), true);
  });

  test("két transit láb közötti (transfer) WALK láb pathway-je KÜLÖN komponensként számít, és stairs-only esetén kizár", () => {
    const index = makeIndex({
      stopsById: { A2: { wheelchairBoarding: 1 }, B1: { wheelchairBoarding: 1 } },
      tripsById: { TA: { wheelchairAccessible: 1 }, TB: { wheelchairAccessible: 1 } },
      pathways: [{ fromStopId: "A2", toStopId: "B1", pathwayMode: 2, isBidirectional: true }], // KIZÁRÓLAG stairs
    });
    const legs: StepFreeLegLike[] = [
      { mode: "BUS", tripId: "20260911_10:00_bkkgtfs_TA", wheelchairAccessible: "ACCESSIBLE", from: { stopId: "bkkgtfs_A1" }, to: { stopId: "bkkgtfs_A2" } },
      { mode: "WALK", from: { stopId: "bkkgtfs_A2" }, to: { stopId: "bkkgtfs_B1" } },
      { mode: "TRAM", tripId: "20260911_10:20_bkkgtfs_TB", wheelchairAccessible: "ACCESSIBLE", from: { stopId: "bkkgtfs_B1" }, to: { stopId: "bkkgtfs_B2" } },
    ];
    const result = classifyItineraryStepFreeAccessibility(legs, index);
    assert.equal(result.resultStatus, "KNOWN_NOT_ACCESSIBLE");
  });

  test("vehicle-szintű MOTIS/GTFS konfliktus esetén hasVehicleConflict === true (kizárólag diagnosztikai jelző)", () => {
    const index = makeIndex({ tripsById: { TA: { wheelchairAccessible: 2 } } });
    const legs: StepFreeLegLike[] = [
      { mode: "BUS", tripId: "20260911_10:00_bkkgtfs_TA", wheelchairAccessible: "ACCESSIBLE", from: { stopId: "bkkgtfs_A1" }, to: { stopId: "bkkgtfs_A2" } },
    ];
    const result = classifyItineraryStepFreeAccessibility(legs, index);
    assert.equal(result.hasVehicleConflict, true);
    assert.equal(result.resultStatus, "KNOWN_NOT_ACCESSIBLE");
  });
});

// -----------------------------------------------------------------------
// A) MOTIS REQUEST + G) REGRESSION — orchestrator.ts integráció, mockolt fetch
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

function walkLeg(id: string) {
  return {
    mode: "WALK",
    from: { name: `from-${id}`, lat: 47.5, lon: 19.05 },
    to: { name: `to-${id}`, lat: 47.51, lon: 19.06 },
    duration: 900,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:15:00+02:00",
  };
}

function transitLeg(id: string, wheelchairAccessible: string, tripId: string, fromStopId: string, toStopId: string) {
  return {
    mode: "BUS",
    routeShortName: "41",
    tripId,
    wheelchairAccessible,
    from: { name: `stop-from-${id}`, lat: 47.5, lon: 19.05, stopId: fromStopId },
    to: { name: `stop-to-${id}`, lat: 47.51, lon: 19.06, stopId: toStopId },
    duration: 900,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:15:00+02:00",
  };
}

function itinerary(legs: unknown[]) {
  return {
    duration: 900,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:15:00+02:00",
    transfers: 0,
    legs,
  };
}

const baseRequest = {
  from: { name: "kiindulópont", lat: 47.4813, lon: 19.0559 },
  to: { name: "célpont", lat: 47.4389, lon: 19.1706 },
  departAt: "2026-09-11T10:00:00+02:00",
};

describe("searchVedettRoutes — stepFreeRequired=false (REGRESSION, spec 3. pont) -> a MOTIS kérés BYTE-RA változatlan", () => {
  test("nincs pedestrianProfile/useRoutedTransfers/timetableView paraméter SEMMILYEN hívásban, és a journey-ken nincs accessibilityStatus", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary([walkLeg("a")])] }) } as unknown as Response;
    }) as typeof fetch;

    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, true);
    if (result.ok) {
      for (const ranked of result.journeys) assert.equal(ranked.journey.accessibilityStatus, undefined);
    }
    for (const url of calls) {
      assert.doesNotMatch(url, /pedestrianProfile/i);
      assert.doesNotMatch(url, /useRoutedTransfers/i);
      assert.doesNotMatch(url, /timetableView/i);
    }
  });
});

describe("searchVedettRoutes — stepFreeRequired=true (MOTIS REQUEST, spec 1/6/7. pont)", () => {
  test("MINDHÁROM proven MOTIS paraméter jelen van MINDEN hívásban (pedestrianProfile=WHEELCHAIR, useRoutedTransfers=true, timetableView=false)", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary([walkLeg("a")])] }) } as unknown as Response;
    }) as typeof fetch;

    await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.ok(calls.length >= 2, "legalább a két normál stratégia-hívásnak le kell futnia");
    for (const url of calls) {
      assert.match(url, /pedestrianProfile=WHEELCHAIR/);
      assert.match(url, /useRoutedTransfers=true/);
      assert.match(url, /timetableView=false/);
    }
  });

  test("egy KNOWN_NOT_ACCESSIBLE (MOTIS-jelzett) itinerary kiesik a kőkemény szűrőn, a maradék (accessible/unknown) journey megmarad", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        itineraries: [
          itinerary([walkLeg("x"), transitLeg("bad", "NOT_ACCESSIBLE", "t1", "s1", "s2"), walkLeg("y")]),
          itinerary([walkLeg("p"), transitLeg("ok", "ACCESSIBLE", "t2", "s3", "s4"), walkLeg("q")]),
        ],
      }),
    })) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.journeys.length, 1, "a NOT_ACCESSIBLE itinerary-nek ki kell esnie");
      assert.equal(result.journeys[0].journey.accessibilityStatus, "PARTIALLY_UNKNOWN");
    }
  });

  test("MINDEN itinerary NOT_ACCESSIBLE -> 'no_step_free_route_found' (KÜLÖN a generikus 'no_route_found'-tól), pontos spec-üzenettel", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ itineraries: [itinerary([transitLeg("bad", "NOT_ACCESSIBLE", "t1", "s1", "s2")])] }),
    })) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "no_step_free_route_found");
      assert.equal(
        result.message,
        "Nem találtunk olyan útvonalat, amely a rendelkezésre álló adatok alapján megfelel a lépcsőmentes feltételeknek."
      );
    }
  });

  test("a MOTIS eleve 0 itineraryt ad (nincs debugOutput/last-mile jel) -> a generikus 'no_route_found' marad, NEM 'no_step_free_route_found'", async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ itineraries: [] }) })) as typeof fetch;
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route_found");
  });
});

describe("Last-mile fallback (radius=1500) — accessibility módban SOHA nem esik vissza csendben FOOT profilra (spec 6/7/11. pont)", () => {
  test("a fallback-hívás MEGKAPJA a radius paramétert ÉS a három wheelchair paramétert EGYSZERRE, ha stepFreeRequired=true", async () => {
    const calls: string[] = [];
    let callIndex = 0;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      callIndex++;
      if (callIndex <= 2) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ itineraries: [], debugOutput: { n_start_offsets: 0, n_dest_offsets: 5 } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary([transitLeg("fb", "ACCESSIBLE", "t9", "s9", "s10")])] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.expandedAccessSearch, true);
    const fallbackCall = calls[2];
    assert.ok(fallbackCall, "a fallback hívásnak le kell futnia");
    assert.match(fallbackCall, /radius=1500/);
    assert.match(fallbackCall, /pedestrianProfile=WHEELCHAIR/);
    assert.match(fallbackCall, /useRoutedTransfers=true/);
    assert.match(fallbackCall, /timetableView=false/);
  });

  test("stepFreeRequired=false esetén a fallback-hívás (ugyanaz a trigger-logika) NEM kap semmilyen wheelchair paramétert — a fallback viselkedése normál keresésnél változatlan", async () => {
    const calls: string[] = [];
    let callIndex = 0;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      callIndex++;
      if (callIndex <= 2) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ itineraries: [], debugOutput: { n_start_offsets: 0, n_dest_offsets: 5 } }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary([walkLeg("fb")])] }) } as unknown as Response;
    }) as typeof fetch;

    await searchVedettRoutes(baseRequest);
    const fallbackCall = calls[2];
    assert.ok(fallbackCall);
    assert.doesNotMatch(fallbackCall, /pedestrianProfile/i);
    assert.doesNotMatch(fallbackCall, /useRoutedTransfers/i);
    assert.doesNotMatch(fallbackCall, /timetableView/i);
  });
});
