import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJourneyFingerprint, deduplicateJourneys } from "../../lib/vedett-route/fingerprint.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    totalDurationMinutes: 30,
    departureTime: "2026-09-06T10:00:00Z",
    arrivalTime: "2026-09-06T10:30:00Z",
    walkingMinutes: 5,
    waitingMinutes: 2,
    transfers: 1,
    legs: [
      { mode: "WALK", fromName: "A", toName: "Megallo1", durationMinutes: 5, realtime: false },
      {
        mode: "TRANSIT",
        transitMode: "SUBWAY",
        routeShortName: "M2",
        fromName: "Megallo1",
        toName: "Megallo2",
        durationMinutes: 10,
        realtime: false,
      },
    ],
    alerts: [],
    realtimeAvailable: false,
    ...overrides,
  };
}

test("két, funkcionálisan azonos útvonal (más objektum, ugyanaz a tartalom) ugyanazt a fingerprintet kapja", () => {
  const a = journey();
  const b = journey();
  assert.equal(computeJourneyFingerprint(a), computeJourneyFingerprint(b));
});

test("eltérő vonal (routeShortName) eltérő fingerprintet ad", () => {
  const a = journey();
  const b = journey({
    legs: [
      { mode: "WALK", fromName: "A", toName: "Megallo1", durationMinutes: 5, realtime: false },
      {
        mode: "TRANSIT",
        transitMode: "BUS",
        routeShortName: "7",
        fromName: "Megallo1",
        toName: "Megallo2",
        durationMinutes: 15,
        realtime: false,
      },
    ],
  });
  assert.notEqual(computeJourneyFingerprint(a), computeJourneyFingerprint(b));
});

test("deduplicateJourneys csak az első előfordulást tartja meg fingerprintenként", () => {
  const a = journey();
  const b = journey(); // duplikátum
  const c = journey({ departureTime: "2026-09-06T11:00:00Z", arrivalTime: "2026-09-06T11:30:00Z" }); // más indulás -> más fingerprint
  const result = deduplicateJourneys([a, b, c]);
  assert.equal(result.length, 2);
});
