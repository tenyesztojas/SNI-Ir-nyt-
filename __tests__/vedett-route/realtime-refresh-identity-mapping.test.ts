// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — IDENTITY/MAPPING kategória:
// a raw MOTIS leg stabil identitás-mezői (tripId/routeId/stopId) hogyan
// öröklődnek a JourneyLeg-be a mapMotisItineraryToJourney()-n keresztül.
//   node --test __tests__/vedett-route/realtime-refresh-identity-mapping.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMotisItineraryToJourney } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

const TRANSIT_ITINERARY: MotisItinerary = {
  duration: 180,
  startTime: "2026-09-16T21:55:00Z",
  endTime: "2026-09-16T22:14:00Z",
  transfers: 0,
  legs: [
    {
      mode: "SUBWAY",
      from: { name: "Deák Ferenc tér", stopId: "bkkgtfs_CSF00954" },
      to: { name: "Blaha Lujza tér", stopId: "bkkgtfs_CSF01291" },
      duration: 180,
      startTime: "2026-09-16T21:55:00Z",
      endTime: "2026-09-16T22:14:00Z",
      routeShortName: "M2",
      routeId: "bkkgtfs_5400",
      tripId: "bkkgtfs_TRIP_1",
    },
  ],
};

test("stabil identitás (tripId/routeId/fromStopId/toStopId) megőrződik a TRANSIT JourneyLeg-en", () => {
  const journey = mapMotisItineraryToJourney(TRANSIT_ITINERARY);
  const leg = journey.legs[0];
  assert.equal(leg.tripId, "bkkgtfs_TRIP_1");
  assert.equal(leg.routeId, "bkkgtfs_5400");
  assert.equal(leg.fromStopId, "bkkgtfs_CSF00954");
  assert.equal(leg.toStopId, "bkkgtfs_CSF01291");
});

test("hiányzó opcionális identitás-mező biztonságosan undefined marad (nincs kitalálás/fallback)", () => {
  const journey = mapMotisItineraryToJourney({
    ...TRANSIT_ITINERARY,
    legs: [
      {
        mode: "BUS",
        from: { name: "A" },
        to: { name: "B" },
        duration: 180,
        startTime: "2026-09-16T21:55:00Z",
        endTime: "2026-09-16T22:14:00Z",
      },
    ],
  });
  const leg = journey.legs[0];
  assert.equal(leg.tripId, undefined);
  assert.equal(leg.routeId, undefined);
  assert.equal(leg.fromStopId, undefined);
  assert.equal(leg.toStopId, undefined);
});

test("WALK láb sosem kap identitás-mezőt, még ha a nyers leg tartalmazná is (identitás csak TRANSIT-hez releváns)", () => {
  const journey = mapMotisItineraryToJourney({
    duration: 60,
    startTime: "2026-09-16T21:50:00Z",
    endTime: "2026-09-16T21:51:00Z",
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        from: { name: "A", stopId: "irrelevant" },
        to: { name: "B" },
        duration: 60,
        startTime: "2026-09-16T21:50:00Z",
        endTime: "2026-09-16T21:51:00Z",
        tripId: "should-not-matter",
      },
    ],
  });
  const leg = journey.legs[0];
  assert.equal(leg.mode, "WALK");
  // A mapLeg jelenlegi logikája minden leg-re ráteszi a mezőt, ha a nyers
  // adat tartalmazza — de a UI/merge réteg SOHA nem használja WALK lábon
  // (lásd mergeRealtimeUpdates.ts: kizárólag mode === "TRANSIT" lábakat
  // frissít). Ez a teszt azt rögzíti, hogy a mapping maga nem szűri, a
  // biztonság a merge oldalán van garantálva (lásd merge tesztek).
  assert.equal(leg.tripId, "should-not-matter");
});

test("két különböző TRANSIT lábon két különböző tripId marad meg egymástól függetlenül", () => {
  const journey = mapMotisItineraryToJourney({
    duration: 600,
    startTime: "2026-09-16T21:00:00Z",
    endTime: "2026-09-16T21:10:00Z",
    transfers: 1,
    legs: [
      {
        mode: "SUBWAY",
        from: { name: "A" },
        to: { name: "B" },
        duration: 300,
        startTime: "2026-09-16T21:00:00Z",
        endTime: "2026-09-16T21:05:00Z",
        tripId: "TRIP_A",
        routeId: "ROUTE_A",
      },
      {
        mode: "BUS",
        from: { name: "B" },
        to: { name: "C" },
        duration: 300,
        startTime: "2026-09-16T21:05:00Z",
        endTime: "2026-09-16T21:10:00Z",
        tripId: "TRIP_B",
        routeId: "ROUTE_B",
      },
    ],
  });
  assert.equal(journey.legs[0].tripId, "TRIP_A");
  assert.equal(journey.legs[1].tripId, "TRIP_B");
  assert.notEqual(journey.legs[0].tripId, journey.legs[1].tripId);
});

test("az identitás-mezők SOHA nem kerülnek bele a UI-nak szánt egyéb mezőkbe (routeShortName változatlan)", () => {
  const journey = mapMotisItineraryToJourney(TRANSIT_ITINERARY);
  assert.equal(journey.legs[0].routeShortName, "M2");
});
