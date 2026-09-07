// lib/vedett-route/geometry.ts tesztek — Map/GPS/Rest Points sprint, R. pont
// "MOTIS geometry parsing" + "malformed geometry handling".
//   node --test __tests__/vedett-route/geometry.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePolyline, journeyLegsToGeoJson } from "../../lib/vedett-route/geometry.ts";

test("valós, egy MOTIS válaszból megfigyelt encoded polyline helyesen dekódolódik", () => {
  // Ez a pontos string egy VALÓS MOTIS legGeometry.points értékből származik
  // (2026-09-06-i élő teszt, M2 metró szakasz), precision=6.
  const encoded = "qv_ryAaq}ic@Pr@`Ae@jKyD|KmFhOmK~^{\\|f@ub@~PuSdN}RnL{RnLg[rIy\\`DwSlGu]|B}RfAgQfAkUPqT?gQa@gLgA}MqQw|AaMwu@QJPK_q@scEkb@}}B_ZqxA}V{jAQX";
  const points = decodePolyline(encoded, 6);
  assert.ok(points.length > 10, "a valós polyline-nak több mint 10 pontot kell adnia");
  // A dekódolt pontoknak Budapest környékén kell lenniük (durva bounding box).
  for (const p of points) {
    assert.ok(p.lat > 47.3 && p.lat < 47.7, `lat ${p.lat} Budapest környékén kell legyen`);
    assert.ok(p.lon > 18.8 && p.lon < 19.4, `lon ${p.lon} Budapest környékén kell legyen`);
  }
});

test("üres string esetén üres tömböt ad, nem dob hibát", () => {
  assert.deepEqual(decodePolyline(""), []);
});

test("undefined/null bemenetre üres tömböt ad", () => {
  assert.deepEqual(decodePolyline(undefined), []);
  assert.deepEqual(decodePolyline(null), []);
});

test("malformed (érvénytelen karakterek) polyline nem dob kivételt", () => {
  assert.doesNotThrow(() => decodePolyline("!!!not-a-valid-polyline###", 6));
});

test("journeyLegsToGeoJson: valós geometriájú lábból LineString feature-t épít", () => {
  const geojson = journeyLegsToGeoJson([
    {
      mode: "TRANSIT",
      transitMode: "SUBWAY",
      fromLat: 47.4979,
      fromLon: 19.0402,
      toLat: 47.5,
      toLon: 19.05,
      geometryEncoded: "qv_ryAaq}ic@Pr@",
      geometryPrecision: 6,
    },
  ]);
  const lineFeatures = geojson.features.filter((f) => f.geometry.type === "LineString");
  assert.equal(lineFeatures.length, 1);
});

test("journeyLegsToGeoJson: geometria hiányában a két végpont közti egyenest használja fallbackként", () => {
  const geojson = journeyLegsToGeoJson([
    { mode: "WALK", fromLat: 47.5, fromLon: 19.05, toLat: 47.51, toLon: 19.06 },
  ]);
  const lineFeatures = geojson.features.filter((f) => f.geometry.type === "LineString");
  assert.equal(lineFeatures.length, 1);
  assert.equal((lineFeatures[0].geometry as GeoJSON.LineString).coordinates.length, 2);
});

test("journeyLegsToGeoJson: sem geometria, sem koordináta esetén nem ad line feature-t, nem dob hibát", () => {
  assert.doesNotThrow(() => {
    const geojson = journeyLegsToGeoJson([{ mode: "WALK" }]);
    assert.equal(geojson.features.filter((f) => f.geometry.type === "LineString").length, 0);
  });
});

test("journeyLegsToGeoJson: intermediateStops Point feature-ökké alakul", () => {
  const geojson = journeyLegsToGeoJson([
    {
      mode: "TRANSIT",
      fromLat: 47.5,
      fromLon: 19.05,
      toLat: 47.51,
      toLon: 19.06,
      intermediateStops: [{ name: "Astoria", lat: 47.4948, lon: 19.0625 }],
    },
  ]);
  const pointFeatures = geojson.features.filter((f) => f.geometry.type === "Point");
  assert.equal(pointFeatures.length, 1);
  assert.equal(pointFeatures[0].properties?.name, "Astoria");
});
