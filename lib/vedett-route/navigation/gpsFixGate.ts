// NAVIGATION FOUNDATION sprint (2026-09-17) — PURE GPS-fix-frissesség
// döntési logika, UGYANAZT a mintát követi, mint rerouteGuard.ts /
// realtimeRefreshGuard.ts (pure decision + explicit mutable-state-transition
// helper függvények, "now" mindig explicit paraméter, SOHA Date.now() a
// tiszta logika belsejében).
//
// CÉL (spec: "GPS FIX FRESHNESS" + "FOREGROUND REACQUISITION FOUNDATION"):
// 1) egy GPS fix `timestampMs`-ét FRESH/STALE/INVALID-ra klasszifikálja;
// 2) egy STALE/INVALID fix SOHA nem okozhat leg-transitiont, boarding
//    megerősítést, route-progress előrehaladást, vagy adaptív reroute/
//    alternative döntést — ezt a hívó oldal úgy éri el, hogy egy nem
//    "usable" fixnél NULL pozíciót ad tovább a lentebbi hookoknak (lásd
//    VedettUtvonalSearchForm.tsx wiring), NEM ezen a modulon belül;
// 3) háttérből (hidden) előtérbe (visible) váltás után a KORÁBBAN tárolt
//    fix NEM válik automatikusan "frissé" — meg kell várni a KÖVETKEZŐ,
//    genuinely friss fixet, mielőtt a route progress / leg transition /
//    boarding / reroute-kiértékelés újra folytatódhat.
//
// EZ A MODUL NEM MÓDOSÍTJA routeProgress.ts-t vagy legTransition.ts-t —
// azok már ma is helyesen kezelik a `null` pozíciót (early return /
// üres állapot), így elég a POZÍCIÓ BEMENETET `null`-ra kapcsolni a
// hívó oldalon (VedettUtvonalSearchForm.tsx), amikor egy fix nem usable.

/** Egyetlen dokumentált küszöbérték-konstans — NINCS szórt magic number. */
export const GPS_FIX_MAX_AGE_MS = 20_000;

/**
 * Mennyi "jövőbeli" időbélyeget tolerálunk óra-eltérés/kerekítés miatt,
 * mielőtt INVALID-nak minősítjük a fixet. Konzervatív, kis érték —
 * NEM ugyanaz a szemantika, mint a staleness (lejárt) küszöb.
 */
export const GPS_FIX_FUTURE_TOLERANCE_MS = 5_000;

export type GpsFixFreshness = "FRESH" | "STALE" | "INVALID";

/**
 * Egy GPS fix `timestampMs`-ének klasszifikációja. Tiszta függvény —
 * `nowMs` MINDIG explicit paraméter (determinisztikus tesztelhetőség,
 * spec 1. pont: "now mindig explicit input, sose implicit Date.now()").
 *
 * INVALID: hiányzó/nem véges timestamp, VAGY a tolerancián túl
 *          jövőbeli (óra-hiba elleni védekezés).
 * STALE:   a fix régebbi, mint maxAgeMs.
 * FRESH:   egyébként.
 */
export function classifyGpsFixFreshness(
  timestampMs: number | null | undefined,
  nowMs: number,
  maxAgeMs: number = GPS_FIX_MAX_AGE_MS
): GpsFixFreshness {
  if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) return "INVALID";
  if (timestampMs - nowMs > GPS_FIX_FUTURE_TOLERANCE_MS) return "INVALID";
  if (nowMs - timestampMs > Math.max(0, maxAgeMs)) return "STALE";
  return "FRESH";
}

/**
 * A "foreground reacquisition" állapot. `pendingReacquisitionSinceMs`
 * nem-null, amikor a dokumentum nemrég vált láthatóvá, és MÉG NEM
 * érkezett egy, ehhez az időponthoz képest genuinely friss fix.
 */
export interface GpsFixGateState {
  pendingReacquisitionSinceMs: number | null;
}

export function createInitialGpsFixGateState(): GpsFixGateState {
  return { pendingReacquisitionSinceMs: null };
}

/**
 * A hívó (VedettUtvonalSearchForm.tsx) ezt hívja a `visibilitychange`
 * eseményen, amikor a dokumentum hidden -> visible-re vált. Ez NEM
 * dönti el önmagában, hogy a KÖVETKEZŐ fix usable lesz-e — csak
 * megjelöli, hogy egy reacquisition van folyamatban, amit
 * `evaluateGpsFixUsability` majd a fix saját timestamp-jével összevet.
 */
export function markVisibilityReturned(state: GpsFixGateState, nowMs: number): GpsFixGateState {
  return { pendingReacquisitionSinceMs: nowMs };
}

export interface GpsFixUsabilityResult {
  usable: boolean;
  nextState: GpsFixGateState;
  freshness: GpsFixFreshness;
}

// METRO GPS LOSS + MAP CAMERA SAFETY SPRINT (2026-09-17) — "GPS QUALITY
// STATE". NEM egy második freshness-rendszer: a MÁR meglévő
// GpsFixUsabilityResult (freshness + usable) mezőit osztályozza egy, a
// hívó oldal (kamera/marker döntések) számára kényelmesebb, durva
// állapotra. Nincs új küszöbérték, nincs accuracy-alapú heurisztika.
//
//   GOOD     — friss ÉS felhasználható fix (usable === true).
//   DEGRADED — a fix technikailag FRESH, de MÉG NEM usable (pl.
//              foreground reacquisition alatt a visszatérés ELŐTTI utolsó
//              ismert fix) — bizonytalan, de nem "elveszett".
//   LOST     — a fix STALE vagy INVALID (nincs megbízható, aktuális adat).
export type GpsQuality = "GOOD" | "DEGRADED" | "LOST";

export function classifyGpsQuality(result: Pick<GpsFixUsabilityResult, "usable" | "freshness">): GpsQuality {
  if (result.usable) return "GOOD";
  return result.freshness === "FRESH" ? "DEGRADED" : "LOST";
}

/**
 * Egy adott GPS fix (annak `timestampMs`-e) FELHASZNÁLHATÓ-e route
 * progress / leg transition / boarding / reroute-kiértékeléshez.
 *
 * `usable` akkor és csak akkor true, ha:
 *   (a) a fix FRESH, ÉS
 *   (b) ha éppen van pending reacquisition (visibility épp visszatért),
 *       akkor a fix timestamp-je >= a reacquisition pillanata — azaz a
 *       fix TÉNYLEG a visszatérés UTÁN érkezett, nem a korábban (még
 *       háttérben) tárolt régi fix.
 *
 * A pending reacquisition flag a `nextState`-ben törlődik, amint egy
 * usable fix megérkezik (innentől a normál FRESH/STALE logika elég).
 */
export function evaluateGpsFixUsability(
  state: GpsFixGateState,
  timestampMs: number | null | undefined,
  nowMs: number,
  maxAgeMs: number = GPS_FIX_MAX_AGE_MS
): GpsFixUsabilityResult {
  const freshness = classifyGpsFixFreshness(timestampMs, nowMs, maxAgeMs);

  if (freshness !== "FRESH") {
    // STALE/INVALID fix: sose törli a pending reacquisition flaget —
    // továbbra is várunk egy genuinely friss fixre.
    return { usable: false, nextState: state, freshness };
  }

  if (state.pendingReacquisitionSinceMs !== null) {
    const fixTimestamp = timestampMs as number;
    if (fixTimestamp < state.pendingReacquisitionSinceMs) {
      // Friss (nem lejárt) fix, de a visibility-visszatérés ELŐTTRŐL
      // származik (pl. háttérben az utolsó ismert érték) — még nem
      // számít "a visszatérés utáni első friss fixnek".
      return { usable: false, nextState: state, freshness };
    }
    // Az első genuinely friss fix a visszatérés óta — reacquisition kész.
    return { usable: true, nextState: { pendingReacquisitionSinceMs: null }, freshness };
  }

  return { usable: true, nextState: state, freshness };
}
