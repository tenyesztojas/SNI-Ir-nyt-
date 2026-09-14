import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const ROUTE_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "api",
  "admin",
  "vedett-utvonal",
  "car-route",
  "route.ts",
);
const src = readFileSync(ROUTE_PATH, "utf8");

describe("car-route MVP — Mapbox driving-traffic + háttér turn-by-turn kompatibilitás", () => {
  test("admin/feature flag gate változatlan", () => {
    assert.match(src, /requireVedettRouteAccess/);
    assert.match(src, /const auth = await requireVedettRouteAccess\(\)/);
    assert.match(src, /if \(!auth\.ok\) return auth\.response/);
  });

  test("meglévő geocodeAddress() használat megmarad", () => {
    assert.match(src, /geocodeAddress/);
    assert.match(src, /geocodeToCoordinates/);
  });

  test("alternatives=true, steps=true, full GeoJSON", () => {
    assert.match(src, /params\.set\("alternatives", "true"\)/);
    assert.match(src, /params\.set\("steps", "true"\)/);
    assert.match(src, /params\.set\("overview", "full"\)/);
    assert.match(src, /params\.set\("geometries", "geojson"\)/);
  });

  test("MAPBOX_ACCESS_TOKEN env variable", () => {
    assert.match(src, /process\.env\.MAPBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(src, /pk\.[A-Za-z0-9._-]{20,}/);
  });

  test("maximum 3 Mapbox route normalizálódik", () => {
    assert.match(src, /const MAX_CAR_ROUTES = 3/);
    assert.match(src, /\.slice\(0, MAX_CAR_ROUTES\)/);
    assert.match(src, /\.map\(normalizeCarRoute\)/);
  });

  test("kontrollált hibaágak megmaradnak", () => {
    for (const reason of [
      "invalid_request",
      "geocoding_failed",
      "car_routing_unavailable",
      "car_routing_error",
      "no_route",
    ]) {
      assert.match(src, new RegExp(reason));
    }
  });

  test("response továbbra is ok:true + routes", () => {
    assert.match(src, /NextResponse\.json\(\{ ok: true, routes \}\)/);
  });
});
