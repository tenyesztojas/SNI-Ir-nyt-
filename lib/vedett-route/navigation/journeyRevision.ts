// STALE ALTERNATIVE INVALIDATION (2026-10-08) — célzott útvonal-revízió.
//
// Probléma: a sikeres automatikus OFF_ROUTE újratervezés lecseréli az aktív
// útvonalat, de a navigációs session generációját SZÁNDÉKOSAN nem lépteti
// (az a foreground/restore helyreállítást és a GPS-vesztés megerősítést is
// nullázná). Emiatt egy, a RÉGI útvonalra számolt Live Alternative ajánlat
// elfogadható maradt, és egy korábban indult keresés eredménye később is
// ajánlattá válhatott.
//
// Megoldás: külön, csak az útvonalcserét jelölő revízió. Minden Live
// Alternative keresés és ajánlat a SAJÁT indulási revízióját hordozza; késve
// érkező eredmény és elfogadás csak akkor érvényes, ha ez megegyezik az
// aktuálissal. React state-től független (ref + tiszta ellenőrzés).

import { createInitialLiveAlternativeOffer, type LiveAlternativeOffer } from "./liveAlternative.ts";
import { createInitialRealtimeMonitorDebounceState, type RealtimeMonitorDebounceState } from "./journeyMonitor.ts";

export const INITIAL_JOURNEY_REVISION = 0;

/** A revíziót léptető útvonalcsere után a következő revízió. */
export function nextJourneyRevision(current: number): number {
  return current + 1;
}

/** Egy adott revízión indult keresés eredménye / ajánlata még az aktuális útvonalhoz tartozik-e. */
export function isJourneyRevisionCurrent(startedAtRevision: number | null, currentRevision: number): boolean {
  return startedAtRevision !== null && startedAtRevision === currentRevision;
}

/**
 * A sikeres automatikus útvonalcsere utáni Live Alternative / Journey Monitor
 * állapot: az ajánlat alapállapotba, az előnézet zárva, a szimuláció és a
 * pending debounce esemény törölve. Az ÚJ útvonalat nem érinti.
 */
export function resetAlternativeStateAfterJourneyReplacement(): {
  offer: LiveAlternativeOffer;
  previewOpen: false;
  debounce: RealtimeMonitorDebounceState;
  simulation: null;
} {
  return {
    offer: createInitialLiveAlternativeOffer(),
    previewOpen: false,
    debounce: createInitialRealtimeMonitorDebounceState(),
    simulation: null,
  };
}
