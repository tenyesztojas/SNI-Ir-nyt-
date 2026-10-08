// NAVIGÁCIÓS ETA — MENETRENDI KORLÁT (2026-10-08).
//
// Probléma: a GPS-alapú becslés (routeProgress.ts: fix időpont + teljes
// időtartam × hátralévő hányad) úgy számol, mintha az útiterv MOST indulna —
// közösségi közlekedésnél figyelmen kívül hagyja a következő járat indulásáig
// tartó várakozást, ezért teljesíthetetlenül korai érkezést mutathat
// (pl. 12:35-kor 53 perces, 12:53-kor induló útiterv → 13:28 a valós 13:46 helyett).
//
// Megoldás: ha a hátralévő részben van TRANSIT láb, a meglévő
// estimateRemainingEta (journeyMonitor.ts) adja a menetrendi/realtime alsó
// korlátot (az utolsó hátralévő járat realtime-korrigált érkezése + az utána
// következő gyalogos szakaszok; a már teljesített lábakat nem számolja), és a
// megjelenített ETA = max(GPS-becslés, menetrendi korlát). Tisztán gyalogos
// hátralévő útnál a GPS-becslés VÁLTOZATLAN. Bármilyen hiányzó/érvénytelen
// adatnál a korábbi viselkedés a fallback.

import type { Journey } from "../types.ts";
import { estimateRemainingEta } from "./journeyMonitor.ts";

export type NavigationEtaBasis = "GPS_PROGRESS" | "TRANSIT_SCHEDULE" | "JOURNEY_ARRIVAL" | "NONE";

export interface NavigationEtaInput {
  journey: Journey;
  activeLegIndex: number | null;
  /** routeProgress.estimatedArrivalTimeMs (GPS-alapú), ha van. */
  gpsEstimatedArrivalMs: number | null;
  /** routeProgress.remainingDurationSeconds (GPS-alapú), ha van. */
  gpsRemainingDurationSeconds: number | null;
  nowMs: number;
}

export interface NavigationEta {
  arrivalMs: number | null;
  /** Az érkezéssel összhangban lévő hátralévő perc (felfelé kerekítve), ha számítható. */
  remainingMinutes: number | null;
  basis: NavigationEtaBasis;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function hasRemainingTransit(journey: Journey, activeLegIndex: number | null): boolean {
  if (!journey || !Array.isArray(journey.legs)) return false;
  return journey.legs.slice(Math.max(0, activeLegIndex ?? 0)).some((leg) => leg.mode === "TRANSIT");
}

export function computeNavigationEta(input: NavigationEtaInput): NavigationEta {
  const { journey, activeLegIndex, gpsEstimatedArrivalMs, gpsRemainingDurationSeconds, nowMs } = input;
  const gpsArrival = finite(gpsEstimatedArrivalMs) ? gpsEstimatedArrivalMs : null;
  const gpsRemainingMinutes = finite(gpsRemainingDurationSeconds)
    ? Math.max(0, Math.ceil(gpsRemainingDurationSeconds / 60))
    : null;

  if (finite(nowMs) && hasRemainingTransit(journey, activeLegIndex)) {
    const schedule = estimateRemainingEta(journey, activeLegIndex, nowMs);
    if (schedule && (gpsArrival === null || schedule.arrivalMs > gpsArrival)) {
      return {
        arrivalMs: schedule.arrivalMs,
        remainingMinutes: Math.max(0, Math.ceil((schedule.arrivalMs - nowMs) / 60_000)),
        basis: "TRANSIT_SCHEDULE",
      };
    }
  }

  // Változatlan, korábbi viselkedés: GPS-becslés, hiányában az útiterv érkezése.
  if (gpsArrival !== null) return { arrivalMs: gpsArrival, remainingMinutes: gpsRemainingMinutes, basis: "GPS_PROGRESS" };
  const journeyArrival = journey?.arrivalTime ? Date.parse(journey.arrivalTime) : Number.NaN;
  if (Number.isFinite(journeyArrival)) return { arrivalMs: journeyArrival, remainingMinutes: gpsRemainingMinutes, basis: "JOURNEY_ARRIVAL" };
  return { arrivalMs: null, remainingMinutes: gpsRemainingMinutes, basis: "NONE" };
}
