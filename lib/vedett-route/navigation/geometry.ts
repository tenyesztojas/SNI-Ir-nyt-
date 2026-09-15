import type { NavigationCoordinate } from "./types.ts";

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

export function haversineMeters(a: NavigationCoordinate, b: NavigationCoordinate): number {
  const lat1 = a[1] * DEG;
  const lat2 = b[1] * DEG;
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toLocalMeters(p: NavigationCoordinate, origin: NavigationCoordinate): [number, number] {
  const lat0 = origin[1] * DEG;
  return [
    (p[0] - origin[0]) * DEG * EARTH_RADIUS_M * Math.cos(lat0),
    (p[1] - origin[1]) * DEG * EARTH_RADIUS_M,
  ];
}

function fromLocalMeters(x: number, y: number, origin: NavigationCoordinate): NavigationCoordinate {
  const lat0 = origin[1] * DEG;
  const cos = Math.max(1e-9, Math.cos(lat0));
  return [origin[0] + (x / (EARTH_RADIUS_M * cos)) / DEG, origin[1] + (y / EARTH_RADIUS_M) / DEG];
}

export interface RouteProjection {
  coordinate: NavigationCoordinate;
  segmentIndex: number;
  segmentFraction: number;
  distanceFromRouteMeters: number;
  distanceAlongRouteMeters: number;
  routeDistanceMeters: number;
}

export function routeLengthMeters(route: readonly NavigationCoordinate[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i += 1) total += haversineMeters(route[i - 1], route[i]);
  return total;
}

export function projectPointToRoute(point: NavigationCoordinate, route: readonly NavigationCoordinate[]): RouteProjection | null {
  if (route.length < 2) return null;
  let best: RouteProjection | null = null;
  let cumulative = 0;
  const total = routeLengthMeters(route);

  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const [bx, by] = toLocalMeters(b, a);
    const [px, py] = toLocalMeters(point, a);
    const denom = bx * bx + by * by;
    const t = denom > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / denom)) : 0;
    const qx = bx * t;
    const qy = by * t;
    const dx = px - qx;
    const dy = py - qy;
    const distance = Math.hypot(dx, dy);
    const segmentLength = haversineMeters(a, b);
    const candidate: RouteProjection = {
      coordinate: fromLocalMeters(qx, qy, a),
      segmentIndex: i,
      segmentFraction: t,
      distanceFromRouteMeters: distance,
      distanceAlongRouteMeters: cumulative + segmentLength * t,
      routeDistanceMeters: total,
    };
    if (!best || candidate.distanceFromRouteMeters < best.distanceFromRouteMeters) best = candidate;
    cumulative += segmentLength;
  }
  return best;
}
