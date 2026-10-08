// LIVE ALTERNATIVE AJÁNLAT-RÉSZLETEK (2026-10-08) — tiszta (React-mentes)
// megjelenítési modell az ajánlat- és előnézet-kártyához. KIZÁRÓLAG meglévő,
// valós adatokból dolgozik (a jelölt útvonal saját időadatai, a Journey Monitor
// trigger típusa, a jelenlegi útvonal realtime-korrigált hátralévő ETA-ja);
// semmilyen döntést nem hoz, útvonalat nem választ, állapotot nem módosít.
// Hiányzó / érvénytelen adatnál az adott sor null — sosem kitalált érték.

import type { Journey } from "../../lib/vedett-route/types.ts";
import type { LiveAlternativeTriggerType } from "../../lib/vedett-route/navigation/liveAlternative.ts";
import { computeRemainingJourneyMetrics } from "../../lib/vedett-route/navigation/liveAlternative.ts";
import { estimateRemainingEta, evaluateMissedConnection } from "../../lib/vedett-route/navigation/journeyMonitor.ts";

/** A felajánlás oka a trigger típusából — csak megbízható, egyértelmű esetekben. */
const REASON_LABEL: Partial<Record<LiveAlternativeTriggerType, string>> = {
  CANCELLED: "Ok: járatkimaradás",
  SIGNIFICANT_REALTIME_DEGRADATION: "Ok: jelentős késés",
  MISSED_CONNECTION: "Ok: elveszett csatlakozás",
  PROVEN_RELEVANT_DISRUPTION: "Ok: forgalmi fennakadás az útvonalon",
};

export const LONGER_WALKING_NOTICE = "Ez az útvonal hosszabb gyaloglással jár.";

export interface LiveAlternativeOfferDetails {
  reasonLabel: string | null;
  /** "HH:MM" — a jelölt SAJÁT érkezési idejéből, a meglévő hu-HU formázással. */
  arrivalLabel: string | null;
  durationMinutes: number | null;
  transfers: number | null;
  walkingMinutes: number | null;
  /** + = a jelölt korábban érkezik; null, ha nem számítható megbízhatóan. */
  arrivalDifferenceMinutes: number | null;
  arrivalDifferenceLabel: string | null;
  /** A jelölt gyaloglása mínusz az eredeti útvonal hátralévő gyaloglása (perc); null, ha nem számítható. */
  extraWalkingMinutes: number | null;
  showLongerWalkingNotice: boolean;
}

const finiteNonNegative = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const parseMs = (iso: string | undefined | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** A meglévő időformázás (hu-HU, óra:perc, az eszköz időzónája) — ugyanaz, mint a kártyán korábban. */
export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function walkingMinutesOf(journey: Journey, fromIndex: number): number | null {
  if (!journey || !Array.isArray(journey.legs)) return null;
  const legs = journey.legs.slice(Math.max(0, fromIndex));
  const walkLegs = legs.filter((leg) => leg.mode === "WALK");
  if (walkLegs.some((leg) => finiteNonNegative(leg.durationMinutes) === null)) return null;
  return computeRemainingJourneyMetrics(journey, fromIndex).remainingWalkingMinutes;
}

export function buildLiveAlternativeOfferDetails(input: {
  triggerType: LiveAlternativeTriggerType | null | undefined;
  candidate: Journey;
  current: Journey;
  currentActiveLegIndex: number | null;
  nowMs: number;
}): LiveAlternativeOfferDetails {
  const { triggerType, candidate, current, currentActiveLegIndex, nowMs } = input;
  const reasonLabel = triggerType ? REASON_LABEL[triggerType] ?? null : null;

  const arrivalMs = parseMs(candidate.arrivalTime);
  const arrivalLabel = arrivalMs !== null ? formatClockTime(arrivalMs) : null;

  const durationRaw = finiteNonNegative(candidate.totalDurationMinutes);
  const transfersRaw = finiteNonNegative(candidate.transfers);
  const candidateWalking = walkingMinutesOf(candidate, 0);

  // Időkülönbség az eredeti útvonalhoz: CSAK ha az eredeti hátralévő ETA
  // értelmes (nincs kimaradás / elveszett csatlakozás) és a jelölt érkezése ismert.
  let arrivalDifferenceMinutes: number | null = null;
  const originalBroken =
    triggerType === "CANCELLED" ||
    triggerType === "MISSED_CONNECTION" ||
    evaluateMissedConnection(current, currentActiveLegIndex).status === "MISSED";
  if (!originalBroken && arrivalMs !== null) {
    const currentEta = estimateRemainingEta(current, currentActiveLegIndex, nowMs);
    if (currentEta) arrivalDifferenceMinutes = Math.round((currentEta.arrivalMs - arrivalMs) / 60_000);
  }
  let arrivalDifferenceLabel: string | null = null;
  if (arrivalDifferenceMinutes !== null) {
    arrivalDifferenceLabel =
      arrivalDifferenceMinutes >= 1
        ? `Kb. ${arrivalDifferenceMinutes} perccel korábban érkezel, mint az eredeti útvonalon.`
        : arrivalDifferenceMinutes <= -1
          ? `Kb. ${-arrivalDifferenceMinutes} perccel később érkezel, mint az eredeti útvonalon.`
          : "Nagyjából ugyanakkor érkezel, mint az eredeti útvonalon.";
  }

  // Gyaloglási többlet: a jelölt teljes gyaloglása vs. az eredeti HÁTRALÉVŐ
  // gyaloglása — ugyanaz a mérőszám, mint a meglévő strukturális összevetésben.
  const currentWalking = walkingMinutesOf(current, currentActiveLegIndex ?? 0);
  const extraWalkingMinutes =
    candidateWalking !== null && currentWalking !== null ? Math.round(candidateWalking - currentWalking) : null;

  return {
    reasonLabel,
    arrivalLabel,
    durationMinutes: durationRaw !== null ? Math.round(durationRaw) : null,
    transfers: transfersRaw !== null ? Math.round(transfersRaw) : null,
    walkingMinutes: candidateWalking !== null ? Math.round(candidateWalking) : null,
    arrivalDifferenceMinutes,
    arrivalDifferenceLabel,
    extraWalkingMinutes,
    showLongerWalkingNotice: extraWalkingMinutes !== null && extraWalkingMinutes >= 1,
  };
}
