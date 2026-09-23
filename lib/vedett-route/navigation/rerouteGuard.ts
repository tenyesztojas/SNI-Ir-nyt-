import type { OffRouteStatus } from "./types.ts";

export const DEFAULT_REROUTE_COOLDOWN_MS = 30_000;

export interface RerouteGuardState {
  inFlight: boolean;
  lastAttemptAtMs: number | null;
}

export interface RerouteGuardInput {
  navigationActive: boolean;
  offRouteStatus: OffRouteStatus;
  hasCurrentPosition: boolean;
  hasDestination: boolean;
  nowMs: number;
  cooldownMs?: number;
  /**
   * SAFETY SPRINT (2026-09-17) — igaz, HA a jelenleg aktív (vagy éppen
   * bizonytalan felszállási állapotú) sínhez/vezetett pályához kötött
   * TRANSIT leg SAJÁT geometriája bizonyítottan "weak" (lásd
   * transitGeometryConfidence.ts, pl. a VPS-proven S40 2-pontos eset). Ilyen
   * esetben a geometria-alapú GPS-eltérés ÖNMAGÁBAN sosem elég bizonyíték
   * az automatikus újratervezéshez — a hívó (VedettUtvonalSearchForm) ezt
   * a MEGLÉVŐ OFF_ROUTE-tól FÜGGETLEN, plusz feltételként adja át; a globális
   * 50 m-es küszöb és a WALK reroute-viselkedés VÁLTOZATLAN marad.
   */
  transitGeometryUncertain?: boolean;
  /**
   * TRANSIT STATE CONTINUITY + GPS REACQUISITION SPRINT (2026-09-18) —
   * igaz, HA a gpsFixGate.ts szerint MÉG a LOST utáni "bemelegítési"
   * (REACQUIRING) ablakban vagyunk (lásd isGpsReacquiring()). Az ELSŐ
   * néhány, egy GPS-kiesés UTÁN visszaérkező fix (jump/wifi/cell/tunnel-
   * exit multipath) SOSE lehet önmagában auto-reroute alapja — UGYANAZ az
   * elv, mint a transitGeometryUncertain-nél: FÜGGETLEN, plusz feltétel,
   * a globális OFF_ROUTE-küszöb és a WALK reroute-viselkedés VÁLTOZATLAN.
   */
  gpsReacquiring?: boolean;
  /**
   * SPRINT 8.1 (FOREGROUND REACQUISITION, 2026-09-18) — igaz, HA a hívó
   * saját foregroundReacquisition.ts állapota szerint egy hidden->visible
   * átmenet utáni recovery-ciklus MÉG folyamatban van (lásd
   * isForegroundRecoveryActive()). FÜGGETLEN, plusz feltétel — UGYANAZ az
   * elv, mint transitGeometryUncertain/gpsReacquiring-nél: a globális
   * OFF_ROUTE-küszöb és a WALK reroute-viselkedés VÁLTOZATLAN, ez csak egy
   * ÚJABB blokkoló réteg, explicit, jól naplózható reason-nel, mert a
   * felhasználó éppen most tért vissza a háttérből és a rendszer még nem
   * gyűjtött elég friss bizonyítékot az aktuális helyzetéről.
   */
  foregroundRecoveryActive?: boolean;
  /**
   * SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18) — igaz, HA a
   * jelenlegi navigáció egy ÚJ/mountolt JS-session storage-ból (localStorage)
   * történő restore-jából ered, ÉS a meglévő gpsFixGate.ts szerint MÉG NEM
   * áll rendelkezésre stabil, friss GPS-bizonyíték. FÜGGETLEN, plusz
   * feltétel — UGYANAZ az elv, mint foregroundRecoveryActive-nél, DE
   * KONCEPTUÁLISAN KÜLÖN: a foreground-reacquisition ugyanaz a JS-session
   * tér vissza háttérből, a restore-recovery egy ÚJ JS-session áll helyre
   * storage-ból (lásd navigationSessionPersistence.ts fejléce). A hívó
   * (VedettUtvonalSearchForm.tsx) KÜLÖN refben tartja a két recovery-t,
   * még ha ugyanazt a pure fázis-átmenet modult (foregroundReacquisition.ts)
   * használja is fel mindkettőhöz — ez NEM egy második, párhuzamos GPS
   * state machine, csak a MEGLÉVŐ, kis modul másik, külön névvel követett
   * felhasználása.
   */
  restoreRecoveryActive?: boolean;
  /**
   * TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — igaz, HA a
   * hívó (VedettUtvonalSearchForm.tsx) transitGpsLossConfirmation.ts szerint
   * egy transit-legen történt GPS LOST utáni, egyébként reroute-ot kiváltó
   * deviation-re a felhasználó MÉG NEM válaszolt (lásd
   * markTransitGpsLoss()/resolveTransitGpsLossConfirmation()). FÜGGETLEN,
   * plusz feltétel — UGYANAZ az elv, mint transitGeometryUncertain/
   * gpsReacquiring-nél: a globális OFF_ROUTE-küszöb és a WALK reroute-
   * viselkedés VÁLTOZATLAN, ez csak egy ÚJABB blokkoló réteg. A hívó a
   * felhasználó explicit "Nem" válaszára ezt false-ra állítja, ami PONTOSAN
   * egy (a MEGLÉVŐ in-flight/cooldown guard által is védett) reroute-
   * kísérletet enged át.
   */
  transitGpsLossAwaitingConfirmation?: boolean;
  /**
   * ONBOARD CONFIRMATION SPRINT (2026-09-23) — igaz, HA a hívó
   * transitGpsLossConfirmation.ts szerint a JELENLEG AKTÍV TRANSIT leg
   * SAJÁT tripId-jére a felhasználó KORÁBBAN már explicit IGEN-t
   * válaszolt (status === "CONFIRMED_ONBOARD" ÉS a scope tripId-je
   * EGYEZIK az aktív leg tripId-jével — a hívó felelős ezért az
   * egyeztetésért, lásd isTransitOnboardScopeStale()). FÜGGETLEN, plusz
   * blokkoló feltétel, UGYANAZ az elv, mint a többi gate-nél: egy
   * KIZÁRÓLAG geometriai OFF_ROUTE bizonyíték a MÁR megerősített tripen
   * SOSEM indíthat automatikus reroute-ot — nincs újra-kérdezés, nincs
   * második /plan hívás. A globális OFF_ROUTE-küszöb és a WALK
   * reroute-viselkedés VÁLTOZATLAN.
   */
  transitOnboardConfirmed?: boolean;
  /**
   * ONBOARD CONFIRMATION SPRINT (2026-09-23) — igaz, HA a hívó szerint egy
   * korábbi NEM válasz (transitGpsLossConfirmation.ts declineTransitOnboard())
   * óta MÉG NEM érkezett a válasz IDŐPONTJÁT KÖVETŐ, usable GPS fix (lásd
   * isAwaitingFreshGpsAfterDecline()/clearAwaitingFreshGpsIfSatisfied()).
   * UGYANAZ az "esemény-időpont vs. fix-időpont" minta, mint gpsFixGate.ts
   * pendingReacquisitionSinceMs-e — SOHA nem enged reroute-ot egy, a NEM
   * válasz ELŐTTI (potenciálisan alagút-előtti) állófixről.
   */
  awaitingFreshGpsAfterDecline?: boolean;
}

export type RerouteBlockReason =
  | "NAVIGATION_INACTIVE"
  | "NOT_CONFIRMED_OFF_ROUTE"
  | "POSITION_MISSING"
  | "DESTINATION_MISSING"
  | "REQUEST_IN_FLIGHT"
  | "COOLDOWN_ACTIVE"
  | "TRANSIT_GEOMETRY_UNCERTAIN"
  | "GPS_REACQUIRING"
  | "FOREGROUND_REACQUISITION"
  | "RESTORE_RECOVERY_ACTIVE"
  | "TRANSIT_GPS_LOSS_AWAITING_CONFIRMATION"
  | "TRANSIT_ONBOARD_CONFIRMED"
  | "AWAITING_FRESH_GPS_AFTER_DECLINE";

export type RerouteGuardDecision =
  | { shouldReroute: true; reason: null }
  | { shouldReroute: false; reason: RerouteBlockReason };

export function createInitialRerouteGuardState(): RerouteGuardState {
  return { inFlight: false, lastAttemptAtMs: null };
}

export function shouldStartAutomaticReroute(
  state: RerouteGuardState,
  input: RerouteGuardInput,
): RerouteGuardDecision {
  if (!input.navigationActive) return { shouldReroute: false, reason: "NAVIGATION_INACTIVE" };
  if (input.offRouteStatus !== "OFF_ROUTE") return { shouldReroute: false, reason: "NOT_CONFIRMED_OFF_ROUTE" };
  // ONBOARD CONFIRMATION SPRINT (2026-09-23) — explicit IGEN a JELENLEG
  // aktív trip-re a LEGERŐSEBB, legkorábban kiértékelt blokkoló bizonyíték:
  // ha a felhasználó már megerősítette, hogy ezen a tripen van, egy pusztán
  // geometriai OFF_ROUTE (akár "usable" geometria mellett is) SOSEM
  // indíthat automatikus reroute-ot, függetlenül attól, hogy a geometria
  // egyébként weak/uncertain-e.
  if (input.transitOnboardConfirmed) return { shouldReroute: false, reason: "TRANSIT_ONBOARD_CONFIRMED" };
  if (input.transitGeometryUncertain) return { shouldReroute: false, reason: "TRANSIT_GEOMETRY_UNCERTAIN" };
  if (input.gpsReacquiring) return { shouldReroute: false, reason: "GPS_REACQUIRING" };
  if (input.foregroundRecoveryActive) return { shouldReroute: false, reason: "FOREGROUND_REACQUISITION" };
  if (input.restoreRecoveryActive) return { shouldReroute: false, reason: "RESTORE_RECOVERY_ACTIVE" };
  if (input.transitGpsLossAwaitingConfirmation) {
    return { shouldReroute: false, reason: "TRANSIT_GPS_LOSS_AWAITING_CONFIRMATION" };
  }
  // ONBOARD CONFIRMATION SPRINT (2026-09-23) — egy korábbi NEM válasz után
  // MÉG NEM érkezett friss (a válasz utáni) usable GPS fix — ugyanazon a
  // "family"-n belül, mint a fenti PENDING-gate: a NEM válasz önmagában
  // NEM elég ok azonnal reroute-olni egy esetleg még alagút-előtti,
  // pontatlan fixről.
  if (input.awaitingFreshGpsAfterDecline) {
    return { shouldReroute: false, reason: "AWAITING_FRESH_GPS_AFTER_DECLINE" };
  }
  if (!input.hasCurrentPosition) return { shouldReroute: false, reason: "POSITION_MISSING" };
  if (!input.hasDestination) return { shouldReroute: false, reason: "DESTINATION_MISSING" };
  if (state.inFlight) return { shouldReroute: false, reason: "REQUEST_IN_FLIGHT" };

  const cooldownMs = Math.max(0, input.cooldownMs ?? DEFAULT_REROUTE_COOLDOWN_MS);
  if (state.lastAttemptAtMs !== null && input.nowMs - state.lastAttemptAtMs < cooldownMs) {
    return { shouldReroute: false, reason: "COOLDOWN_ACTIVE" };
  }

  return { shouldReroute: true, reason: null };
}

export function markRerouteStarted(state: RerouteGuardState, nowMs: number): RerouteGuardState {
  return { ...state, inFlight: true, lastAttemptAtMs: nowMs };
}

export function markRerouteFinished(state: RerouteGuardState): RerouteGuardState {
  return { ...state, inFlight: false };
}

export function resetRerouteGuard(): RerouteGuardState {
  return createInitialRerouteGuardState();
}
