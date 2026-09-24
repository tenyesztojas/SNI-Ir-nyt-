import type { TransitProgress } from "./transitProgress.ts";

export interface StableTransitProgress {
  scope: string;
  timestamp: number | null;
  accepted: TransitProgress | null;
  pendingCount: number | null;
  display: TransitProgress | null;
}
// The raw resolver (transitProgress.ts) already gates a single fix behind
// its own accuracy-based margin before it will report a stop as passed, so
// a decreasing (forward-progress) count from a fresh, valid fix is accepted
// immediately here — stacking a second, same-value-required fix on top of
// that would only double the latency without adding real jitter protection.
// An INCREASING count (device appears to have moved backwards, away from
// the destination) is still treated as noise: it hides the display rather
// than reviving an already-passed stop or regressing what was shown.
export function stabilizeTransitProgress(
  previous: StableTransitProgress | null,
  scope: string,
  candidate: TransitProgress | null,
  timestamp: number | null,
): StableTransitProgress {
  const state: StableTransitProgress = previous?.scope === scope ? previous : {
    scope, timestamp: null, accepted: null, pendingCount: null, display: null,
  };
  if (!candidate || timestamp === null || !Number.isFinite(timestamp)) return { ...state, display: null, pendingCount: null };
  if (state.timestamp !== null && timestamp <= state.timestamp) return state;
  if (!state.accepted || candidate.remainingStopCount <= state.accepted.remainingStopCount) {
    return { scope, timestamp, accepted: candidate, pendingCount: null, display: candidate };
  }
  return { ...state, timestamp, pendingCount: null, display: null };
}
