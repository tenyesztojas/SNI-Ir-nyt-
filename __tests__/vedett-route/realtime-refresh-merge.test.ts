// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — MERGE kategória:
// mergeRealtimeUpdates() — kizárólag pontos identitás alapján, kizárólag a
// megengedett mezőket módosítja egy TRANSIT lábon; minden más (WALK/RENTAL,
// geometria, intermediateStops, destination, egyéb Journey-mezők)
// garantáltan változatlan marad.
//   node --test __tests__/vedett-route/realtime-refresh-merge.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates.ts";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";

function baseLeg(overrides: Partial<JourneyLeg>): JourneyLeg {
  return {
    mode: "TRANSIT",
    fromName: "A",
    toName: "B",
    durationMinutes: 10,
    realtime: false,
    ...overrides,
  };
}

function baseJourney(legs: JourneyLeg[]): Journey {
  return {
    totalDurationMinutes: 30,
    departureTime: "2026-09-16T21:55:00Z",
    arrivalTime: "2026-09-16T22:14:00Z",
    walkingMinutes: 5,
    waitingMinutes: 0,
    transfers: 0,
    legs,
    alerts: [],
    realtimeAvailable: false,
  };
}

test("exact identitás egyezés esetén a departure/arrival/delay/realtime frissül", () => {
  const journey = baseJourney([baseLeg({ tripId: "TRIP_1", departureTime: "2026-09-16T22:14:00Z" })]);
  const result = mergeRealtimeUpdates(journey, [
    { tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true, delayMinutes: 4 },
  ]);
  assert.equal(result.legs[0].departureTime, "2026-09-16T22:18:00Z");
  assert.equal(result.legs[0].realtime, true);
  assert.equal(result.legs[0].delayMinutes, 4);
});

test("identitás-eltérés esetén no-op — a leg byte-ra változatlan marad", () => {
  const leg = baseLeg({ tripId: "TRIP_1", departureTime: "2026-09-16T22:14:00Z" });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_OTHER", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.deepEqual(result.legs[0], leg);
});

test("tripId nélküli TRANSIT láb sosem frissül (nincs bizonytalan párosítás)", () => {
  const leg = baseLeg({ departureTime: "2026-09-16T22:14:00Z" });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.deepEqual(result.legs[0], leg);
});

test("WALK láb SOHA nem módosul, még ha (hibásan) lenne is rajta tripId", () => {
  const walkLeg = baseLeg({ mode: "WALK", tripId: "TRIP_1", departureTime: "2026-09-16T22:00:00Z" });
  const journey = baseJourney([walkLeg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.deepEqual(result.legs[0], walkLeg);
});

test("geometria és intermediateStops változatlan marad egy frissített lábon", () => {
  const leg = baseLeg({
    tripId: "TRIP_1",
    geometryEncoded: "abc123",
    intermediateStops: [{ name: "Megálló" }],
  });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.equal(result.legs[0].geometryEncoded, "abc123");
  assert.deepEqual(result.legs[0].intermediateStops, [{ name: "Megálló" }]);
});

test("cancellation (proven, ugyanaz a tripId) mindig elsőbbséget kap", () => {
  const leg = baseLeg({ tripId: "TRIP_1", realtime: true, departureTime: "2026-09-16T22:14:00Z" });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", realtime: false, cancelled: true }]);
  assert.equal(result.legs[0].cancelled, true);
});

test("konzervatív downgrade: korábbi realtime=true + idő NEM törlődik egy scheduled-only frissítésre", () => {
  const leg = baseLeg({
    tripId: "TRIP_1",
    realtime: true,
    departureTime: "2026-09-16T22:18:00Z",
    delayMinutes: 4,
  });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [
    { tripId: "TRIP_1", realtime: false, scheduledDepartureTime: "2026-09-16T22:14:00Z" },
  ]);
  assert.equal(result.legs[0].departureTime, "2026-09-16T22:18:00Z", "a korábbi realtime departureTime megmarad");
  assert.equal(result.legs[0].delayMinutes, 4, "a korábbi delay megmarad");
  assert.equal(result.legs[0].scheduledDepartureTime, "2026-09-16T22:14:00Z", "a scheduled* mező frissülhet");
});

test("partial response: csak a bizonyítottan érkezett mezők változnak, a többi megmarad", () => {
  const leg = baseLeg({ tripId: "TRIP_1", arrivalTime: "2026-09-16T22:20:00Z", realtime: false });
  const journey = baseJourney([leg]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.equal(result.legs[0].departureTime, "2026-09-16T22:18:00Z");
  assert.equal(result.legs[0].arrivalTime, "2026-09-16T22:20:00Z", "az arrivalTime, amit a frissítés nem hozott, megmarad");
});

test("üres updates lista esetén ugyanazt a journey referenciát adja vissza (nincs szükségtelen új objektum)", () => {
  const journey = baseJourney([baseLeg({ tripId: "TRIP_1" })]);
  const result = mergeRealtimeUpdates(journey, []);
  assert.equal(result, journey);
});

test("ha semelyik update sem talál egyező identitást, ugyanazt a journey referenciát adja vissza", () => {
  const journey = baseJourney([baseLeg({ tripId: "TRIP_1" })]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_OTHER", realtime: true }]);
  assert.equal(result, journey);
});

test("több TRANSIT lábból csak a helyes tripId-jű frissül, a másik változatlan marad", () => {
  const legA = baseLeg({ tripId: "TRIP_A", departureTime: "2026-09-16T21:00:00Z" });
  const legB = baseLeg({ tripId: "TRIP_B", departureTime: "2026-09-16T21:30:00Z" });
  const journey = baseJourney([legA, legB]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_B", departureTime: "2026-09-16T21:35:00Z", realtime: true }]);
  assert.equal(result.legs[0].departureTime, "2026-09-16T21:00:00Z");
  assert.equal(result.legs[1].departureTime, "2026-09-16T21:35:00Z");
});

test("a journey egyéb mezői (alerts, transfers, walkingMinutes) változatlanok maradnak", () => {
  const journey = baseJourney([baseLeg({ tripId: "TRIP_1" })]);
  const result = mergeRealtimeUpdates(journey, [{ tripId: "TRIP_1", departureTime: "2026-09-16T22:18:00Z", realtime: true }]);
  assert.equal(result.transfers, journey.transfers);
  assert.equal(result.walkingMinutes, journey.walkingMinutes);
  assert.equal(result.alerts, journey.alerts);
});
