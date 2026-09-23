import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransitProgress } from "../../lib/vedett-route/navigation/transitProgress.ts";
import { buildNavigationInstructions, selectActiveInstructionWithStopProgress } from "../../lib/vedett-route/navigation/instructions.ts";
import { createInitialWalkToTransitBoundaryState, resolveWalkToTransitBoundary } from "../../lib/vedett-route/navigation/legTransition.ts";

const coordinates = [[0, 0], [0, 0.01], [0, 0.02]] as const;
const stops = [{ name: "A", lon: 0, lat: 0.002 }, { name: "B", lon: 0, lat: 0.008 }];
const destination = { name: "C", lon: 0, lat: 0.02 };
const fix = (latitude: number) => ({ longitude: 0, latitude, accuracyMeters: 5 });
const progress = (lat: number) => resolveTransitProgress(coordinates, stops, destination, fix(lat));
test("two stops in one segment are counted separately", () => {
  assert.equal(progress(0.001)?.remainingStopCount, 3);
  assert.equal(progress(0.004)?.remainingStopCount, 2);
  assert.equal(progress(0.004)?.nextStopName, "B");
  assert.equal(progress(0.009)?.remainingStopCount, 1);
  assert.equal(progress(0.009)?.nextStopName, "C");
});
test("platform and uncertainty band do not prematurely pass a stop", () => {
  assert.equal(progress(0.002)?.nextStopName, "A");
  assert.equal(progress(0.00205)?.nextStopName, "A");
});
test("missing GPS, weak geometry, bad accuracy and off-route fixes hide precise progress", () => {
  assert.equal(resolveTransitProgress(coordinates, stops, destination, null), null);
  assert.equal(resolveTransitProgress(coordinates.slice(0, 2), stops, destination, fix(0.004)), null);
  assert.equal(resolveTransitProgress(coordinates, stops, destination, { ...fix(0.004), accuracyMeters: 70 }), null);
  assert.equal(resolveTransitProgress(coordinates, stops, destination, { ...fix(0.004), longitude: 1 }), null);
});
test("unknown, incomplete and reversed stops are not presented as precise", () => {
  assert.equal(resolveTransitProgress(coordinates, undefined, destination, fix(0)), null);
  assert.equal(resolveTransitProgress(coordinates, [{ name: "Unknown" }], destination, fix(0)), null);
  assert.equal(resolveTransitProgress(coordinates, [...stops].reverse(), destination, fix(0)), null);
});
test("explicit direct trip and destination proximity", () => {
  assert.equal(resolveTransitProgress(coordinates, [], destination, fix(0.005))?.remainingStopCount, 1);
  assert.equal(progress(0.0199)?.nearAlighting, true);
  assert.equal(progress(0.018)?.nearAlighting, false);
});
const instructions = buildNavigationInstructions({ legs: [
  { mode: "TRANSIT", fromName: "Start", toName: "C", durationMinutes: 10, realtime: false },
  { mode: "WALK", fromName: "C", toName: "Goal", durationMinutes: 2, realtime: false },
] });
test("onboard late geometry and route end cannot prematurely say alight/arrive", () => {
  const result = selectActiveInstructionWithStopProgress(instructions, {
    legIndex: 0, legPhaseFraction: 0.95, atRouteEnd: true, onboard: true,
    remainingStops: progress(0.004), nextStopName: "B",
  });
  assert.equal(result.current?.kind, "RIDE");
  assert.equal(result.current?.title, "Utazz még 2 megállót");
  assert.equal(result.current?.detail, "Következő megálló: B");
});
test("GPS loss while onboard stays generic and does not show the full trip count", () => {
  const result = selectActiveInstructionWithStopProgress(instructions, { legIndex: 0, legPhaseFraction: 0.99, onboard: true });
  assert.equal(result.current?.kind, "RIDE");
  assert.equal(result.current?.detail, undefined);
});
test("last stop guidance and following WALK are selected correctly", () => {
  const result = selectActiveInstructionWithStopProgress(instructions, { legIndex: 0, onboard: true, remainingStops: progress(0.015) });
  assert.equal(result.current?.title, "A következő megállónál szállj le");
  assert.equal(selectActiveInstructionWithStopProgress(instructions, { legIndex: 1 }).current?.kind, "WALK");
});
test("arrival requires three fixes; GPS loss preserves state, next leg is entered once", () => {
  let previous = { ...createInitialWalkToTransitBoundaryState(), phase: "BOARDED" as const, resolvedLegIndex: 1 };
  const input = { geometryActiveLegIndex: 0, geometryActiveLegMode: "WALK" as const,
    nextTransitLeg: { legIndex: 1, boardingCoordinate: coordinates[0], legCoordinates: coordinates, alightingCoordinate: coordinates[2], hasFollowingLeg: true },
    position: fix(0.02), offRouteStatus: "ON_ROUTE" as const };
  const first = resolveWalkToTransitBoundary({ ...input, previous });
  assert.equal(first.phase, "BOARDED");
  assert.deepEqual(resolveWalkToTransitBoundary({ ...input, position: null, previous: first }), first);
  const second = resolveWalkToTransitBoundary({ ...input, previous: first });
  const third = resolveWalkToTransitBoundary({ ...input, previous: second });
  assert.equal(third.phase, "ARRIVED");
  assert.equal(third.resolvedLegIndex, 2);
  assert.deepEqual(resolveWalkToTransitBoundary({ ...input, previous: third }), third);
});

test("final transit destination remains reachable after boarding", () => {
  const finalInstructions = buildNavigationInstructions({ legs: [
    { mode: "TRANSIT", fromName: "Start", toName: "C", durationMinutes: 10, realtime: false },
  ] });
  const result = selectActiveInstructionWithStopProgress(finalInstructions, {
    legIndex: 0, onboard: true, atRouteEnd: true, nearAlighting: true,
    remainingStops: progress(0.02),
  });
  assert.equal(result.current?.kind, "ARRIVE");
});
test("following direct transit uses TRANSFER, not the completed ride", () => {
  const transferInstructions = buildNavigationInstructions({ legs: [
    { mode: "TRANSIT", fromName: "Start", toName: "C", durationMinutes: 10, realtime: false },
    { mode: "TRANSIT", fromName: "C", toName: "End", durationMinutes: 10, realtime: false },
  ] });
  assert.equal(selectActiveInstructionWithStopProgress(transferInstructions, { legIndex: 1 }).current?.kind, "TRANSFER");
});
