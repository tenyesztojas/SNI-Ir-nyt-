// Sprint E Preparation Gate — állapotgép tesztek.
//   node --test __tests__/vedett-route/rest-stop-flow-state-machine.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialRestStopFlowContext, transitionRestStopFlow } from "../../lib/vedett-route/restStopFlow/stateMachine.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";
import type { RankedRestPoint } from "../../lib/vedett-route/restStopFlow/types.ts";

const ORIGINAL_DESTINATION = { name: "Astoria", lat: 47.4952, lon: 19.0616 };
const ORIGINAL_DEPART_AT = "2026-09-07T10:00:00.000Z";

function makeRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "rp-1",
    createdBy: "user-1",
    name: "Pad a téren",
    latitude: 47.5,
    longitude: 19.05,
    source: "USER",
    visibility: "PRIVATE",
    toilet: true,
    seating: true,
    quietSpace: false,
    indoors: false,
    outdoors: true,
    purchaseRequired: false,
    notes: null,
    createdAt: "2026-09-07T09:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

function makeRanked(restPoint: RestPoint): RankedRestPoint {
  return {
    restPoint,
    ranking: { score: 80, confidence: 0.9, availableFactors: [], missingFactors: [], factors: [] },
  };
}

test("kezdeti context ROUTE_ACTIVE állapotban van, az eredeti célt tárolja", () => {
  const ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  assert.equal(ctx.state, "ROUTE_ACTIVE");
  assert.deepEqual(ctx.originalDestination, ORIGINAL_DESTINATION);
});

test("teljes boldog út: ROUTE_ACTIVE -> ... -> ROUTE_RESUMED, minden lépésben megőrzött originalDestination", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  const restPoint = makeRestPoint();
  const ranked = [makeRanked(restPoint)];

  const steps: Array<{ event: Parameters<typeof transitionRestStopFlow>[1]; expectedState: string }> = [
    { event: { type: "REQUEST_REST" }, expectedState: "REST_REQUESTED" },
    { event: { type: "START_LOADING_REST_POINTS" }, expectedState: "REST_POINTS_LOADING" },
    { event: { type: "REST_POINTS_LOADED", restPoints: ranked }, expectedState: "REST_POINTS_READY" },
    { event: { type: "SELECT_REST_POINT", restPoint }, expectedState: "REST_POINT_SELECTED" },
    { event: { type: "START_NAVIGATION_TO_REST_POINT" }, expectedState: "NAVIGATING_TO_REST_POINT" },
    { event: { type: "ARRIVED_AT_REST_POINT" }, expectedState: "AT_REST_POINT" },
    { event: { type: "REQUEST_RESUME" }, expectedState: "RESUME_REQUESTED" },
    { event: { type: "START_REROUTE" }, expectedState: "REROUTING_TO_ORIGINAL_DESTINATION" },
    { event: { type: "REROUTE_SUCCEEDED" }, expectedState: "ROUTE_RESUMED" },
  ];

  for (const step of steps) {
    const result = transitionRestStopFlow(ctx, step.event);
    assert.equal(result.ok, true, `váratlan hiba a(z) "${step.event.type}" eseménynél`);
    if (result.ok) {
      assert.equal(result.context.state, step.expectedState);
      // KRITIKUS: az eredeti cél MINDEN lépésben, még a pihenőpont
      // kiválasztása és a navigáció után is, VÁLTOZATLAN.
      assert.deepEqual(result.context.originalDestination, ORIGINAL_DESTINATION);
      assert.equal(result.context.originalDepartAt, ORIGINAL_DEPART_AT);
      ctx = result.context;
    }
  }

  assert.deepEqual(ctx.selectedRestPoint, restPoint);
});

test("a pihenőpont csak IDEIGLENES cél — a selectedRestPoint sosem írja felül az originalDestination mezőt", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  const restPoint = makeRestPoint({ latitude: 10, longitude: 20 });
  ctx = (transitionRestStopFlow(ctx, { type: "REQUEST_REST" }) as { ok: true; context: typeof ctx }).context;
  ctx = (transitionRestStopFlow(ctx, { type: "START_LOADING_REST_POINTS" }) as { ok: true; context: typeof ctx }).context;
  ctx = (transitionRestStopFlow(ctx, { type: "REST_POINTS_LOADED", restPoints: [makeRanked(restPoint)] }) as { ok: true; context: typeof ctx }).context;
  const selectResult = transitionRestStopFlow(ctx, { type: "SELECT_REST_POINT", restPoint });
  assert.equal(selectResult.ok, true);
  if (selectResult.ok) {
    assert.equal(selectResult.context.selectedRestPoint?.latitude, 10);
    // originalDestination koordinátái NEM a pihenőpont koordinátái.
    assert.equal(selectResult.context.originalDestination.lat, ORIGINAL_DESTINATION.lat);
    assert.equal(selectResult.context.originalDestination.lon, ORIGINAL_DESTINATION.lon);
  }
});

test("érvénytelen átmenet SOSEM dob kivételt, ok:false-t ad, a context változatlan marad", () => {
  const ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  const result = transitionRestStopFlow(ctx, { type: "ARRIVED_AT_REST_POINT" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_transition");
    assert.deepEqual(result.context, ctx);
  }
});

test("REST_POINTS_LOAD_FAILED -> ERROR állapot, hibaüzenettel", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  ctx = (transitionRestStopFlow(ctx, { type: "REQUEST_REST" }) as { ok: true; context: typeof ctx }).context;
  ctx = (transitionRestStopFlow(ctx, { type: "START_LOADING_REST_POINTS" }) as { ok: true; context: typeof ctx }).context;
  const result = transitionRestStopFlow(ctx, { type: "REST_POINTS_LOAD_FAILED", reason: "network_error" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.state, "ERROR");
    assert.equal(result.context.errorReason, "rest_points_load_failed");
    assert.equal(result.context.errorMessage, "network_error");
    // Hiba esetén is megőrzött eredeti cél.
    assert.deepEqual(result.context.originalDestination, ORIGINAL_DESTINATION);
  }
});

test("REROUTE_FAILED -> ERROR állapot, az eredeti cél akkor is megmarad", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  ctx = { ...ctx, state: "REROUTING_TO_ORIGINAL_DESTINATION" };
  const result = transitionRestStopFlow(ctx, { type: "REROUTE_FAILED", reason: "route_service_unavailable" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.state, "ERROR");
    assert.equal(result.context.errorReason, "reroute_failed");
    assert.deepEqual(result.context.originalDestination, ORIGINAL_DESTINATION);
  }
});

test("ERROR állapotból RESET_TO_ROUTE_ACTIVE visszaviszi ROUTE_ACTIVE-ra, törli a hiba/kiválasztás mezőket, de megőrzi az eredeti célt", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  ctx = { ...ctx, state: "ERROR", errorReason: "reroute_failed", errorMessage: "x", selectedRestPoint: makeRestPoint() };
  const result = transitionRestStopFlow(ctx, { type: "RESET_TO_ROUTE_ACTIVE" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.state, "ROUTE_ACTIVE");
    assert.equal(result.context.errorReason, undefined);
    assert.equal(result.context.selectedRestPoint, undefined);
    assert.deepEqual(result.context.originalDestination, ORIGINAL_DESTINATION);
  }
});

test("ERROR állapotból BÁRMILYEN MÁS esemény érvénytelen (csak RESET_TO_ROUTE_ACTIVE vezet ki)", () => {
  let ctx = createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT);
  ctx = { ...ctx, state: "ERROR" };
  const result = transitionRestStopFlow(ctx, { type: "REQUEST_REST" });
  assert.equal(result.ok, false);
});

test("CANCEL_REST_STOP a köztes állapotokból (REST_REQUESTED, REST_POINTS_LOADING, REST_POINTS_READY, REST_POINT_SELECTED) mindig ROUTE_ACTIVE-ra visz vissza", () => {
  const intermediateStates: Array<typeof ctxState> = ["REST_REQUESTED", "REST_POINTS_LOADING", "REST_POINTS_READY", "REST_POINT_SELECTED"] as const;
  type ctxState = "REST_REQUESTED" | "REST_POINTS_LOADING" | "REST_POINTS_READY" | "REST_POINT_SELECTED";
  for (const state of intermediateStates) {
    const ctx = { ...createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT), state };
    const result = transitionRestStopFlow(ctx, { type: "CANCEL_REST_STOP" });
    assert.equal(result.ok, true, `CANCEL_REST_STOP-nak működnie kell ${state}-ból`);
    if (result.ok) {
      assert.equal(result.context.state, "ROUTE_ACTIVE");
      assert.deepEqual(result.context.originalDestination, ORIGINAL_DESTINATION);
    }
  }
});

test("CANCEL_REST_STOP NEM engedélyezett, miután a felhasználó már fizikailag útnak indult (NAVIGATING_TO_REST_POINT, AT_REST_POINT, RESUME_REQUESTED, REROUTING_TO_ORIGINAL_DESTINATION, ROUTE_RESUMED)", () => {
  const lateStates = [
    "NAVIGATING_TO_REST_POINT",
    "AT_REST_POINT",
    "RESUME_REQUESTED",
    "REROUTING_TO_ORIGINAL_DESTINATION",
    "ROUTE_RESUMED",
  ] as const;
  for (const state of lateStates) {
    const ctx = { ...createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT), state };
    const result = transitionRestStopFlow(ctx, { type: "CANCEL_REST_STOP" });
    assert.equal(result.ok, false, `CANCEL_REST_STOP-nak NEM szabadna működnie ${state}-ból`);
  }
});

test("START_NAVIGATION_TO_REST_POINT kiválasztott pihenőpont nélkül érvénytelen (védekező ág)", () => {
  const ctx = { ...createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT), state: "REST_POINT_SELECTED" as const };
  const result = transitionRestStopFlow(ctx, { type: "START_NAVIGATION_TO_REST_POINT" });
  assert.equal(result.ok, false);
});

test("ROUTE_RESUMED végállapot — nincs innen kimenő átmenet", () => {
  const ctx = { ...createInitialRestStopFlowContext(ORIGINAL_DESTINATION, ORIGINAL_DEPART_AT), state: "ROUTE_RESUMED" as const };
  const result = transitionRestStopFlow(ctx, { type: "REQUEST_REST" });
  assert.equal(result.ok, false);
});
