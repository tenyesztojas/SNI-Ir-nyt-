// VÉDETT ÚTVONAL — JOURNEY MONITOR v1 (2026-10-07) — tiszta, determinisztikus helperek.
//
// NEM új monitor-rendszer: a MEGLÉVŐ Live Alternative pipeline (guard,
// cooldown, decline-suppression, keresés, ajánlat, elfogadás) kap pontosabb
// bemenetet. Ez a modul:
//   1) estimateRemainingEta — a hátralévő út VALÓS (realtime-korrigált)
//      várható ideje a lábak időpontjaiból (nem durationMinutes-összeg);
//   2) evaluateMissedConnection — veszélyeztetett/elveszett csatlakozás a
//      realtime érkezés + átszálló gyaloglás vs. következő indulás alapján;
//   3) decideRealtimeMonitorTrigger — melyik realtime jelből és mikor legyen
//      Live Alternative trigger (debounce-szal).
// Nincs hálózat, nincs React, nincs GPS. Bizonytalan adat -> null (fail-open).

import type { Journey, JourneyLeg } from "../types.ts";
import {
  computeRemainingJourneyMetrics,
  computeSwitchingCost,
  evaluateMeaningfulImprovement,
  type LiveAlternativeTrigger,
  type LiveAlternativeTriggerType,
  type MeaningfulImprovementReason,
  type RealtimeDegradationResult,
  type StructuralImprovement,
  type SwitchingCostBreakdown,
} from "./liveAlternative.ts";

const parseMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const legMinutes = (leg: JourneyLeg): number | null =>
  typeof leg.durationMinutes === "number" && Number.isFinite(leg.durationMinutes) && leg.durationMinutes >= 0 ? leg.durationMinutes : null;

// ---------------------------------------------------------------------------
// 1) HÁTRALÉVŐ IDŐ (ETA)
// ---------------------------------------------------------------------------

export type RemainingEtaBasis = "REALTIME_TRANSIT_ARRIVAL" | "SCHEDULED_TRANSIT_ARRIVAL" | "WALK_ONLY";

export interface RemainingEta {
  /** Várható érkezés a végső célhoz (epoch ms). */
  arrivalMs: number;
  /** Hátralévő idő percben (arrivalMs − now), legalább 0. */
  remainingMinutes: number;
  basis: RemainingEtaBasis;
}

/** Ennél régebbi (már elmúltnak mutatott) utolsó tömegközlekedési érkezés elavult adatra utal -> null. */
export const ETA_STALE_TOLERANCE_MS = 2 * 60_000;

/**
 * A hátralévő út várható ideje:
 *   - Ha van hátralévő TRANSIT láb: az UTOLSÓ hátralévő TRANSIT láb
 *     (realtime-merge után aktuális) arrivalTime-ja + az utána következő
 *     nem-TRANSIT lábak (gyaloglás, kerékpár) durationMinutes-a.
 *   - Ha csak gyaloglás van hátra: most + a hátralévő lábak durationMinutes-a.
 * A journey.arrivalTime-ot SZÁNDÉKOSAN nem használjuk (a realtime merge nem
 * frissíti, elavult lehet). null: kimaradt hátralévő TRANSIT láb, hiányzó
 * vagy érvénytelen idő/időtartam, vagy már elmúltnak mutatott érkezés.
 */
export function estimateRemainingEta(journey: Journey, activeLegIndex: number | null | undefined, nowMs: number): RemainingEta | null {
  if (!journey || !Array.isArray(journey.legs) || journey.legs.length === 0 || !Number.isFinite(nowMs)) return null;
  const from = Math.max(0, Math.min(activeLegIndex ?? 0, journey.legs.length));
  const remaining = journey.legs.slice(from);
  if (remaining.length === 0) return null;
  if (remaining.some((leg) => leg.mode === "TRANSIT" && leg.cancelled === true)) return null;

  let lastTransit = -1;
  for (let i = remaining.length - 1; i >= 0; i--) {
    if (remaining[i].mode === "TRANSIT") {
      lastTransit = i;
      break;
    }
  }

  let tailMinutes = 0;
  for (const leg of remaining.slice(lastTransit + 1)) {
    const m = legMinutes(leg);
    if (m === null) return null;
    tailMinutes += m;
  }

  if (lastTransit < 0) {
    const arrivalMs = nowMs + tailMinutes * 60_000;
    return { arrivalMs, remainingMinutes: tailMinutes, basis: "WALK_ONLY" };
  }

  const anchor = remaining[lastTransit];
  const anchorMs = parseMs(anchor.arrivalTime);
  if (anchorMs === null) return null;
  if (anchorMs < nowMs - ETA_STALE_TOLERANCE_MS) return null;
  const arrivalMs = anchorMs + tailMinutes * 60_000;
  return {
    arrivalMs,
    remainingMinutes: Math.max(0, (arrivalMs - nowMs) / 60_000),
    basis: anchor.realtime ? "REALTIME_TRANSIT_ARRIVAL" : "SCHEDULED_TRANSIT_ARRIVAL",
  };
}

// ---------------------------------------------------------------------------
// 2) CSATLAKOZÁS
// ---------------------------------------------------------------------------

export const DEFAULT_MIN_TRANSFER_MARGIN_MINUTES = 2;

export type MissedConnectionStatus = "OK" | "AT_RISK" | "MISSED";

export interface MissedConnectionResult {
  status: MissedConnectionStatus;
  /** A csatlakozás tartaléka percben (következő indulás − (érkezés + átszálló gyaloglás)). */
  slackMinutes: number | null;
  fromTripId: string | null;
  toTripId: string | null;
}

const NO_RISK: MissedConnectionResult = { status: "OK", slackMinutes: null, fromTripId: null, toTripId: null };

/**
 * Az aktív lábtól kezdve az ELSŐ olyan TRANSIT -> (gyalog) -> TRANSIT
 * átszállás, ahol a tartalék < marginMinutes:
 *   tartalék = következő.departureTime − (aktuális.arrivalTime + köztes lábak durationMinutes)
 *   tartalék < 0 -> MISSED, 0 <= tartalék < margin -> AT_RISK.
 * Hiányzó/érvénytelen idő, kimaradt láb (azt a CANCELLED jel kezeli),
 * vagy hiányzó tripId esetén az adott pár kimarad (fail-open).
 */
export function evaluateMissedConnection(
  journey: Journey,
  activeLegIndex: number | null | undefined,
  marginMinutes: number = DEFAULT_MIN_TRANSFER_MARGIN_MINUTES
): MissedConnectionResult {
  if (!journey || !Array.isArray(journey.legs)) return NO_RISK;
  const legs = journey.legs;
  const from = Math.max(0, activeLegIndex ?? 0);
  for (let i = from; i < legs.length; i++) {
    const current = legs[i];
    if (current.mode !== "TRANSIT") continue;
    let j = i + 1;
    let betweenMinutes = 0;
    let betweenValid = true;
    while (j < legs.length && legs[j].mode !== "TRANSIT") {
      const m = legMinutes(legs[j]);
      if (m === null) betweenValid = false;
      else betweenMinutes += m;
      j++;
    }
    if (j >= legs.length) break; // nincs több csatlakozás
    const next = legs[j];
    if (!betweenValid || current.cancelled === true || next.cancelled === true || !current.tripId || !next.tripId) continue;
    const arrivalMs = parseMs(current.arrivalTime);
    const departureMs = parseMs(next.departureTime);
    if (arrivalMs === null || departureMs === null) continue;
    const slackMinutes = (departureMs - (arrivalMs + betweenMinutes * 60_000)) / 60_000;
    if (slackMinutes < marginMinutes) {
      return { status: slackMinutes < 0 ? "MISSED" : "AT_RISK", slackMinutes, fromTripId: current.tripId, toTripId: next.tripId };
    }
  }
  return NO_RISK;
}

// ---------------------------------------------------------------------------
// 3) TRIGGER-DÖNTÉS DEBOUNCE-SZAL
// ---------------------------------------------------------------------------

/**
 * Debounce-döntés (dokumentált):
 *   - Kimaradás (cancelled=true): AZONNAL — egyértelmű, bináris tény, nincs
 *     mit megerősíteni, és minden poll-ciklus késlekedés rontja az esélyeket.
 *   - Elveszett csatlakozás, ha a tartalék legalább 1 perccel negatív:
 *     AZONNAL — a realtime idők szerint már nem érhető el.
 *   - Határeset csatlakozás (−1 perc < tartalék < margin) és jelentős késés:
 *     KÉT EGYMÁST KÖVETŐ poll (~30 s) erősítse meg UGYANAZT az eseményt,
 *     hogy egy rövid realtime-ingadozás ne dobjon fel alternatívát.
 * Ha egy pollban nincs megerősítendő jel, a függőben lévő esemény törlődik.
 */
export const CLEARLY_MISSED_SLACK_MINUTES = -1;

export interface RealtimeMonitorDebounceState {
  pendingEventId: string | null;
}

export function createInitialRealtimeMonitorDebounceState(): RealtimeMonitorDebounceState {
  return { pendingEventId: null };
}

export interface RealtimeMonitorDecision {
  trigger: LiveAlternativeTrigger | null;
  state: RealtimeMonitorDebounceState;
}

export function decideRealtimeMonitorTrigger(
  input: { degradation: RealtimeDegradationResult | null; missedConnection: MissedConnectionResult | null },
  state: RealtimeMonitorDebounceState
): RealtimeMonitorDecision {
  const { degradation, missedConnection } = input;

  if (degradation?.newlyCancelled && degradation.cancelledTripId) {
    return { trigger: { type: "CANCELLED", eventId: `cancelled:${degradation.cancelledTripId}` }, state: { pendingEventId: null } };
  }

  let candidate: LiveAlternativeTrigger | null = null;
  if (missedConnection && missedConnection.status !== "OK" && missedConnection.fromTripId && missedConnection.toTripId) {
    const eventId = `missed:${missedConnection.fromTripId}>${missedConnection.toTripId}`;
    if (missedConnection.slackMinutes !== null && missedConnection.slackMinutes <= CLEARLY_MISSED_SLACK_MINUTES) {
      return { trigger: { type: "MISSED_CONNECTION", eventId }, state: { pendingEventId: null } };
    }
    candidate = { type: "MISSED_CONNECTION", eventId };
  } else if (degradation?.degraded && degradation.worstLegTripId) {
    candidate = { type: "SIGNIFICANT_REALTIME_DEGRADATION", eventId: `degradation:${degradation.worstLegTripId}` };
  }

  if (!candidate) return { trigger: null, state: { pendingEventId: null } };
  if (state.pendingEventId === candidate.eventId) return { trigger: candidate, state: { pendingEventId: candidate.eventId } };
  return { trigger: null, state: { pendingEventId: candidate.eventId } };
}

// ---------------------------------------------------------------------------
// 4) ETA-ALAPÚ LIVE ALTERNATIVE ÖSSZEHASONLÍTÁS (Journey Monitor v1 / 2. lépés)
// ---------------------------------------------------------------------------

/**
 * Szabály (dokumentált):
 *   - NORMÁL eset (nincs bizonyított strukturális hiba): A = a jelenlegi út
 *     hátralévő ETA-ja (estimateRemainingEta, aktív lábtól), B = a jelölt
 *     teljes ETA-ja (estimateRemainingEta, 0. lábtól — a jelölt az aktuális
 *     helyzetből indul). raw = A − B, nettó = raw − a MEGLÉVŐ switching cost,
 *     majd a MEGLÉVŐ evaluateMeaningfulImprovement (5 perces kapu,
 *     strukturális kapu változatlan). Bármelyik ETA null -> nincs ajánlat.
 *   - STRUKTURÁLISAN SÉRÜLT jelenlegi út: a trigger CANCELLED, a hátralévő
 *     részben van kimaradt TRANSIT láb, vagy a csatlakozás realtime szerint
 *     már elveszett (MISSED). Ilyenkor a jelenlegi ETA értelmetlen (vagy
 *     null), ezért nem vetjük össze vele: egy ÉRVÉNYES jelölt (van ETA-ja,
 *     nincs kimaradt lába, nincs elveszett csatlakozása) felajánlható
 *     "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT" okkal. Ez is CSAK ajánlat
 *     (OFFERED) — a váltás továbbra is kizárólag explicit elfogadással.
 * A szerkezeti mérőszámok (átszállás, gyaloglás) továbbra is a meglévő
 * computeRemainingJourneyMetrics-ből jönnek — ezek csak a switching costhoz
 * és a strukturális kapuhoz kellenek, az IDŐ-összevetéshez nem.
 */
export type EtaComparisonRejectReason =
  | "CANDIDATE_ETA_UNAVAILABLE"
  | "CANDIDATE_NOT_VIABLE"
  | "CURRENT_ETA_UNAVAILABLE"
  | "NOT_MEANINGFUL";

export interface EtaLiveAlternativeInput {
  current: Journey;
  activeLegIndex: number | null | undefined;
  candidate: Journey;
  nowMs: number;
  triggerType: LiveAlternativeTriggerType;
}

export interface EtaLiveAlternativeDecision {
  offer: boolean;
  reason: MeaningfulImprovementReason;
  rejectedReason: EtaComparisonRejectReason | null;
  currentStructurallyBroken: boolean;
  currentRemainingMinutes: number | null;
  candidateRemainingMinutes: number | null;
  /** current − candidate ETA percben (null, ha a jelenlegi ETA nem értelmezhető). */
  rawTimeDifferenceMinutes: number | null;
  /** raw − switching cost; strukturálisan sérült útnál null. */
  netTimeBenefitMinutes: number | null;
  switchingCost: SwitchingCostBreakdown;
  structuralImprovement: StructuralImprovement;
}

function hasCancelledRemainingTransit(journey: Journey, fromIndex: number): boolean {
  return journey.legs.slice(Math.max(0, fromIndex)).some((leg) => leg.mode === "TRANSIT" && leg.cancelled === true);
}

export function evaluateEtaLiveAlternative(input: EtaLiveAlternativeInput): EtaLiveAlternativeDecision {
  const from = Math.max(0, input.activeLegIndex ?? 0);
  const currentMetrics = computeRemainingJourneyMetrics(input.current, from);
  const candidateMetrics = computeRemainingJourneyMetrics(input.candidate, 0);
  const switchingCost = computeSwitchingCost({ current: currentMetrics, candidate: candidateMetrics });
  const structuralImprovement: StructuralImprovement = {
    fewerTransfers: candidateMetrics.remainingTransfers < currentMetrics.remainingTransfers,
    lessWalking: candidateMetrics.remainingWalkingMinutes < currentMetrics.remainingWalkingMinutes,
  };
  const currentStructurallyBroken =
    input.triggerType === "CANCELLED" ||
    hasCancelledRemainingTransit(input.current, from) ||
    evaluateMissedConnection(input.current, from).status === "MISSED";

  const candidateEta = estimateRemainingEta(input.candidate, 0, input.nowMs);
  const currentEta = currentStructurallyBroken ? null : estimateRemainingEta(input.current, from, input.nowMs);
  const base = {
    currentStructurallyBroken,
    currentRemainingMinutes: currentEta?.remainingMinutes ?? null,
    candidateRemainingMinutes: candidateEta?.remainingMinutes ?? null,
    switchingCost,
    structuralImprovement,
  };
  const reject = (rejectedReason: EtaComparisonRejectReason, raw: number | null = null, net: number | null = null): EtaLiveAlternativeDecision => ({
    ...base,
    offer: false,
    reason: "NONE",
    rejectedReason,
    rawTimeDifferenceMinutes: raw,
    netTimeBenefitMinutes: net,
  });

  if (!candidateEta) return reject("CANDIDATE_ETA_UNAVAILABLE");

  if (currentStructurallyBroken) {
    const candidateViable = !hasCancelledRemainingTransit(input.candidate, 0) && evaluateMissedConnection(input.candidate, 0).status !== "MISSED";
    if (!candidateViable) return reject("CANDIDATE_NOT_VIABLE");
    return {
      ...base,
      offer: true,
      reason: "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT",
      rejectedReason: null,
      rawTimeDifferenceMinutes: null,
      netTimeBenefitMinutes: null,
    };
  }

  if (!currentEta) return reject("CURRENT_ETA_UNAVAILABLE");

  const rawTimeDifferenceMinutes = currentEta.remainingMinutes - candidateEta.remainingMinutes;
  const netTimeBenefitMinutes = rawTimeDifferenceMinutes - switchingCost.totalPenaltyMinutes;
  const gate = evaluateMeaningfulImprovement({
    rawTimeDifferenceMinutes,
    netTimeBenefitMinutes,
    disruptionDriven:
      input.triggerType === "PROVEN_RELEVANT_DISRUPTION" || input.triggerType === "CANCELLED" || input.triggerType === "MISSED_CONNECTION",
    structuralImprovement,
    hasRealPreferenceData: false,
    preferenceFavorsStructuralImprovement: false,
  });
  if (!gate.meaningful) return reject("NOT_MEANINGFUL", rawTimeDifferenceMinutes, netTimeBenefitMinutes);
  return { ...base, offer: true, reason: gate.reason, rejectedReason: null, rawTimeDifferenceMinutes, netTimeBenefitMinutes };
}
