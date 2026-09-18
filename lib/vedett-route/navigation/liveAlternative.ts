// VÉDETT ÚTVONAL — SPRINT 8.4 (LIVE ALTERNATIVE, 2026-09-18)
//
// PURE modul. "STAY ON CURRENT ROUTE" az alap állapot — ez a modul SOHA nem
// vált útvonalat automatikusan, SOHA nem indít navigációt egy candidate-en,
// és SOHA nem mond "szállj le" utasítást. Kizárólag azt dönti el, hogy
// (a) szabad-e egyáltalán alternatívát keresni (guard), (b) egy megtalált
// candidate ÉRDEMBEN jobb-e a hátralévő útnál (összehasonlítás + switching
// cost + meaningful-improvement gate), és (c) egy egyszerű, explicit
// felhasználói elfogadáshoz kötött állapotgépet (OFFER state machine) ad a
// hívó (RankedJourneyCard) React-orchestrationjéhez.
//
// EZ NEM AZ AUTO-REROUTE MECHANIZMUS (lásd rerouteGuard.ts): az auto-reroute
// azt kezeli, amikor a user BIZONYÍTOTTAN letért az útvonalról
// (OFF_ROUTE). A Live Alternative pontosan az ELLENKEZŐ esetben fut: a user
// TOVÁBBRA IS helyesen követi az eredeti útvonalat, de a körülmények
// (bizonyított disruption / jelentős realtime romlás) miatt egy másik
// útvonal érdemben jobb lehet. Az OFF_ROUTE állapot ezért SOHA nem indíthat
// Live Alternative keresést (lásd shouldStartLiveAlternativeSearch —
// explicit "OFF_ROUTE" blokkoló ok, UGYANAZ a guard-mintázat, mint
// rerouteGuard.ts-ben, de FÜGGETLEN state/döntés).
//
// Candidate-keresés forrása: a hívó a MEGLÉVŐ, MÁR BEKÖTÖTT
// POST /api/vedett-route/rest-stops/resume végpontot használja (lásd
// app/api/vedett-route/rest-stops/resume/route.ts) — ez a MEGLÉVŐ
// automatikus-reroute mechanizmus által is használt, "jelenlegi pozíció ->
// eredeti cél" újratervező végpont, ami a szerver oldalon MÁR kiválasztja a
// legjobb itineraryt (pickBestItinerary) és MÁR fingerprintelt Journey-t ad
// vissza (lásd orchestrator.ts mapMotisItineraryToJourney() ->
// computeJourneyFingerprint()). Ez a modul emiatt NEM implementál
// többcandidate-közüli választást a szerver válaszán belül — a
// selectBestLiveAlternativeCandidate() egy általánosabb, jövőbiztos pure
// segédfüggvény, ha a hívó valaha több candidate-et adna át egyszerre, de a
// jelenlegi, tényleges bekötési pont már egyetlen candidate-et ad.
//
// FONTOS — a switching cost és a meaningful-improvement gate EXPLICIT,
// szabály-alapú (nem "AI"/fuzzy scoring, nem klinikai/pszichológiai
// pontszám — "Ez product heuristic."). A négy, a specifikációban adott
// példaszcenárió a szabályokból KÖVETKEZIK (lásd a modul alján a
// evaluateMeaningfulImprovement() header-kommentjét a levezetéssel), nem
// hardcode-olt eredmény.

import type { Journey, JourneyLeg, ServiceAlert } from "../types.ts";
import { computeJourneyFingerprint } from "../fingerprint.ts";
import {
  filterProvenRelevantDisruptions,
  type DisruptionRelevanceLeg,
} from "./disruptionRelevance.ts";
import type { RealtimeLegUpdate } from "../realtimeRefresh/extractUpdates.ts";

// ---------------------------------------------------------------------------
// 1) TRIGGER TÍPUSOK
// ---------------------------------------------------------------------------

export type LiveAlternativeTriggerType =
  | "PROVEN_RELEVANT_DISRUPTION"
  | "SIGNIFICANT_REALTIME_DEGRADATION"
  | "MANUAL_CHECK";

export interface LiveAlternativeTrigger {
  type: LiveAlternativeTriggerType;
  /**
   * Stabil esemény-identitás — a cooldown-override és a decline-suppression
   * dedup EHHEZ van kötve, NEM a trigger típusához. PROVEN_RELEVANT_DISRUPTION
   * esetén az alert saját id-je (lásd disruptionRelevance.ts PROVEN_RELEVANT
   * eredmény alertId mezője); SIGNIFICANT_REALTIME_DEGRADATION esetén a
   * legrosszabbul romló láb tripId-je + egy durva idő-bucket (a hívó
   * felelőssége, hogy ne generáljon minden pollozási ciklusban új eventId-t
   * UGYANARRA a folyamatban lévő romlásra); MANUAL_CHECK esetén a hívó ad
   * minden explicit felhasználói kérésre egyedi kulcsot.
   */
  eventId: string;
}

/** Csak PROVEN_RELEVANT disruption triggerelhet Live Alternative keresést — UNKNOWN/IRRELEVANT SOHA. */
export function buildDisruptionTriggers(
  alerts: ServiceAlert[],
  legs: DisruptionRelevanceLeg[],
  currentLegIndex: number | null,
  nowMs: number
): LiveAlternativeTrigger[] {
  return filterProvenRelevantDisruptions(alerts, legs, currentLegIndex, nowMs).map((p) => ({
    type: "PROVEN_RELEVANT_DISRUPTION" as const,
    eventId: p.alertId,
  }));
}

// ---------------------------------------------------------------------------
// 2) RATE/CHURN GUARD — cooldown, in-flight, decline-suppression, stale
//    session generáció. UGYANAZ a mintázat, mint rerouteGuard.ts, de
//    FÜGGETLEN state — a két mechanizmus SOHA nem osztja meg az állapotát.
// ---------------------------------------------------------------------------

export const DEFAULT_LIVE_ALTERNATIVE_COOLDOWN_MS = 5 * 60 * 1000;
export const DEFAULT_DECLINE_SUPPRESSION_MS = 15 * 60 * 1000;

export interface LiveAlternativeGuardState {
  inFlight: boolean;
  lastSearchAtMs: number | null;
  lastEventId: string | null;
  /** eventId -> mikor lett explicit elutasítva ("Maradok ezen"). */
  declinedEvents: Record<string, number>;
}

export function createInitialLiveAlternativeGuardState(): LiveAlternativeGuardState {
  return { inFlight: false, lastSearchAtMs: null, lastEventId: null, declinedEvents: {} };
}

export type LiveAlternativeGuardBlockReason =
  | "NAVIGATION_INACTIVE"
  | "OFF_ROUTE_NOT_OUR_JOB"
  | "GPS_UNRELIABLE"
  | "RECOVERY_ACTIVE"
  | "DESTINATION_MISSING"
  | "SEARCH_IN_FLIGHT"
  | "EVENT_DECLINED_SUPPRESSED"
  | "COOLDOWN_ACTIVE";

export type LiveAlternativeGuardDecision =
  | { shouldSearch: true; reason: null }
  | { shouldSearch: false; reason: LiveAlternativeGuardBlockReason };

export interface LiveAlternativeGuardInput {
  navigationActive: boolean;
  /** Bizonyítottan OFF_ROUTE — ekkor a Live Alternative SOHA nem indul (az auto-reroute felelőssége). */
  offRouteConfirmed: boolean;
  /** Friss, megbízható GPS-fix (gpsFixUsable && !gpsReacquiring) — soha nem fabrikált pozícióból induló keresés. */
  gpsReliable: boolean;
  /** Foreground-reacquisition VAGY restore-recovery folyamatban — mindkettő blokkolja (lásd rerouteGuard.ts azonos elve). */
  foregroundRecoveryActive: boolean;
  restoreRecoveryActive: boolean;
  hasDestination: boolean;
  trigger: LiveAlternativeTrigger;
  nowMs: number;
  cooldownMs?: number;
  declineSuppressionMs?: number;
}

export function shouldStartLiveAlternativeSearch(
  state: LiveAlternativeGuardState,
  input: LiveAlternativeGuardInput
): LiveAlternativeGuardDecision {
  if (!input.navigationActive) return { shouldSearch: false, reason: "NAVIGATION_INACTIVE" };
  if (input.offRouteConfirmed) return { shouldSearch: false, reason: "OFF_ROUTE_NOT_OUR_JOB" };
  if (input.foregroundRecoveryActive || input.restoreRecoveryActive) {
    return { shouldSearch: false, reason: "RECOVERY_ACTIVE" };
  }
  if (!input.gpsReliable) return { shouldSearch: false, reason: "GPS_UNRELIABLE" };
  if (!input.hasDestination) return { shouldSearch: false, reason: "DESTINATION_MISSING" };
  if (state.inFlight) return { shouldSearch: false, reason: "SEARCH_IN_FLIGHT" };

  const suppressedAt = state.declinedEvents[input.trigger.eventId];
  const declineSuppressionMs = Math.max(0, input.declineSuppressionMs ?? DEFAULT_DECLINE_SUPPRESSION_MS);
  if (suppressedAt !== undefined && input.nowMs - suppressedAt < declineSuppressionMs) {
    return { shouldSearch: false, reason: "EVENT_DECLINED_SUPPRESSED" };
  }

  const cooldownMs = Math.max(0, input.cooldownMs ?? DEFAULT_LIVE_ALTERNATIVE_COOLDOWN_MS);
  if (state.lastSearchAtMs !== null && input.nowMs - state.lastSearchAtMs < cooldownMs) {
    // Egy ÚJ, genuinely különböző disruption esemény (más eventId) felülírhatja
    // a cooldownt — egy folyamatban lévő/ismétlődő eseményre viszont nem.
    const isGenuinelyNewDisruption =
      input.trigger.type === "PROVEN_RELEVANT_DISRUPTION" && input.trigger.eventId !== state.lastEventId;
    if (!isGenuinelyNewDisruption) {
      return { shouldSearch: false, reason: "COOLDOWN_ACTIVE" };
    }
  }

  return { shouldSearch: true, reason: null };
}

export function markLiveAlternativeSearchStarted(
  state: LiveAlternativeGuardState,
  trigger: LiveAlternativeTrigger,
  nowMs: number
): LiveAlternativeGuardState {
  return { ...state, inFlight: true, lastSearchAtMs: nowMs, lastEventId: trigger.eventId };
}

export function markLiveAlternativeSearchFinished(state: LiveAlternativeGuardState): LiveAlternativeGuardState {
  return { ...state, inFlight: false };
}

export function markLiveAlternativeEventDeclined(
  state: LiveAlternativeGuardState,
  eventId: string,
  nowMs: number
): LiveAlternativeGuardState {
  return { ...state, declinedEvents: { ...state.declinedEvents, [eventId]: nowMs } };
}

export function resetLiveAlternativeGuard(): LiveAlternativeGuardState {
  return createInitialLiveAlternativeGuardState();
}

// ---------------------------------------------------------------------------
// 3) HÁTRALÉVŐ ÚT METRIKÁI — leg-szintű közelítés (nem fabrikált sub-leg
//    pontosság). A currentLegIndex-nél KORÁBBI legek nem számítanak bele —
//    UGYANAZ a "still ahead of us" elv, mint disruptionRelevance.ts-ben.
// ---------------------------------------------------------------------------

export interface RemainingJourneyMetrics {
  remainingDurationMinutes: number;
  remainingWalkingMinutes: number;
  /** null, ha nem MINDEN hátralévő gyaloglási lábhoz volt valós MOTIS távolság-adat — soha nem becsült érték. */
  remainingWalkingDistanceMeters: number | null;
  remainingTransfers: number;
  remainingTransitLegCount: number;
  /** A hátralévő TRANSIT lábak transitMode-jainak halmaza (mode-change penalty számításához). */
  remainingTransitModes: Set<string>;
}

export function computeRemainingJourneyMetrics(
  journey: Journey,
  currentLegIndex: number | null
): RemainingJourneyMetrics {
  const fromIndex = Math.max(0, currentLegIndex ?? 0);
  const remainingLegs = journey.legs.slice(fromIndex);
  const remainingDurationMinutes = remainingLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const walkLegs = remainingLegs.filter((leg) => leg.mode === "WALK");
  const remainingWalkingMinutes = walkLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const remainingWalkingDistanceMeters =
    walkLegs.length > 0 && walkLegs.every((leg) => leg.distanceMeters !== undefined)
      ? walkLegs.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0)
      : null;
  const transitLegs = remainingLegs.filter((leg) => leg.mode === "TRANSIT");
  const remainingTransfers = Math.max(0, transitLegs.length - 1);
  const remainingTransitModes = new Set(
    transitLegs.map((leg) => leg.transitMode).filter((m): m is string => Boolean(m))
  );
  return {
    remainingDurationMinutes,
    remainingWalkingMinutes,
    remainingWalkingDistanceMeters,
    remainingTransfers,
    remainingTransitLegCount: transitLegs.length,
    remainingTransitModes,
  };
}

// ---------------------------------------------------------------------------
// 4) SWITCHING COST MODEL — explicit, szabály-alapú "product heuristic",
//    NEM klinikai/pszichológiai pontszám. Minden komponens percben kifejezett
//    "ekvivalens" büntetés/bónusz.
// ---------------------------------------------------------------------------

export const SWITCHING_COST_CONTINUITY_BONUS_MINUTES = 3;
export const SWITCHING_COST_TRANSFER_PENALTY_MINUTES = 4;
export const SWITCHING_COST_WALKING_PENALTY_PER_MINUTE = 0.5;
export const SWITCHING_COST_IMMEDIATE_CHANGE_PENALTY_MINUTES = 5;
export const SWITCHING_COST_MODE_CHANGE_PENALTY_MINUTES = 3;
/** Ha a döntést eddig az időn belül kellene meghozni (pl. a jelenlegi lábból emiatt kiszállás), az "immediate change" büntetés aktiválódik. */
export const IMMEDIATE_CHANGE_THRESHOLD_SECONDS = 90;

export interface SwitchingCostInput {
  current: RemainingJourneyMetrics;
  candidate: RemainingJourneyMetrics;
  /**
   * Ha ismert (pl. a jelenlegi TRANSIT láb hamarosan véget ér / azonnal át
   * kellene szállni), a hívó ideadja a másodperceket — HIÁNYÁBAN (undefined)
   * a modul SOHA nem fabrikál "azonnali döntés" büntetést.
   */
  secondsUntilActionRequired?: number;
}

export interface SwitchingCostBreakdown {
  continuityBonusMinutes: number;
  transferPenaltyMinutes: number;
  walkingPenaltyMinutes: number;
  immediateChangePenaltyMinutes: number;
  modeChangePenaltyMinutes: number;
  totalPenaltyMinutes: number;
}

export function computeSwitchingCost(input: SwitchingCostInput): SwitchingCostBreakdown {
  const addedTransfers = Math.max(0, input.candidate.remainingTransfers - input.current.remainingTransfers);
  const transferPenaltyMinutes = addedTransfers * SWITCHING_COST_TRANSFER_PENALTY_MINUTES;

  const addedWalkingMinutes = Math.max(
    0,
    input.candidate.remainingWalkingMinutes - input.current.remainingWalkingMinutes
  );
  const walkingPenaltyMinutes = addedWalkingMinutes * SWITCHING_COST_WALKING_PENALTY_PER_MINUTE;

  const immediateChangePenaltyMinutes =
    input.secondsUntilActionRequired !== undefined &&
    input.secondsUntilActionRequired >= 0 &&
    input.secondsUntilActionRequired <= IMMEDIATE_CHANGE_THRESHOLD_SECONDS
      ? SWITCHING_COST_IMMEDIATE_CHANGE_PENALTY_MINUTES
      : 0;

  const introducesNewMode = [...input.candidate.remainingTransitModes].some(
    (mode) => !input.current.remainingTransitModes.has(mode)
  );
  const modeChangePenaltyMinutes = introducesNewMode ? SWITCHING_COST_MODE_CHANGE_PENALTY_MINUTES : 0;

  const totalPenaltyMinutes =
    SWITCHING_COST_CONTINUITY_BONUS_MINUTES +
    transferPenaltyMinutes +
    walkingPenaltyMinutes +
    immediateChangePenaltyMinutes +
    modeChangePenaltyMinutes;

  return {
    continuityBonusMinutes: SWITCHING_COST_CONTINUITY_BONUS_MINUTES,
    transferPenaltyMinutes,
    walkingPenaltyMinutes,
    immediateChangePenaltyMinutes,
    modeChangePenaltyMinutes,
    totalPenaltyMinutes,
  };
}

// ---------------------------------------------------------------------------
// 5) MEANINGFUL IMPROVEMENT GATE
//
// Levezetés a specifikáció 4 példaszcenáriójára (a szabályokból KÖVETKEZIK,
// nincs hardcode-olt eset):
//   1) 31 vs 29 perc + 1 új átszállás: rawDiff=2, switchingCost>=4(transfer)+3(continuity)=7
//      -> netTimeBenefit = 2-7 = -5 -> nincs SUFFICIENT_TIME_BENEFIT (kell >=5) -> NINCS OFFER.
//   2) 31 vs 26 perc + 2 új átszállás: rawDiff=5, switchingCost=2*4+3=11 -> net=-6 -> NINCS OFFER
//      ("probably NO OFFER" — konzervatív alapértékkel egyértelműen nem elég).
//   3) 52 (disruption miatt) vs 33 perc + 1 egyszerű átszállás: rawDiff=19, switchingCost=4+3=7
//      -> net=12 >= 5 -> SUFFICIENT_TIME_BENEFIT -> OFFER lehetséges.
//   4) 35 vs 35 perc, de kevesebb átszállás/gyaloglás ÉS valós preferencia-adat
//      ezt támogatja: rawDiff=0 (nem rosszabb), disruptionDriven hiányában a
//      preferencia-alapú ág aktiválódik -> PREFERENCE_BACKED_STRUCTURAL_ADVANTAGE
//      -> OFFER lehetséges, DE KIZÁRÓLAG mert a hívó VALÓS preferencia-adatot
//      (hasRealPreferenceData=true) és tényleges strukturális előnyt adott át.
//
// A rawTimeDifferenceMinutes (switching cost NÉLKÜLI idő-különbség) csak a
// strukturális kapukhoz kell "nem rosszabb" ellenőrzésre — a switching cost
// mindig teljes egészében benne van a fő idő-alapú kapuban (netTimeBenefit).
// ---------------------------------------------------------------------------

export const MIN_MEANINGFUL_TIME_BENEFIT_MINUTES = 5;
/** Kis tolerancia a "nem rosszabb" ellenőrzéshez, hogy egy 1 perces mérési zaj ne zárja ki a strukturális kapukat. */
export const STRUCTURAL_GATE_TIME_TOLERANCE_MINUTES = 1;

export type MeaningfulImprovementReason =
  | "SUFFICIENT_TIME_BENEFIT"
  | "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT"
  | "PREFERENCE_BACKED_STRUCTURAL_ADVANTAGE"
  | "NONE";

export interface StructuralImprovement {
  fewerTransfers: boolean;
  lessWalking: boolean;
}

export interface MeaningfulImprovementGateInput {
  /** current.remainingDurationMinutes - candidate.remainingDurationMinutes, switching cost NÉLKÜL. */
  rawTimeDifferenceMinutes: number;
  /** rawTimeDifferenceMinutes - switchingCost.totalPenaltyMinutes. */
  netTimeBenefitMinutes: number;
  /** Igaz, ha a trigger egy PROVEN_RELEVANT disruption volt, amely a JELENLEGI hátralévő útra vonatkozott. */
  disruptionDriven: boolean;
  structuralImprovement: StructuralImprovement;
  /** Igaz, ha a hívó tényleges, meglévő preferencia-adatot (pl. PersonalizationWeights/SensoryScore) adott át — soha nem fabrikált. */
  hasRealPreferenceData: boolean;
  /** A hívó a VALÓS preferencia-adatból (nem ez a modul) állítja elő: kedvez-e a strukturális előnynek. */
  preferenceFavorsStructuralImprovement: boolean;
}

export interface MeaningfulImprovementDecision {
  meaningful: boolean;
  reason: MeaningfulImprovementReason;
}

export function evaluateMeaningfulImprovement(
  input: MeaningfulImprovementGateInput
): MeaningfulImprovementDecision {
  if (input.netTimeBenefitMinutes >= MIN_MEANINGFUL_TIME_BENEFIT_MINUTES) {
    return { meaningful: true, reason: "SUFFICIENT_TIME_BENEFIT" };
  }

  const notWorseOnRawTime = input.rawTimeDifferenceMinutes >= -STRUCTURAL_GATE_TIME_TOLERANCE_MINUTES;
  const hasStructuralAdvantage = input.structuralImprovement.fewerTransfers || input.structuralImprovement.lessWalking;

  if (input.disruptionDriven && notWorseOnRawTime && hasStructuralAdvantage) {
    return { meaningful: true, reason: "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT" };
  }

  if (
    input.hasRealPreferenceData &&
    input.preferenceFavorsStructuralImprovement &&
    notWorseOnRawTime &&
    hasStructuralAdvantage
  ) {
    return { meaningful: true, reason: "PREFERENCE_BACKED_STRUCTURAL_ADVANTAGE" };
  }

  return { meaningful: false, reason: "NONE" };
}

// ---------------------------------------------------------------------------
// 6) CANDIDATE DEDUP / KIVÁLASZTÁS — a MEGLÉVŐ fingerprint modult
//    (fingerprint.ts) használja, NEM duplikál nagy fingerprint logikát.
// ---------------------------------------------------------------------------

/**
 * Legfeljebb 1 candidate-et ad vissza: kiszűri a jelenlegi journey-vel
 * megegyező fingerprintű (=ugyanaz az út, nincs mit felajánlani) és a
 * korábban elutasított/suppressed fingerprintű candidate-eket, majd az
 * elsőt adja vissza. A tényleges bekötési pont (POST .../rest-stops/resume)
 * MÁR egyetlen, szerver-oldalon kiválasztott legjobb itineraryt ad — ez a
 * függvény egy jövőbiztos, több-candidate-es hívó esetére is helyes.
 */
export function selectBestLiveAlternativeCandidate(
  candidates: Journey[],
  currentJourneyFingerprint: string | undefined,
  suppressedFingerprints: ReadonlySet<string> = new Set()
): Journey | null {
  for (const candidate of candidates) {
    const fp = candidate.fingerprint ?? computeJourneyFingerprint(candidate);
    if (currentJourneyFingerprint !== undefined && fp === currentJourneyFingerprint) continue;
    if (suppressedFingerprints.has(fp)) continue;
    return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 7) REALTIME DEGRADATION HELPER — a MEGLÉVŐ ~30s realtime-refresh
//    (useTransitRealtimeRefresh.ts onUpdates callback) kimenetéből, ÚJ
//    poller NÉLKÜL. Fail-closed: hiányzó előző/új delay adatból SOHA nem
//    fabrikál romlást.
// ---------------------------------------------------------------------------

export const DEFAULT_SIGNIFICANT_DEGRADATION_THRESHOLD_MINUTES = 5;

export interface RealtimeDegradationLegSample {
  tripId: string;
  routeId?: string;
  /** null, ha nem volt korábbi, MEGBÍZHATÓ (realtime=true) delay-bizonyíték. */
  previousDelayMinutes: number | null;
  /** null, ha a frissítés nem adott delay-t. */
  updatedDelayMinutes: number | null;
  updatedCancelled?: boolean;
}

export interface RealtimeDegradationResult {
  degraded: boolean;
  worstLegTripId: string | null;
  worsenedByMinutes: number;
  newlyCancelled: boolean;
}

export function evaluateRealtimeDegradation(
  samples: RealtimeDegradationLegSample[],
  thresholdMinutes: number = DEFAULT_SIGNIFICANT_DEGRADATION_THRESHOLD_MINUTES
): RealtimeDegradationResult {
  let worstDelta = 0;
  let worstTripId: string | null = null;
  let newlyCancelled = false;

  for (const sample of samples) {
    if (sample.updatedCancelled === true) newlyCancelled = true;
    if (sample.previousDelayMinutes === null || sample.updatedDelayMinutes === null) continue;
    const delta = sample.updatedDelayMinutes - sample.previousDelayMinutes;
    if (delta > worstDelta) {
      worstDelta = delta;
      worstTripId = sample.tripId;
    }
  }

  return {
    degraded: newlyCancelled || worstDelta >= thresholdMinutes,
    worstLegTripId: worstTripId,
    worsenedByMinutes: worstDelta,
    newlyCancelled,
  };
}

/**
 * A hívó (RankedJourneyCard onUpdates callback) segédfüggvénye: a MEGLÉVŐ
 * mergeRealtimeUpdates.ts findUpdate() PONTOSAN ugyanazon tripId(+routeId)
 * párosítási szabályát tükrözi (szándékosan kis, önálló másolat — a
 * mergeRealtimeUpdates.ts saját findUpdate()-je nincs exportálva, és egy
 * ekkora, stabil párosítási logika duplikálása nem indokol új shared modult).
 */
export function buildRealtimeDegradationSamples(
  previousJourney: Journey,
  updates: RealtimeLegUpdate[]
): RealtimeDegradationLegSample[] {
  const samples: RealtimeDegradationLegSample[] = [];
  for (const leg of previousJourney.legs) {
    if (leg.mode !== "TRANSIT" || !leg.tripId) continue;
    const update = updates.find((u) => {
      if (u.tripId !== leg.tripId) return false;
      if (leg.routeId !== undefined && u.routeId !== undefined && leg.routeId !== u.routeId) return false;
      return true;
    });
    if (!update) continue;
    samples.push({
      tripId: leg.tripId,
      routeId: leg.routeId,
      previousDelayMinutes: leg.realtime && leg.delayMinutes !== undefined ? leg.delayMinutes : null,
      updatedDelayMinutes: update.delayMinutes !== undefined ? update.delayMinutes : null,
      updatedCancelled: update.cancelled === true,
    });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// 8) OFFER STATE MACHINE — FÜGGETLEN a navigationMode-tól. Kizárólag
//    OFFERED állapotban jelenik meg UI; ACCEPTED állapot a hívó felelőssége,
//    hogy egyszer, explicit "Ezt választom" után hozza létre.
// ---------------------------------------------------------------------------

export type LiveAlternativeOfferStatus = "NONE" | "SEARCHING" | "OFFERED" | "DECLINED" | "ACCEPTED";

export interface LiveAlternativeComparisonSummary {
  netTimeBenefitMinutes: number;
  reason: MeaningfulImprovementReason;
  /** Legfeljebb 2-3 rövid, bizonyított-előny bullet (pl. "12 perccel gyorsabb") — a hívó UI-ja jeleníti meg. */
  bullets: string[];
}

export interface LiveAlternativeOffer {
  status: LiveAlternativeOfferStatus;
  candidateJourney: Journey | null;
  trigger: LiveAlternativeTrigger | null;
  /** A keresés indításakor rögzített navigation-session generáció — stale-session discard ehhez van kötve. */
  sessionGeneration: number | null;
  comparisonSummary: LiveAlternativeComparisonSummary | null;
}

export function createInitialLiveAlternativeOffer(): LiveAlternativeOffer {
  return { status: "NONE", candidateJourney: null, trigger: null, sessionGeneration: null, comparisonSummary: null };
}

export function startLiveAlternativeOfferSearch(
  trigger: LiveAlternativeTrigger,
  sessionGeneration: number
): LiveAlternativeOffer {
  return { status: "SEARCHING", candidateJourney: null, trigger, sessionGeneration, comparisonSummary: null };
}

/**
 * Stale-session discard: ha a keresés indítása óta bumpolódott a navigation
 * session generációja (reroute/resume/stop/persisted-restore/másik candidate
 * elfogadása), az eredmény NÉMÁN elvetődik — az offer state VÁLTOZATLAN marad.
 */
export function presentLiveAlternativeOffer(
  offer: LiveAlternativeOffer,
  candidateJourney: Journey,
  comparisonSummary: LiveAlternativeComparisonSummary,
  currentSessionGeneration: number
): LiveAlternativeOffer {
  if (offer.status !== "SEARCHING" || offer.sessionGeneration !== currentSessionGeneration) {
    return offer;
  }
  return { ...offer, status: "OFFERED", candidateJourney, comparisonSummary };
}

/** A keresés nem talált érdemi javulást (vagy hibázott) — visszaáll NONE-ra, stale-session esetén no-op. */
export function discardLiveAlternativeSearch(
  offer: LiveAlternativeOffer,
  currentSessionGeneration: number
): LiveAlternativeOffer {
  if (offer.status !== "SEARCHING" || offer.sessionGeneration !== currentSessionGeneration) {
    return offer;
  }
  return createInitialLiveAlternativeOffer();
}

/** "Maradok ezen" — displayedJourney/navigáció VÁLTOZATLAN, a hívó felelőssége a guard.declinedEvents frissítése. */
export function declineLiveAlternativeOffer(offer: LiveAlternativeOffer): LiveAlternativeOffer {
  if (offer.status !== "OFFERED") return offer;
  return { ...offer, status: "DECLINED" };
}

/**
 * Explicit elfogadás — KIZÁRÓLAG OFFERED állapotból hívható. A visszaadott
 * journey-t a hívó helyezi displayedJourney-be, bumpolja a navigation
 * session generációt, és NEM indít új navigationMode-ot (a navigáció már
 * aktív, csak a journey cserélődik).
 */
export function acceptLiveAlternativeOffer(
  offer: LiveAlternativeOffer
): { nextOffer: LiveAlternativeOffer; acceptedJourney: Journey } | null {
  if (offer.status !== "OFFERED" || !offer.candidateJourney) return null;
  return {
    nextOffer: { ...offer, status: "ACCEPTED" },
    acceptedJourney: offer.candidateJourney,
  };
}

export function resetLiveAlternativeOffer(): LiveAlternativeOffer {
  return createInitialLiveAlternativeOffer();
}

// re-export a JourneyLeg típust, hogy a hívó ne kelljen közvetlenül a
// types.ts-ből importálnia csak a szomszédos leg-metrikák miatt.
export type { JourneyLeg };
