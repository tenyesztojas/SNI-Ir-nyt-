// VÉDETT ÚTVONAL — MOTIS STREET/WALKING ROUTING — pure-function tesztek
// (Nearby Transit Access Backend sprint, folytatás, 2026-09-17).
// lib/vedett-route/motisStreetRoute.ts: isValidStreetRoutePoint(),
// parseMotisStreetRouteResponse(), flattenStreetRouteGeometry().
//   node --test __tests__/vedett-route/motis-street-route.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isValidStreetRoutePoint,
  parseMotisStreetRouteResponse,
  flattenStreetRouteGeometry,
  type StreetRoute,
} from "../../lib/vedett-route/motisStreetRoute.ts";

describe("isValidStreetRoutePoint", () => {
  test("érvényes pont true-t ad", () => {
    assert.equal(isValidStreetRoutePoint({ lat: 47.5005, lng: 19.0248, level: 0 }), true);
  });

  test("negatív level (pl. aluljáró) is érvényes — nincs level-tartomány korlát", () => {
    assert.equal(isValidStreetRoutePoint({ lat: 47.5, lng: 19.0, level: -1 }), true);
  });

  for (const invalidLat of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 91, -91, "47.5"]) {
    test(`érvénytelen lat (${String(invalidLat)}) -> false`, () => {
      assert.equal(isValidStreetRoutePoint({ lat: invalidLat, lng: 19.0, level: 0 }), false);
    });
  }

  for (const invalidLng of [Number.NaN, Number.POSITIVE_INFINITY, 181, -181]) {
    test(`érvénytelen lng (${String(invalidLng)}) -> false`, () => {
      assert.equal(isValidStreetRoutePoint({ lat: 47.5, lng: invalidLng, level: 0 }), false);
    });
  }

  test("érvénytelen (NaN/Infinity) level -> false", () => {
    assert.equal(isValidStreetRoutePoint({ lat: 47.5, lng: 19.0, level: Number.NaN }), false);
    assert.equal(isValidStreetRoutePoint({ lat: 47.5, lng: 19.0, level: Number.POSITIVE_INFINITY }), false);
  });

  test("hiányzó mező -> false", () => {
    assert.equal(isValidStreetRoutePoint({ lat: 47.5, lng: 19.0 }), false);
  });

  test("nem-objektum bemenet -> false", () => {
    assert.equal(isValidStreetRoutePoint(null), false);
    assert.equal(isValidStreetRoutePoint("47.5,19.0"), false);
  });
});

function validRawResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: "FeatureCollection",
    metadata: { duration: 115, distance: 141.1, uses_elevator: false },
    features: [
      {
        type: "Feature",
        properties: { level: 0, way: 42 },
        geometry: { type: "LineString", coordinates: [[19.0248, 47.5005], [19.0247, 47.5004]] },
      },
    ],
    ...overrides,
  };
}

describe("parseMotisStreetRouteResponse — happy path", () => {
  test("valós E2E-bizonyított alakot helyesen parszol", () => {
    const result = parseMotisStreetRouteResponse(validRawResponse());
    assert.ok(!("error" in result));
    const route = result as StreetRoute;
    assert.deepEqual(route.metadata, { duration: 115, distance: 141.1, usesElevator: false });
    assert.equal(route.features.length, 1);
    assert.deepEqual(route.features[0].coordinates, [[19.0248, 47.5005], [19.0247, 47.5004]]);
    assert.equal(route.features[0].level, 0);
    assert.equal(route.features[0].way, 42);
  });

  test("uses_elevator: true helyesen usesElevator: true-ra mappelődik", () => {
    const result = parseMotisStreetRouteResponse(
      validRawResponse({ metadata: { duration: 10, distance: 5, uses_elevator: true } })
    );
    assert.ok(!("error" in result));
    assert.equal((result as StreetRoute).metadata.usesElevator, true);
  });

  test("több LineString feature esetén mindegyiket megőrzi, sorrendben", () => {
    const raw = validRawResponse({
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: [[19.0, 47.5]] }, properties: {} },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[19.01, 47.51]] }, properties: {} },
      ],
    });
    const result = parseMotisStreetRouteResponse(raw);
    assert.ok(!("error" in result));
    assert.equal((result as StreetRoute).features.length, 2);
  });

  test("level/way hiánya esetén undefined marad (nem 0-ra eső hamis default)", () => {
    const raw = validRawResponse({
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[19.0, 47.5]] } }],
    });
    const result = parseMotisStreetRouteResponse(raw);
    assert.ok(!("error" in result));
    assert.equal((result as StreetRoute).features[0].level, undefined);
    assert.equal((result as StreetRoute).features[0].way, undefined);
  });

  test("üres features tömb -> érvényes StreetRoute, 0 feature-rel (nem hiba)", () => {
    const result = parseMotisStreetRouteResponse(validRawResponse({ features: [] }));
    assert.ok(!("error" in result));
    assert.deepEqual((result as StreetRoute).features, []);
  });
});

describe("parseMotisStreetRouteResponse — malformed bemenetek", () => {
  test("nem-objektum body -> MALFORMED_TYPE", () => {
    assert.deepEqual(parseMotisStreetRouteResponse(null), { error: "MALFORMED_TYPE" });
    assert.deepEqual(parseMotisStreetRouteResponse("string"), { error: "MALFORMED_TYPE" });
  });

  test("type !== FeatureCollection -> MALFORMED_TYPE", () => {
    assert.deepEqual(parseMotisStreetRouteResponse(validRawResponse({ type: "NotAFeatureCollection" })), { error: "MALFORMED_TYPE" });
  });

  test("hiányzó/rossz alakú metadata -> MALFORMED_METADATA", () => {
    assert.deepEqual(parseMotisStreetRouteResponse(validRawResponse({ metadata: undefined })), { error: "MALFORMED_METADATA" });
    assert.deepEqual(parseMotisStreetRouteResponse(validRawResponse({ metadata: { duration: "115", distance: 1, uses_elevator: false } })), {
      error: "MALFORMED_METADATA",
    });
  });

  for (const invalidNumber of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    test(`metadata.duration érvénytelen (${String(invalidNumber)}) -> MALFORMED_METADATA`, () => {
      const result = parseMotisStreetRouteResponse(
        validRawResponse({ metadata: { duration: invalidNumber, distance: 1, uses_elevator: false } })
      );
      assert.deepEqual(result, { error: "MALFORMED_METADATA" });
    });

    test(`metadata.distance érvénytelen (${String(invalidNumber)}) -> MALFORMED_METADATA`, () => {
      const result = parseMotisStreetRouteResponse(
        validRawResponse({ metadata: { duration: 1, distance: invalidNumber, uses_elevator: false } })
      );
      assert.deepEqual(result, { error: "MALFORMED_METADATA" });
    });
  }

  test("uses_elevator nem boolean -> MALFORMED_METADATA", () => {
    const result = parseMotisStreetRouteResponse(validRawResponse({ metadata: { duration: 1, distance: 1, uses_elevator: "false" } }));
    assert.deepEqual(result, { error: "MALFORMED_METADATA" });
  });

  test("features nem tömb -> MALFORMED_FEATURES", () => {
    assert.deepEqual(parseMotisStreetRouteResponse(validRawResponse({ features: "not-an-array" })), { error: "MALFORMED_FEATURES" });
  });

  test("egy feature nem Feature type -> MALFORMED_FEATURES", () => {
    const raw = validRawResponse({ features: [{ type: "NotAFeature", geometry: { type: "LineString", coordinates: [] } }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_FEATURES" });
  });

  test("hiányzó geometry -> MALFORMED_GEOMETRY", () => {
    const raw = validRawResponse({ features: [{ type: "Feature" }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_GEOMETRY" });
  });

  test("geometry.type !== LineString -> MALFORMED_GEOMETRY (LineString nélküli, használhatatlan válasz)", () => {
    const raw = validRawResponse({ features: [{ type: "Feature", geometry: { type: "Point", coordinates: [19.0, 47.5] } }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_GEOMETRY" });
  });

  test("coordinates nem tömb -> MALFORMED_COORDINATES", () => {
    const raw = validRawResponse({ features: [{ type: "Feature", geometry: { type: "LineString", coordinates: "nope" } }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_COORDINATES" });
  });

  test("egy koordináta-pár NaN/Infinity -> MALFORMED_COORDINATES", () => {
    const raw = validRawResponse({
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[19.0, 47.5], [Number.NaN, 47.5]] } }],
    });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_COORDINATES" });

    const rawInf = validRawResponse({
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[19.0, Number.POSITIVE_INFINITY]] } }],
    });
    assert.deepEqual(parseMotisStreetRouteResponse(rawInf), { error: "MALFORMED_COORDINATES" });
  });

  test("földrajzilag érvénytelen koordináta (lon/lat tartományon kívül) -> MALFORMED_COORDINATES", () => {
    const raw = validRawResponse({ features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[200, 47.5]] } }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_COORDINATES" });
  });

  test("koordináta-pár nem 2 elemű -> MALFORMED_COORDINATES", () => {
    const raw = validRawResponse({ features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[19.0]] } }] });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_COORDINATES" });
  });

  test("properties.level érvénytelen (NaN) -> MALFORMED_GEOMETRY", () => {
    const raw = validRawResponse({
      features: [{ type: "Feature", properties: { level: Number.NaN }, geometry: { type: "LineString", coordinates: [[19.0, 47.5]] } }],
    });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_GEOMETRY" });
  });

  test("properties.way érvénytelen (string) -> MALFORMED_GEOMETRY", () => {
    const raw = validRawResponse({
      features: [{ type: "Feature", properties: { way: "not-a-number" }, geometry: { type: "LineString", coordinates: [[19.0, 47.5]] } }],
    });
    assert.deepEqual(parseMotisStreetRouteResponse(raw), { error: "MALFORMED_GEOMETRY" });
  });
});

describe("flattenStreetRouteGeometry", () => {
  test("egyetlen feature koordinátáit megtartja, sorrendben", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5], [19.01, 47.51], [19.02, 47.52]] }],
    };
    assert.deepEqual(flattenStreetRouteGeometry(route), [[19.0, 47.5], [19.01, 47.51], [19.02, 47.52]]);
  });

  test("két feature-t sorrendben összefűz", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5], [19.01, 47.51]] }, { coordinates: [[19.02, 47.52], [19.03, 47.53]] }],
    };
    assert.deepEqual(flattenStreetRouteGeometry(route), [[19.0, 47.5], [19.01, 47.51], [19.02, 47.52], [19.03, 47.53]]);
  });

  test("feature-határon lévő PONTOSAN azonos duplikátum-pontot deduplikálja", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5], [19.01, 47.51]] }, { coordinates: [[19.01, 47.51], [19.02, 47.52]] }],
    };
    assert.deepEqual(flattenStreetRouteGeometry(route), [[19.0, 47.5], [19.01, 47.51], [19.02, 47.52]]);
  });

  test("egy feature-ön BELÜLI egymást követő duplikátumot is deduplikálja", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5], [19.0, 47.5], [19.01, 47.51]] }],
    };
    assert.deepEqual(flattenStreetRouteGeometry(route), [[19.0, 47.5], [19.01, 47.51]]);
  });

  test("NEM deduplikál olyan pontot, ami csak KÖZELI, de nem PONTOSAN azonos", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5], [19.0000001, 47.5]] }],
    };
    assert.equal(flattenStreetRouteGeometry(route)!.length, 2, "csak PONTOS egyezést dedupolunk, nem talál ki/olvaszt össze közeli pontokat");
  });

  test("nincs feature -> null (nincs használható geometria)", () => {
    const route: StreetRoute = { metadata: { duration: 1, distance: 1, usesElevator: false }, features: [] };
    assert.equal(flattenStreetRouteGeometry(route), null);
  });

  test("egyetlen pontra összefűzött geometria (nem áll elő vonal) -> null", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [[19.0, 47.5]] }],
    };
    assert.equal(flattenStreetRouteGeometry(route), null);
  });

  test("LineString nélküli (üres coordinates tömbű) feature-ökből álló, összesen használhatatlan válasz -> null", () => {
    const route: StreetRoute = {
      metadata: { duration: 1, distance: 1, usesElevator: false },
      features: [{ coordinates: [] }, { coordinates: [] }],
    };
    assert.equal(flattenStreetRouteGeometry(route), null);
  });
});
