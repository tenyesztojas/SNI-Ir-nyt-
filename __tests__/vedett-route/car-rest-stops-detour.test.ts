import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRestStopDetourDirectionsUrl,
  rankCarRestStopsByDetour,
} from "../../lib/vedett-route/car/restStops/detour.ts";
import type { CarNavigationRoute } from "../../lib/vedett-route/car/types.ts";
import type { CarRestStopOnRoute } from "../../lib/vedett-route/car/restStops/types.ts";

function makeRoute(): CarNavigationRoute {
  return {
    durationSeconds: 600,
    distanceMeters: 10_000,
    geometry: {
      type: "LineString",
      coordinates: [
        [19.04, 47.50],
        [19.10, 47.52],
      ],
    },
    legs: [],
    sensory: {
      version: "car-sensory-v1",
      experimental: true,
      score: 0,
      components: {
        trafficStress: 0,
        maneuverLoad: 0,
        roadComplexity: 0,
        speedStress: 0,
        uncertainty: 0,
      },
      features: {
        totalDistanceMeters: 10_000,
        durationSeconds: 600,
        congestionKnownDistanceMeters: 0,
        congestionWeightedMean: 0,
        congestedDistanceRatio: 0,
        liveVsTypicalDelayRatio: 0,
        maneuverCount: 0,
        turnsPerKm: 0,
        sharpTurnCount: 0,
        uTurnCount: 0,
        roundaboutCount: 0,
        exitCount: 0,
        rapidInstructionSequenceCount: 0,
        intersectionCount: 0,
        trafficSignalCount: 0,
        stopSignCount: 0,
        yieldSignCount: 0,
        railwayCrossingCount: 0,
        highSpeedDistanceRatio: 0,
      },
    },
  };
}

function candidate(
  id: string,
  location: [number, number],
  routePositionMeters: number,
): CarRestStopOnRoute {
  return {
    id,
    type: "FUEL",
    name: id,
    location,
    source: "MAPBOX",
    routePositionMeters,
    distanceFromRouteMeters: 100,
  };
}

test("detour URL A → pihenőhely → B sorrendet használ driving-traffic profillal", () => {
  const url = buildRestStopDetourDirectionsUrl(
    [19.04, 47.50],
    [19.07, 47.51],
    [19.10, 47.52],
    "secret-token",
  );

  assert.match(
    url,
    /directions\/v5\/mapbox\/driving-traffic\/19\.04,47\.5;19\.07,47\.51;19\.1,47\.52/,
  );

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("alternatives"), "false");
  assert.equal(parsed.searchParams.get("steps"), "false");
  assert.equal(parsed.searchParams.get("overview"), "false");
  assert.equal(parsed.searchParams.get("access_token"), "secret-token");
});

test("valós kerülőidő és kerülőtávolság szerint rangsorol", async () => {
  const route = makeRoute();
  const candidates = [
    candidate("slow", [19.06, 47.51], 3_000),
    candidate("fast", [19.08, 47.515], 6_000),
  ];

  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    const isFast = url.includes("19.08,47.515");

    return new Response(
      JSON.stringify({
        routes: [
          isFast
            ? { duration: 660, distance: 10_500 }
            : { duration: 780, distance: 11_300 },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await rankCarRestStopsByDetour(
    route,
    candidates,
    "token",
    { maxCandidates: 6 },
    fetchImpl as typeof fetch,
  );

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0]?.id, "fast");
  assert.equal(result.candidates[0]?.detour.detourDurationSeconds, 60);
  assert.equal(result.candidates[0]?.detour.detourDistanceMeters, 500);
  assert.equal(result.candidates[1]?.id, "slow");
  assert.equal(result.candidates[1]?.detour.detourDurationSeconds, 180);
  assert.equal(result.candidates[1]?.detour.detourDistanceMeters, 1_300);
  assert.deepEqual(result.unpricedCandidateIds, []);
  assert.equal(result.diagnostics.attemptedCount, 2);
  assert.equal(result.diagnostics.pricedCount, 2);
});

test("egy hibás Mapbox-kérés nem dönti el a teljes pihenőhely-rangsorolást", async () => {
  const route = makeRoute();
  const candidates = [
    candidate("broken", [19.05, 47.505], 1_000),
    candidate("working", [19.09, 47.518], 8_000),
  ];

  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("19.05,47.505")) {
      return new Response("upstream error", { status: 502 });
    }

    return new Response(
      JSON.stringify({ routes: [{ duration: 700, distance: 10_900 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await rankCarRestStopsByDetour(
    route,
    candidates,
    "token",
    {},
    fetchImpl as typeof fetch,
  );

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.id, "working");
  assert.deepEqual(result.unpricedCandidateIds, ["broken"]);
  assert.equal(result.diagnostics.failedCount, 1);
});

test("a fizetős Directions hívások száma alapból legfeljebb 6 jelöltre korlátozott", async () => {
  const route = makeRoute();
  const candidates = Array.from({ length: 10 }, (_, index) =>
    candidate(
      `candidate-${index}`,
      [19.05 + index * 0.001, 47.505],
      1_000 + index * 500,
    ),
  );

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ routes: [{ duration: 650, distance: 10_400 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await rankCarRestStopsByDetour(
    route,
    candidates,
    "token",
    {},
    fetchImpl as typeof fetch,
  );

  assert.equal(calls, 6);
  assert.equal(result.diagnostics.attemptedCount, 6);
  assert.equal(result.candidates.length, 6);
});

test("forgalmi pillanatkép miatti negatív delta nem jelenik meg negatív kerülőként", async () => {
  const route = makeRoute();
  const candidates = [candidate("traffic-drift", [19.07, 47.51], 5_000)];

  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ routes: [{ duration: 590, distance: 9_900 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const result = await rankCarRestStopsByDetour(
    route,
    candidates,
    "token",
    {},
    fetchImpl as typeof fetch,
  );

  const detour = result.candidates[0]?.detour;
  assert.ok(detour);
  assert.equal(detour.signedDurationDeltaSeconds, -10);
  assert.equal(detour.signedDistanceDeltaMeters, -100);
  assert.equal(detour.detourDurationSeconds, 0);
  assert.equal(detour.detourDistanceMeters, 0);
});
