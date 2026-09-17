// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — buildRealtimeRefreshRequest()
// PURE request-builder tesztjei, ugyanaz a hálózat-mentes elv, mint
// rest-stop-reroute-request.test.ts-nél.
//   node --test __tests__/vedett-route/realtime-refresh-request.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRealtimeRefreshRequest } from "../../lib/vedett-route/realtimeRefresh/buildRequest.ts";

test("a fromPlace/toPlace a Journey SAJÁT origin/destination koordinátáiból épül, a departAt a Journey saját indulási idejéből", () => {
  const params = buildRealtimeRefreshRequest({
    from: { lat: 47.5, lon: 19.05 },
    to: { lat: 47.51, lon: 19.06 },
    departAt: "2026-09-16T21:55:00.000Z",
  });
  assert.equal(params.fromPlace, "47.5,19.05");
  assert.equal(params.toPlace, "47.51,19.06");
  assert.equal(params.time, "2026-09-16T21:55:00.000Z");
});

test("numItineraries alapértelmezetten 3, felülírható", () => {
  const context = { from: { lat: 47.5, lon: 19.05 }, to: { lat: 47.51, lon: 19.06 }, departAt: "2026-09-16T21:55:00.000Z" };
  assert.equal(buildRealtimeRefreshRequest(context).numItineraries, 3);
  assert.equal(buildRealtimeRefreshRequest(context, 1).numItineraries, 1);
});

test("a visszaadott objektum kizárólag a hivatalos MOTIS mezőket tartalmazza", () => {
  const params = buildRealtimeRefreshRequest({
    from: { lat: 47.5, lon: 19.05 },
    to: { lat: 47.51, lon: 19.06 },
    departAt: "2026-09-16T21:55:00.000Z",
  });
  assert.deepEqual(Object.keys(params).sort(), ["fromPlace", "numItineraries", "time", "toPlace"]);
});
