// VÉDETT ÚTVONAL — SENSORY & TRAFFIC INTELLIGENCE — friss állapot aggregáció.
//
// Egyszerű, determinisztikus, ML nélküli matek:
//   1. Csak AKTÍV (nem lejárt) megfigyelések számítanak.
//   2. Frissességi súly: w = sourceWeight * 0.5^(kor / felezési idő).
//   3. Dimenziónként: score = Σ w·v / Σ w (súlyozott átlag, 0..1).
//   4. Bizonyíték: E = Σ w; alap-confidence = E / (E + K)  (1 friss report -> 0.33).
//   5. Ellentmondás: súlyozott szórásnégyzet (max 0.25 a 0..1 skálán) arányában
//      csökken a confidence: conf = alap * (1 - penalty * var/0.25).
//   6. Felső korlát: maxConfidence.
// Üres bemenet -> minden szint "unknown", confidence 0, sample_count 0.

import {
  COMMUNITY_AGGREGATION_CONFIG,
  SENSORY_DIMENSIONS,
  TRAFFIC_DIMENSIONS,
  type TrafficDimension,
} from "./config.ts";
import type { TrafficObservation } from "./observation.ts";

export type CrowdingLevel = "unknown" | "low" | "medium" | "high" | "very_high";
export type SensoryLevel = "unknown" | "low" | "medium" | "high";

export interface DimensionAggregate {
  /** 0..1 súlyozott pontszám, vagy null, ha nincs adat. */
  score: number | null;
  confidence: number;
  sampleCount: number;
}

export interface TrafficStateAggregate {
  crowding: CrowdingLevel;
  sensory: SensoryLevel;
  /** Összesített confidence 0..1 (a dimenziók bizonyíték-súlyozott átlaga). */
  confidence: number;
  /** Az aggregációba bekerült aktív megfigyelések száma. */
  sampleCount: number;
  dimensions: Record<TrafficDimension, DimensionAggregate>;
  /** A négy szenzoros dimenzió összevont jelzése (megfigyelésenként a max). */
  sensoryCombined: DimensionAggregate;
}

export interface AggregationOptions {
  now: Date;
  halfLifeMinutes?: number;
  evidenceSaturation?: number;
  disagreementPenalty?: number;
  maxConfidence?: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function freshnessWeight(observedAt: string, now: Date, halfLifeMinutes: number = COMMUNITY_AGGREGATION_CONFIG.freshnessHalfLifeMinutes): number {
  const ageMinutes = Math.max(0, (now.getTime() - new Date(observedAt).getTime()) / 60_000);
  if (!Number.isFinite(ageMinutes)) return 0;
  return Math.pow(0.5, ageMinutes / halfLifeMinutes);
}

function isActive(observation: TrafficObservation, now: Date): boolean {
  const observedAt = new Date(observation.observedAt).getTime();
  if (!Number.isFinite(observedAt) || observedAt > now.getTime()) return false;
  if (observation.expiresAt === null) return true;
  const expiresAt = new Date(observation.expiresAt).getTime();
  return Number.isFinite(expiresAt) && now.getTime() < expiresAt;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function aggregateValues(samples: { value: number; weight: number }[], options: Required<Omit<AggregationOptions, "now">>): DimensionAggregate {
  const usable = samples.filter((s) => s.weight > 0 && Number.isFinite(s.value));
  if (usable.length === 0) return { score: null, confidence: 0, sampleCount: 0 };
  const evidence = usable.reduce((sum, s) => sum + s.weight, 0);
  const mean = usable.reduce((sum, s) => sum + s.weight * clamp01(s.value), 0) / evidence;
  const variance = usable.reduce((sum, s) => sum + s.weight * (clamp01(s.value) - mean) ** 2, 0) / evidence;
  const base = evidence / (evidence + options.evidenceSaturation);
  const agreement = 1 - options.disagreementPenalty * Math.min(1, variance / 0.25);
  const confidence = Math.min(options.maxConfidence, Math.max(0, base * agreement));
  return { score: round(mean), confidence: round(confidence), sampleCount: usable.length };
}

export function crowdingLevelFromScore(score: number | null): CrowdingLevel {
  if (score === null) return "unknown";
  if (score < 0.25) return "low";
  if (score < 0.55) return "medium";
  if (score < 0.85) return "high";
  return "very_high";
}

export function sensoryLevelFromScore(score: number | null): SensoryLevel {
  if (score === null) return "unknown";
  if (score < 0.34) return "low";
  if (score < 0.67) return "medium";
  return "high";
}

export function aggregateTrafficObservations(observations: readonly TrafficObservation[], options: AggregationOptions): TrafficStateAggregate {
  const resolved = {
    halfLifeMinutes: options.halfLifeMinutes ?? COMMUNITY_AGGREGATION_CONFIG.freshnessHalfLifeMinutes,
    evidenceSaturation: options.evidenceSaturation ?? COMMUNITY_AGGREGATION_CONFIG.evidenceSaturation,
    disagreementPenalty: options.disagreementPenalty ?? COMMUNITY_AGGREGATION_CONFIG.disagreementPenalty,
    maxConfidence: options.maxConfidence ?? COMMUNITY_AGGREGATION_CONFIG.maxConfidence,
  };
  const active = observations.filter((o) => isActive(o, options.now));
  const weighted = active.map((o) => ({
    observation: o,
    weight: (o.sourceWeight ?? 1) * freshnessWeight(o.observedAt, options.now, resolved.halfLifeMinutes),
  }));

  const dimensions = {} as Record<TrafficDimension, DimensionAggregate>;
  for (const dimension of TRAFFIC_DIMENSIONS) {
    const samples = weighted
      .filter(({ observation }) => typeof observation.signals[dimension] === "number")
      .map(({ observation, weight }) => ({ value: observation.signals[dimension] as number, weight }));
    dimensions[dimension] = aggregateValues(samples, resolved);
  }

  const sensorySamples = weighted
    .map(({ observation, weight }) => {
      const values = SENSORY_DIMENSIONS.map((d) => observation.signals[d]).filter((v): v is number => typeof v === "number");
      return values.length > 0 ? { value: Math.max(...values), weight } : null;
    })
    .filter((s): s is { value: number; weight: number } => s !== null);
  const sensoryCombined = aggregateValues(sensorySamples, resolved);

  // Összesített confidence: a releváns (adattal bíró) fő jelzések bizonyíték-súlyozott átlaga.
  const parts = [dimensions.crowding, sensoryCombined, dimensions.traffic_disruption].filter((d) => d.sampleCount > 0);
  const totalSamples = parts.reduce((sum, d) => sum + d.sampleCount, 0);
  const confidence = totalSamples === 0 ? 0 : round(parts.reduce((sum, d) => sum + d.confidence * d.sampleCount, 0) / totalSamples);

  return {
    crowding: crowdingLevelFromScore(dimensions.crowding.score),
    sensory: sensoryLevelFromScore(sensoryCombined.score),
    confidence,
    sampleCount: active.length,
    dimensions,
    sensoryCombined,
  };
}
