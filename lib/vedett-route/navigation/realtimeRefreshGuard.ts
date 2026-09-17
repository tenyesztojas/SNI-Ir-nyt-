// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — PURE polling-gate döntési
// logika, UGYANAZT a mintát követi, mint rerouteGuard.ts
// (shouldStartAutomaticReroute). Ez a réteg NEM tud semmit a hálózatról —
// csak eldönti, hogy egy adott pillanatban ELINDULHAT-e egy realtime
// refresh kérés, és karbantartja az in-flight/last-refresh állapotot.

export const TRANSIT_REALTIME_REFRESH_INTERVAL_MS = 30_000;

export interface RealtimeRefreshGuardState {
  inFlight: boolean;
  lastRefreshAtMs: number | null;
}

export interface RealtimeRefreshGuardInput {
  navigationActive: boolean;
  documentVisible: boolean;
  // true, ha van AKTÍV TRANSIT láb, VAGY a következő releváns láb TRANSIT
  // (pl. még WALK-ban vagyunk a beszállás előtt, de hamarosan releváns
  // lesz a friss adat).
  hasRelevantTransitLeg: boolean;
  // true, ha egy rest-stop legsOverride aktív (a megjelenített lábak nem a
  // "fő" navigációs Journey lábai).
  hasRestStopOverride: boolean;
  isRerouting: boolean;
  nowMs: number;
  intervalMs?: number;
  // true, ha ez a hívás egy "tab visibility visszatért" eseményre reagál —
  // ekkor a normál intervallum-korlát nem blokkol, hogy a felhasználó ne
  // lásson elavult adatot visszatéréskor, de request storm-ot sem okoz,
  // mert az in-flight guard és a hívó oldal (a hook) egyszer, esemény
  // alapján hívja, nem ismétlődően.
  justBecameVisible?: boolean;
}

export type RealtimeRefreshBlockReason =
  | "NAVIGATION_INACTIVE"
  | "DOCUMENT_HIDDEN"
  | "NO_RELEVANT_TRANSIT_LEG"
  | "REST_STOP_OVERRIDE_ACTIVE"
  | "REROUTING_ACTIVE"
  | "REQUEST_IN_FLIGHT"
  | "INTERVAL_NOT_ELAPSED";

export type RealtimeRefreshGuardDecision =
  | { shouldRefresh: true; reason: null }
  | { shouldRefresh: false; reason: RealtimeRefreshBlockReason };

export function createInitialRealtimeRefreshGuardState(): RealtimeRefreshGuardState {
  return { inFlight: false, lastRefreshAtMs: null };
}

export function shouldStartRealtimeRefresh(
  state: RealtimeRefreshGuardState,
  input: RealtimeRefreshGuardInput
): RealtimeRefreshGuardDecision {
  if (!input.navigationActive) return { shouldRefresh: false, reason: "NAVIGATION_INACTIVE" };
  if (!input.documentVisible) return { shouldRefresh: false, reason: "DOCUMENT_HIDDEN" };
  if (!input.hasRelevantTransitLeg) return { shouldRefresh: false, reason: "NO_RELEVANT_TRANSIT_LEG" };
  if (input.hasRestStopOverride) return { shouldRefresh: false, reason: "REST_STOP_OVERRIDE_ACTIVE" };
  if (input.isRerouting) return { shouldRefresh: false, reason: "REROUTING_ACTIVE" };
  // At most 1 request at a time.
  if (state.inFlight) return { shouldRefresh: false, reason: "REQUEST_IN_FLIGHT" };

  if (input.justBecameVisible) {
    return { shouldRefresh: true, reason: null };
  }

  const intervalMs = Math.max(1000, input.intervalMs ?? TRANSIT_REALTIME_REFRESH_INTERVAL_MS);
  if (state.lastRefreshAtMs !== null && input.nowMs - state.lastRefreshAtMs < intervalMs) {
    return { shouldRefresh: false, reason: "INTERVAL_NOT_ELAPSED" };
  }

  return { shouldRefresh: true, reason: null };
}

export function markRealtimeRefreshStarted(state: RealtimeRefreshGuardState, nowMs: number): RealtimeRefreshGuardState {
  return { ...state, inFlight: true, lastRefreshAtMs: nowMs };
}

export function markRealtimeRefreshFinished(state: RealtimeRefreshGuardState): RealtimeRefreshGuardState {
  return { ...state, inFlight: false };
}

export function resetRealtimeRefreshGuard(): RealtimeRefreshGuardState {
  return createInitialRealtimeRefreshGuardState();
}
