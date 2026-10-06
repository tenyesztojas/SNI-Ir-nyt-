// VÉDETT ÚTVONAL — crowding/sensory routing penalty INTERFÉSZ (v1: NINCS bekötve).
//
// A ranking (ranking.ts / sensoryEngine.ts) ebben a fázisban NEM hívja. A
// függvény szándékosan konzervatív: kevés vagy bizonytalan közösségi adat
// SOHA nem ad penaltyt, és a penalty felülről korlátos, így egy későbbi
// bekötés sem tudja radikálisan megváltoztatni az útvonalat.

import { COMMUNITY_ROUTING_PENALTY_CONFIG } from "./config.ts";
import type { TrafficStateAggregate } from "./aggregation.ts";

export interface CrowdingSensoryPenalty {
  applied: boolean;
  penaltyMinutes: number;
  reason: "insufficient_confidence" | "insufficient_samples" | "no_signal" | "applied";
}

export interface CrowdingSensoryPenaltyProvider {
  penaltyFor(state: TrafficStateAggregate): CrowdingSensoryPenalty;
}

export function computeCrowdingSensoryPenalty(
  state: TrafficStateAggregate,
  config: { minConfidence: number; minSampleCount: number; maxPenaltyMinutes: number } = COMMUNITY_ROUTING_PENALTY_CONFIG
): CrowdingSensoryPenalty {
  if (state.sampleCount < config.minSampleCount) return { applied: false, penaltyMinutes: 0, reason: "insufficient_samples" };
  if (state.confidence < config.minConfidence) return { applied: false, penaltyMinutes: 0, reason: "insufficient_confidence" };
  const crowding = state.dimensions.crowding.score ?? 0;
  const sensory = state.sensoryCombined.score ?? 0;
  const load = Math.max(crowding, sensory);
  if (load <= 0) return { applied: false, penaltyMinutes: 0, reason: "no_signal" };
  const penaltyMinutes = Math.round(load * state.confidence * config.maxPenaltyMinutes * 10) / 10;
  return { applied: penaltyMinutes > 0, penaltyMinutes: Math.min(config.maxPenaltyMinutes, penaltyMinutes), reason: "applied" };
}

export const defaultCrowdingSensoryPenaltyProvider: CrowdingSensoryPenaltyProvider = {
  penaltyFor: (state) => computeCrowdingSensoryPenalty(state),
};
