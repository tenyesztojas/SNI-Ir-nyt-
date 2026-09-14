// VÉDETT ÚTVONAL — Autós útvonaltervezés MVP (2026-09-14), kiegészítve a
// választható (max 3) autós útvonal sprinttel.
//
// Kicsi, célzott, forráskód-szintű teszt (a projekt már meglévő mintáját
// követve, lásd pl. c41-ambiguous-and-origin-label.test.ts) — a route.ts
// mockolás nélküli, valódi futtatása (Mapbox hívás, geokódolás, auth)
// külön infrastruktúrát igényelne, amit ez a kis MVP-sprint nem indokol.
// Ez a teszt a válasz NORMALIZÁLT alakját (kizárólag a routes tömb,
// route-onként durationSeconds/distanceMeters/geometry, SOHA a teljes
// Mapbox response vagy a token) és a Mapbox hívás profilját/paramétereit
// ellenőrzi forráskód-szinten.
//
//   node --test __tests__/vedett-route/car-route-mvp.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "car-route", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

describe("car-route MVP — Mapbox driving-traffic hívás és normalizált válasz", () => {
  test("a végpont admin/feature-flag gate-et használ (requireVedettRouteAccess, ugyanaz mint a /search végponton)", () => {
    assert.match(routeSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(routeSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a geokódolás a MEGLÉVŐ geocodeAddress()-t hívja — nincs duplikált geokódoló logika", () => {
    assert.match(routeSrc, /import\s*\{\s*geocodeAddress,\s*isAmbiguousGeocodeResult\s*\}\s*from\s*"@\/lib\/vedett-route\/geocode"/);
  });

  test("a Mapbox Directions hívás alternatives=true-t kér (2026-09-14, választható útvonalak sprint) — steps=false&overview=full&geometries=geojson VÁLTOZATLAN maradt", () => {
    assert.match(routeSrc, /\/directions\/v5\/mapbox\/driving-traffic\//);
    assert.match(routeSrc, /alternatives=true&steps=false&overview=full&geometries=geojson/);
  });

  test("a Mapbox access token a MAPBOX_ACCESS_TOKEN env variable-ből jön, és SEHOL nincs hardcode-olva", () => {
    assert.match(routeSrc, /process\.env\.MAPBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(routeSrc, /pk\.[A-Za-z0-9._-]{20,}/, "nem lehet hardcode-olt Mapbox token a forráskódban");
  });

  test("a routes tömb legfeljebb MAX_CAR_ROUTES (3) elemre van vágva, MIELŐTT normalizálnánk", () => {
    assert.match(routeSrc, /const MAX_CAR_ROUTES = 3;/);
    assert.match(routeSrc, /\.slice\(0, MAX_CAR_ROUTES\)/);
  });

  test("minden route a normalizeCarRoute()-on megy át — null-t ad, ha hiányzik a duration/distance, vagy a geometry nem valódi LineString+coordinates", () => {
    const fnMatch = routeSrc.match(/function normalizeCarRoute\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a normalizeCarRoute() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /typeof route\.duration !== "number"/);
    assert.match(fn, /typeof route\.distance !== "number"/);
    assert.match(fn, /geometry\.type !== "LineString"/);
    assert.match(fn, /!Array\.isArray\(geometry\.coordinates\)/);
    assert.match(fn, /return null;/);
  });

  test("a hibás/hiányos (null-ra normalizált) route-ok kiszűrődnek a végső routes tömbből", () => {
    assert.match(routeSrc, /\.filter\(\(r\): r is NonNullable<typeof r> => r !== null\)/);
  });

  test("1 vagy 2 Mapbox route esetén is helyes a válasz — nincs kikényszerített minimum/maximum darabszám a sikeresen normalizált routes-on túl, csak az üres eset ('no_route') van külön kezelve", () => {
    assert.match(routeSrc, /if \(routes\.length === 0\) \{/);
    assert.match(routeSrc, /reason: "no_route"/);
    // A sikeres válasz FELTÉTLENÜL a routes tömböt adja vissza — nincs
    // routes.length === 3 (vagy hasonló, darabszámhoz kötött) elvárás.
    assert.doesNotMatch(routeSrc, /routes\.length === 3/);
    assert.match(routeSrc, /return NextResponse\.json\(\{ ok: true, routes \}\);/);
  });

  test("a válasz KIZÁRÓLAG a routes tömböt adja vissza (route-onként durationSeconds/distanceMeters/geometry) — a teljes Mapbox response NEM megy a kliensnek", () => {
    assert.match(routeSrc, /return NextResponse\.json\(\{ ok: true, routes \}\);/);
    assert.doesNotMatch(routeSrc, /\.\.\.(data|route)\b/, "a teljes Mapbox objektumot nem szabad spread-elve visszaküldeni");
    const normalizeReturnMatch = routeSrc.match(/return \{\s*\n\s*durationSeconds:[\s\S]*?\n\s*\};/);
    assert.ok(normalizeReturnMatch, "meg kell találni a normalizeCarRoute() sikeres visszatérési objektumát");
    assert.match(normalizeReturnMatch![0], /durationSeconds: Math\.round\(route\.duration\)/);
    assert.match(normalizeReturnMatch![0], /distanceMeters: Math\.round\(route\.distance\)/);
    assert.match(normalizeReturnMatch![0], /geometry: \{ type: "LineString" as const, coordinates: geometry\.coordinates as \[number, number\]\[\] \}/);
  });

  test("a koordináták a Mapbox GeoJSON válaszból közvetlenül a kliensnek továbbítódnak (nincs szerveroldali lat/lon-konverzió)", () => {
    assert.doesNotMatch(routeSrc, /\.reverse\(\)|swapLatLon|toLatLng/i);
  });

  test("a négy kötelező hibaeset kontrolláltan van kezelve (invalid_request, geocoding_failed, car_routing_error/unavailable, no_route)", () => {
    assert.match(routeSrc, /reason: "invalid_request"/);
    assert.match(routeSrc, /reason: "geocoding_failed"/);
    assert.match(routeSrc, /reason: "car_routing_unavailable"/);
    assert.match(routeSrc, /reason: "car_routing_error"/);
    assert.match(routeSrc, /reason: "no_route"/);
  });
});
