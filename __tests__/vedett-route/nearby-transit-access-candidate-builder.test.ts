// VÉDETT ÚTVONAL — NEARBY TRANSIT ACCESS: candidate-builder tesztek
// (integráció előtti candidate-builder sprint, 2026-09-17).
//
// lib/vedett-route/nearbyTransitAccess.ts buildNearbyTransitAccessCandidates()
// — mockolja MIND a lookupNearbyStops(), MIND a fetchMotisWalkingRoute()
// alatt hívott globalThis.fetch-et (URL alapján elágazva /nearby-stops
// vagy /api/route felé), UGYANAZT a mintát követve, mint
// accessibility-nearby-stops-client.test.ts és
// motis-walking-route-client.test.ts. Nincs élő szerver-függés.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildNearbyTransitAccessCandidates,
  DEFAULT_NEARBY_STOP_LIMIT,
  MAX_NEARBY_STOP_LIMIT,
} from "../../lib/vedett-route/nearbyTransitAccess.ts";

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

function nearbyStop(overrides: Partial<{ stopId: string; parentStation?: string; name?: string; lat: number; lon: number; distanceMeters: number }> = {}) {
  return {
    stopId: "S1",
    lat: 47.50045,
    lon: 19.024604,
    distanceMeters: 42,
    ...overrides,
  };
}

function validStreetRouteResponse(overrides: Partial<{ duration: number; distance: number; uses_elevator: boolean }> = {}) {
  return {
    type: "FeatureCollection",
    metadata: { duration: 100, distance: 130, uses_elevator: false, ...overrides },
    features: [
      {
        type: "Feature",
        properties: { level: 0, way: 0 },
        geometry: { type: "LineString", coordinates: [[19.0248, 47.5005], [19.024604, 47.50045]] },
      },
    ],
  };
}

/**
 * Egy fetch-mock, ami URL alapján elágazik: /nearby-stops -> a megadott
 * `stops` tömböt adja vissza sikeresként; /api/route -> egy
 * per-stopId-alapú resolver dönti el a választ (siker/hiba/malformed).
 */
function mockFetch(
  stops: ReturnType<typeof nearbyStop>[],
  walkingResolver: (bodyDestination: { lat: number; lng: number }) => "success" | "failure" | "malformed_geometry" | "timeout" | "malformed_metadata",
  successOverrides?: (bodyDestination: { lat: number; lng: number }) => Partial<{ duration: number; distance: number; uses_elevator: boolean }>
) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/nearby-stops")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
    }
    if (url.includes("/api/route")) {
      const body = JSON.parse(String(init?.body)) as { destination: { lat: number; lng: number } };
      const outcome = walkingResolver(body.destination);
      if (outcome === "timeout") {
        const err = new Error("aborted");
        err.name = "TimeoutError";
        throw err;
      }
      if (outcome === "failure") {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      if (outcome === "malformed_geometry") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: "FeatureCollection",
            metadata: { duration: 100, distance: 130, uses_elevator: false },
            features: [],
          }),
        } as unknown as Response;
      }
      if (outcome === "malformed_metadata") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ type: "FeatureCollection", metadata: { duration: -1, distance: 130, uses_elevator: false }, features: [] }),
        } as unknown as Response;
      }
      const overrides = successOverrides ? successOverrides(body.destination) : {};
      return { ok: true, status: 200, json: async () => validStreetRouteResponse(overrides) } as unknown as Response;
    }
    throw new Error(`unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
}

describe("buildNearbyTransitAccessCandidates — egy közeli megálló, sikeres gyalogos route", () => {
  test("egy stop + sikeres walking route -> egy candidate, minden mezővel", async () => {
    const stops = [nearbyStop({ stopId: "S1", parentStation: "P1", name: "Stop One", lat: 47.50045, lon: 19.024604, distanceMeters: 42 })];
    mockFetch(stops, () => "success");

    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.stopId, "S1");
    assert.equal(c.parentStation, "P1");
    assert.equal(c.stopName, "Stop One");
    assert.equal(c.stopLat, 47.50045);
    assert.equal(c.stopLon, 19.024604);
    assert.equal(c.discoveryDistanceMeters, 42);
    assert.equal(c.walkingDistanceMeters, 130);
    assert.equal(c.walkingDurationSeconds, 100);
    assert.equal(c.usesElevator, false);
    assert.deepEqual(c.walkingGeometry, [[19.0248, 47.5005], [19.024604, 47.50045]]);
  });

  test("discoveryDistanceMeters és walkingDistanceMeters SOSEM keverődik össze", async () => {
    const stops = [nearbyStop({ stopId: "S1", distanceMeters: 42 })];
    mockFetch(stops, () => "success", () => ({ distance: 999 }));
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(result.candidates[0].discoveryDistanceMeters, 42);
    assert.equal(result.candidates[0].walkingDistanceMeters, 999);
    assert.notEqual(result.candidates[0].discoveryDistanceMeters, result.candidates[0].walkingDistanceMeters);
  });

  test("usesElevator és parentStation/name megőrződik", async () => {
    const stops = [nearbyStop({ stopId: "S1", parentStation: "PARENT_X", name: "Nev X" })];
    mockFetch(stops, () => "success", () => ({ uses_elevator: true }));
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(result.candidates[0].usesElevator, true);
    assert.equal(result.candidates[0].parentStation, "PARENT_X");
    assert.equal(result.candidates[0].stopName, "Nev X");
  });

  test("origin és destination level mindkettő 0", async () => {
    const stops = [nearbyStop({ stopId: "S1" })];
    let capturedStart: { level: number } | undefined;
    let capturedDestination: { level: number } | undefined;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      const body = JSON.parse(String(init?.body));
      capturedStart = body.start;
      capturedDestination = body.destination;
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(capturedStart?.level, 0);
    assert.equal(capturedDestination?.level, 0);
  });

  test("nem hív fetchMotisPlan-t / nincs transit-tervezés jellegű hívás — csak /nearby-stops és /api/route URL-ek jelennek meg", async () => {
    const stops = [nearbyStop({ stopId: "S1" })];
    const calledUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    for (const url of calledUrls) {
      assert.ok(url.includes("/nearby-stops") || url.includes("/api/route"), `csak nearby-stops/api-route hívás megengedett, kapott: ${url}`);
      assert.ok(!url.includes("/api/v6/plan"), "SOSEM hívhatja a transit-tervezés /api/v6/plan végpontját");
    }
  });
});

describe("buildNearbyTransitAccessCandidates — több közeli megálló, sorrend", () => {
  test("több stop -> mindegyikre külön candidate", async () => {
    const stops = [
      nearbyStop({ stopId: "S1", lat: 47.5001, lon: 19.02 }),
      nearbyStop({ stopId: "S2", lat: 47.5002, lon: 19.021 }),
      nearbyStop({ stopId: "S3", lat: 47.5003, lon: 19.022 }),
    ];
    mockFetch(stops, () => "success");
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, nearbyStopLimit: 3 });
    assert.equal(result.candidates.length, 3);
  });

  test("walkingDurationSeconds szerint növekvő sorrend", async () => {
    const stops = [
      nearbyStop({ stopId: "SLOW", lat: 47.51, lon: 19.03 }),
      nearbyStop({ stopId: "FAST", lat: 47.52, lon: 19.04 }),
    ];
    mockFetch(stops, () => "success", (dest) => ({ duration: dest.lat === 47.51 ? 300 : 50 }));
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates.map((c) => c.stopId), ["FAST", "SLOW"]);
  });

  test("duration egyenlőség esetén walkingDistanceMeters dönt", async () => {
    const stops = [
      nearbyStop({ stopId: "FAR", lat: 47.51, lon: 19.03 }),
      nearbyStop({ stopId: "NEAR", lat: 47.52, lon: 19.04 }),
    ];
    mockFetch(stops, () => "success", (dest) => ({ duration: 100, distance: dest.lat === 47.51 ? 500 : 50 }));
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates.map((c) => c.stopId), ["NEAR", "FAR"]);
  });

  test("duration ÉS distance egyenlőség esetén stopId lexikografikus sorrend dönt", async () => {
    const stops = [
      nearbyStop({ stopId: "B_STOP", lat: 47.51, lon: 19.03 }),
      nearbyStop({ stopId: "A_STOP", lat: 47.52, lon: 19.04 }),
    ];
    mockFetch(stops, () => "success", () => ({ duration: 100, distance: 130 }));
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates.map((c) => c.stopId), ["A_STOP", "B_STOP"]);
  });
});

describe("buildNearbyTransitAccessCandidates — fail-safe per-candidate viselkedés", () => {
  test("3 stopból A siker, B timeout, C malformed -> csak A marad", async () => {
    const stops = [
      nearbyStop({ stopId: "A", lat: 47.51, lon: 19.03 }),
      nearbyStop({ stopId: "B", lat: 47.52, lon: 19.04 }),
      nearbyStop({ stopId: "C", lat: 47.53, lon: 19.05 }),
    ];
    mockFetch(stops, (dest) => {
      if (dest.lat === 47.51) return "success";
      if (dest.lat === 47.52) return "timeout";
      return "malformed_geometry";
    });
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, nearbyStopLimit: 3 });
    assert.deepEqual(result.candidates.map((c) => c.stopId), ["A"]);
  });

  test("minden gyalogos hívás sikertelen -> sikeres, üres candidate lista (nem hiba)", async () => {
    const stops = [nearbyStop({ stopId: "A" }), nearbyStop({ stopId: "B" })];
    mockFetch(stops, () => "failure");
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(result.ok, true);
    assert.deepEqual(result.candidates, []);
  });

  test("malformed/hasznavehetetlen geometria kizárja a candidate-ot", async () => {
    const stops = [nearbyStop({ stopId: "A" })];
    mockFetch(stops, () => "malformed_geometry");
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates, []);
  });

  test("malformed metadata (pl. negatív duration -> parse hiba) kizárja a candidate-ot", async () => {
    const stops = [nearbyStop({ stopId: "A" })];
    mockFetch(stops, () => "malformed_metadata");
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates, []);
  });

  test("üres nearby-stops eredmény -> sikeres, üres candidate lista, SOSEM hív walking route-ot", async () => {
    let walkingCalled = false;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops: [] }) } as unknown as Response;
      }
      walkingCalled = true;
      throw new Error("walking route-nak nem kellene meghívódnia");
    }) as typeof fetch;
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.deepEqual(result.candidates, []);
    assert.equal(walkingCalled, false);
  });

  test("nearby-stops lookup teljes hibája (pl. 500) -> sikeres, üres candidate lista, SOSEM hív walking route-ot", async () => {
    let walkingCalled = false;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      walkingCalled = true;
      throw new Error("walking route-nak nem kellene meghívódnia");
    }) as typeof fetch;
    const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(result.ok, true);
    assert.deepEqual(result.candidates, []);
    assert.equal(walkingCalled, false);
  });

  test("nearby-stops lookup hibája SOSEM dob kivételt", async () => {
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) throw new Error("ECONNRESET");
      throw new Error("walking route-nak nem kellene meghívódnia");
    }) as typeof fetch;
    await assert.doesNotReject(async () => {
      const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
      assert.deepEqual(result.candidates, []);
    });
  });
});

describe("buildNearbyTransitAccessCandidates — request-költségvetés / fanout korlátok", () => {
  test("legfeljebb nearbyStopLimit db walking-hívás indul, még akkor is, ha a sidecar többet adna vissza", async () => {
    const stops = [
      nearbyStop({ stopId: "S1", lat: 47.51 }),
      nearbyStop({ stopId: "S2", lat: 47.52 }),
      nearbyStop({ stopId: "S3", lat: 47.53 }),
      nearbyStop({ stopId: "S4", lat: 47.54 }),
      nearbyStop({ stopId: "S5", lat: 47.55 }),
    ];
    let walkingCallCount = 0;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      walkingCallCount++;
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, nearbyStopLimit: 2 });
    assert.equal(walkingCallCount, 2);
  });

  test("nearbyStopLimit hiányában az alapérték (DEFAULT_NEARBY_STOP_LIMIT) érvényes", async () => {
    // 2026-09-18 production regresszió javítás után DEFAULT_NEARBY_STOP_LIMIT
    // 3-ról 6-ra emelkedett (lásd nearbyTransitAccess.ts fejléce) — a
    // fixture-nek legalább ennyi (+ margin) stopot kell adnia, különben a
    // teszt hamis pozitívot adna (a "walkingCallCount === 5" véletlenül
    // egyezne egy KISEBB, hibás limittel is).
    const stops = Array.from({ length: 8 }, (_, i) => nearbyStop({ stopId: `S${i}`, lat: 47.5 + i * 0.001 }));
    let walkingCallCount = 0;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      walkingCallCount++;
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(walkingCallCount, DEFAULT_NEARBY_STOP_LIMIT);
  });

  test("nearbyStopLimit sosem lépheti túl MAX_NEARBY_STOP_LIMIT-et, még explicit túltúlzott kérésre sem", async () => {
    const stops = Array.from({ length: 20 }, (_, i) => nearbyStop({ stopId: `S${i}`, lat: 47.5 + i * 0.001 }));
    let capturedLimit: number | undefined;
    let walkingCallCount = 0;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/nearby-stops")) {
        const body = JSON.parse(String(init?.body));
        capturedLimit = body.limit;
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops: stops.slice(0, body.limit) }) } as unknown as Response;
      }
      walkingCallCount++;
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, nearbyStopLimit: 999 });
    assert.equal(capturedLimit, MAX_NEARBY_STOP_LIMIT);
    assert.equal(walkingCallCount, MAX_NEARBY_STOP_LIMIT);
  });

  test("nincs automatikus radius-bővítés — a radiusMeters PONTOSAN egyszer, változatlanul kerül továbbadásra", async () => {
    const stops = [nearbyStop({ stopId: "S1" })];
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
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, radiusMeters: 300 });
    assert.equal(nearbyCallCount, 1, "PONTOSAN 1 nearby-stops hívás futásonként");
    assert.equal(capturedRadius, 300, "a radius változatlanul, bővítés nélkül kerül továbbadásra");
  });

  test("nem hív transit-tervezést (/api/v6/plan) semmilyen körülmények között", async () => {
    const stops = [nearbyStop({ stopId: "S1" })];
    let planCalled = false;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/v6/plan")) {
        planCalled = true;
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      if (url.includes("/nearby-stops")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => validStreetRouteResponse() } as unknown as Response;
    }) as typeof fetch;

    await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon });
    assert.equal(planCalled, false);
  });
});
