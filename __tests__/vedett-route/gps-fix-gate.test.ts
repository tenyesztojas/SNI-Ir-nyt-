// NAVIGATION FOUNDATION sprint (2026-09-17) — GPS FIX FRESHNESS + FOREGROUND
// REACQUISITION kategória: classifyGpsFixFreshness() / evaluateGpsFixUsability()
// — UGYANAZ a pure-guard mintázat, mint rerouteGuard.ts/realtimeRefreshGuard.ts.
//   node --test __tests__/vedett-route/gps-fix-gate.test.ts
//
// Szándékosan generikus, Budapest-mentes fixture-ök (nincs Déli/Kossuth
// utalás sem itt, sem a klasszifikáció bemenetében).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGpsFixFreshness,
  createInitialGpsFixGateState,
  evaluateGpsFixUsability,
  isGpsReacquiring,
  markVisibilityReturned,
  updateGpsReacquisitionState,
  GPS_FIX_MAX_AGE_MS,
  GPS_REACQUISITION_STABLE_FIXES,
  type GpsFixGateState,
} from "../../lib/vedett-route/navigation/gpsFixGate.ts";

function freshState(): GpsFixGateState {
  return createInitialGpsFixGateState();
}

test("dokumentált küszöbérték-konstans determinisztikus", () => {
  assert.equal(GPS_FIX_MAX_AGE_MS, 20_000);
});

test("classifyGpsFixFreshness: hiányzó timestamp -> INVALID", () => {
  assert.equal(classifyGpsFixFreshness(null, 10_000), "INVALID");
  assert.equal(classifyGpsFixFreshness(undefined, 10_000), "INVALID");
});

test("classifyGpsFixFreshness: NaN/nem véges timestamp -> INVALID", () => {
  assert.equal(classifyGpsFixFreshness(Number.NaN, 10_000), "INVALID");
  assert.equal(classifyGpsFixFreshness(Number.POSITIVE_INFINITY, 10_000), "INVALID");
});

test("classifyGpsFixFreshness: toleranciát meghaladó jövőbeli timestamp -> INVALID", () => {
  assert.equal(classifyGpsFixFreshness(20_000, 10_000), "INVALID");
});

test("classifyGpsFixFreshness: toleranciahatáron belüli apró jövőbeli eltérés -> nem INVALID", () => {
  assert.notEqual(classifyGpsFixFreshness(10_500, 10_000), "INVALID");
});

test("classifyGpsFixFreshness: küszöbnél régebbi fix -> STALE", () => {
  assert.equal(classifyGpsFixFreshness(0, GPS_FIX_MAX_AGE_MS + 1), "STALE");
});

test("classifyGpsFixFreshness: küszöbön belüli fix -> FRESH", () => {
  assert.equal(classifyGpsFixFreshness(1_000, 1_000 + GPS_FIX_MAX_AGE_MS - 1), "FRESH");
});

test("classifyGpsFixFreshness: explicit maxAgeMs paraméter felülírja az alapértéket", () => {
  assert.equal(classifyGpsFixFreshness(0, 5_000, 10_000), "FRESH");
  assert.equal(classifyGpsFixFreshness(0, 5_000, 1_000), "STALE");
});

test("evaluateGpsFixUsability: STALE fix sosem usable, és nem törli a pending reacquisition-t", () => {
  const pending = markVisibilityReturned(freshState(), 5_000);
  const result = evaluateGpsFixUsability(pending, 0, 5_000 + GPS_FIX_MAX_AGE_MS + 1);
  assert.equal(result.usable, false);
  assert.equal(result.freshness, "STALE");
  assert.equal(result.nextState.pendingReacquisitionSinceMs, 5_000);
});

test("evaluateGpsFixUsability: INVALID fix sosem usable", () => {
  const result = evaluateGpsFixUsability(freshState(), null, 5_000);
  assert.equal(result.usable, false);
  assert.equal(result.freshness, "INVALID");
});

test("evaluateGpsFixUsability: nincs pending reacquisition -> egy FRESH fix usable", () => {
  const result = evaluateGpsFixUsability(freshState(), 5_000, 5_500);
  assert.equal(result.usable, true);
  assert.equal(result.freshness, "FRESH");
  assert.equal(result.nextState.pendingReacquisitionSinceMs, null);
});

test("evaluateGpsFixUsability: visibility-visszatérés ELŐTTI, egyébként FRESH fix NEM usable (a korábban tárolt fix nem 'válik automatikusan frissé')", () => {
  const pending = markVisibilityReturned(freshState(), 10_000);
  // A fix maga friss (nem lejárt), de a timestamp-je a visszatérés ELŐTTRŐL van.
  const result = evaluateGpsFixUsability(pending, 9_000, 10_100);
  assert.equal(result.usable, false);
  assert.equal(result.freshness, "FRESH");
  // A pending flaget NEM töröljük — továbbra is várunk az első genuinely friss fixre.
  assert.equal(result.nextState.pendingReacquisitionSinceMs, 10_000);
});

test("evaluateGpsFixUsability: a visszatérés UTÁNI első FRESH fix usable, és törli a pending flaget", () => {
  const pending = markVisibilityReturned(freshState(), 10_000);
  const result = evaluateGpsFixUsability(pending, 10_050, 10_100);
  assert.equal(result.usable, true);
  assert.equal(result.freshness, "FRESH");
  assert.equal(result.nextState.pendingReacquisitionSinceMs, null);
});

test("evaluateGpsFixUsability: a visszatérés PONTOSAN abban a pillanatában érkező fix usable (>= határeset)", () => {
  const pending = markVisibilityReturned(freshState(), 10_000);
  const result = evaluateGpsFixUsability(pending, 10_000, 10_000);
  assert.equal(result.usable, true);
  assert.equal(result.nextState.pendingReacquisitionSinceMs, null);
});

test("evaluateGpsFixUsability: reacquisition után egy STALE fix nem oldja fel a pending flaget, de egy KÉSŐBBI friss fix már igen", () => {
  const pending = markVisibilityReturned(freshState(), 10_000);
  const staleAttempt = evaluateGpsFixUsability(pending, 9_500, 10_100 + GPS_FIX_MAX_AGE_MS + 1);
  assert.equal(staleAttempt.usable, false);
  assert.equal(staleAttempt.nextState.pendingReacquisitionSinceMs, 10_000);

  const freshAttempt = evaluateGpsFixUsability(staleAttempt.nextState, 10_200, 10_300);
  assert.equal(freshAttempt.usable, true);
  assert.equal(freshAttempt.nextState.pendingReacquisitionSinceMs, null);
});

test("markVisibilityReturned: az állapot pontosan a megadott nowMs-re áll be", () => {
  const state = markVisibilityReturned(freshState(), 42_000);
  assert.equal(state.pendingReacquisitionSinceMs, 42_000);
});

test("createInitialGpsFixGateState: nincs pending reacquisition induláskor", () => {
  assert.equal(freshState().pendingReacquisitionSinceMs, null);
});

// ============================================================================
// TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) — teszt-
// lista 3/4/5. pont: LOST -> első reacquired fix (ELÉGTELEN), inkonzisztens
// reacquired fixek (ELÉGTELEN), majd több stabil fix (VÉGRE OK).
// ============================================================================

test("createInitialGpsFixGateState: sosem volt LOST -> isGpsReacquiring hamis", () => {
  assert.equal(isGpsReacquiring(freshState()), false);
});

test("updateGpsReacquisitionState: LOST -> streak 0, isGpsReacquiring igaz (teszt-lista 3. pont eleje)", () => {
  const afterLost = updateGpsReacquisitionState(freshState(), "LOST");
  assert.equal(afterLost.reacquisitionStreak, 0);
  assert.equal(isGpsReacquiring(afterLost), true);
});

test("updateGpsReacquisitionState: LOST -> egyetlen GOOD fix -> MÉG reacquiring (teszt-lista 3. pont: nem elég ÖNMAGÁBAN)", () => {
  const afterLost = updateGpsReacquisitionState(freshState(), "LOST");
  const afterOneGood = updateGpsReacquisitionState(afterLost, "GOOD");
  assert.equal(isGpsReacquiring(afterOneGood), true);
  assert.equal(afterOneGood.reacquisitionStreak, 1);
});

test("updateGpsReacquisitionState: LOST -> GOOD -> LOST (inkonzisztens fixek) -> a streak visszaáll 0-ra, MÉG reacquiring (teszt-lista 4. pont)", () => {
  let state = updateGpsReacquisitionState(freshState(), "LOST");
  state = updateGpsReacquisitionState(state, "GOOD");
  state = updateGpsReacquisitionState(state, "GOOD");
  state = updateGpsReacquisitionState(state, "LOST");
  assert.equal(state.reacquisitionStreak, 0);
  assert.equal(isGpsReacquiring(state), true);
});

test(`updateGpsReacquisitionState: LOST -> ${GPS_REACQUISITION_STABLE_FIXES} egymást követő GOOD fix -> isGpsReacquiring hamis, normál kiértékelés folytatódik (teszt-lista 5. pont)`, () => {
  let state = updateGpsReacquisitionState(freshState(), "LOST");
  for (let i = 0; i < GPS_REACQUISITION_STABLE_FIXES; i += 1) {
    state = updateGpsReacquisitionState(state, "GOOD");
  }
  assert.equal(isGpsReacquiring(state), false);
  assert.equal(state.reacquisitionStreak, null);
});

test("updateGpsReacquisitionState: DEGRADED sem növeli, sem nem törli a streaket LOST után", () => {
  let state = updateGpsReacquisitionState(freshState(), "LOST");
  state = updateGpsReacquisitionState(state, "DEGRADED");
  assert.equal(state.reacquisitionStreak, 0);
  assert.equal(isGpsReacquiring(state), true);
});

test("updateGpsReacquisitionState: sosem volt LOST -> egy GOOD/DEGRADED fix NEM indít reacquisition-ablakot (nincs feleslegesen 3 fixes bemelegítés minden navigáció elején)", () => {
  const afterGood = updateGpsReacquisitionState(freshState(), "GOOD");
  assert.equal(isGpsReacquiring(afterGood), false);
  const afterDegraded = updateGpsReacquisitionState(freshState(), "DEGRADED");
  assert.equal(isGpsReacquiring(afterDegraded), false);
});

test("evaluateGpsFixUsability: STALE (LOST) fix után egyetlen usable fix MÉG reacquiring-ot jelez (result.reacquiring)", () => {
  const lostResult = evaluateGpsFixUsability(freshState(), 0, GPS_FIX_MAX_AGE_MS + 1);
  assert.equal(lostResult.quality, "LOST");
  const firstGoodResult = evaluateGpsFixUsability(lostResult.nextState, 100_000, 100_000);
  assert.equal(firstGoodResult.usable, true);
  assert.equal(firstGoodResult.quality, "GOOD");
  assert.equal(firstGoodResult.reacquiring, true);
});
