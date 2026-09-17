// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — POLLING/SESSION kategória:
// shouldStartRealtimeRefresh() — UGYANAZ a pure-guard mintázat, mint
// rerouteGuard.ts shouldStartAutomaticReroute()-ja.
//   node --test __tests__/vedett-route/realtime-refresh-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialRealtimeRefreshGuardState,
  markRealtimeRefreshFinished,
  markRealtimeRefreshStarted,
  shouldStartRealtimeRefresh,
  TRANSIT_REALTIME_REFRESH_INTERVAL_MS,
  type RealtimeRefreshGuardState,
} from "../../lib/vedett-route/navigation/realtimeRefreshGuard.ts";

const BASE_INPUT = {
  navigationActive: true,
  documentVisible: true,
  hasRelevantTransitLeg: true,
  hasRestStopOverride: false,
  isRerouting: false,
  nowMs: 1000,
};

function freshState(): RealtimeRefreshGuardState {
  return createInitialRealtimeRefreshGuardState();
}

test("interval konstans determinisztikusan 30000 ms", () => {
  assert.equal(TRANSIT_REALTIME_REFRESH_INTERVAL_MS, 30_000);
});

test("navigáció inaktív esetén nem indul kérés", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, navigationActive: false });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "NAVIGATION_INACTIVE");
});

test("nincs releváns TRANSIT láb esetén nem indul kérés (pl. csak WALK van a teljes útvonalon)", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, hasRelevantTransitLeg: false });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "NO_RELEVANT_TRANSIT_LEG");
});

test("WALK legen, de a KÖVETKEZŐ láb TRANSIT -> indulhat kérés (hívó oldal jelzi hasRelevantTransitLeg=true-val)", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, hasRelevantTransitLeg: true });
  assert.equal(decision.shouldRefresh, true);
});

test("aktív TRANSIT láb esetén indulhat kérés", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), BASE_INPUT);
  assert.equal(decision.shouldRefresh, true);
});

test("dokumentum nem látható (hidden tab) esetén nem indul kérés", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, documentVisible: false });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "DOCUMENT_HIDDEN");
});

test("rest-stop legsOverride aktív esetén nem indul kérés", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, hasRestStopOverride: true });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "REST_STOP_OVERRIDE_ACTIVE");
});

test("automatikus reroute folyamatban van esetén nem indul kérés", () => {
  const decision = shouldStartRealtimeRefresh(freshState(), { ...BASE_INPUT, isRerouting: true });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "REROUTING_ACTIVE");
});

test("már folyamatban lévő (in-flight) kérés mellett nem indul második (legfeljebb 1 kérés egyszerre)", () => {
  const state = markRealtimeRefreshStarted(freshState(), 1000);
  const decision = shouldStartRealtimeRefresh(state, { ...BASE_INPUT, nowMs: 1500 });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "REQUEST_IN_FLIGHT");
});

test("az intervallum letelte előtt nem indul újra kérés", () => {
  let state = markRealtimeRefreshStarted(freshState(), 0);
  state = markRealtimeRefreshFinished(state);
  const decision = shouldStartRealtimeRefresh(state, { ...BASE_INPUT, nowMs: 10_000 });
  assert.equal(decision.shouldRefresh, false);
  assert.equal(decision.reason, "INTERVAL_NOT_ELAPSED");
});

test("az intervallum letelte után újra indulhat kérés (determinisztikus 30 mp)", () => {
  let state = markRealtimeRefreshStarted(freshState(), 0);
  state = markRealtimeRefreshFinished(state);
  const decision = shouldStartRealtimeRefresh(state, { ...BASE_INPUT, nowMs: 30_000 });
  assert.equal(decision.shouldRefresh, true);
});

test("visibility-return esetén (justBecameVisible) az intervallum-korlátot átlépve is indulhat frissítés, de nem in-flight/rerouting/override felett", () => {
  let state = markRealtimeRefreshStarted(freshState(), 0);
  state = markRealtimeRefreshFinished(state);
  const decision = shouldStartRealtimeRefresh(state, { ...BASE_INPUT, nowMs: 5000, justBecameVisible: true });
  assert.equal(decision.shouldRefresh, true);

  const blockedByOverride = shouldStartRealtimeRefresh(state, {
    ...BASE_INPUT,
    nowMs: 5000,
    justBecameVisible: true,
    hasRestStopOverride: true,
  });
  assert.equal(blockedByOverride.shouldRefresh, false);
});

test("markRealtimeRefreshFinished feloldja az in-flight állapotot, de a lastRefreshAtMs megmarad", () => {
  const started = markRealtimeRefreshStarted(freshState(), 1234);
  const finished = markRealtimeRefreshFinished(started);
  assert.equal(finished.inFlight, false);
  assert.equal(finished.lastRefreshAtMs, 1234);
});
