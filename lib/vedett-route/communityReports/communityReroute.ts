// VÉDETT ÚTVONAL — DYNAMIC SENSORY REROUTING (2026-10-06) — tiszta döntési modul.
//
// SOHA nem vált útvonalat: csak (1) eldönti, hogy a hátralévő út közösségi
// állapota ÉRDEMBEN romlott-e a navigáció-indításkori baseline-hoz képest, és
// (2) egy már lekért alternatíva-listából megmondja, van-e VALÓBAN jobb út.
// A keresést, az ajánlatot, az előnézetet és az elfogadást a MEGLÉVŐ Live
// Alternative pipeline végzi (guard, cooldown, decline-suppression, explicit
// felhasználói elfogadás) — ez a modul annak egy új triggerét és döntési
// kapuját adja. Nincs második routing motor: a jelöltek a fő keresési
// végpontból jönnek, a pontszám UGYANAZ a computeScoreBreakdown() (strukturális
// Sensory Engine + közösségi szenzoros + zavar pont), amit a rangsor is használ.

import type { Journey } from "../types.ts";
import { computeSensoryScore } from "../sensoryEngine.ts";
import { computeJourneyFingerprint } from "../fingerprint.ts";
import { computeRemainingJourneyMetrics, computeSwitchingCost, type SwitchingCostBreakdown } from "../navigation/liveAlternative.ts";
import { COMMUNITY_ROUTING_CONFIG } from "./communityRoutingConfig.ts";
import {
  collectCommunityContexts,
  computeScoreBreakdown,
  type CommunityLegContext,
  type CommunityScoreBreakdown,
  type JourneyCommunityAssessment,
  type JourneyCommunityState,
  type RankingReasonCode,
} from "./communityRouting.ts";
import type { PersonalizationWeights } from "../types.ts";

/**
 * Központi, dokumentált küszöbök (a 0..100-as Sensory Engine pontskálán).
 *  - materialPenaltyIncrease 0.2: a személyes közösségi penalty (0..1) legalább
 *    ennyit nőjön — ez a skála ötöde, egy egyszeri gyenge jelzés nem éri el.
 *  - newDisruptionMin 0.3: új, megfelelő confidence-ű zavar akkor számít, ha a
 *    hátralévő út zavar-összetevője legalább ennyi (és a baseline-ban nem volt).
 *  - minImprovementPoints 8: ennyi pont + a váltási költség kell az ajánlathoz
 *    (≈ egy átszállás-különbség súlya a Sensory Engine-ben) — 1-2 pontért nem.
 *  - minCommunityImprovementPoints 4: a javulás legalább részben a közösségi
 *    összetevőből jöjjön (különben nem a romlás miatt ajánlunk váltást).
 *  - pointsPerSwitchingMinute 1, pointsPerExtraMinute 0.5, max 20: a meglévő
 *    perc-alapú switching cost pontra váltása, felülről korlátosan.
 *  - maxExtraMinutes 10 / maxExtraTransfers 1 / maxExtraWalkingMinutes 8:
 *    navigáció közben szigorúbb, mint a kezdeti rangsorolás 20 perce.
 */
export const COMMUNITY_REROUTE_CONFIG = {
  minConfidence: COMMUNITY_ROUTING_CONFIG.minConfidence,
  materialPenaltyIncrease: COMMUNITY_ROUTING_CONFIG.materialChangeThreshold,
  newDisruptionMin: 0.3,
  minImprovementPoints: 8,
  minCommunityImprovementPoints: 4,
  pointsPerSwitchingMinute: 1,
  pointsPerExtraMinute: 0.5,
  maxSwitchingCostPoints: 20,
  maxExtraMinutes: 10,
  maxExtraTransfers: 1,
  maxExtraWalkingMinutes: 8,
  /** Kliens monitor kadencia (a meglévő realtime figyelmeztetés percenkénti ütemével közös timer). */
  monitorIntervalMs: 60_000,
} as const;

// ── Hátralévő út ─────────────────────────────────────────────────────────────

/** A hátralévő út Journey-ként (a már megtett lábak NÉLKÜL). */
export function buildRemainingJourney(journey: Journey, activeLegIndex: number | null | undefined): Journey {
  const from = Math.max(0, activeLegIndex ?? 0);
  const legs = journey.legs.slice(from);
  const transitAll = journey.legs.filter((l) => l.mode === "TRANSIT").length;
  const transitRemaining = legs.filter((l) => l.mode === "TRANSIT").length;
  return {
    ...journey,
    legs,
    totalDurationMinutes: legs.reduce((s, l) => s + l.durationMinutes, 0),
    walkingMinutes: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.durationMinutes, 0),
    transfers: Math.max(0, transitRemaining - 1),
    // Várakozás: a teljes út várakozásának a hátralévő járatok arányában eső része.
    waitingMinutes: transitAll > 0 ? Math.round((journey.waitingMinutes * transitRemaining) / transitAll) : 0,
    departureTime: legs[0]?.departureTime ?? journey.departureTime,
    sensory: undefined,
  };
}

/** A hátralévő TRANSIT szakaszok közösségi kontextusai (a megtett lábak kizárva). */
export function collectRemainingCommunityContexts(journey: Journey, activeLegIndex: number | null | undefined): { contexts: CommunityLegContext[]; durations: Record<string, number> } {
  const remaining = buildRemainingJourney(journey, activeLegIndex);
  const { contexts, legRefs } = collectCommunityContexts([remaining]);
  const durations: Record<string, number> = {};
  for (const ref of legRefs[0] ?? []) durations[ref.contextKey] = (durations[ref.contextKey] ?? 0) + ref.durationMinutes;
  return { contexts, durations };
}

// ── Material change ──────────────────────────────────────────────────────────

export type CommunityDeteriorationTrigger = "PENALTY_INCREASE" | "NEW_DISRUPTION";

export interface CommunityDeteriorationDecision {
  material: boolean;
  trigger: CommunityDeteriorationTrigger | null;
  reason: "NO_BASELINE" | "LOW_CONFIDENCE" | "NO_EVIDENCE" | "BELOW_THRESHOLD" | "MATERIAL";
}

/**
 * Baseline (útvonal-választáskor / elfogadáskor) vs. jelen. Gyenge vagy
 * bizonyíték nélküli jelen állapotból SOHA nem material. A "reference"
 * (pl. egy elutasított ajánlat állapota) ugyanígy összevethető.
 */
export function evaluateCommunityDeterioration(reference: JourneyCommunityState | null, current: JourneyCommunityState): CommunityDeteriorationDecision {
  const c = COMMUNITY_REROUTE_CONFIG;
  if (!reference) return { material: false, trigger: null, reason: "NO_BASELINE" };
  if (current.evidenceLegCount === 0) return { material: false, trigger: null, reason: "NO_EVIDENCE" };
  if (current.confidence < c.minConfidence) return { material: false, trigger: null, reason: "LOW_CONFIDENCE" };
  if (current.disruption >= c.newDisruptionMin && reference.disruption < c.newDisruptionMin && current.disruption - reference.disruption >= c.materialPenaltyIncrease) {
    return { material: true, trigger: "NEW_DISRUPTION", reason: "MATERIAL" };
  }
  if (current.personalPenalty - reference.personalPenalty >= c.materialPenaltyIncrease) {
    return { material: true, trigger: "PENALTY_INCREASE", reason: "MATERIAL" };
  }
  return { material: false, trigger: null, reason: "BELOW_THRESHOLD" };
}

// ── Current vs. alternative ──────────────────────────────────────────────────

export interface RerouteCandidateInput {
  journey: Journey;
  /** A szerver rangsorolójának breakdownja (ugyanaz a computeScoreBreakdown); hiányában csak strukturális. */
  scoreBreakdown?: CommunityScoreBreakdown;
  reasonCodes?: RankingReasonCode[];
}

export interface RerouteDecision {
  shouldOffer: boolean;
  best: RerouteCandidateInput | null;
  currentBreakdown: CommunityScoreBreakdown;
  bestBreakdown: CommunityScoreBreakdown | null;
  improvementPoints: number;
  communityImprovementPoints: number;
  switchingCostPoints: number;
  switchingCost: SwitchingCostBreakdown | null;
  reasonCodes: RankingReasonCode[];
  rejectedReason:
    | null
    | "NO_CANDIDATES"
    | "ONLY_CURRENT_ROUTE"
    | "GUARDRAIL_DURATION"
    | "GUARDRAIL_TRANSFERS"
    | "GUARDRAIL_WALKING"
    | "INSUFFICIENT_IMPROVEMENT"
    | "NOT_COMMUNITY_DRIVEN";
  /** Az ajánlott alternatíva hátralévő ideje a jelenlegihez képest (perc; + = hosszabb). */
  durationDeltaMinutes: number;
  transferDelta: number;
}

/** A jelenlegi hátralévő út pontszáma UGYANAZZAL az engine-nel, mint a jelölteké. */
export function computeCurrentRemainingBreakdown(
  journey: Journey,
  activeLegIndex: number | null | undefined,
  weights: PersonalizationWeights,
  assessment: JourneyCommunityAssessment | null
): { remaining: Journey; breakdown: CommunityScoreBreakdown } {
  const remaining = buildRemainingJourney(journey, activeLegIndex);
  const withSensory = { ...remaining, sensory: computeSensoryScore(remaining, weights) };
  return { remaining: withSensory, breakdown: computeScoreBreakdown(withSensory, assessment) };
}

const communityPoints = (b: CommunityScoreBreakdown) => b.communitySensoryPenalty + b.communityDisruptionPenalty;

export function evaluateRerouteOpportunity(input: {
  current: { remaining: Journey; breakdown: CommunityScoreBreakdown; assessment: JourneyCommunityAssessment | null; fingerprint?: string };
  candidates: readonly RerouteCandidateInput[];
  secondsUntilActionRequired?: number;
}): RerouteDecision {
  const c = COMMUNITY_REROUTE_CONFIG;
  const current = input.current;
  const base: RerouteDecision = {
    shouldOffer: false, best: null, currentBreakdown: current.breakdown, bestBreakdown: null, improvementPoints: 0,
    communityImprovementPoints: 0, switchingCostPoints: 0, switchingCost: null, reasonCodes: [], rejectedReason: null,
    durationDeltaMinutes: 0, transferDelta: 0,
  };
  if (input.candidates.length === 0) return { ...base, rejectedReason: "NO_CANDIDATES" };
  const currentFp = current.fingerprint;
  const others = input.candidates
    .map((cand, index) => ({ cand, index, fp: cand.journey.fingerprint ?? computeJourneyFingerprint(cand.journey), b: cand.scoreBreakdown ?? computeScoreBreakdown(cand.journey, null) }))
    .filter((x) => !currentFp || x.fp !== currentFp);
  if (others.length === 0) return { ...base, rejectedReason: "ONLY_CURRENT_ROUTE" };

  const cur = current.remaining;
  const passing = others.filter((x) => x.cand.journey.totalDurationMinutes <= cur.totalDurationMinutes + c.maxExtraMinutes);
  if (passing.length === 0) return { ...base, rejectedReason: "GUARDRAIL_DURATION" };
  const passingTransfers = passing.filter((x) => x.cand.journey.transfers <= cur.transfers + c.maxExtraTransfers);
  if (passingTransfers.length === 0) return { ...base, rejectedReason: "GUARDRAIL_TRANSFERS" };
  const eligible = passingTransfers.filter((x) => x.cand.journey.walkingMinutes <= cur.walkingMinutes + c.maxExtraWalkingMinutes);
  if (eligible.length === 0) return { ...base, rejectedReason: "GUARDRAIL_WALKING" };

  // Determinisztikus legjobb jelölt — ugyanaz a rendezés, mint a rangsorban.
  const best = [...eligible].sort(
    (x, y) =>
      x.b.finalScore - y.b.finalScore ||
      x.b.structuralSensoryPenalty - y.b.structuralSensoryPenalty ||
      x.cand.journey.totalDurationMinutes - y.cand.journey.totalDurationMinutes ||
      (x.fp < y.fp ? -1 : x.fp > y.fp ? 1 : 0) ||
      x.index - y.index
  )[0];

  const switchingCost = computeSwitchingCost({
    current: computeRemainingJourneyMetrics(cur, 0),
    candidate: computeRemainingJourneyMetrics(best.cand.journey, 0),
    secondsUntilActionRequired: input.secondsUntilActionRequired,
  });
  const extraMinutes = Math.max(0, best.cand.journey.totalDurationMinutes - cur.totalDurationMinutes);
  const switchingCostPoints = Math.round(Math.min(c.maxSwitchingCostPoints, switchingCost.totalPenaltyMinutes * c.pointsPerSwitchingMinute + extraMinutes * c.pointsPerExtraMinute) * 10) / 10;
  const improvementPoints = Math.round((current.breakdown.finalScore - best.b.finalScore) * 10) / 10;
  const communityImprovementPoints = Math.round((communityPoints(current.breakdown) - communityPoints(best.b)) * 10) / 10;
  const durationDeltaMinutes = Math.round(best.cand.journey.totalDurationMinutes - cur.totalDurationMinutes);
  const transferDelta = best.cand.journey.transfers - cur.transfers;
  const decided = { ...base, best: best.cand, bestBreakdown: best.b, improvementPoints, communityImprovementPoints, switchingCostPoints, switchingCost, durationDeltaMinutes, transferDelta };

  if (communityImprovementPoints < c.minCommunityImprovementPoints) return { ...decided, rejectedReason: "NOT_COMMUNITY_DRIVEN" };
  if (improvementPoints < c.minImprovementPoints + switchingCostPoints) return { ...decided, rejectedReason: "INSUFFICIENT_IMPROVEMENT" };

  const reasonCodes: RankingReasonCode[] = [];
  const a = current.assessment;
  if (best.b.communityDisruptionPenalty < current.breakdown.communityDisruptionPenalty && a?.disruptionDriver) reasonCodes.push("AVOIDS_REPORTED_DISRUPTION");
  if (best.b.communitySensoryPenalty < current.breakdown.communitySensoryPenalty && a?.sensoryDriver === "realtime") reasonCodes.push("CURRENTLY_CALMER");
  else if (best.b.communitySensoryPenalty < current.breakdown.communitySensoryPenalty && a?.sensoryDriver === "historical") {
    reasonCodes.push(a.crowdingDriven ? "LOWER_EXPECTED_CROWDING" : "LOWER_EXPECTED_SENSORY_LOAD");
  }
  if (transferDelta < 0) reasonCodes.push("FEWER_TRANSFERS");
  if (best.cand.journey.walkingMinutes < cur.walkingMinutes) reasonCodes.push("LESS_WALKING");
  return { ...decided, shouldOffer: true, reasonCodes, rejectedReason: null };
}

/** Rövid, szám-alapú különbségek + legfontosabb indok (max 3), az ajánlat-kártyához. */
export function buildRerouteOfferBullets(decision: RerouteDecision, reasonText: (code: RankingReasonCode) => string | null): string[] {
  if (!decision.shouldOffer) return [];
  const bullets: string[] = [];
  const community = decision.reasonCodes.map(reasonText).find((t): t is string => Boolean(t));
  if (community) bullets.push(community);
  if (decision.durationDeltaMinutes >= 1) bullets.push(`${decision.durationDeltaMinutes} perccel hosszabb`);
  else if (decision.durationDeltaMinutes <= -1) bullets.push(`${Math.abs(decision.durationDeltaMinutes)} perccel rövidebb`);
  if (decision.transferDelta < 0) bullets.push(`${Math.abs(decision.transferDelta)} átszállással kevesebb`);
  else if (decision.transferDelta > 0) bullets.push(`${decision.transferDelta} átszállással több`);
  return bullets.slice(0, 3);
}
