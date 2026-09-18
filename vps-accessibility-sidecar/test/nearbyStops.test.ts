// VPS ACCESSIBILITY SIDECAR — NEARBY STOP DISCOVERY unit tesztek (Nearby
// Transit Access Backend sprint, 2026-09-17).
//
// Szándékosan generikus, Budapest-mentes fixture-ök (nincs Déli/Kossuth/BKK
// konkrét helyszín-utalás sem itt, sem a bemeneti adatban).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NEARBY_LIMIT,
  DEFAULT_NEARBY_RADIUS_METERS,
  MAX_NEARBY_LIMIT,
  MAX_NEARBY_RADIUS_METERS,
  findNearbyStops,
  haversineMeters,
  parseNearbyStopsRequest,
} from "../dist/nearbyStops.js";
import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "../dist/lib/accessibilityIndex.js";

function stop(overrides: Partial<StopAccessibilityIndexEntry> & { stopId: string }): StopAccessibilityIndexEntry {
  return { ...overrides };
}

function indexFrom(stops: StopAccessibilityIndexEntry[]): AccessibilityIndex {
  const stopsById: Record<string, StopAccessibilityIndexEntry> = {};
  for (const s of stops) stopsById[s.stopId] = s;
  return { provider: "BKK", generation: "g1", builtAt: "2026-09-17T00:00:00Z", stopsById, tripsById: {}, pathways: [] };
}

describe("haversineMeters", () => {
  test("azonos koordinátára 0-t ad", () => {
    assert.equal(haversineMeters(47.5, 19.0, 47.5, 19.0), 0);
  });

  test("ismert, kb. 111.2 km/fok szélességi-fok különbségre plauzibilis távolságot ad", () => {
    const d = haversineMeters(0, 0, 1, 0);
    assert.ok(d > 110_000 && d < 112_000, `váratlan távolság: ${d}`);
  });

  test("szimmetrikus: a(p1,p2) === a(p2,p1)", () => {
    const a = haversineMeters(47.5, 19.0, 47.51, 19.02);
    const b = haversineMeters(47.51, 19.02, 47.5, 19.0);
    assert.equal(a, b);
  });
});

describe("parseNearbyStopsRequest — validáció", () => {
  test("hiányzó dataset -> MISSING_DATASET", () => {
    const result = parseNearbyStopsRequest({ lat: 47.5, lon: 19.0 });
    assert.deepEqual(result, { error: "MISSING_DATASET" });
  });

  test("nem-objektum body -> MALFORMED_BODY", () => {
    assert.deepEqual(parseNearbyStopsRequest(null), { error: "MALFORMED_BODY" });
    assert.deepEqual(parseNearbyStopsRequest("string"), { error: "MALFORMED_BODY" });
  });

  test("hiányzó radiusMeters/limit esetén a dokumentált default értékeket kapja", () => {
    const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 19.0 });
    assert.ok(!("error" in result));
    assert.equal((result as { radiusMeters: number }).radiusMeters, DEFAULT_NEARBY_RADIUS_METERS);
    assert.equal((result as { limit: number }).limit, DEFAULT_NEARBY_LIMIT);
  });

  for (const invalidCoord of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "47.5", 91, -91]) {
    test(`érvénytelen lat (${String(invalidCoord)}) -> INVALID_COORDINATES`, () => {
      const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: invalidCoord, lon: 19.0 });
      assert.deepEqual(result, { error: "INVALID_COORDINATES" });
    });
  }

  test("tartományon kívüli lon -> INVALID_COORDINATES", () => {
    const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 181 });
    assert.deepEqual(result, { error: "INVALID_COORDINATES" });
  });

  for (const invalidRadius of [Number.NaN, Number.POSITIVE_INFINITY, 0, -100, MAX_NEARBY_RADIUS_METERS + 1, "500"]) {
    test(`érvénytelen radiusMeters (${String(invalidRadius)}) -> INVALID_RADIUS`, () => {
      const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 19.0, radiusMeters: invalidRadius });
      assert.deepEqual(result, { error: "INVALID_RADIUS" });
    });
  }

  test("pontosan a MAX_NEARBY_RADIUS_METERS határérték még ELFOGADOTT", () => {
    const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 19.0, radiusMeters: MAX_NEARBY_RADIUS_METERS });
    assert.ok(!("error" in result));
  });

  for (const invalidLimit of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, MAX_NEARBY_LIMIT + 1, "3"]) {
    test(`érvénytelen limit (${String(invalidLimit)}) -> INVALID_LIMIT`, () => {
      const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 19.0, limit: invalidLimit });
      assert.deepEqual(result, { error: "INVALID_LIMIT" });
    });
  }

  test("pontosan a MAX_NEARBY_LIMIT határérték még ELFOGADOTT", () => {
    const result = parseNearbyStopsRequest({ dataset: "bkkgtfs", lat: 47.5, lon: 19.0, limit: MAX_NEARBY_LIMIT });
    assert.ok(!("error" in result));
  });
});

describe("findNearbyStops — radius szűrés / nearest-first / limit", () => {
  test("csak a radiuson BELÜLI stopokat adja vissza", () => {
    const index = indexFrom([
      stop({ stopId: "NEAR", latitude: 47.5, longitude: 19.0 }),
      stop({ stopId: "FAR", latitude: 48.5, longitude: 20.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 200, 10);
    assert.deepEqual(result.map((s) => s.stopId), ["NEAR"]);
  });

  test("nearest-first sorrendben adja vissza a találatokat", () => {
    const index = indexFrom([
      stop({ stopId: "FAR", latitude: 47.503, longitude: 19.0 }),
      stop({ stopId: "NEAR", latitude: 47.5001, longitude: 19.0 }),
      stop({ stopId: "MID", latitude: 47.501, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.deepEqual(result.map((s) => s.stopId), ["NEAR", "MID", "FAR"]);
  });

  test("limit-re vágja a találatokat, a legközelebbieket tartva meg", () => {
    const index = indexFrom([
      stop({ stopId: "S1", latitude: 47.5001, longitude: 19.0 }),
      stop({ stopId: "S2", latitude: 47.5002, longitude: 19.0 }),
      stop({ stopId: "S3", latitude: 47.5003, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 2);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((s) => s.stopId), ["S1", "S2"]);
  });

  test("a distanceMeters a válaszban jelen van és nem-negatív egész", () => {
    const index = indexFrom([stop({ stopId: "S1", latitude: 47.5001, longitude: 19.0 })]);
    const [candidate] = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.ok(Number.isInteger(candidate.distanceMeters));
    assert.ok(candidate.distanceMeters >= 0);
  });
});

describe("findNearbyStops — station dedup (parent_station elsődleges, stopId fallback)", () => {
  test("közös parent_station alá tartozó platformokat EGYETLEN reprezentánsra deduplikálja", () => {
    const index = indexFrom([
      stop({ stopId: "PLATFORM_A", parentStation: "STATION_X", latitude: 47.5002, longitude: 19.0 }),
      stop({ stopId: "PLATFORM_B", parentStation: "STATION_X", latitude: 47.5001, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.equal(result.length, 1, "ugyanazon station két platformja EGY candidate-re dedupolódik");
    assert.equal(result[0].stopId, "PLATFORM_B", "a klaszteren belül a legközelebbi platform a reprezentáns");
  });

  test("parent_station NÉLKÜLI stopoknál a stopId maga a dedup-kulcs (nincs téves összevonás)", () => {
    const index = indexFrom([
      stop({ stopId: "S1", latitude: 47.5001, longitude: 19.0 }),
      stop({ stopId: "S2", latitude: 47.5002, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.equal(result.length, 2, "különböző stopId, parent_station nélkül -> KÉT külön candidate marad");
  });

  test("determinisztikus reprezentáns-választás: pontos távolság-holtverseny esetén a lexikografikusan kisebb stopId nyer", () => {
    const index = indexFrom([
      stop({ stopId: "PLATFORM_Z", parentStation: "STATION_Y", latitude: 47.5001, longitude: 19.0 }),
      stop({ stopId: "PLATFORM_A", parentStation: "STATION_Y", latitude: 47.5001, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.equal(result.length, 1);
    assert.equal(result[0].stopId, "PLATFORM_A");
  });

  test("a reprezentáns MINDIG egy a bemenetben tényleg létező konkrét stopId (sosem kitalált)", () => {
    const index = indexFrom([
      stop({ stopId: "PLATFORM_A", parentStation: "STATION_X", latitude: 47.5001, longitude: 19.0 }),
      stop({ stopId: "PLATFORM_B", parentStation: "STATION_X", latitude: 47.5002, longitude: 19.0 }),
      stop({ stopId: "PLATFORM_C", parentStation: "STATION_X", latitude: 47.5003, longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    const knownStopIds = new Set(["PLATFORM_A", "PLATFORM_B", "PLATFORM_C"]);
    assert.ok(result.every((s) => knownStopIds.has(s.stopId)));
  });
});

describe("findNearbyStops — hiányzó lat/lon GTFS rekordok kezelése", () => {
  test("latitude/longitude nélküli stopot defenzíven kihagyja, nem dob hibát", () => {
    const index = indexFrom([
      stop({ stopId: "NO_COORDS" }),
      stop({ stopId: "HAS_COORDS", latitude: 47.5001, longitude: 19.0 }),
    ]);
    assert.doesNotThrow(() => {
      const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
      assert.deepEqual(result.map((s) => s.stopId), ["HAS_COORDS"]);
    });
  });

  test("csak-latitude vagy csak-longitude (részlegesen hiányos) rekordot is kihagyja", () => {
    const index = indexFrom([
      stop({ stopId: "ONLY_LAT", latitude: 47.5001 }),
      stop({ stopId: "ONLY_LON", longitude: 19.0 }),
    ]);
    const result = findNearbyStops(index, 47.5, 19.0, 1000, 10);
    assert.deepEqual(result, []);
  });

  test("teljesen koordináta nélküli index esetén üres tömböt ad, nem hibázik", () => {
    const index = indexFrom([stop({ stopId: "NO_COORDS_1" }), stop({ stopId: "NO_COORDS_2" })]);
    assert.deepEqual(findNearbyStops(index, 47.5, 19.0, 1000, 10), []);
  });
});
