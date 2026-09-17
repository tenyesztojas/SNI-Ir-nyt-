// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — MAPPING kategória:
// extractRealtimeUpdates() — friss MOTIS legekből, KIZÁRÓLAG pontos
// identitás-egyezés esetén nyer ki frissítést.
//   node --test __tests__/vedett-route/realtime-refresh-extract.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";
import type { MotisLeg } from "../../lib/vedett-route/motisTypes.ts";

function leg(overrides: Partial<MotisLeg>): MotisLeg {
  return {
    mode: "BUS",
    from: { name: "A" },
    to: { name: "B" },
    ...overrides,
  };
}

test("exact identitás (tripId) egyezés esetén frissítést ad vissza", () => {
  const fresh = [leg({ tripId: "TRIP_1", routeId: "ROUTE_1", startTime: "2026-09-16T22:18:00Z", realTime: true })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1", routeId: "ROUTE_1" }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].tripId, "TRIP_1");
  assert.equal(updates[0].departureTime, "2026-09-16T22:18:00Z");
  assert.equal(updates[0].realtime, true);
});

test("identitás-eltérés (más tripId) esetén no-op, nem ad vissza frissítést", () => {
  const fresh = [leg({ tripId: "TRIP_OTHER", startTime: "2026-09-16T22:18:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates.length, 0);
});

test("azonos routeShortName/busszám önmagában NEM elég a párosításhoz (csak tripId dönt)", () => {
  const fresh = [leg({ tripId: "TRIP_OTHER", routeShortName: "7", startTime: "2026-09-16T22:18:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates.length, 0);
});

test("hiányzó opcionális routeId a kérésben biztonságosan párosít, ha a tripId egyezik", () => {
  const fresh = [leg({ tripId: "TRIP_1", routeId: "ROUTE_1", startTime: "2026-09-16T22:18:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates.length, 1);
});

test("mindkét oldalon jelen lévő, DE eltérő routeId esetén no-op (konzervatív döntés)", () => {
  const fresh = [leg({ tripId: "TRIP_1", routeId: "ROUTE_X", startTime: "2026-09-16T22:18:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1", routeId: "ROUTE_1" }]);
  assert.equal(updates.length, 0);
});

test("delay/arrival/departure frissítést tartalmaz, ha a friss leg realtime-korrigált", () => {
  const fresh = [
    leg({
      tripId: "TRIP_1",
      startTime: "2026-09-16T22:18:00Z",
      endTime: "2026-09-16T22:25:00Z",
      realTime: true,
      from: { name: "A", scheduledDeparture: "2026-09-16T22:14:00Z" },
      to: { name: "B", scheduledArrival: "2026-09-16T22:20:00Z" },
    }),
  ];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates[0].delayMinutes, 5);
  assert.equal(updates[0].scheduledDepartureTime, "2026-09-16T22:14:00Z");
});

test("cancelled=true a friss legről átkerül a frissítésbe", () => {
  const fresh = [leg({ tripId: "TRIP_1", cancelled: true })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates[0].cancelled, true);
});

test("csak menetrendi (scheduled-only, realTime hiányzik) friss válasz esetén realtime: false a frissítésben", () => {
  const fresh = [leg({ tripId: "TRIP_1", startTime: "2026-09-16T22:14:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }]);
  assert.equal(updates[0].realtime, false);
});

test("üres identitás-lista esetén üres frissítés-lista jön vissza, nincs hiba", () => {
  const updates = extractRealtimeUpdates([leg({ tripId: "TRIP_1" })], []);
  assert.deepEqual(updates, []);
});

test("több lekért identitás közül csak a tényleg megtalált trip kap frissítést", () => {
  const fresh = [leg({ tripId: "TRIP_1", startTime: "2026-09-16T22:18:00Z" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "TRIP_1" }, { tripId: "TRIP_2" }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].tripId, "TRIP_1");
});

test("üres tripId-jű identitás bejegyzést kihagyja (nincs bizonytalan párosítás)", () => {
  const fresh = [leg({ tripId: "TRIP_1" })];
  const updates = extractRealtimeUpdates(fresh, [{ tripId: "" }]);
  assert.equal(updates.length, 0);
});
