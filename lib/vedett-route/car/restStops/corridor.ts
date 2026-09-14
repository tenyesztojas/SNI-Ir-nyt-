import type { CarRouteGeometry, LngLat } from "../types.ts";
import type {
  CarRestStopCandidate,
  CarRestStopCorridorOptions,
  CarRestStopOnRoute,
} from "./types.ts";

const EARTH_RADIUS_M = 6371008.8;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_M *
    Math.asin(Math.min(1, Math.sqrt(h)))
  );
}

/**
 * Egy földrajzi pontot lokális síkbeli koordinátává alakít.
 *
 * Autós útvonalak rövid szakaszainál az equirectangular projection
 * kellően pontos ahhoz, hogy egy POI és egy route-segment közötti
 * távolságot meghatározzunk.
 *
 * A visszaadott x/y értékek méterben vannak.
 */
function projectToLocalMeters(
  point: LngLat,
  referenceLatitudeDeg: number,
): { x: number; y: number } {
  const lon = toRad(point[0]);
  const lat = toRad(point[1]);
  const referenceLat = toRad(referenceLatitudeDeg);

  return {
    x: EARTH_RADIUS_M * lon * Math.cos(referenceLat),
    y: EARTH_RADIUS_M * lat,
  };
}

type SegmentProjection = {
  distanceMeters: number;
  fraction: number;
};

/**
 * Meghatározza, hogy a `point` milyen messze van az `a -> b`
 * vonalszakasztól, illetve hol helyezkedik el a vetület a szakaszon.
 *
 * fraction:
 * - 0   = a pont
 * - 1   = b pont
 * - 0.5 = a szakasz közepe
 */
function distanceToSegmentMeters(
  point: LngLat,
  a: LngLat,
  b: LngLat,
): SegmentProjection {
  const referenceLatitude =
    (point[1] + a[1] + b[1]) / 3;

  const p = projectToLocalMeters(
    point,
    referenceLatitude,
  );
  const pa = projectToLocalMeters(
    a,
    referenceLatitude,
  );
  const pb = projectToLocalMeters(
    b,
    referenceLatitude,
  );

  const abX = pb.x - pa.x;
  const abY = pb.y - pa.y;

  const apX = p.x - pa.x;
  const apY = p.y - pa.y;

  const abLengthSquared =
    abX * abX + abY * abY;

  if (abLengthSquared <= Number.EPSILON) {
    return {
      distanceMeters: haversineMeters(point, a),
      fraction: 0,
    };
  }

  const rawFraction =
    (apX * abX + apY * abY) /
    abLengthSquared;

  const fraction = clamp(
    rawFraction,
    0,
    1,
  );

  const nearestX =
    pa.x + fraction * abX;

  const nearestY =
    pa.y + fraction * abY;

  const dx = p.x - nearestX;
  const dy = p.y - nearestY;

  return {
    distanceMeters: Math.sqrt(
      dx * dx + dy * dy,
    ),
    fraction,
  };
}

type NearestRoutePoint = {
  distanceMeters: number;
  routePositionMeters: number;
};

/**
 * Megkeresi a POI-hoz legközelebbi pontot a teljes útvonalon.
 *
 * Fontos: nem csak a LineString vertexeit vizsgáljuk,
 * hanem minden egymást követő vertex közötti vonalszakaszt.
 *
 * Így például egy benzinkút, amely két route-vertex között
 * 100 méterre van az úttól, valóban kb. 100 méteres
 * distanceFromRouteMeters értéket kap.
 */
function nearestRoutePoint(
  geometry: CarRouteGeometry,
  point: LngLat,
): NearestRoutePoint | null {
  const coordinates =
    geometry.coordinates;

  if (coordinates.length === 0) {
    return null;
  }

  /**
   * Speciális eset:
   * ha valamiért csak egyetlen koordináta van,
   * nincs valódi szakasz, ezért a ponthoz mérünk.
   */
  if (coordinates.length === 1) {
    return {
      distanceMeters: haversineMeters(
        coordinates[0],
        point,
      ),
      routePositionMeters: 0,
    };
  }

  let bestDistance =
    Number.POSITIVE_INFINITY;

  let bestRoutePosition = 0;

  let traversedMeters = 0;

  for (
    let i = 0;
    i < coordinates.length - 1;
    i += 1
  ) {
    const segmentStart =
      coordinates[i];

    const segmentEnd =
      coordinates[i + 1];

    const segmentLengthMeters =
      haversineMeters(
        segmentStart,
        segmentEnd,
      );

    const projection =
      distanceToSegmentMeters(
        point,
        segmentStart,
        segmentEnd,
      );

    const projectedRoutePosition =
      traversedMeters +
      segmentLengthMeters *
        projection.fraction;

    if (
      projection.distanceMeters <
      bestDistance
    ) {
      bestDistance =
        projection.distanceMeters;

      bestRoutePosition =
        projectedRoutePosition;
    }

    traversedMeters +=
      segmentLengthMeters;
  }

  if (!Number.isFinite(bestDistance)) {
    return null;
  }

  return {
    distanceMeters: bestDistance,
    routePositionMeters:
      bestRoutePosition,
  };
}

/**
 * Autós pihenőhely-korridor szűrő.
 *
 * Szándékosan csak:
 * - FUEL
 * - RESTAURANT
 * - PUBLIC_TOILET
 *
 * kategóriát fogad.
 *
 * Pad, park és egyéb gyalogos pihenőpont
 * nem része az autós modellnek.
 *
 * A POI-k távolságát a teljes route LineStringhez
 * mérjük, nem pusztán annak vertexeihez.
 *
 * Ez a réteg később a Mapbox Search Along Route
 * találatait is szerveroldalon ellenőrzi és rendezi.
 */
export function filterAndRankCarRestStops(
  route: CarRouteGeometry,
  candidates: CarRestStopCandidate[],
  options: CarRestStopCorridorOptions = {
    maxDistanceFromRouteMeters: 1500,
    maxResults: 12,
  },
): CarRestStopOnRoute[] {
  const allowedTypes = new Set<
    CarRestStopCandidate["type"]
  >([
    "FUEL",
    "RESTAURANT",
    "PUBLIC_TOILET",
  ]);

  return candidates
    .filter((candidate) =>
      allowedTypes.has(candidate.type),
    )
    .map((candidate) => {
      const nearest =
        nearestRoutePoint(
          route,
          candidate.location,
        );

      if (!nearest) {
        return null;
      }

      return {
        ...candidate,

        routePositionMeters:
          Math.round(
            nearest.routePositionMeters,
          ),

        distanceFromRouteMeters:
          Math.round(
            nearest.distanceMeters,
          ),
      } satisfies CarRestStopOnRoute;
    })
    .filter(
      (
        candidate,
      ): candidate is CarRestStopOnRoute =>
        candidate !== null,
    )
    .filter(
      (candidate) =>
        candidate.distanceFromRouteMeters <=
        options.maxDistanceFromRouteMeters,
    )
    .sort((a, b) => {
      if (
        a.routePositionMeters !==
        b.routePositionMeters
      ) {
        return (
          a.routePositionMeters -
          b.routePositionMeters
        );
      }

      return (
        a.distanceFromRouteMeters -
        b.distanceFromRouteMeters
      );
    })
    .slice(0, options.maxResults);
}