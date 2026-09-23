import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceTransitJourneySession, confirmJourneyAlighting, createTransitJourneySession } from "../../lib/vedett-route/navigation/transitJourneySession.ts";
import type { SessionTransitLeg, TransitJourneySession } from "../../lib/vedett-route/navigation/transitJourneySession.ts";
import type { WalkToTransitBoundaryInput } from "../../lib/vedett-route/navigation/legTransition.ts";
import { buildNavigationInstructions, selectActiveInstructionWithStopProgress } from "../../lib/vedett-route/navigation/instructions.ts";

const leg: SessionTransitLeg = { legIndex: 1, scope: "trip-A", transitMode: "BUS", boardingCoordinate: [0, 0],
  alightingCoordinate: [0, 0.01], legCoordinates: [[0, 0], [0, 0.005], [0, 0.01]], hasFollowingLeg: true };
const second: SessionTransitLeg = { ...leg, legIndex: 3, scope: "trip-B", boardingCoordinate: [0, 0.011],
  alightingCoordinate: [0, 0.02], legCoordinates: [[0, 0.011], [0, 0.015], [0, 0.02]], hasFollowingLeg: false };
const input = (lat: number | null, index = 0, mode: "WALK" | "TRANSIT" = "WALK"): WalkToTransitBoundaryInput => ({
  geometryActiveLegIndex: index, geometryActiveLegMode: mode, nextTransitLeg: leg, previous: null,
  offRouteStatus: "ON_ROUTE", position: lat === null ? null : { latitude: lat, longitude: 0, accuracyMeters: 5 },
});
function boarded(selected = leg): TransitJourneySession {
  const initial = createTransitJourneySession();
  return { ...initial, trackedLeg: selected, lastFixTimestamp: 3,
    boundary: { ...initial.boundary, phase: "BOARDED", resolvedLegIndex: selected.legIndex } };
}
function arrive(state = boarded(), legs: SessionTransitLeg[] = [leg, second]) {
  for (let i = 4; i <= 6; i++) state = advanceTransitJourneySession(state, input(state.trackedLeg!.alightingCoordinate![1]), legs, i);
  return state;
}

test("actual boarding is collected when map already calls the leg TRANSIT", () => {
  let state = createTransitJourneySession();
  for (const [i, lat] of [0, 0.0001, 0.0002].entries()) state = advanceTransitJourneySession(state, input(lat, 1, "TRANSIT"), [leg], i + 1);
  assert.equal(state.boundary.phase, "BOARDED");
  assert.equal(state.boundary.resolvedLegIndex, 1);
});
test("standing on the platform never proves boarding", () => {
  let state = createTransitJourneySession();
  for (let i = 1; i < 10; i++) state = advanceTransitJourneySession(state, input(0, 1, "TRANSIT"), [leg], i);
  assert.equal(state.boundary.phase, "AT_BOARDING_AREA");
});
test("GPS map switching to TRANSIT does not clear a boarded ride", () => {
  const result = advanceTransitJourneySession(boarded(), input(0.004, 1, "TRANSIT"), [leg], 4);
  assert.equal(result.boundary.phase, "BOARDED");
  assert.equal(result.boundary.resolvedLegIndex, 1);
});
test("GPS jump to later WALK or another vehicle cannot complete the ride", () => {
  for (const args of [input(0.006, 2), input(0.006, 3, "TRANSIT")]) {
    const result = advanceTransitJourneySession(boarded(), args, [leg, second], 4);
    assert.equal(result.boundary.resolvedLegIndex, 1);
    assert.equal(result.trackedLeg?.scope, "trip-A");
  }
});
test("three destination fixes offer confirmation without moving to WALK", () => {
  const state = arrive();
  assert.equal(state.alightingReady, true);
  assert.equal(state.boundary.phase, "BOARDED");
  assert.equal(state.boundary.resolvedLegIndex, 1);
  assert.equal(state.completedThrough, -1);
});
test("repeated timestamp/realtime refresh cannot multiply arrival evidence", () => {
  let state = advanceTransitJourneySession(boarded(), input(0.01), [leg], 4);
  for (let i = 0; i < 10; i++) state = advanceTransitJourneySession(state, input(0.01), [{ ...leg }], 4);
  assert.equal(state.boundary.arrivalEvidenceFixes, 1);
  assert.equal(state.alightingReady, false);
});
test("old GPS timestamp cannot add arrival evidence", () => {
  const state = advanceTransitJourneySession(boarded(), input(0.01), [leg], 2);
  assert.equal(state.boundary.arrivalEvidenceFixes, 0);
});
test("bad GPS accuracy cannot prove arrival", () => {
  let state = boarded();
  const args = input(0.01);
  args.position!.accuracyMeters = 100;
  for (let i = 4; i < 10; i++) state = advanceTransitJourneySession(state, args, [leg], i);
  assert.equal(state.alightingReady, false);
});
test("GPS loss keeps the onboard scope and ready confirmation", () => {
  const state = arrive();
  assert.deepEqual(advanceTransitJourneySession(state, input(null, 3, "TRANSIT"), [leg, second], null), state);
});
test("GPS loss before readiness restarts the three-fix arrival check", () => {
  let state = advanceTransitJourneySession(boarded(), input(0.01), [leg], 4);
  state = advanceTransitJourneySession(state, input(null), [leg], null);
  assert.equal(state.boundary.arrivalEvidenceFixes, 0);
  state = advanceTransitJourneySession(state, input(0.01), [leg], 5);
  assert.equal(state.boundary.arrivalEvidenceFixes, 1);
  assert.equal(state.alightingReady, false);
});
test("invalid destination coordinates cannot offer confirmation", () => {
  const invalid = { ...leg, alightingCoordinate: [0, 100] as const };
  let state = boarded(invalid);
  for (let i = 4; i <= 8; i++) state = advanceTransitJourneySession(state, input(0.01), [invalid], i);
  assert.equal(state.alightingReady, false);
});
test("driving away from the destination withdraws the confirmation", () => {
  const state = advanceTransitJourneySession(arrive(), input(0.013), [leg, second], 7);
  assert.equal(state.alightingReady, false);
  assert.equal(state.boundary.resolvedLegIndex, 1);
});
test("confirmation is scoped, cannot happen early, and is idempotent", () => {
  const early = boarded();
  assert.equal(confirmJourneyAlighting(early, "trip-A"), early);
  const ready = arrive();
  assert.equal(confirmJourneyAlighting(ready, "trip-B"), ready);
  const done = confirmJourneyAlighting(ready, "trip-A");
  assert.equal(done.boundary.resolvedLegIndex, 2);
  assert.equal(done.completedThrough, 1);
  assert.equal(confirmJourneyAlighting(done, "trip-A"), done);
});
test("stale GPS matching an old leg cannot undo confirmed alighting", () => {
  const done = confirmJourneyAlighting(arrive(), "trip-A");
  const next = advanceTransitJourneySession(done, input(0.01), [leg, second], 7);
  assert.equal(next.boundary.resolvedLegIndex, 2);
  assert.notEqual(next.boundary.phase, "BOARDED");
});
test("second vehicle starts with fresh boarding evidence, not sticky ARRIVED", () => {
  let state = confirmJourneyAlighting(arrive(), "trip-A");
  for (const [i, lat] of [0.011, 0.0111, 0.0112].entries()) state = advanceTransitJourneySession(state, input(lat, 2), [leg, second], i + 7);
  assert.equal(state.boundary.phase, "BOARDED");
  assert.equal(state.boundary.resolvedLegIndex, 3);
  assert.equal(state.trackedLeg?.scope, "trip-B");
  assert.equal(state.boundary.arrivalEvidenceFixes, 0);
});
test("direct transfer lands on the next vehicle without claiming boarding", () => {
  const following = { ...second, legIndex: 2 };
  const done = confirmJourneyAlighting(arrive(boarded(), [leg, following]), "trip-A");
  const next = advanceTransitJourneySession(done, input(0.011, 2, "TRANSIT"), [leg, following], 7);
  assert.equal(next.boundary.resolvedLegIndex, 2);
  assert.equal(next.boundary.phase, "AT_BOARDING_AREA");
});
test("final alighting works with weak geometry and no intermediate-stop data", () => {
  const final = { ...leg, hasFollowingLeg: false, legCoordinates: null };
  const ready = arrive(boarded(final), [final]);
  assert.equal(ready.alightingReady, true);
  const done = confirmJourneyAlighting(ready, final.scope);
  assert.equal(done.journeyComplete, true);
  assert.equal(advanceTransitJourneySession(done, input(null), [final], null), done);
});
test("changed trip identity cannot inherit onboard or arrival evidence", () => {
  const result = advanceTransitJourneySession(arrive(), input(0.01, 1, "TRANSIT"), [{ ...leg, scope: "replacement" }], 7);
  assert.equal(result.alightingReady, false);
  assert.notEqual(result.boundary.phase, "BOARDED");
});
test("a fresh session has no completed legs or confirmation", () => {
  const state = createTransitJourneySession();
  assert.equal(state.completedThrough, -1);
  assert.equal(state.alightingReady, false);
  assert.equal(state.trackedLeg, null);
});
test("final arrival UI requires confirmation even when geometry says route end", () => {
  const instructions = buildNavigationInstructions({ legs: [{ mode: "TRANSIT", fromName: "A", toName: "B", durationMinutes: 5, realtime: false }] });
  const options = { legIndex: 0, onboard: true, atRouteEnd: true, nearAlighting: true, requireAlightingConfirmation: true };
  assert.equal(selectActiveInstructionWithStopProgress(instructions, options).current?.kind, "RIDE");
  assert.equal(selectActiveInstructionWithStopProgress(instructions, { ...options, alightingConfirmed: true }).current?.kind, "ARRIVE");
});
test("missed boarding evidence still allows explicit final alighting after three fixes", () => {
  const final = { ...leg, hasFollowingLeg: false };
  let state = createTransitJourneySession();
  for (let i = 1; i <= 3; i++) state = advanceTransitJourneySession(state, input(0.01, 1, "TRANSIT"), [final], i);
  assert.notEqual(state.boundary.phase, "BOARDED");
  assert.equal(state.journeyComplete, false);
  assert.equal(state.alightingReady, true);
  assert.equal(confirmJourneyAlighting(state, final.scope).journeyComplete, true);
});
