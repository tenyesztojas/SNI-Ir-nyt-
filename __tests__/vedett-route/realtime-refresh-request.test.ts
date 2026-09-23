// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — DÁTUMOZOTT
// KORREKCIÓ. Ez a fájl korábban (Sprint 7.2) buildRealtimeRefreshRequest()-
// et tesztelte, ami egy MotisPlanParams-ot épített egy /plan re-query-hez.
// Mivel a realtime-refresh SOHA nem hív /plan-t (lásd
// lib/vedett-route/realtimeRefresh/buildRequest.ts fejléce), ez a modul
// mostantól KIZÁRÓLAG dedupeRealtimeRefreshTripIds()-t exportálja — ezt a
// PURE, tripId-nkénti deduplikáló logikát teszteli ez a fájl.
//   node --test __tests__/vedett-route/realtime-refresh-request.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeRealtimeRefreshTripIds } from "../../lib/vedett-route/realtimeRefresh/buildRequest.ts";
import type { RealtimeRefreshIdentity } from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";

test("egyetlen identitás -> egyelemű tripId-lista", () => {
  const legs: RealtimeRefreshIdentity[] = [{ tripId: "TRIP_1" }];
  assert.deepEqual(dedupeRealtimeRefreshTripIds(legs), ["TRIP_1"]);
});

test("[12] azonos tripId két különböző TRANSIT lábon -> a tripId a deduplikált listában csak EGYSZER szerepel", () => {
  const legs: RealtimeRefreshIdentity[] = [
    { tripId: "TRIP_1", fromStopId: "A", toStopId: "B" },
    { tripId: "TRIP_1", fromStopId: "B", toStopId: "C" },
  ];
  assert.deepEqual(dedupeRealtimeRefreshTripIds(legs), ["TRIP_1"]);
});

test("több, különböző tripId sorrend-megőrzően, egyedi bejegyzésenként szerepel", () => {
  const legs: RealtimeRefreshIdentity[] = [{ tripId: "TRIP_A" }, { tripId: "TRIP_B" }, { tripId: "TRIP_A" }, { tripId: "TRIP_C" }];
  assert.deepEqual(dedupeRealtimeRefreshTripIds(legs), ["TRIP_A", "TRIP_B", "TRIP_C"]);
});

test("üres tripId-jű bejegyzést kihagyja", () => {
  const legs: RealtimeRefreshIdentity[] = [{ tripId: "" }, { tripId: "TRIP_1" }];
  assert.deepEqual(dedupeRealtimeRefreshTripIds(legs), ["TRIP_1"]);
});

test("üres lista -> üres eredmény, nincs hiba", () => {
  assert.deepEqual(dedupeRealtimeRefreshTripIds([]), []);
});
