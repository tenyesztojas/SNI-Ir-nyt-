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
}

export type RerouteBlockReason =
  | "NAVIGATION_INACTIVE"
  | "NOT_CONFIRMED_OFF_ROUTE"
  | "POSITION_MISSING"
  | "DESTINATION_MISSING"
  | "REQUEST_IN_FLIGHT"
  | "COOLDOWN_ACTIVE";

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
