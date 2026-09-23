import type { TransitProgress } from "./transitProgress.ts";

export interface StableTransitProgress {
  scope: string;
  timestamp: number | null;
  accepted: TransitProgress | null;
  pendingCount: number | null;
  display: TransitProgress | null;
}
// Require two distinct GPS samples before reducing a count. A backwards jump
// hides the precise count rather than resurrecting an already passed stop.
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
  if (!state.accepted || candidate.remainingStopCount === state.accepted.remainingStopCount) {
    return { scope, timestamp, accepted: candidate, pendingCount: null, display: candidate };
  }
  if (candidate.remainingStopCount > state.accepted.remainingStopCount) {
    return { ...state, timestamp, pendingCount: null, display: null };
  }
  if (state.pendingCount === candidate.remainingStopCount) {
    return { scope, timestamp, accepted: candidate, pendingCount: null, display: candidate };
  }
  return { ...state, timestamp, pendingCount: candidate.remainingStopCount, display: state.accepted };
}
