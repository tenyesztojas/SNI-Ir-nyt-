import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMotisItineraryToJourney, searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

// Ez a fixture a valódi, futó MOTIS instance (ghcr.io/motis-project/motis
// @sha256:2a99b5f811f...) tényleges /api/v6/plan válaszának alakját követi,
// amit a Deák Ferenc tér -> Blaha Lujza tér tesztlekérdezés során manuálisan
// megfigyeltünk (lásd docs/vedett-route/MOTIS_GO_LIVE_REPORT.md).
const REAL_SHAPE_ITINERARY: MotisItinerary = {
  duration: 180,
  startTime: "2026-09-06T07:41:00Z",
  endTime: "2026-09-06T07:44:00Z",
  transfers: 0,
  legs: [
    {
      mode: "SUBWAY",
      from: { name: "Deák Ferenc tér", stopId: "bkkgtfs_CSF00954" },
      to: { name: "Blaha Lujza tér", stopId: "bkkgtfs_CSF01291" },
      duration: 180,
      startTime: "2026-09-06T07:41:00Z",
      endTime: "2026-09-06T07:44:00Z",
      routeShortName: "M2",
    },
  ],
};

test("mapMotisItineraryToJourney helyesen alakítja a valós alakú MOTIS itinerary-t Journey-vé", () => {
  const journey = mapMotisItineraryToJourney(REAL_SHAPE_ITINERARY);
  assert.equal(journey.totalDurationMinutes, 3);
  assert.equal(journey.transfers, 0);
  assert.equal(journey.legs.length, 1);
  assert.equal(journey.legs[0].mode, "TRANSIT");
  assert.equal(journey.legs[0].transitMode, "SUBWAY");
  assert.equal(journey.legs[0].routeShortName, "M2");
  assert.ok(journey.fingerprint && journey.fingerprint.length > 0);
});

test("WALK láb 'WALK' módra képződik le, transitMode nélkül", () => {
  const journey = mapMotisItineraryToJourney({
    duration: 600,
    startTime: "2026-09-06T07:00:00Z",
    endTime: "2026-09-06T07:10:00Z",
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        from: { name: "A" },
        to: { name: "B" },
        duration: 600,
        startTime: "2026-09-06T07:00:00Z",
        endTime: "2026-09-06T07:10:00Z",
      },
    ],
  });
  assert.equal(journey.legs[0].mode, "WALK");
  assert.equal(journey.legs[0].transitMode, undefined);
  assert.equal(journey.walkingMinutes, 10);
});

test("searchVedettRoutes: MOTIS_BASE_URL nélkül routing_engine_unavailable-t ad, nem dob kivételt", async () => {
  delete process.env.MOTIS_BASE_URL;
  const result = await searchVedettRoutes({
    from: { name: "A", lat: 47.5, lon: 19.05 },
    to: { name: "B", lat: 47.49, lon: 19.06 },
    departAt: new Date().toISOString(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_engine_unavailable");
});

test("searchVedettRoutes: a két stratégia (alap + metrómentes) találatait összefésüli, dedupolja és rangsorolja", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    const isCalmer = url.includes("transitModes=BUS");
    const body = isCalmer
      ? {
          itineraries: [
            {
              duration: 1200,
              startTime: "2026-09-06T07:41:00Z",
              endTime: "2026-09-06T08:01:00Z",
              transfers: 0,
              legs: [
                {
                  mode: "BUS",
                  from: { name: "Deák Ferenc tér" },
                  to: { name: "Blaha Lujza tér" },
                  duration: 1200,
                  routeShortName: "7",
                },
              ],
            },
          ],
        }
      : { itineraries: [REAL_SHAPE_ITINERARY] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await searchVedettRoutes({
      from: { name: "Deák Ferenc tér", lat: 47.497771, lon: 19.05451 },
      to: { name: "Blaha Lujza tér", lat: 47.497097, lon: 19.070595 },
      departAt: new Date().toISOString(),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.journeys.length, 2);
      const fastest = result.journeys.find((r) => r.labels.includes("FASTEST"))!;
      assert.equal(fastest.journey.legs[0].transitMode, "SUBWAY");
      assert.ok(result.dataCoverage.missingFactorsUnion.includes("crowding"));
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});
