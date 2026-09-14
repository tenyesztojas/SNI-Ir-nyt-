import type {
  CarBannerInstruction,
  CarIntersection,
  CarLegAnnotations,
  CarManeuver,
  CarNavigationLeg,
  CarNavigationRoute,
  CarNavigationStep,
  CarRouteGeometry,
  CarSegmentMaxSpeed,
  CarVoiceInstruction,
  LngLat,
  RawMapboxBannerInstruction,
  RawMapboxIntersection,
  RawMapboxLeg,
  RawMapboxManeuver,
  RawMapboxMaxSpeed,
  RawMapboxRoute,
  RawMapboxStep,
  RawMapboxVoiceInstruction,
} from "./types.ts";
import { buildCarSensoryScore } from "./sensoryScore.ts";

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function normalizeGeometry(
  geometry: { type?: unknown; coordinates?: unknown } | undefined,
): CarRouteGeometry | undefined {
  if (
    !geometry ||
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    !geometry.coordinates.every(isLngLat)
  ) {
    return undefined;
  }

  return {
    type: "LineString",
    coordinates: geometry.coordinates.map(([lon, lat]) => [lon, lat]),
  };
}

function normalizeManeuver(raw: RawMapboxManeuver | undefined): CarManeuver | null {
  if (!raw || !isLngLat(raw.location)) return null;

  const type = stringValue(raw.type);
  const instruction = stringValue(raw.instruction);
  if (!type || !instruction) return null;

  return {
    type,
    modifier: stringValue(raw.modifier),
    instruction,
    location: [raw.location[0], raw.location[1]],
    bearingBefore: finiteNumber(raw.bearing_before),
    bearingAfter: finiteNumber(raw.bearing_after),
    exit: finiteNumber(raw.exit),
  };
}

function normalizeVoiceInstruction(
  raw: RawMapboxVoiceInstruction,
): CarVoiceInstruction | null {
  const distance = finiteNumber(raw.distanceAlongGeometry);
  const announcement = stringValue(raw.announcement);
  if (distance === undefined || !announcement) return null;

  return {
    distanceAlongGeometryMeters: distance,
    announcement,
    ssmlAnnouncement: stringValue(raw.ssmlAnnouncement),
  };
}

function normalizeBannerInstruction(
  raw: RawMapboxBannerInstruction,
): CarBannerInstruction | null {
  const distance = finiteNumber(raw.distanceAlongGeometry);
  if (distance === undefined) return null;

  return {
    distanceAlongGeometryMeters: distance,
    primaryText: stringValue(raw.primary?.text),
    secondaryText: stringValue(raw.secondary?.text),
    subText: stringValue(raw.sub?.text),
  };
}

function normalizeIntersection(raw: RawMapboxIntersection): CarIntersection | null {
  if (!isLngLat(raw.location)) return null;

  return {
    location: [raw.location[0], raw.location[1]],
    trafficSignal: raw.traffic_signal === true,
    stopSign: raw.stop_sign === true,
    yieldSign: raw.yield_sign === true,
    railwayCrossing: raw.railway_crossing === true,
    classes: Array.isArray(raw.classes)
      ? raw.classes.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function normalizeStep(raw: RawMapboxStep): CarNavigationStep | null {
  const distance = finiteNumber(raw.distance);
  const duration = finiteNumber(raw.duration);
  const maneuver = normalizeManeuver(raw.maneuver);

  if (distance === undefined || duration === undefined || !maneuver) {
    return null;
  }

  return {
    distanceMeters: Math.round(distance),
    durationSeconds: Math.round(duration),
    typicalDurationSeconds:
      finiteNumber(raw.duration_typical) === undefined
        ? undefined
        : Math.round(finiteNumber(raw.duration_typical)!),
    roadName: stringValue(raw.name),
    roadRef: stringValue(raw.ref),
    destinations: stringValue(raw.destinations),
    exits: stringValue(raw.exits),
    drivingSide:
      raw.driving_side === "left" || raw.driving_side === "right"
        ? raw.driving_side
        : undefined,
    mode: stringValue(raw.mode),
    maneuver,
    geometry: normalizeGeometry(raw.geometry),
    intersections: Array.isArray(raw.intersections)
      ? raw.intersections
          .map(normalizeIntersection)
          .filter((x): x is CarIntersection => x !== null)
      : [],
    voiceInstructions: Array.isArray(raw.voiceInstructions)
      ? raw.voiceInstructions
          .map(normalizeVoiceInstruction)
          .filter((x): x is CarVoiceInstruction => x !== null)
      : [],
    bannerInstructions: Array.isArray(raw.bannerInstructions)
      ? raw.bannerInstructions
          .map(normalizeBannerInstruction)
          .filter((x): x is CarBannerInstruction => x !== null)
      : [],
  };
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    : [];
}

function nullableNumberArray(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map((x) =>
    typeof x === "number" && Number.isFinite(x) ? x : null,
  );
}

function nullableStringArray(value: unknown): Array<string | null> {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (typeof x === "string" ? x : null));
}

function normalizeMaxSpeed(raw: RawMapboxMaxSpeed): CarSegmentMaxSpeed {
  const speed = finiteNumber(raw.speed);
  const unit = stringValue(raw.unit);

  let speedKmh: number | undefined;
  if (speed !== undefined) {
    speedKmh = unit === "mph" ? speed * 1.609344 : speed;
  }

  return {
    speedKmh,
    unknown: raw.unknown === true,
    unlimited: raw.none === true,
  };
}

function normalizeAnnotations(raw: RawMapboxLeg["annotation"]): CarLegAnnotations {
  const maxspeed = Array.isArray(raw?.maxspeed)
    ? (raw!.maxspeed as RawMapboxMaxSpeed[]).map(normalizeMaxSpeed)
    : [];

  return {
    distanceMeters: numberArray(raw?.distance),
    durationSeconds: numberArray(raw?.duration),
    speedMetersPerSecond: nullableNumberArray(raw?.speed),
    congestion: nullableStringArray(raw?.congestion),
    congestionNumeric: nullableNumberArray(raw?.congestion_numeric),
    maxSpeed: maxspeed,
  };
}

function normalizeLeg(raw: RawMapboxLeg): CarNavigationLeg | null {
  const distance = finiteNumber(raw.distance);
  const duration = finiteNumber(raw.duration);
  if (distance === undefined || duration === undefined) return null;

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map(normalizeStep)
        .filter((x): x is CarNavigationStep => x !== null)
    : [];

  return {
    distanceMeters: Math.round(distance),
    durationSeconds: Math.round(duration),
    typicalDurationSeconds:
      finiteNumber(raw.duration_typical) === undefined
        ? undefined
        : Math.round(finiteNumber(raw.duration_typical)!),
    summary: stringValue(raw.summary),
    steps,
    annotations: normalizeAnnotations(raw.annotation),
  };
}

export function normalizeCarRoute(route: RawMapboxRoute): CarNavigationRoute | null {
  const duration = finiteNumber(route.duration);
  const distance = finiteNumber(route.distance);
  const geometry = normalizeGeometry(route.geometry);

  if (duration === undefined || distance === undefined || !geometry) {
    return null;
  }

  const legs = Array.isArray(route.legs)
    ? route.legs.map(normalizeLeg).filter((x): x is CarNavigationLeg => x !== null)
    : [];

  const base = {
    durationSeconds: Math.round(duration),
    typicalDurationSeconds:
      finiteNumber(route.duration_typical) === undefined
        ? undefined
        : Math.round(finiteNumber(route.duration_typical)!),
    distanceMeters: Math.round(distance),
    geometry,
    legs,
  };

  return {
    ...base,
    sensory: buildCarSensoryScore(base),
  };
}
