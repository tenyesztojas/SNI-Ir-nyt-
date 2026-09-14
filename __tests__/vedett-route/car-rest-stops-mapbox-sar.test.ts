import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  fetchMapboxRestStopsAlongRoute,
  resolvePublicToiletCategoryId,
} from "../../lib/vedett-route/car/restStops/mapboxSearchAlongRoute.ts";
import { encodePolyline6 } from "../../lib/vedett-route/car/restStops/polyline.ts";
import { searchCarRestStopsAlongRoute } from "../../lib/vedett-route/car/restStops/searchAlongRoute.ts";

const route = {
  type: "LineString" as const,
  coordinates: [
    [19.0, 47.5],
    [19.05, 47.5],
    [19.1, 47.5],
  ] as [number, number][],
};

describe("car rest stops — Mapbox Search Along Route", () => {
  test("polyline6 encoder stabil eredményt ad", () => {
    const encoded = encodePolyline6(route);
    assert.equal(typeof encoded, "string");
    assert.ok(encoded.length > 5);
  });

  test("a nyilvános WC kategóriát a category listből oldja fel, nem hardcode-olja", async () => {
    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);
      assert.match(url, /\/list\/category/);

      return new Response(
        JSON.stringify({
          listItems: [
            { canonical_id: "coffee", name: "Coffee" },
            { canonical_id: "public_restroom", name: "Public Restroom" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const id = await resolvePublicToiletCategoryId("token", fakeFetch as typeof fetch);
    assert.equal(id, "public_restroom");
  });

  test("gas_station + restaurant + feloldott WC kategóriát SAR-ként kér", async () => {
    const requested: string[] = [];

    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);

      if (url.includes("/list/category")) {
        return new Response(
          JSON.stringify({
            listItems: [
              { canonical_id: "public_restroom", name: "Public Restroom" },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({ type: "FeatureCollection", features: [] }),
        { status: 200 },
      );
    };

    const result = await fetchMapboxRestStopsAlongRoute(
      route,
      "token",
      {},
      fakeFetch as typeof fetch,
    );

    assert.deepEqual(result.categoriesRequested, [
      "gas_station",
      "restaurant",
      "public_restroom",
    ]);

    const categoryCalls = requested.filter((url) => url.includes("/category/"));
    assert.equal(categoryCalls.length, 3);

    for (const url of categoryCalls) {
      assert.match(url, /sar_type=isochrone/);
      assert.match(url, /route_geometry=polyline6/);
      assert.match(url, /country=HU/);
      assert.match(url, /language=hu/);
      assert.match(url, /route=/);
    }
  });

  test("Mapbox feature normalizálódik és corridor szűrésen átmegy", async () => {
    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/list/category")) {
        return new Response(
          JSON.stringify({
            listItems: [
              { canonical_id: "public_restroom", name: "Public Restroom" },
            ],
          }),
          { status: 200 },
        );
      }

      const isFuel = url.includes("/category/gas_station");
      const features = isFuel
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [19.05, 47.501] },
              properties: {
                mapbox_id: "fuel-1",
                name: "Teszt benzinkút",
                full_address: "Teszt út 1.",
                poi_category_ids: ["gas_station"],
              },
            },
          ]
        : [];

      return new Response(
        JSON.stringify({ type: "FeatureCollection", features }),
        { status: 200 },
      );
    };

    const result = await searchCarRestStopsAlongRoute(
      route,
      "token",
      { maxDistanceFromRouteMeters: 1500 },
      fakeFetch as typeof fetch,
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].type, "FUEL");
    assert.equal(result.candidates[0].name, "Teszt benzinkút");
    assert.equal(result.candidates[0].source, "MAPBOX");
    assert.ok(result.candidates[0].distanceFromRouteMeters < 1500);
    assert.equal(result.diagnostics.provider, "MAPBOX_SEARCH_BOX");
  });
});
