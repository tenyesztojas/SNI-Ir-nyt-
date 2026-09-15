import { projectPointToRoute } from "./geometry.ts";
import type { NavigationCoordinate, NavigationPosition, OffRouteStatus, RouteProgressOptions, RouteProgressState } from "./types.ts";

const DEFAULTS = {
  onRouteThresholdMeters: 25,
  offRouteThresholdMeters: 50,
  offRouteConfirmFixes: 3,
  backwardToleranceMeters: 20,
} as const;

export function createInitialRouteProgress(): RouteProgressState {
  return {
    routeDistanceMeters: 0,
    progressDistanceMeters: 0,
    progressFraction: 0,
    remainingDistanceMeters: 0,
    remainingDurationSeconds: null,
    estimatedArrivalTimeMs: null,
    distanceFromRouteMeters: Number.POSITIVE_INFINITY,
    matchedCoordinate: null,
    matchedSegmentIndex: null,
    offRouteStatus: "ON_ROUTE",
    consecutiveOffRouteFixes: 0,
  };
}

function classifyOffRoute(distance: number, previousFarFixes: number, options: Required<Pick<RouteProgressOptions, "onRouteThresholdMeters" | "offRouteThresholdMeters" | "offRouteConfirmFixes">>): { status: OffRouteStatus; farFixes: number } {
  if (distance <= options.onRouteThresholdMeters) return { status: "ON_ROUTE", farFixes: 0 };
  if (distance < options.offRouteThresholdMeters) return { status: "POSSIBLY_OFF_ROUTE", farFixes: 0 };
  const farFixes = previousFarFixes + 1;
  return { status: farFixes >= options.offRouteConfirmFixes ? "OFF_ROUTE" : "POSSIBLY_OFF_ROUTE", farFixes };
}

export function updateRouteProgress(
  route: readonly NavigationCoordinate[],
  position: NavigationPosition,
  previous: RouteProgressState | null,
  options: RouteProgressOptions = {},
): RouteProgressState {
  const projection = projectPointToRoute([position.longitude, position.latitude], route);
  if (!projection) return createInitialRouteProgress();

  const onRouteThresholdMeters = options.onRouteThresholdMeters ?? DEFAULTS.onRouteThresholdMeters;
  const offRouteThresholdMeters = Math.max(onRouteThresholdMeters, options.offRouteThresholdMeters ?? DEFAULTS.offRouteThresholdMeters);
  const offRouteConfirmFixes = Math.max(1, Math.round(options.offRouteConfirmFixes ?? DEFAULTS.offRouteConfirmFixes));
  const backwardToleranceMeters = Math.max(0, options.backwardToleranceMeters ?? DEFAULTS.backwardToleranceMeters);
  const offRoute = classifyOffRoute(projection.distanceFromRouteMeters, previous?.consecutiveOffRouteFixes ?? 0, {
    onRouteThresholdMeters,
    offRouteThresholdMeters,
    offRouteConfirmFixes,
  });

  let progress = projection.distanceAlongRouteMeters;
  if (previous && progress < previous.progressDistanceMeters) {
    const backwards = previous.progressDistanceMeters - progress;
    if (backwards <= backwardToleranceMeters || offRoute.status !== "ON_ROUTE") progress = previous.progressDistanceMeters;
  }
  progress = Math.max(0, Math.min(projection.routeDistanceMeters, progress));
  const fraction = projection.routeDistanceMeters > 0 ? progress / projection.routeDistanceMeters : 0;
  const remainingDistance = Math.max(0, projection.routeDistanceMeters - progress);

  const routeDuration = typeof options.routeDurationSeconds === "number" && Number.isFinite(options.routeDurationSeconds) && options.routeDurationSeconds >= 0
    ? options.routeDurationSeconds
    : null;
  const remainingDuration = routeDuration === null ? null : Math.max(0, routeDuration * (1 - fraction));
  const now = position.timestampMs ?? Date.now();

  return {
    routeDistanceMeters: projection.routeDistanceMeters,
    progressDistanceMeters: progress,
    progressFraction: Math.max(0, Math.min(1, fraction)),
    remainingDistanceMeters: remainingDistance,
    remainingDurationSeconds: remainingDuration,
    estimatedArrivalTimeMs: remainingDuration === null ? null : now + remainingDuration * 1000,
    distanceFromRouteMeters: projection.distanceFromRouteMeters,
    matchedCoordinate: projection.coordinate,
    matchedSegmentIndex: projection.segmentIndex,
    offRouteStatus: offRoute.status,
    consecutiveOffRouteFixes: offRoute.farFixes,
  };
}
