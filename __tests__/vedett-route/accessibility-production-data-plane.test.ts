// VÉDETT ÚTVONAL — TASK C3 PRODUCTION DATA PLANE integrációs tesztek.
//
// Ez a fájl az orchestrator.ts + accessibilityLookupClient.ts EGYÜTTES
// viselkedését teszteli, mockolt globalThis.fetch-csel: mindkét célt
// (MOTIS route-service hívások ÉS a VPS accessibility-sidecar /lookup
// hívása) EGYETLEN mock fetch-implementáció szolgálja ki, az URL alapján
// szétválasztva — pontosan úgy, ahogy egy valódi kérésben is két külön
// szerver-to-szerver célpont volna.
//
// Kategóriák a spec 23. pontja szerint: CLASSIFIER INTEGRATION, NORMAL
// MODE REGRESSION, LAST-MILE.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";

const originalFetch = globalThis.fetch;
const ENV_KEYS = [
  "MOTIS_BASE_URL",
  "ROUTE_SERVICE_URL",
  "ROUTE_SERVICE_AUTH_TOKEN",
  "ACCESSIBILITY_SIDECAR_URL",
  "ACCESSIBILITY_SIDECAR_AUTH_TOKEN",
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  process.env.MOTIS_BASE_URL = "http://localhost:8080";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function configureSidecar(): void {
  process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "sidecar-secret";
}

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

function transferWalkLeg(fromStopId: string, toStopId: string) {
  return {
    mode: "WALK",
    from: { name: "atszallas-from", lat: 47.5, lon: 19.05, stopId: fromStopId },
    to: { name: "atszallas-to", lat: 47.51, lon: 19.06, stopId: toStopId },
    duration: 180,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:03:00+02:00",
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

// Egy mock fetch, ami MOTIS-választ ad a "localhost:8080" hívásokra, és a
// sidecar lookup-válaszát a "/accessibility/lookup" hívásra — pontosan
// úgy, mint egy éles rendszerben KÉT KÜLÖNBÖZŐ szerver-to-szerver
// célponthoz.
function makeSplitFetch(opts: {
  motisItineraries: unknown[];
  sidecarResponse?: unknown;
  onSidecarCall?: (body: unknown) => void;
  sidecarCallCount?: { count: number };
}): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/accessibility/lookup")) {
      if (opts.sidecarCallCount) opts.sidecarCallCount.count++;
      if (opts.onSidecarCall) opts.onSidecarCall(JSON.parse(String(init?.body)));
      return { ok: true, status: 200, json: async () => opts.sidecarResponse ?? { status: "unavailable", stops: {}, trips: {}, pathways: [] } } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ itineraries: opts.motisItineraries }) } as unknown as Response;
  }) as typeof fetch;
}

describe("NORMAL MODE REGRESSION (spec 22. pont) — stepFreeRequired=false esetén a sidecar SOHA nem kap hívást", () => {
  test("stepFreeRequired hiányzik -> nulla /lookup hívás, még akkor is, ha a sidecar konfigurálva van", async () => {
    configureSidecar();
    const sidecarCallCount = { count: 0 };
    globalThis.fetch = makeSplitFetch({ motisItineraries: [itinerary([walkLeg("a")])], sidecarCallCount });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, true);
    assert.equal(sidecarCallCount.count, 0);
  });

  test("stepFreeRequired=false -> nulla /lookup hívás", async () => {
    configureSidecar();
    const sidecarCallCount = { count: 0 };
    globalThis.fetch = makeSplitFetch({ motisItineraries: [itinerary([walkLeg("a")])], sidecarCallCount });
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: false });
    assert.equal(result.ok, true);
    assert.equal(sidecarCallCount.count, 0);
  });
});

describe("CLASSIFIER INTEGRATION (spec 22/23. pont) — a sidecar válasza a MEGLÉVŐ, változatlan accessibility.ts klasszifikáción keresztül érvényesül", () => {
  test("a sidecar egy stop-ot wheelchairBoarding=2 (NOT_ACCESSIBLE)-ként ad -> a candidate kiesik", async () => {
    configureSidecar();
    globalThis.fetch = makeSplitFetch({
      motisItineraries: [itinerary([transitLeg("a", "UNKNOWN", "20260911_10:00_bkkgtfs_T1", "bkkgtfs_S1", "bkkgtfs_S2")])],
      sidecarResponse: {
        status: "ok",
        provider: "BKK",
        dataset: "bkkgtfs",
        generation: "g1",
        builtAt: "now",
        stops: { S1: { stopId: "S1", wheelchairBoarding: 1 }, S2: { stopId: "S2", wheelchairBoarding: 2 } },
        trips: { T1: { tripId: "T1", wheelchairAccessible: 1 } },
        pathways: [],
      },
    });
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, false, "az egyetlen candidate KNOWN_NOT_ACCESSIBLE stop miatt kiesik -> nincs eligible eredmény");
    if (!result.ok) assert.equal(result.reason, "no_step_free_route_found");
  });

  test("a sidecar szerint minden komponens accessible -> KNOWN_ACCESSIBLE, a candidate megmarad", async () => {
    configureSidecar();
    globalThis.fetch = makeSplitFetch({
      motisItineraries: [itinerary([transitLeg("a", "ACCESSIBLE", "20260911_10:00_bkkgtfs_T1", "bkkgtfs_S1", "bkkgtfs_S2")])],
      sidecarResponse: {
        status: "ok",
        provider: "BKK",
        dataset: "bkkgtfs",
        generation: "g1",
        builtAt: "now",
        stops: { S1: { stopId: "S1", wheelchairBoarding: 1 }, S2: { stopId: "S2", wheelchairBoarding: 1 } },
        trips: { T1: { tripId: "T1", wheelchairAccessible: 1 } },
        pathways: [],
      },
    });
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.journeys[0].journey.accessibilityStatus, "KNOWN_ACCESSIBLE");
  });

  test("pathway lekérdezés csak lépcsős kapcsolatot ad vissza a két transit láb közötti transzferhez -> a journey kiesik", async () => {
    configureSidecar();
    globalThis.fetch = makeSplitFetch({
      motisItineraries: [
        itinerary([
          transitLeg("a", "ACCESSIBLE", "20260911_10:00_bkkgtfs_T1", "bkkgtfs_S1", "bkkgtfs_S2"),
          transferWalkLeg("bkkgtfs_S2", "bkkgtfs_S3"),
          transitLeg("b", "ACCESSIBLE", "20260911_10:05_bkkgtfs_T2", "bkkgtfs_S3", "bkkgtfs_S4"),
        ]),
      ],
      sidecarResponse: {
        status: "ok",
        provider: "BKK",
        dataset: "bkkgtfs",
        generation: "g1",
        builtAt: "now",
        stops: {
          S1: { stopId: "S1", wheelchairBoarding: 1 },
          S2: { stopId: "S2", wheelchairBoarding: 1 },
          S3: { stopId: "S3", wheelchairBoarding: 1 },
          S4: { stopId: "S4", wheelchairBoarding: 1 },
        },
        trips: { T1: { tripId: "T1", wheelchairAccessible: 1 }, T2: { tripId: "T2", wheelchairAccessible: 1 } },
        pathways: [{ pathwayId: "PW1", fromStopId: "S2", toStopId: "S3", pathwayMode: 2, isBidirectional: true }], // GTFS pathway_mode 2 = STAIRS (lásd pathwayGraph.ts)
      },
    });
    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, false, "a KIZÁRÓLAG lépcsős transfer-pathway KNOWN_NOT_ACCESSIBLE-t eredményez -> kiesik");
  });

  test("MOTIS NOT_ACCESSIBLE jelzés a sidecar-lookup TELJES sikertelensége (500) mellett is hard-rejectel — sosem esik vissza csendben elfogadásra", async () => {
    configureSidecar();
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/accessibility/lookup")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary([transitLeg("a", "NOT_ACCESSIBLE", "20260911_10:00_bkkgtfs_T1", "bkkgtfs_S1", "bkkgtfs_S2")])] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, false, "a MOTIS saját NOT_ACCESSIBLE jelzése FÜGGETLEN a sidecar állapotától, és önmagában is kizár");
    if (!result.ok) assert.equal(result.reason, "no_step_free_route_found");
  });

  test("sidecar lookup teljesen elérhetetlen (500), de a MOTIS jelzés ACCESSIBLE -> SOHA nem KNOWN_ACCESSIBLE, legfeljebb PARTIALLY_UNKNOWN", async () => {
    configureSidecar();
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/accessibility/lookup")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary([transitLeg("a", "ACCESSIBLE", "20260911_10:00_bkkgtfs_T1", "bkkgtfs_S1", "bkkgtfs_S2")])] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.notEqual(
        result.journeys[0].journey.accessibilityStatus,
        "KNOWN_ACCESSIBLE",
        "lookup-hiba esetén a stop-komponensek UNKNOWN-ra esnek, tehát a végeredmény legfeljebb PARTIALLY_UNKNOWN lehet"
      );
      assert.equal(result.journeys[0].journey.accessibilityStatus, "PARTIALLY_UNKNOWN");
    }
  });
});

describe("LAST-MILE (spec 22/23. pont) — a lookup a VÉGLEGES (fallback utáni) itineraryk alapján fut", () => {
  test("last-mile fallback (radius=1500) esetén a sidecar-lookup a FALLBACK itineraryból származó stop/trip id-ket kérdezi le, nem az eredeti (0 itinerary) próbálkozásból", async () => {
    configureSidecar();
    let callIndex = 0;
    let capturedSidecarBody: { stopIds: string[] } | null = null;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/accessibility/lookup")) {
        capturedSidecarBody = JSON.parse(String(init?.body));
        return { ok: true, status: 200, json: async () => ({ status: "unavailable", stops: {}, trips: {}, pathways: [] }) } as unknown as Response;
      }
      callIndex++;
      if (callIndex <= 2) {
        // A két normál stratégia mindegyike explicit 0 last-mile offsettel, 0 itineraryval válaszol.
        return {
          ok: true,
          status: 200,
          json: async () => ({ itineraries: [], debugOutput: { n_start_offsets: 0, n_dest_offsets: 5 } }),
        } as unknown as Response;
      }
      // A radius=1500 fallback-hívás (a 3. fetch) TÉNYLEGES itineraryt ad vissza.
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary([transitLeg("fb", "ACCESSIBLE", "20260911_10:00_bkkgtfs_FBTRIP", "bkkgtfs_FBSTOP1", "bkkgtfs_FBSTOP2")])] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await searchVedettRoutes({ ...baseRequest, stepFreeRequired: true });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.expandedAccessSearch, true);
    assert.ok(capturedSidecarBody, "a lookupnak meg kellett történnie a fallback itinerary alapján");
    assert.deepEqual(new Set(capturedSidecarBody!.stopIds), new Set(["FBSTOP1", "FBSTOP2"]), "a lookup a FALLBACK itinerary stop id-jeit kérdezte le, nem az eredeti (üres) próbálkozásét");
  });
});
