import type { CarNavigationRoute, LngLat } from "../types.ts";
import type {
  CarRestStopDetour,
  CarRestStopDetourOptions,
  CarRestStopDetourResult,
  CarRestStopOnRoute,
  CarRestStopWithDetour,
} from "./types.ts";

const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic";
const DEFAULT_MAX_CANDIDATES = 6;
const DEFAULT_TIMEOUT_MS = 8000;

type FetchLike = typeof fetch;

type RawDirectionsRoute = {
  duration?: unknown;
  distance?: unknown;
};

type RawDirectionsResponse = {
  routes?: unknown;
};

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function getRouteEndpoints(route: CarNavigationRoute): { origin: LngLat; destination: LngLat } | null {
  const coordinates = route.geometry.coordinates;
  if (coordinates.length < 2) return null;

  const origin = coordinates[0];
  const destination = coordinates[coordinates.length - 1];
  if (!origin || !destination) return null;

  return { origin, destination };
}

function normalizeViaRoute(
  raw: RawDirectionsRoute,
  baselineDurationSeconds: number,
  baselineDistanceMeters: number,
): CarRestStopDetour | null {
  if (!isFiniteNonNegative(raw.duration) || !isFiniteNonNegative(raw.distance)) {
    return null;
  }

  const signedDurationDeltaSeconds = raw.duration - baselineDurationSeconds;
  const signedDistanceDeltaMeters = raw.distance - baselineDistanceMeters;

  return {
    baselineDurationSeconds,
    baselineDistanceMeters,
    viaDurationSeconds: raw.duration,
    viaDistanceMeters: raw.distance,
    signedDurationDeltaSeconds,
    signedDistanceDeltaMeters,
    // Separate Directions requests can differ slightly because traffic changes between calls.
    // The user-facing "detour" is therefore never allowed to become negative.
    detourDurationSeconds: Math.max(0, signedDurationDeltaSeconds),
    detourDistanceMeters: Math.max(0, signedDistanceDeltaMeters),
  };
}

export function buildRestStopDetourDirectionsUrl(
  origin: LngLat,
  restStop: LngLat,
  destination: LngLat,
  accessToken: string,
): string {
  const coordinates = [origin, restStop, destination]
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(";");

  const params = new URLSearchParams();
  params.set("alternatives", "false");
  params.set("steps", "false");
  params.set("overview", "false");
  params.set("access_token", accessToken);

  return `${DIRECTIONS_BASE}/${coordinates}?${params.toString()}`;
}

async function priceOneCandidate(
  route: CarNavigationRoute,
  candidate: CarRestStopOnRoute,
  accessToken: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<CarRestStopWithDetour | null> {
  const endpoints = getRouteEndpoints(route);
  if (!endpoints) return null;

  const url = buildRestStopDetourDirectionsUrl(
    endpoints.origin,
    candidate.location,
    endpoints.destination,
    accessToken,
  );

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data: unknown = await response.json().catch(() => null);
  const routes =
    data && typeof data === "object" && Array.isArray((data as RawDirectionsResponse).routes)
      ? ((data as RawDirectionsResponse).routes as RawDirectionsRoute[])
      : [];

  const detour = routes[0]
    ? normalizeViaRoute(routes[0], route.durationSeconds, route.distanceMeters)
    : null;

  if (!detour) return null;

  return {
    ...candidate,
    detour,
  };
}

function compareByDetour(a: CarRestStopWithDetour, b: CarRestStopWithDetour): number {
  if (a.detour.detourDurationSeconds !== b.detour.detourDurationSeconds) {
    return a.detour.detourDurationSeconds - b.detour.detourDurationSeconds;
  }

  if (a.detour.detourDistanceMeters !== b.detour.detourDistanceMeters) {
    return a.detour.detourDistanceMeters - b.detour.detourDistanceMeters;
  }

  if (a.routePositionMeters !== b.routePositionMeters) {
    return a.routePositionMeters - b.routePositionMeters;
  }

  return a.distanceFromRouteMeters - b.distanceFromRouteMeters;
}

export async function rankCarRestStopsByDetour(
  route: CarNavigationRoute,
  candidates: CarRestStopOnRoute[],
  accessToken: string,
  options: CarRestStopDetourOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<CarRestStopDetourResult> {
  if (!accessToken) {
    throw new Error("mapbox_access_token_missing");
  }

  const maxCandidates = Math.min(
    12,
    Math.max(1, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES)),
  );
  const timeoutMs = Math.min(
    20_000,
    Math.max(1_000, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  );

  const selected = candidates.slice(0, maxCandidates);

  const priced = await Promise.all(
    selected.map((candidate) =>
      priceOneCandidate(route, candidate, accessToken, timeoutMs, fetchImpl),
    ),
  );

  const successful = priced
    .filter((candidate): candidate is CarRestStopWithDetour => candidate !== null)
    .sort(compareByDetour);

  const successfulIds = new Set(successful.map((candidate) => candidate.id));
  const unpricedCandidateIds = selected
    .filter((candidate) => !successfulIds.has(candidate.id))
    .map((candidate) => candidate.id);

  return {
    candidates: successful,
    unpricedCandidateIds,
    diagnostics: {
      provider: "MAPBOX_DIRECTIONS",
      profile: "driving-traffic",
      attemptedCount: selected.length,
      pricedCount: successful.length,
      failedCount: unpricedCandidateIds.length,
      maxCandidates,
    },
  };
}
