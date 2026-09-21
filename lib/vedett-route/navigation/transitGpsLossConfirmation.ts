// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — pure döntési
// logika a "vonaton/buszon/villamoson/metrón utazva elveszett GPS után egy
// pontatlan visszatérő fix NE indítson automatikus reroute-ot" hibára.
//
// ROOT CAUSE: gpsFixGate.ts isGpsReacquiring() már blokkolja az automatikus
// reroute-ot a LOST utáni "bemelegítési" ablakban (GPS_REACQUISITION_STABLE_
// FIXES fixig), DE ez az ablak jellemzően RÖVIDEBB, mint amíg egy alagútból/
// rossz lefedettségű területről kilépő fix ténylegesen stabilizálódik — az
// ablak lejárta UTÁN egy továbbra is pontatlan (de "GOOD" minőségűnek
// minősülő) fix simán OFF_ROUTE-ot generálhat, és a MEGLÉVŐ rerouteGuard.ts
// ekkor automatikusan újratervezne. EZ A MODUL NEM egy második GPS-állapot-
// gép: a hívó (VedettUtvonalSearchForm.tsx) a MÁR MEGLÉVŐ gpsFixGate.ts
// classifyGpsQuality() kimenetét és a MÁR MEGLÉVŐ legTransition.ts BOARDED/
// BOARDED_UNCERTAIN_GEOMETRY fázisát adja át — ez a modul csak egy pending
// megerősítés-jelzőt tart fent eddig a KÉT bemenetből, plusz a rerouteGuard.ts
// döntésébe illesztendő FÜGGETLEN blokkoló feltételt biztosítja (ugyanaz a
// minta, mint transitGeometryUncertain/gpsReacquiring/foregroundRecoveryActive).

export interface TransitGpsLossConfirmationState {
  /** Igaz, amíg egy transit-legen történt GPS LOST utáni, egyébként
   * reroute-ot kiváltó deviation-re a felhasználó MÉG NEM válaszolt. */
  pending: boolean;
  /** A LOST idején aktív (BOARDED/BOARDED_UNCERTAIN_GEOMETRY) transit leg
   * NORMALIZÁLT transitMode-ja (JourneyLeg.transitMode) — ez dönti el a
   * megjelenítendő magyar kérdés szövegét. */
  transitMode: string | null;
}

export function createInitialTransitGpsLossConfirmationState(): TransitGpsLossConfirmationState {
  return { pending: false, transitMode: null };
}

/**
 * A hívó ezt hívja, amikor `classifyGpsQuality(...) === "LOST"` ÉS az
 * aktuális aktív leg egy BOARDED/BOARDED_UNCERTAIN_GEOMETRY TRANSIT leg
 * (transitMode nem null). Ha MÁR van függőben lévő, meg nem válaszolt
 * kérdés, ÚJABB LOST esemény nem írja felül/duplikálja azt (első bizonyíték
 * marad mérvadó, amíg a felhasználó nem válaszol).
 */
export function markTransitGpsLoss(
  state: TransitGpsLossConfirmationState,
  transitMode: string | null,
): TransitGpsLossConfirmationState {
  if (state.pending) return state;
  return { pending: true, transitMode };
}

/**
 * A függőben lévő kérdés lezárása — IGEN válasz ("még mindig a járművön
 * vagyok"), NEM válasz ("már nem"), VAGY a kérdés más okból (normál GPS-
 * visszatérés off-route bizonyíték nélkül, navigációs session váltás)
 * elavulttá válása esetén EGYARÁNT ezt hívja a hívó — a három eset a
 * hívó oldalán tér el (IGEN: OFF_ROUTE-bizonyíték törlése + NINCS reroute;
 * NEM: pontosan egy reroute engedélyezése; egyéb: csendben eltűnik).
 */
export function resolveTransitGpsLossConfirmation(): TransitGpsLossConfirmationState {
  return createInitialTransitGpsLossConfirmationState();
}

/**
 * Igaz, ha egy függőben lévő kérdést a felhasználói válasz NÉLKÜL,
 * csendben el kell tüntetni: a GPS időközben stabilizálódott
 * (usable ÉS nem reacquiring), ÉS a route-progress motor szerint MÁR NEM
 * áll fenn megerősített OFF_ROUTE — azaz "a GPS normálisan tért vissza",
 * nincs szükség kérdésre (spec 1. pont utolsó bekezdése).
 */
export function shouldAutoClearTransitGpsLossConfirmation(
  pending: boolean,
  gpsFixUsable: boolean,
  gpsReacquiring: boolean,
  offRouteStatus: string,
): boolean {
  if (!pending) return false;
  if (!gpsFixUsable || gpsReacquiring) return false;
  return offRouteStatus !== "OFF_ROUTE";
}

const TRANSIT_GPS_LOSS_QUESTION_BY_MODE: Readonly<Record<string, string>> = {
  RAIL: "Még mindig a vonaton vagy?",
  REGIONAL_RAIL: "Még mindig a vonaton vagy?",
  BUS: "Még mindig a buszon vagy?",
  TRAM: "Még mindig a villamoson vagy?",
  SUBWAY: "Még mindig a metrón vagy?",
};

const TRANSIT_GPS_LOSS_QUESTION_DEFAULT = "Még mindig a járművön vagy?";

/** A transitMode-hoz tartozó magyar megerősítő kérdés — ismeretlen/hiányzó
 * transitMode esetén egy semleges, jármű-független alapértelmezés. */
export function transitGpsLossQuestionText(transitMode: string | null): string {
  if (!transitMode) return TRANSIT_GPS_LOSS_QUESTION_DEFAULT;
  return TRANSIT_GPS_LOSS_QUESTION_BY_MODE[transitMode] ?? TRANSIT_GPS_LOSS_QUESTION_DEFAULT;
}
