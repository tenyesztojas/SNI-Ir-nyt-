import type {
  CarNavigationLeg,
  CarSensoryComponents,
  CarSensoryScore,
} from "./types.ts";
import { extractCarSensoryFeatures } from "./sensoryFeatures.ts";

type RouteLike = {
  durationSeconds: number;
  typicalDurationSeconds?: number;
  distanceMeters: number;
  legs: CarNavigationLeg[];
};

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * V1 kísérleti, transzparens heurisztika.
 *
 * NEM klinikai mérőszám és NEM állítja, hogy egy adott személy számára
 * objektíven "stresszes" egy út. A cél kizárólag az alternatív autós
 * útvonalak összehasonlítható háttér-feature-einek stabil 0..100 közé
 * vetítése. A súlyok később felhasználói visszajelzés alapján kalibrálhatók.
 */
export function buildCarSensoryScore(route: RouteLike): CarSensoryScore {
  const f = extractCarSensoryFeatures(route);
  const km = Math.max(f.totalDistanceMeters / 1000, 0.1);

  const trafficStress = clamp100(
    f.congestionWeightedMean * 0.65 +
      f.congestedDistanceRatio * 100 * 0.35,
  );

  const maneuverLoad = clamp100(
    f.turnsPerKm * 10 +
      f.sharpTurnCount * 7 +
      f.uTurnCount * 15 +
      f.roundaboutCount * 5 +
      f.exitCount * 4 +
      f.rapidInstructionSequenceCount * 4,
  );

  const controlledIntersections =
    f.trafficSignalCount +
    f.stopSignCount +
    f.yieldSignCount +
    f.railwayCrossingCount * 2;

  const roadComplexity = clamp100(
    (controlledIntersections / km) * 12 +
      (f.intersectionCount / km) * 2.5,
  );

  const speedStress = clamp100(
    f.highSpeedDistanceRatio * 80 +
      (f.maxKnownSpeedKmh !== undefined && f.maxKnownSpeedKmh >= 110 ? 20 : 0),
  );

  const uncertainty = clamp100(
    f.liveVsTypicalDelayRatio * 200,
  );

  const components: CarSensoryComponents = {
    trafficStress,
    maneuverLoad,
    roadComplexity,
    speedStress,
    uncertainty,
  };

  const score = clamp100(
    trafficStress * 0.30 +
      maneuverLoad * 0.25 +
      roadComplexity * 0.20 +
      speedStress * 0.15 +
      uncertainty * 0.10,
  );

  return {
    version: "car-sensory-v1",
    experimental: true,
    score,
    components,
    features: f,
  };
}
