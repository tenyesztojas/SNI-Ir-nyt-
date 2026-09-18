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
}

export type RerouteBlockReason =
  | "NAVIGATION_INACTIVE"
  | "NOT_CONFIRMED_OFF_ROUTE"
  | "POSITION_MISSING"
  | "DESTINATION_MISSING"
  | "REQUEST_IN_FLIGHT"
  | "COOLDOWN_ACTIVE"
  | "TRANSIT_GEOMETRY_UNCERTAIN"
  | "GPS_REACQUIRING";

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
  if (input.transitGeometryUncertain) return { shouldReroute: false, reason: "TRANSIT_GEOMETRY_UNCERTAIN" };
  if (input.gpsReacquiring) return { shouldReroute: false, reason: "GPS_REACQUIRING" };
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
