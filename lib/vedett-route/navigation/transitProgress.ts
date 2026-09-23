import { haversineMeters, projectPointToRoute } from "./geometry.ts";
import type { NavigationCoordinate } from "./types.ts";
import type { RemainingStopsResult } from "./instructions.ts";

type Stop = { name: string; lat?: number; lon?: number };
export interface TransitProgress extends RemainingStopsResult {
  nextStopName: string;
  nearAlighting: boolean;
}

// The caller supplies only fresh, gated GPS fixes. Never infer progress from time.
export function resolveTransitProgress(
  coordinates: readonly NavigationCoordinate[],
  stops: readonly Stop[] | undefined,
  destination: Stop,
  position: { latitude: number; longitude: number; accuracyMeters?: number | null } | null,
): TransitProgress | null {
  if (!position || coordinates.length < 3 || stops === undefined) return null;
  const valid = (lon: number | undefined, lat: number | undefined) =>
    Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon!) <= 180 && Math.abs(lat!) <= 90;
  if (!valid(position.longitude, position.latitude) || coordinates.some(c => !valid(c[0], c[1]))) return null;
  const accuracy = position.accuracyMeters;
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50) return null;
  const point: NavigationCoordinate = [position.longitude, position.latitude];
  const current = projectPointToRoute(point, coordinates);
  if (!current || current.distanceFromRouteMeters > 50) return null;
  const projected = [];
  for (const stop of [...stops, destination]) {
    if (!valid(stop.lon, stop.lat) || !stop.name.trim()) return null;
    const projection = projectPointToRoute([stop.lon!, stop.lat!], coordinates);
    if (!projection || projection.distanceFromRouteMeters > 50) return null;
    if (projected.length && projection.distanceAlongRouteMeters <= projected[projected.length - 1].distance) return null;
    projected.push({ name: stop.name, distance: projection.distanceAlongRouteMeters });
  }
  // Keep a stop until the fix is beyond its uncertainty band; GPS jitter at a
  // platform must not immediately announce the following station.
  const margin = Math.max(15, accuracy);
  const nextIndex = projected.findIndex((stop, index) =>
    index === projected.length - 1 || current.distanceAlongRouteMeters <= stop.distance + margin);
  const remainingStopCount = projected.length - nextIndex;
  return {
    remainingStopCount,
    atFinalStop: remainingStopCount === 1,
    nextStopName: projected[nextIndex].name,
    nearAlighting: remainingStopCount === 1 &&
      haversineMeters(point, [destination.lon!, destination.lat!]) + accuracy <= 35,
  };
}
