import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { filterAndRankCarRestStops } from "../../lib/vedett-route/car/restStops/corridor.ts";

const route = {
  type: "LineString" as const,
  coordinates: [
    [19.0, 47.5] as [number, number],
    [19.05, 47.5] as [number, number],
    [19.10, 47.5] as [number, number],
  ],
};

describe("car rest stop corridor — háttérmotor", () => {
  test("benzinkút, étterem és nyilvános WC engedélyezett", () => {
    const result = filterAndRankCarRestStops(
      route,
      [
        {
          id: "fuel",
          type: "FUEL",
          name: "Benzinkút",
          location: [19.05, 47.501],
          source: "MAPBOX",
        },
        {
          id: "food",
          type: "RESTAURANT",
          name: "Étterem",
          location: [19.06, 47.501],
          source: "MAPBOX",
        },
        {
          id: "wc",
          type: "PUBLIC_TOILET",
          name: "Nyilvános WC",
          location: [19.08, 47.501],
          source: "MAPBOX",
        },
      ],
      { maxDistanceFromRouteMeters: 1500, maxResults: 10 },
    );

    assert.equal(result.length, 3);
  });

  test("útvonaltól túl távoli pont kiesik", () => {
    const result = filterAndRankCarRestStops(
      route,
      [{
        id: "far",
        type: "FUEL",
        name: "Távoli kút",
        location: [19.05, 47.60],
        source: "MAPBOX",
      }],
      { maxDistanceFromRouteMeters: 1500, maxResults: 10 },
    );

    assert.equal(result.length, 0);
  });

  test("a típusmodellben nincs BENCH kategória", () => {
    const source = String(filterAndRankCarRestStops);
    assert.match(source, /FUEL/);
    assert.match(source, /RESTAURANT/);
    assert.match(source, /PUBLIC_TOILET/);
    assert.doesNotMatch(source, /BENCH/);
  });
});
