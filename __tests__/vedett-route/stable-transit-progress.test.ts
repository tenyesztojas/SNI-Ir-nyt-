import { test } from "node:test";
import assert from "node:assert/strict";
import { stabilizeTransitProgress } from "../../lib/vedett-route/navigation/stableTransitProgress.ts";
const candidate = (count: number) => ({ remainingStopCount: count, atFinalStop: count === 1, nextStopName: String(count), nearAlighting: false });
test("decreasing count requires two distinct fixes; rerenders do not count", () => {
  let state = stabilizeTransitProgress(null, "A", candidate(3), 1);
  state = stabilizeTransitProgress(state, "A", candidate(2), 2);
  assert.equal(state.display?.remainingStopCount, 3);
  state = stabilizeTransitProgress(state, "A", candidate(2), 2);
  assert.equal(state.display?.remainingStopCount, 3);
  state = stabilizeTransitProgress(state, "A", candidate(2), 3);
  assert.equal(state.display?.remainingStopCount, 2);
});
test("backward GPS hides the count instead of reviving a passed stop", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(2), 1);
  const back = stabilizeTransitProgress(initial, "A", candidate(3), 2);
  assert.equal(back.display, null);
  assert.equal(stabilizeTransitProgress(back, "A", candidate(2), 3).display?.remainingStopCount, 2);
});
test("GPS loss immediately hides counts and resets pending evidence", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(3), 1);
  const pending = stabilizeTransitProgress(initial, "A", candidate(2), 2);
  const lost = stabilizeTransitProgress(pending, "A", null, null);
  assert.equal(lost.display, null);
  const fresh = stabilizeTransitProgress(lost, "A", candidate(2), 3);
  assert.equal(fresh.display?.remainingStopCount, 3);
});
test("another route or leg starts a new count", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(1), 1);
  assert.equal(stabilizeTransitProgress(initial, "B", candidate(7), 2).display?.remainingStopCount, 7);
});
