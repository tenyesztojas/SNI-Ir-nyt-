// NAVIGATION RESUME (2026-10-09) — alkalmazás-újraindítás után a mentett
// navigáció (navigationSessionPersistence.ts) folytathatóságának PURE
// értékelése. NEM új navigációs állapotgép: csak azt dönti el, hogy a
// "Folytatod a korábbi navigációt?" kérdésnél a folytatás felajánlható-e,
// vagy újratervezést kell javasolni. A tényleges visszaállítás a MEGLÉVŐ
// restorePersistedNavigation() útján (sanitizeRestoredJourney + restore-
// recovery GPS-stabilizálás + reroute-guard reset) történik, és KIZÁRÓLAG a
// felhasználó kifejezett jóváhagyása után.
//
// Időbeli érvényesség (a 6 órás TTL MELLETT, azt nem váltja ki):
// - ha az útiterv tervezett érkezése + JOURNEY_FINISHED_GRACE_MS elmúlt
//   -> az út véget ért / elavult, újratervezés javasolt;
// - ha van közösségi közlekedési szakasz, és az UTOLSÓ járat tervezett
//   érkezése + TRANSIT_SCHEDULE_GRACE_MS is elmúlt -> a menetrend lejárt,
//   lejárt járatokkal nem indítunk navigációt, újratervezés javasolt;
// - ha valamelyik járat indulása már elmúlt, de az út még tart -> a
//   folytatás felajánlható, de figyelmeztetéssel (lemaradhatott járatról).
// Hiányzó/értelmezhetetlen időpont: fail-safe az adott feltételre nézve
// (nem tiltunk ki emiatt, de nem is állítunk lejárt menetrendet).

import type { Journey, JourneyLeg } from "../types";
import type { PersistedNavigationSession } from "./navigationSessionPersistence.ts";

export const JOURNEY_FINISHED_GRACE_MS = 30 * 60 * 1000;
export const TRANSIT_SCHEDULE_GRACE_MS = 5 * 60 * 1000;
export const TRANSIT_DEPARTED_TOLERANCE_MS = 60 * 1000;

export type NavigationResumeReplanReason = "JOURNEY_FINISHED" | "TRANSIT_SCHEDULE_PASSED" | "MISSING_JOURNEY_IDENTITY";

export type NavigationResumeAssessment =
  | { status: "RESUMABLE"; transitAlreadyDeparted: boolean }
  | { status: "REPLAN_RECOMMENDED"; reason: NavigationResumeReplanReason };

function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const legDepartureMs = (leg: JourneyLeg) => parseIsoMs(leg.departureTime) ?? parseIsoMs(leg.scheduledDepartureTime);
const legArrivalMs = (leg: JourneyLeg) => parseIsoMs(leg.arrivalTime) ?? parseIsoMs(leg.scheduledArrivalTime);

export function assessJourneyResume(journey: Journey, nowMs: number): NavigationResumeAssessment {
  if (!journey.fingerprint || journey.legs.length === 0) {
    return { status: "REPLAN_RECOMMENDED", reason: "MISSING_JOURNEY_IDENTITY" };
  }

  const journeyArrival = parseIsoMs(journey.arrivalTime) ?? parseIsoMs(journey.scheduledArrivalTime);
  if (journeyArrival !== null && nowMs > journeyArrival + JOURNEY_FINISHED_GRACE_MS) {
    return { status: "REPLAN_RECOMMENDED", reason: "JOURNEY_FINISHED" };
  }

  const transitLegs = journey.legs.filter((leg) => leg.mode === "TRANSIT");
  if (transitLegs.length === 0) return { status: "RESUMABLE", transitAlreadyDeparted: false };

  const lastTransitArrival = legArrivalMs(transitLegs[transitLegs.length - 1]);
  if (lastTransitArrival !== null && nowMs > lastTransitArrival + TRANSIT_SCHEDULE_GRACE_MS) {
    return { status: "REPLAN_RECOMMENDED", reason: "TRANSIT_SCHEDULE_PASSED" };
  }

  const transitAlreadyDeparted = transitLegs.some((leg) => {
    const dep = legDepartureMs(leg);
    return dep !== null && nowMs > dep + TRANSIT_DEPARTED_TOLERANCE_MS;
  });
  return { status: "RESUMABLE", transitAlreadyDeparted };
}

export function assessNavigationResume(session: PersistedNavigationSession, nowMs: number): NavigationResumeAssessment {
  return assessJourneyResume(session.displayedJourney, nowMs);
}

/** Felhasználói szöveg a kérdés-kártyához (nem állít többet, mint amit tudunk). */
export function describeNavigationResume(assessment: NavigationResumeAssessment): string {
  if (assessment.status === "RESUMABLE") {
    return assessment.transitAlreadyDeparted
      ? "Az útvonal egyik járata már elindult. Ha lemaradtál róla, inkább tervezz új útvonalat."
      : "A navigáció új GPS-pozícióval folytatódik.";
  }
  switch (assessment.reason) {
    case "TRANSIT_SCHEDULE_PASSED":
      return "A korábbi útvonal járatai már elmentek, ezért nem folytatható biztonságosan. Tervezz új útvonalat ugyanoda.";
    case "JOURNEY_FINISHED":
      return "A korábbi útvonal tervezett ideje már lejárt. Tervezz új útvonalat ugyanoda.";
    default:
      return "A korábbi navigáció nem állítható vissza megbízhatóan. Tervezz új útvonalat ugyanoda.";
  }
}
