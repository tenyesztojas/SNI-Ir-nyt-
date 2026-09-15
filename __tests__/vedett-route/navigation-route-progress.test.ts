import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { haversineMeters, projectPointToRoute } from "../../lib/vedett-route/navigation/geometry.ts";
import { createInitialRouteProgress, updateRouteProgress } from "../../lib/vedett-route/navigation/routeProgress.ts";

const route = [
  [19.0400, 47.4970],
  [19.0500, 47.4970],
  [19.0600, 47.4970],
] as const;

describe("Navigation Sprint 2 — Route Progress Engine", () => {
  test("haversine méterben stabil, pozitív távolságot ad", () => {
    const d = haversineMeters(route[0], route[1]);
    assert.ok(d > 700 && d < 800);
  });

  test("GPS pontot a legközelebbi route-szegmensre vetít", () => {
    const p = projectPointToRoute([19.045, 47.4971], route);
    assert.ok(p);
    assert.equal(p.segmentIndex, 0);
    assert.ok(p.distanceFromRouteMeters < 15);
    assert.ok(p.distanceAlongRouteMeters > 300);
  });

  test("progress 0..1, remaining distance és ETA együtt csökken", () => {
    const first = updateRouteProgress(route, { latitude: 47.497, longitude: 19.045, timestampMs: 1_000_000 }, null, { routeDurationSeconds: 600 });
    const second = updateRouteProgress(route, { latitude: 47.497, longitude: 19.055, timestampMs: 1_060_000 }, first, { routeDurationSeconds: 600 });
    assert.ok(second.progressFraction > first.progressFraction);
    assert.ok(second.remainingDistanceMeters < first.remainingDistanceMeters);
    assert.ok((second.remainingDurationSeconds ?? Infinity) < (first.remainingDurationSeconds ?? 0));
    assert.equal(second.estimatedArrivalTimeMs, 1_060_000 + (second.remainingDurationSeconds ?? 0) * 1000);
  });

  test("kis GPS-visszaugrás nem húzza vissza a progresszt", () => {
    const a = updateRouteProgress(route, { latitude: 47.497, longitude: 19.0501 }, null, { backwardToleranceMeters: 30 });
    const b = updateRouteProgress(route, { latitude: 47.497, longitude: 19.0499 }, a, { backwardToleranceMeters: 30 });
    assert.equal(b.progressDistanceMeters, a.progressDistanceMeters);
  });

  test("egyetlen távoli GPS fix még nem OFF_ROUTE", () => {
    const state = updateRouteProgress(route, { latitude: 47.498, longitude: 19.05 }, null, { offRouteThresholdMeters: 50, offRouteConfirmFixes: 3 });
    assert.equal(state.offRouteStatus, "POSSIBLY_OFF_ROUTE");
    assert.equal(state.consecutiveOffRouteFixes, 1);
  });

  test("három egymást követő távoli fix OFF_ROUTE", () => {
    const opts = { offRouteThresholdMeters: 50, offRouteConfirmFixes: 3 };
    const a = updateRouteProgress(route, { latitude: 47.498, longitude: 19.05 }, null, opts);
    const b = updateRouteProgress(route, { latitude: 47.498, longitude: 19.0501 }, a, opts);
    const c = updateRouteProgress(route, { latitude: 47.498, longitude: 19.0502 }, b, opts);
    assert.equal(c.offRouteStatus, "OFF_ROUTE");
    assert.equal(c.consecutiveOffRouteFixes, 3);
  });

  test("route közelébe visszatérés azonnal nullázza az off-route számlálót", () => {
    const opts = { offRouteThresholdMeters: 50, offRouteConfirmFixes: 2 };
    const a = updateRouteProgress(route, { latitude: 47.498, longitude: 19.05 }, null, opts);
    const b = updateRouteProgress(route, { latitude: 47.498, longitude: 19.0501 }, a, opts);
    assert.equal(b.offRouteStatus, "OFF_ROUTE");
    const recovered = updateRouteProgress(route, { latitude: 47.497, longitude: 19.0502 }, b, opts);
    assert.equal(recovered.offRouteStatus, "ON_ROUTE");
    assert.equal(recovered.consecutiveOffRouteFixes, 0);
  });

  test("üres/egypontos route biztonságos initial state-et ad", () => {
    const state = updateRouteProgress([], { latitude: 47.497, longitude: 19.04 }, createInitialRouteProgress());
    assert.equal(state.progressFraction, 0);
    assert.equal(state.matchedCoordinate, null);
  });
});
