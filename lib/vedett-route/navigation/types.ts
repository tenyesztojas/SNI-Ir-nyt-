export type NavigationCoordinate = readonly [longitude: number, latitude: number];

export type OffRouteStatus = "ON_ROUTE" | "POSSIBLY_OFF_ROUTE" | "OFF_ROUTE";

export interface NavigationPosition {
  latitude: number;
  longitude: number;
  timestampMs?: number | null;
  speedMetersPerSecond?: number | null;
}

export interface RouteProgressOptions {
  /** GPS-route distance <= this is considered on-route. */
  onRouteThresholdMeters?: number;
  /** Distance >= this can contribute to OFF_ROUTE. */
  offRouteThresholdMeters?: number;
  /** Consecutive far fixes required before OFF_ROUTE. */
  offRouteConfirmFixes?: number;
  /** Prevent GPS noise from moving progress backwards by more than this. */
  backwardToleranceMeters?: number;
  /** Optional route duration from the routing engine, used for proportional ETA. */
  routeDurationSeconds?: number | null;
}

export interface RouteProgressState {
  routeDistanceMeters: number;
  progressDistanceMeters: number;
  progressFraction: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number | null;
  estimatedArrivalTimeMs: number | null;
  distanceFromRouteMeters: number;
  matchedCoordinate: NavigationCoordinate | null;
  matchedSegmentIndex: number | null;
  offRouteStatus: OffRouteStatus;
  consecutiveOffRouteFixes: number;
}
