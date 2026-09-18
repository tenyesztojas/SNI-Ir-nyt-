// VÉDETT ÚTVONAL — STOP-BASED TRANSIT CANDIDATE sprint (2026-09-17) —
// buildNearbyTransitJourneyCandidates() / composeMotisStopId() /
// computeTransitDepartureTime() tesztek.
//
// MOCKOLÁSI MEGJEGYZÉS: a spec "mockold buildNearbyTransitAccessCandidates,
// fetchMotisPlan" függvény-szintű mockolást kért. Ebben a repóban NINCS
// precedens modul-szintű (node:test mock.module) mockolásra, és a
// futtatáshoz használt Node verzió (v22.23.x) nem támogatja a
// mock.module()-t flag nélkül (--experimental-test-module-mocking
// ismeretlen kapcsoló ezen a verzión) — ezért, UGYANAZT a mintát követve,
// mint accessibility-nearby-stops-client.test.ts és
// motis-walking-route-client.test.ts, a globalThis.fetch-et mockoljuk, URL
// alapján elágazva (/nearby-stops, /api/route, /api/v6/plan). Mivel MIND
// lookupNearbyStops(), MIND fetchMotisWalkingRoute(), MIND fetchMotisPlan()
// végül ugyanide, a fetch-be futnak ki, ez FUNKCIONÁLISAN egyenértékű a
// kért függvény-szintű mockolással — és emellett a teljes lánc valós
// integrációját is teszteli. Élő MOTIS-t/sidecart unit tesztből nem
// használunk.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildNearbyTransitJourneyCandidates,
  composeMotisStopId,
  computeTransitDepartureTime,
} from "../../lib/vedett-route/nearbyTransitJourneyCandidates.ts";

const originalFetch = globalThis.fetch;
const ENV_KEYS = [
  "ACCESSIBILITY_SIDECAR_URL",
  "ACCESSIBILITY_SIDECAR_AUTH_TOKEN",
  "MOTIS_BASE_URL",
  "ROUTE_SERVICE_URL",
  "ROUTE_SERVICE_AUTH_TOKEN",
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "sidecar-secret";
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

const ORIGIN = { lat: 47.5005, lon: 19.0248 };
const DESTINATION = { lat: 47.55, lon: 19.09 };
const DEPART_AT = "2026-09-17T11:10:00.000Z";

function nearbyStop(overrides: Partial<{ stopId: string; parentStation?: string; name?: string; lat: number; lon: number; distanceMeters: number }> = {}) {
  return { stopId: "S1", lat: 47.50045, lon: 19.024604, distanceMeters: 42, ...overrides };
}

function validStreetRouteResponse(overrides: Partial<{ duration: number; distance: number; uses_elevator: boolean }> = {}) {
  return {
    type: "FeatureCollection",
    metadata: { duration: 115, distance: 141.0995054244995, uses_elevator: false, ...overrides },
    features: [
      { type: "Feature", properties: { level: 0, way: 0 }, geometry: { type: "LineString", coordinates: [[19.0248, 47.5005], [19.024604, 47.50045]] } },
    ],
  };
}

function itinerary(overrides: Partial<{ duration: number; startTime: string; endTime: string; transfers: number }> = {}) {
  return {
    duration: 300,
    startTime: "2026-09-17T11:12:00.000Z",
    endTime: "2026-09-17T11:17:00.000Z",
    transfers: 0,
    legs: [{ mode: "SUBWAY", from: { name: "A" }, to: { name: "B" } }],
    ...overrides,
  };
}

type PlanOutcome = "success" | "failure" | "malformed" | "empty";

/**
 * URL alapján elágazó fetch-mock: /nearby-stops -> `stops`; /api/route ->
 * mindig sikeres (fix metadata, felülírható); /api/v6/plan ->
 * `planResolver(fromPlace)` dönt (siker/hiba/malformed/üres).
 */
function mockFetch(
  stops: ReturnType<typeof nearbyStop>[],
  planResolver: (fromPlace: string) => PlanOutcome,
  capture?: { urls: string[] }
) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    capture?.urls.push(url);
    if (url.includes("/nearby-stops")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
    }
    if (url.includes("/api/route")) {
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }
    if (url.includes("/api/v6/plan")) {
      const parsed = new URL(url);
      const fromPlace = parsed.searchParams.get("fromPlace") ?? "";
      const outcome = planResolver(fromPlace);
      if (outcome === "failure") return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      if (outcome === "malformed") {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("bad json");
          },
        } as unknown as Response;
      }
      if (outcome === "empty") {
        return { ok: true, status: 200, json: async () => ({ itineraries: [] }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary()] }) } as unknown as Response;
    }
    throw new Error(`unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
}

describe("composeMotisStopId", () => {
  test("ismert provider -> '<tag>_<gtfsId>' kompozit alak", () => {
    assert.equal(composeMotisStopId("BKK", "F00094"), "bkkgtfs_F00094");
  });
  test("ismeretlen provider -> null", () => {
    assert.equal(composeMotisStopId("MAV_RAIL", "F00094"), null);
  });
  test("üres gtfsId -> null", () => {
    assert.equal(composeMotisStopId("BKK", ""), null);
  });
});

describe("computeTransitDepartureTime", () => {
  test("115 sec pontos időeltolás", () => {
    assert.equal(computeTransitDepartureTime("2026-09-17T11:10:00.000Z", 115), "2026-09-17T11:11:55.000Z");
  });
  test("0 sec -> változatlan időpont", () => {
    assert.equal(computeTransitDepartureTime("2026-09-17T11:10:00.000Z", 0), "2026-09-17T11:10:00.000Z");
  });
  test("Date.now nincs hatással az eredményre — determinisztikus, ismételt hívás azonos", () => {
    const a = computeTransitDepartureTime("2026-09-17T11:10:00.000Z", 115);
    const b = computeTransitDepartureTime("2026-09-17T11:10:00.000Z", 115);
    assert.equal(a, b);
  });
  test("érvénytelen originalDepartAt -> null", () => {
    assert.equal(computeTransitDepartureTime("not-a-date", 115), null);
  });
  test("negatív walkingDurationSeconds -> null", () => {
    assert.equal(computeTransitDepartureTime("2026-09-17T11:10:00.000Z", -5), null);
  });
});

describe("buildNearbyTransitJourneyCandidates — egy access candidate -> egy transit plan", () => {
  test("sikeres eset: stopId kerül fromPlace-be, destination megmarad, transitDepartureTime helyes", async () => {
    const stops = [nearbyStop({ stopId: "F00094" })];
    const capturedUrls: string[] = [];
    mockFetch(stops, () => "success", { urls: capturedUrls });

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.transitDepartureTime, "2026-09-17T11:11:55.000Z");
    assert.equal(c.access.stopId, "F00094");
    assert.equal(c.itineraries.length, 1);

    const planUrl = capturedUrls.find((u) => u.includes("/api/v6/plan"));
    assert.ok(planUrl);
    const parsed = new URL(planUrl!);
    assert.equal(parsed.searchParams.get("fromPlace"), "bkkgtfs_F00094");
    assert.equal(parsed.searchParams.get("toPlace"), "47.55,19.09");
    assert.equal(parsed.searchParams.get("time"), "2026-09-17T11:11:55.000Z");
  });

  test("access geometry/walking distance-duration/discovery distance/parentStation/name megmarad", async () => {
    const stops = [nearbyStop({ stopId: "F00094", parentStation: "PARENT_X", name: "Nev X", distanceMeters: 42 })];
    mockFetch(stops, () => "success");
    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    const access = result.candidates[0].access;
    assert.equal(access.parentStation, "PARENT_X");
    assert.equal(access.stopName, "Nev X");
    assert.equal(access.discoveryDistanceMeters, 42);
    assert.equal(access.walkingDistanceMeters, 141.0995054244995);
    assert.equal(access.walkingDurationSeconds, 115);
    assert.deepEqual(access.walkingGeometry, [[19.0248, 47.5005], [19.024604, 47.50045]]);
  });

  test("nincs JourneyLeg/Journey gyártás — a candidate alak PONTOSAN {access, transitDepartureTime, itineraries}", async () => {
    const stops = [nearbyStop({ stopId: "F00094" })];
    mockFetch(stops, () => "success");
    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.deepEqual(Object.keys(result.candidates[0]).sort(), ["access", "itineraries", "transitDepartureTime"]);
  });
});

describe("buildNearbyTransitJourneyCandidates — több access candidate", () => {
  test("külön, korrigált transitDepartureTime minden candidate-hez (más walkingDurationSeconds)", async () => {
    const stops = [
      nearbyStop({ stopId: "A", lat: 47.51 }),
      nearbyStop({ stopId: "B", lat: 47.52 }),
    ];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      if (url.includes("/api/route")) {
        const parsed = new URL(url, "http://x");
        // a walking mock választ a destination lat alapján különböztetjük meg — de itt egyszerűbb: body-ból olvasunk
        return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary()] }) } as unknown as Response;
    }) as typeof fetch;

    // Külön mock a walking route-hoz, hogy a két stop különböző walkingDurationSeconds-t kapjon.
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      if (url.includes("/api/route")) {
        const body = JSON.parse(String(init?.body));
        const duration = body.destination.lat === 47.51 ? 60 : 200;
        return { ok: true, status: 200, json: async () => validStreetRouteResponse({ duration }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary()] }) } as unknown as Response;
    }) as typeof fetch;

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });

    const byStop = new Map(result.candidates.map((c) => [c.access.stopId, c.transitDepartureTime]));
    assert.equal(byStop.get("A"), "2026-09-17T11:11:00.000Z"); // +60s
    assert.equal(byStop.get("B"), "2026-09-17T11:13:20.000Z"); // +200s
  });

  test("több itinerary egy stophoz kezelve — a candidate.itineraries a TELJES listát megőrzi", async () => {
    const stops = [nearbyStop({ stopId: "F00094" })];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      if (url.includes("/api/route")) return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary({ duration: 100 }), itinerary({ duration: 200 }), itinerary({ duration: 300 })] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.equal(result.candidates[0].itineraries.length, 3);
  });

  test("itineraries ÉS direct mező is összefűződik (MEGLÉVŐ MOTIS contract, mint orchestrator.ts-ben)", async () => {
    const stops = [nearbyStop({ stopId: "F00094" })];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      if (url.includes("/api/route")) return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ itineraries: [itinerary({ duration: 100 })], direct: [itinerary({ duration: 999 })] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.equal(result.candidates[0].itineraries.length, 2);
  });
});

describe("buildNearbyTransitJourneyCandidates — fail-safe viselkedés", () => {
  test("nincs access candidate -> 0 transit plan request", async () => {
    let planCalled = false;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops: [] }) } as unknown as Response;
      planCalled = true;
      throw new Error("plan-nak nem kellene meghívódnia");
    }) as typeof fetch;

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.deepEqual(result.candidates, []);
    assert.equal(planCalled, false);
  });

  test("3 stopból A siker, B transit timeout/hiba, C malformed -> csak A marad", async () => {
    const stops = [
      nearbyStop({ stopId: "A", lat: 47.51 }),
      nearbyStop({ stopId: "B", lat: 47.52 }),
      nearbyStop({ stopId: "C", lat: 47.53 }),
    ];
    mockFetch(stops, (fromPlace) => {
      if (fromPlace === "bkkgtfs_A") return "success";
      if (fromPlace === "bkkgtfs_B") return "failure";
      return "malformed";
    });

    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
      nearbyStopLimit: 3,
    });
    assert.deepEqual(result.candidates.map((c) => c.access.stopId), ["A"]);
  });

  test("minden transit plan sikertelen -> fail-safe üres eredmény (nem hiba)", async () => {
    const stops = [nearbyStop({ stopId: "A" }), nearbyStop({ stopId: "B" })];
    mockFetch(stops, () => "failure");
    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.candidates, []);
  });

  test("malformed transit válasz (json() dob) fail-safe, nem dob kivételt", async () => {
    const stops = [nearbyStop({ stopId: "A" })];
    mockFetch(stops, () => "malformed");
    await assert.doesNotReject(async () => {
      const result = await buildNearbyTransitJourneyCandidates({
        provider: "BKK",
        originLat: ORIGIN.lat,
        originLon: ORIGIN.lon,
        destination: DESTINATION,
        originalDepartAt: DEPART_AT,
      });
      assert.deepEqual(result.candidates, []);
    });
  });

  test("üres itineraries válasz -> a candidate kimarad, nem hiba", async () => {
    const stops = [nearbyStop({ stopId: "A" })];
    mockFetch(stops, () => "empty");
    const result = await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
    });
    assert.deepEqual(result.candidates, []);
  });
});

describe("buildNearbyTransitJourneyCandidates — request-költségvetés", () => {
  test("legfeljebb nearbyStopLimit transit plan hívás indul", async () => {
    const stops = [
      nearbyStop({ stopId: "S1", lat: 47.51 }),
      nearbyStop({ stopId: "S2", lat: 47.52 }),
      nearbyStop({ stopId: "S3", lat: 47.53 }),
      nearbyStop({ stopId: "S4", lat: 47.54 }),
    ];
    let planCallCount = 0;
    let nearbyCallCount = 0;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        nearbyCallCount++;
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      if (url.includes("/api/route")) return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
      planCallCount++;
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary()] }) } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
      nearbyStopLimit: 2,
    });
    assert.equal(nearbyCallCount, 1, "nincs második nearby lookup");
    assert.equal(planCallCount, 2, "legfeljebb nearbyStopLimit transit plan hívás");
  });

  test("nincs automatikus radius-bővítés — a radiusMeters változatlanul, egyszer kerül továbbadásra", async () => {
    const stops = [nearbyStop({ stopId: "A" })];
    let capturedRadius: number | undefined;
    let nearbyCallCount = 0;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        nearbyCallCount++;
        const body = JSON.parse(String(init?.body));
        capturedRadius = body.radiusMeters;
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      if (url.includes("/api/route")) return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ itineraries: [itinerary()] }) } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitJourneyCandidates({
      provider: "BKK",
      originLat: ORIGIN.lat,
      originLon: ORIGIN.lon,
      destination: DESTINATION,
      originalDepartAt: DEPART_AT,
      radiusMeters: 300,
    });
    assert.equal(nearbyCallCount, 1);
    assert.equal(capturedRadius, 300);
  });
});

// NEARBY TRANSIT ACCESS / DIRECT TRANSIT CANDIDATE SPRINT (2026-09-18) — a
// KORÁBBI "izolációs" audit (lásd git history) most az ELLENKEZŐJÉT
// bizonyítja: az orchestrator.ts EZUTÁN MÁR importálja és hívja ezt a
// modult (lásd searchVedettRoutes() nearbyJourneys ága) — ez a sprint
// szándékos, tervezett integrációs lépése, NEM regresszió.
describe("buildNearbyTransitJourneyCandidates — production wiring audit (source-audit teszt)", () => {
  test("orchestrator.ts importálja és hívja a nearbyTransitJourneyCandidates modult (NEARBY TRANSIT ACCESS integráció)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orchestratorPath = path.join(process.cwd(), "lib/vedett-route/orchestrator.ts");
    const src = fs.readFileSync(orchestratorPath, "utf8");
    assert.ok(src.includes('from "./nearbyTransitJourneyCandidates.ts"'), "orchestrator.ts-nek importálnia kell a stop-based builder modult");
    assert.ok(src.includes("buildNearbyTransitJourneyCandidates("), "orchestrator.ts-nek ténylegesen hívnia kell a buildert");
  });

  test("a nearby expansion a stepFreeRequired ágon KIMARAD (a lépcsőmentes klasszifikáció nyers MOTIS legs-eket igényel)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orchestratorPath = path.join(process.cwd(), "lib/vedett-route/orchestrator.ts");
    const src = fs.readFileSync(orchestratorPath, "utf8");
    assert.match(src, /request\.stepFreeRequired\s*\?\s*Promise\.resolve<Journey\[\]>\(\[\]\)\s*:\s*fetchNearbyTransitAccessJourneys/);
  });
});
