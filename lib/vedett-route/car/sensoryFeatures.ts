import type {
  CarNavigationLeg,
  CarSensoryFeatures,
} from "./types.ts";

type RouteLike = {
  durationSeconds: number;
  typicalDurationSeconds?: number;
  distanceMeters: number;
  legs: CarNavigationLeg[];
};

const CONGESTION_FALLBACK: Record<string, number> = {
  low: 15,
  moderate: 45,
  heavy: 75,
  severe: 95,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function segmentCongestion(
  numeric: number | null | undefined,
  categorical: string | null | undefined,
): number | null {
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, numeric));
  }
  if (!categorical) return null;
  return CONGESTION_FALLBACK[categorical.toLowerCase()] ?? null;
}

export function extractCarSensoryFeatures(route: RouteLike): CarSensoryFeatures {
  let knownCongestionDistance = 0;
  let weightedCongestion = 0;
  let congestedDistance = 0;
  let highSpeedDistance = 0;
  let speedKnownDistance = 0;
  let maxKnownSpeedKmh: number | undefined;

  let maneuverCount = 0;
  let sharpTurnCount = 0;
  let uTurnCount = 0;
  let roundaboutCount = 0;
  let exitCount = 0;
  let rapidInstructionSequenceCount = 0;

  let intersectionCount = 0;
  let trafficSignalCount = 0;
  let stopSignCount = 0;
  let yieldSignCount = 0;
  let railwayCrossingCount = 0;

  for (const leg of route.legs) {
    const a = leg.annotations;
    const segmentCount = Math.max(
      a.distanceMeters.length,
      a.congestionNumeric.length,
      a.congestion.length,
      a.maxSpeed.length,
    );

    for (let i = 0; i < segmentCount; i += 1) {
      const d = a.distanceMeters[i] ?? 0;
      if (d <= 0) continue;

      const congestion = segmentCongestion(
        a.congestionNumeric[i],
        a.congestion[i],
      );

      if (congestion !== null) {
        knownCongestionDistance += d;
        weightedCongestion += congestion * d;
        if (congestion >= 50) congestedDistance += d;
      }

      const maxSpeed = a.maxSpeed[i]?.speedKmh;
      if (typeof maxSpeed === "number" && Number.isFinite(maxSpeed)) {
        speedKnownDistance += d;
        if (maxSpeed >= 90) highSpeedDistance += d;
        maxKnownSpeedKmh =
          maxKnownSpeedKmh === undefined
            ? maxSpeed
            : Math.max(maxKnownSpeedKmh, maxSpeed);
      }
    }

    for (const step of leg.steps) {
      const type = step.maneuver.type.toLowerCase();
      const modifier = step.maneuver.modifier?.toLowerCase() ?? "";

      if (type !== "depart" && type !== "arrive") {
        maneuverCount += 1;
      }

      if (modifier.includes("sharp")) sharpTurnCount += 1;
      if (modifier.includes("uturn") || modifier.includes("u-turn")) {
        uTurnCount += 1;
      }
      if (
        type.includes("roundabout") ||
        type.includes("rotary")
      ) {
        roundaboutCount += 1;
      }
      if (
        type === "off ramp" ||
        type === "on ramp" ||
        type === "exit roundabout" ||
        type === "exit rotary" ||
        step.exits
      ) {
        exitCount += 1;
      }

      if (
        type !== "depart" &&
        type !== "arrive" &&
        step.distanceMeters > 0 &&
        step.distanceMeters < 250
      ) {
        rapidInstructionSequenceCount += 1;
      }

      for (const intersection of step.intersections) {
        intersectionCount += 1;
        if (intersection.trafficSignal) trafficSignalCount += 1;
        if (intersection.stopSign) stopSignCount += 1;
        if (intersection.yieldSign) yieldSignCount += 1;
        if (intersection.railwayCrossing) railwayCrossingCount += 1;
      }
    }
  }

  const km = Math.max(route.distanceMeters / 1000, 0.1);
  const typical = route.typicalDurationSeconds;
  const delayRatio =
    typeof typical === "number" && typical > 0
      ? clamp01(Math.max(0, route.durationSeconds - typical) / typical)
      : 0;

  return {
    totalDistanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    typicalDurationSeconds: route.typicalDurationSeconds,

    congestionKnownDistanceMeters: Math.round(knownCongestionDistance),
    congestionWeightedMean:
      knownCongestionDistance > 0
        ? Math.round((weightedCongestion / knownCongestionDistance) * 10) / 10
        : 0,
    congestedDistanceRatio:
      knownCongestionDistance > 0
        ? Math.round((congestedDistance / knownCongestionDistance) * 1000) / 1000
        : 0,
    liveVsTypicalDelayRatio:
      Math.round(delayRatio * 1000) / 1000,

    maneuverCount,
    turnsPerKm: Math.round((maneuverCount / km) * 100) / 100,
    sharpTurnCount,
    uTurnCount,
    roundaboutCount,
    exitCount,
    rapidInstructionSequenceCount,

    intersectionCount,
    trafficSignalCount,
    stopSignCount,
    yieldSignCount,
    railwayCrossingCount,

    maxKnownSpeedKmh:
      maxKnownSpeedKmh === undefined
        ? undefined
        : Math.round(maxKnownSpeedKmh),
    highSpeedDistanceRatio:
      speedKnownDistance > 0
        ? Math.round((highSpeedDistance / speedKnownDistance) * 1000) / 1000
        : 0,
  };
}
