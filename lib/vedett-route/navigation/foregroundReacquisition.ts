// SPRINT 8.1 (VÉDETT ÚTVONAL FOREGROUND REACQUISITION, 2026-09-18) — pure,
// kis explicit fázis-modell a MEGLÉVŐ gpsFixGate.ts TETEJÉN (nem
// duplikálja a freshness/quality/reacquisition-hiszterézis logikát — csak
// annak KIMENETEIT (usable/reacquiring) nevezi el egy hívó-oldali,
// jól-tesztelhető, jól-naplózható fázisra, plusz egy monoton `generation`
// számlálóval, hogy bármelyik hívó (elsősorban VedettUtvonalSearchForm.tsx)
// biztonságosan felismerhesse, ha egy KORÁBBI foreground-recovery ciklushoz
// tartozó, később lezáruló munka mára már elavult (spec 3. pont: "ha
// recovery közben leáll a navigáció / másik journey indul / új route kerül
// kiválasztásra / újabb hidden->visible recovery indul, az ELŐZŐ async
// eredmény nem írhatja felül az új állapotot").
//
// EZ A MODUL NEM ISMERI a document.visibilityState-et, a React state-et,
// vagy a navigációs session egyéb részleteit — a hívó dönt arról, MIKOR
// induljon egy recovery (spec 2. pont: csak aktív navigáció + van
// megjelenített journey + valódi hidden->visible átmenet esetén), ez a
// modul csak a fázis-átmenetek TISZTA logikáját adja.

/**
 * IDLE               — nincs folyamatban foreground-reacquisition.
 * WAITING_FOR_FRESH_GPS — a dokumentum nemrég vált láthatóvá, de a
 *                      gpsFixGate.ts szerint MÉG NEM érkezett a
 *                      visszatérés UTÁNI, usable fix (lásd
 *                      evaluateGpsFixUsability()/markVisibilityReturned()).
 * REACQUIRING        — az első usable fix megérkezett, de a gpsFixGate.ts
 *                      saját GPS_REACQUISITION_STABLE_FIXES hiszterézise
 *                      (isGpsReacquiring()) szerint még nem gyűlt össze
 *                      elég egymást követő GOOD fix.
 * STABLE             — a gpsFixGate.ts szerint a pozíció usable ÉS nem
 *                      reacquiring — a recovery ciklus sikeresen befejeződött.
 */
export type ForegroundRecoveryPhase = "IDLE" | "WAITING_FOR_FRESH_GPS" | "REACQUIRING" | "STABLE";

export interface ForegroundRecoveryState {
  phase: ForegroundRecoveryPhase;
  generation: number;
}

export function createInitialForegroundRecoveryState(): ForegroundRecoveryState {
  return { phase: "IDLE", generation: 0 };
}

/**
 * A hívó ezt hívja a document hidden->visible átmenetén — DE KIZÁRÓLAG
 * azután, hogy már ellenőrizte a spec 2. pontjának feltételeit (navigáció
 * aktív, van aktuális journey) — ez a modul ezt a döntést NEM ismétli meg.
 *
 * MINDEN hívás ÚJ generation-t nyit, FÜGGETLENÜL az előző fázistól — egy
 * második hidden->visible ciklus (akár egy még folyamatban lévő korábbi
 * recovery alatt) mindig érvényteleníti az előző generation-höz kötött,
 * később lezáruló munkát (spec 3. pont, teszt L).
 */
export function startForegroundRecovery(state: ForegroundRecoveryState): ForegroundRecoveryState {
  return { phase: "WAITING_FOR_FRESH_GPS", generation: state.generation + 1 };
}

/**
 * A hívó a MEGLÉVŐ gpsFixGate.ts `evaluateGpsFixUsability()` kimenetével
 * (usable/reacquiring) frissíti a fázist minden GPS-tick-en/periodikus
 * újraértékelésen. IDLE/STABLE állapotban no-op (nincs folyamatban
 * recovery, amit frissíteni kellene — egy új ciklust `startForegroundRecovery()`
 * nyit). Egy usable=false tick (STALE/INVALID/pending-reacquisition fix)
 * SOHA nem regresszálja a fázist visszafelé — csak előre halad, amíg
 * genuinely jobb bizonyíték nem érkezik.
 */
export function updateForegroundRecoveryPhase(
  state: ForegroundRecoveryState,
  gps: { usable: boolean; reacquiring: boolean },
): ForegroundRecoveryState {
  if (state.phase === "IDLE" || state.phase === "STABLE") return state;
  if (gps.usable && !gps.reacquiring) return { ...state, phase: "STABLE" };
  if (gps.usable && gps.reacquiring) return { ...state, phase: "REACQUIRING" };
  return state;
}

/**
 * Navigáció leállítása / kártya bezárása navigáció közben / új journey
 * (reroute, manuális újratervezés) kiválasztása / bármilyen, a MEGLÉVŐ
 * navigációs-session-számlálót (rerouteSessionRef) bumpoló esemény esetén
 * a hívó ezt hívja: a fázist IDLE-re állítja ÉS bumpolja a generation-t,
 * hogy egy a RÉGI generation alatt elkezdett, később lezáruló munka
 * biztonságosan felismerhető legyen elavultként (spec 3. pont, teszt E).
 * IDLE állapotból hívva no-op (nincs mit érvényteleníteni).
 */
export function cancelForegroundRecovery(state: ForegroundRecoveryState): ForegroundRecoveryState {
  if (state.phase === "IDLE") return state;
  return { phase: "IDLE", generation: state.generation + 1 };
}

/** Igaz, amíg egy recovery ciklus folyamatban van (WAITING_FOR_FRESH_GPS vagy REACQUIRING). */
export function isForegroundRecoveryActive(phase: ForegroundRecoveryPhase): boolean {
  return phase === "WAITING_FOR_FRESH_GPS" || phase === "REACQUIRING";
}

/**
 * A hívó ezzel ellenőrzi, hogy egy korábban elmentett generation-snapshot
 * MÉG a jelenlegi recovery-ciklushoz tartozik-e, mielőtt egy késői
 * eredményt (pl. egy foreground-eseményhez kötött lépés befejezését)
 * alkalmazná — UGYANAZ az elv, mint a MEGLÉVŐ rerouteSessionRef/sessionId
 * staleness-guardok (rerouteGuard.ts hívási helye, useTransitRealtimeRefresh.ts).
 */
export function isForegroundRecoveryGenerationCurrent(state: ForegroundRecoveryState, generation: number): boolean {
  return state.generation === generation;
}

export type DocumentVisibilityState = "visible" | "hidden";

/**
 * COMMIT ELŐTTI CÉLZOTT KORREKCIÓ (2026-09-18) — pure, önállóan tesztelhető
 * predikátum arra, hogy egy `visibilitychange` esemény VALÓDI hidden->visible
 * átmenetet képvisel-e, nem csak azt, hogy a JELENLEGI állapot "visible".
 *
 * Miért kellett ez: a böngésző visibilitychange eseménye a specifikáció
 * szerint kizárólag TÉNYLEGES állapotváltozáskor tüzel, tehát egy valódi
 * DOM-eseménynél a "current === visible" check magában is elegendő lenne —
 * DE a hívó (VedettUtvonalSearchForm.tsx) nem bízhat KIZÁRÓLAG ebben az
 * implicit böngésző-garanciában, mert (a) ez determinisztikusan nem
 * bizonyítható/tesztelhető pure helperek nélkül, és (b) egy esetleges
 * duplikált listener-regisztráció vagy spurious/ismételt hívás esetén a
 * korábbi kód új foreground-recovery generation-t indított volna, akkor is,
 * ha nem történt VALÓDI hidden->visible váltás. Ez a predikátum a hívó által
 * fenntartott "előző állapot" reffel együtt EXPLICIT, determinisztikus
 * bizonyítékot ad — nem timeout, nem heurisztika.
 */
export function isGenuineForegroundTransition(
  previous: DocumentVisibilityState,
  current: DocumentVisibilityState,
): boolean {
  return previous === "hidden" && current === "visible";
}
