import { test } from "node:test";
import assert from "node:assert/strict";
import { stabilizeTransitProgress } from "../../lib/vedett-route/navigation/stableTransitProgress.ts";
import { resolveTransitProgress } from "../../lib/vedett-route/navigation/transitProgress.ts";

const candidate = (count: number) => ({ remainingStopCount: count, atFinalStop: count === 1, nextStopName: String(count), nearAlighting: false });

test("a decreasing (forward-progress) count is accepted on the very first distinct fix — no second confirming fix required", () => {
  let state = stabilizeTransitProgress(null, "A", candidate(3), 1);
  assert.equal(state.display?.remainingStopCount, 3);
  state = stabilizeTransitProgress(state, "A", candidate(2), 2);
  assert.equal(state.display?.remainingStopCount, 2, "a single fresh fix must be enough to advance, not a second matching one");
});

test("rerenders with the same timestamp never advance the count", () => {
  let state = stabilizeTransitProgress(null, "A", candidate(3), 1);
  state = stabilizeTransitProgress(state, "A", candidate(2), 1);
  assert.equal(state.display?.remainingStopCount, 3, "same timestamp = same fix, not a new sample");
});

test("backward GPS hides the count instead of reviving a passed stop", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(2), 1);
  const back = stabilizeTransitProgress(initial, "A", candidate(3), 2);
  assert.equal(back.display, null);
  assert.equal(stabilizeTransitProgress(back, "A", candidate(2), 3).display?.remainingStopCount, 2);
});

test("GPS loss immediately hides counts, and a fresh fix afterwards is accepted at once", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(3), 1);
  const advanced = stabilizeTransitProgress(initial, "A", candidate(2), 2);
  const lost = stabilizeTransitProgress(advanced, "A", null, null);
  assert.equal(lost.display, null);
  const fresh = stabilizeTransitProgress(lost, "A", candidate(2), 3);
  assert.equal(fresh.display?.remainingStopCount, 2, "no re-accumulated pending evidence is required after a loss");
});

test("another route or leg starts a new count", () => {
  const initial = stabilizeTransitProgress(null, "A", candidate(1), 1);
  assert.equal(stabilizeTransitProgress(initial, "B", candidate(7), 2).display?.remainingStopCount, 7);
});

// End-to-end: raw GPS fixes -> resolveTransitProgress (per-fix, accuracy-based
// margin gate) -> stabilizeTransitProgress (single jitter-protection layer).
// Proves the two layers no longer stack into a double delay.
const coordinates = [[0, 0], [0, 0.01], [0, 0.02]] as const;
const stops = [{ name: "A", lon: 0, lat: 0.002 }, { name: "B", lon: 0, lat: 0.008 }];
const destination = { name: "C", lon: 0, lat: 0.02 };
const fix = (latitude: number) => ({ longitude: 0, latitude, accuracyMeters: 5 });

test("GPS-fix sequence: stop progress stays jitter-stable with at most one fix of latency", () => {
  let state: ReturnType<typeof stabilizeTransitProgress> | null = null;
  let t = 1;
  const feed = (lat: number) => {
    const raw = resolveTransitProgress(coordinates, stops, destination, fix(lat));
    state = stabilizeTransitProgress(state, "leg-0", raw, t);
    t += 1;
    return state;
  };

  // 1) Before stop A: does not step forward too early.
  assert.equal(feed(0.001)?.display?.remainingStopCount, 3);

  // 2) A single fix clearly past A's uncertainty band advances the display —
  // 3) — and it does so on THAT one fix, not after a second confirming one.
  assert.equal(feed(0.004)?.display?.remainingStopCount, 2);

  // 4) A noisy fix that lands back inside A's margin must not simply step
  // the display back to 3 — it is hidden rather than regressed.
  const jitter = feed(0.0021);
  assert.equal(jitter?.display, null);
  assert.notEqual(jitter?.display?.remainingStopCount, 3);

  // 5) A subsequent good fix shows the remaining-stop count keeps
  // decreasing as the ride progresses: 3 -> 2 -> 1.
  assert.equal(feed(0.009)?.display?.remainingStopCount, 1);
});
