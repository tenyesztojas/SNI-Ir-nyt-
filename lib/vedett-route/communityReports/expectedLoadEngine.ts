// VÉDETT ÚTVONAL — EXPECTED COMMUNITY / SENSORY LOAD ENGINE (2026-10-06).
//
// getExpectedCommunityLoad(): historikus profilokból (LoadProfile) egy
// route+szakasz+időpont kontextusra fajtánként várható terhelés, óvatos
// időbeli fallbackkel. combineCommunityLoad(): historikus baseline + friss
// realtime állapot -> pillanatnyi becslés. evaluateCommunityLoad(): mindkettő
// + korlátos routing penalty kimenet. Tiszta, determinisztikus függvények —
// a jelenlegi statisztikai modell később ML-re cserélhető, a kimeneti típusok
// változtatása nélkül.
//
// KULCSELV: "nincs adat" (status = insufficient, expectedScore = null) és
// "várhatóan nyugodt" (expectedScore ≈ 0, használható confidence) KÉT KÜLÖN állapot.

import {
  ADJACENT_BUCKET_RADIUS,
  ADJACENT_BUCKET_WEIGHT,
  LOAD_COMBINER_CONFIG,
  ROUTE_FALLBACK_KINDS,
  TIME_FALLBACK_CONFIDENCE_FACTOR,
  TIME_FALLBACK_LEVELS,
  dayTypeOfWeekday,
  type DataQuality,
  type DayType,
  type TimeFallbackLevel,
} from "./historicalConfig.ts";
import { classifyDataQuality, dataQualityRank, historicalConfidence, type LoadProfile } from "./historicalAggregation.ts";
import { computeCommunityReportTimeKeys } from "./context.ts";
import { REALTIME_ROUTING_PENALTY_CONFIG, REALTIME_STATE_KINDS, type RealtimeStateKind } from "./realtimeConfig.ts";
import {
  computeCommunityRealtimeState,
  computeRealtimeCounterSignals,
  quantizePenalty,
  type CommunityRealtimeState,
  type RealtimeReportRecord,
} from "./realtimeEngine.ts";

export interface ExpectedLoadContext {
  routeId: string;
  segmentKey: string | null;
  tripId: string | null;
  /** Tervezett indulás / érintés ideje; "most" esetén a jelen. */
  at: Date;
}

export interface HistoricalExpectation {
  kind: RealtimeStateKind;
  source: "historical";
  status: DataQuality;
  /** null = nincs elég adat (NEM 0 terhelés). */
  expectedScore: number | null;
  confidence: number;
  sampleStrength: number;
  sampleCount: number;
  distinctDays: number;
  fallbackLevel: TimeFallbackLevel | null;
}

export interface CombinedLoad {
  score: number | null;
  confidence: number;
  realtimeApplied: boolean;
}

export interface KindLoadEvaluation {
  kind: RealtimeStateKind;
  historical: HistoricalExpectation;
  realtime: { score: number; confidence: number; independentReportCount: number } | null;
  combined: CombinedLoad;
  historicalPenalty: number;
  realtimePenalty: number;
  combinedPenalty: number;
}

export interface CommunityLoadEvaluation {
  weekday: number;
  dayType: DayType;
  timeBucket: number;
  realtimeApplicable: boolean;
  kinds: KindLoadEvaluation[];
  /** Routing adapter bemenet — mind 0..1, korlátos. */
  routing: {
    historicalPenalty: number;
    realtimePenalty: number;
    combinedPenalty: number;
    confidence: number;
    /** "insufficient": nincs használható historikus adat — NEM jelent 0 terhelést. */
    historicalDataQuality: DataQuality;
  };
}

/** Belső magyarázat (teszt / fejlesztői diagnosztika) — kliensnek SOHA. */
export interface LoadEvaluationBreakdown {
  kind: RealtimeStateKind;
  levels: { level: TimeFallbackLevel; profiles: number; sampleStrength: number; confidence: number; quality: DataQuality }[];
  chosenLevel: TimeFallbackLevel | null;
  historicalConfidence: number;
  realtimeConfidence: number | null;
  realtimeQuietConfidence: number | null;
  combinedScore: number | null;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function weekdaysOfDayType(dayType: DayType): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((d) => dayTypeOfWeekday(d) === dayType);
}

function selectForLevel(
  level: TimeFallbackLevel,
  profiles: readonly LoadProfile[],
  kind: RealtimeStateKind,
  ctx: ExpectedLoadContext,
  weekday: number,
  bucket: number
): { profile: LoadProfile; weight: number }[] {
  const dayType = dayTypeOfWeekday(weekday);
  const segmentLevel = level === "exact" || level === "adjacent_time" || level === "day_type";
  if (segmentLevel && !ctx.segmentKey) return [];
  if (!segmentLevel && !ROUTE_FALLBACK_KINDS.includes(kind)) return [];
  const sameDayOnly = level === "exact" || level === "adjacent_time" || level === "route_adjacent_time";
  const radius = level === "exact" ? 0 : ADJACENT_BUCKET_RADIUS;
  const days = sameDayOnly ? [weekday] : weekdaysOfDayType(dayType);
  return profiles
    .filter(
      (p) =>
        p.kind === kind &&
        p.routeId === ctx.routeId &&
        (segmentLevel ? p.scopeType === "route_segment" && p.segmentKey === ctx.segmentKey : p.scopeType === "route") &&
        days.includes(p.weekday) &&
        Math.abs(p.timeBucket - bucket) <= radius
    )
    .map((profile) => ({ profile, weight: profile.timeBucket === bucket ? 1 : ADJACENT_BUCKET_WEIGHT }));
}

function summarize(selected: { profile: LoadProfile; weight: number }[], level: TimeFallbackLevel) {
  const strength = selected.reduce((s, x) => s + x.weight * x.profile.effectiveSampleStrength, 0);
  const scoreSum = selected.reduce((s, x) => s + x.weight * x.profile.weightedScoreSum, 0);
  const sampleCount = selected.reduce((s, x) => s + x.profile.sampleCount, 0);
  // Konzervatív: a független napok száma a legtöbbet látott profilé (nem összeg).
  const distinctDays = selected.reduce((m, x) => Math.max(m, x.profile.distinctDays), 0);
  const stats = { sampleCount, distinctDays, effectiveSampleStrength: strength };
  const confidence = r3(historicalConfidence(stats) * TIME_FALLBACK_CONFIDENCE_FACTOR[level]);
  const quality = selected.length === 0 ? "insufficient" : classifyDataQuality(stats, confidence);
  return { strength, scoreSum, sampleCount, distinctDays, confidence, quality };
}

export function getExpectedCommunityLoad(
  profiles: readonly LoadProfile[],
  ctx: ExpectedLoadContext,
  kind: RealtimeStateKind,
  breakdown?: LoadEvaluationBreakdown["levels"]
): HistoricalExpectation {
  const keys = computeCommunityReportTimeKeys(ctx.at);
  let best: (ReturnType<typeof summarize> & { level: TimeFallbackLevel }) | null = null;
  for (const level of TIME_FALLBACK_LEVELS) {
    const selected = selectForLevel(level, profiles, kind, ctx, keys.weekday, keys.timeBucket);
    if (selected.length === 0) continue;
    const s = { ...summarize(selected, level), level };
    breakdown?.push({ level, profiles: selected.length, sampleStrength: r3(s.strength), confidence: s.confidence, quality: s.quality });
    if (!best || dataQualityRank(s.quality) > dataQualityRank(best.quality)) best = s;
    if (dataQualityRank(s.quality) >= dataQualityRank("usable")) {
      best = s;
      break;
    }
  }
  if (!best) {
    return { kind, source: "historical", status: "insufficient", expectedScore: null, confidence: 0, sampleStrength: 0, sampleCount: 0, distinctDays: 0, fallbackLevel: null };
  }
  const insufficient = best.quality === "insufficient";
  return {
    kind,
    source: "historical",
    status: best.quality,
    expectedScore: insufficient || best.strength <= 0 ? null : r3(clamp01(best.scoreSum / best.strength)),
    confidence: insufficient ? 0 : best.confidence,
    sampleStrength: r3(best.strength),
    sampleCount: best.sampleCount,
    distinctDays: best.distinctDays,
    fallbackLevel: best.level,
  };
}

/**
 * Historikus baseline + realtime korrekció. Súlyozott átlag:
 *   baseline (expectedScore, w = histConf)
 *   realtime pozitív (score, w = rtConf * boost)
 *   realtime "Nyugodt" (0, w = quietConf * boost)
 * A gyenge (minRealtimeConfidence alatti) realtime jelzés figyelmen kívül marad,
 * így nem írja felül a baseline-t; az erős, friss, pontos jelzés viszont dominál.
 */
export function combineCommunityLoad(
  historical: HistoricalExpectation,
  realtime: { score: number; confidence: number } | null,
  realtimeQuietConfidence: number | null
): CombinedLoad {
  const cfg = LOAD_COMBINER_CONFIG;
  const parts: { value: number; weight: number }[] = [];
  if (historical.expectedScore !== null && historical.confidence > 0) parts.push({ value: historical.expectedScore, weight: historical.confidence });
  let appliedRealtimeConfidence = 0;
  if (realtime && realtime.confidence >= cfg.minRealtimeConfidence) {
    parts.push({ value: clamp01(realtime.score), weight: realtime.confidence * cfg.realtimeWeightBoost });
    appliedRealtimeConfidence = Math.max(appliedRealtimeConfidence, realtime.confidence);
  }
  if (realtimeQuietConfidence !== null && realtimeQuietConfidence >= cfg.minRealtimeConfidence) {
    parts.push({ value: 0, weight: realtimeQuietConfidence * cfg.realtimeWeightBoost });
    appliedRealtimeConfidence = Math.max(appliedRealtimeConfidence, realtimeQuietConfidence);
  }
  const realtimeApplied = appliedRealtimeConfidence > 0;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight <= 0) return { score: null, confidence: 0, realtimeApplied: false };
  const score = r3(clamp01(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight));
  const confidence = r3(Math.min(cfg.maxCombinedConfidence, 1 - (1 - historical.confidence) * (1 - appliedRealtimeConfidence)));
  return { score, confidence, realtimeApplied };
}

function kindWeight(kind: RealtimeStateKind): number {
  return REALTIME_ROUTING_PENALTY_CONFIG.kindWeight[kind];
}

export function historicalPenaltyOf(h: HistoricalExpectation): number {
  if (h.expectedScore === null || dataQualityRank(h.status) < dataQualityRank("usable")) return 0;
  return quantizePenalty(h.expectedScore * h.confidence * kindWeight(h.kind));
}

export function combinedPenaltyOf(kind: RealtimeStateKind, c: CombinedLoad): number {
  if (c.score === null || c.confidence < LOAD_COMBINER_CONFIG.minCombinedConfidenceForPenalty) return 0;
  return quantizePenalty(c.score * c.confidence * kindWeight(kind));
}

export function isRealtimeApplicable(at: Date, now: Date): boolean {
  return Math.abs(at.getTime() - now.getTime()) <= LOAD_COMBINER_CONFIG.realtimeHorizonMinutes * 60_000;
}

export function evaluateCommunityLoad(
  input: { context: ExpectedLoadContext; profiles: readonly LoadProfile[]; realtimeRecords: readonly RealtimeReportRecord[]; now: Date },
  options: { includeBreakdown?: boolean } = {}
): { evaluation: CommunityLoadEvaluation; breakdown?: LoadEvaluationBreakdown[] } {
  const { context: ctx, now } = input;
  const keys = computeCommunityReportTimeKeys(ctx.at);
  const realtimeApplicable = isRealtimeApplicable(ctx.at, now);
  const rtQuery = { tripId: ctx.tripId, routeId: ctx.routeId, segmentKey: ctx.segmentKey, geoCell: null, now };
  const rtStates: CommunityRealtimeState[] = realtimeApplicable ? computeCommunityRealtimeState(input.realtimeRecords, rtQuery).states : [];
  const rtQuiet = realtimeApplicable ? computeRealtimeCounterSignals(input.realtimeRecords, rtQuery) : {};

  const kinds: KindLoadEvaluation[] = [];
  const breakdown: LoadEvaluationBreakdown[] = [];
  for (const kind of REALTIME_STATE_KINDS) {
    const levels: LoadEvaluationBreakdown["levels"] = [];
    const historical = getExpectedCommunityLoad(input.profiles, ctx, kind, options.includeBreakdown ? levels : undefined);
    const rt = rtStates.find((s) => s.kind === kind) ?? null;
    const quiet = rtQuiet[kind]?.confidence ?? null;
    if (historical.fallbackLevel === null && !rt && quiet === null) continue;
    const combined = combineCommunityLoad(historical, rt ? { score: rt.score, confidence: rt.confidence } : null, quiet);
    kinds.push({
      kind,
      historical,
      realtime: rt ? { score: rt.score, confidence: rt.confidence, independentReportCount: rt.independentReportCount } : null,
      combined,
      historicalPenalty: historicalPenaltyOf(historical),
      realtimePenalty: rt ? rt.routingPenalty : 0,
      combinedPenalty: combinedPenaltyOf(kind, combined),
    });
    if (options.includeBreakdown) {
      breakdown.push({
        kind,
        levels,
        chosenLevel: historical.fallbackLevel,
        historicalConfidence: historical.confidence,
        realtimeConfidence: rt?.confidence ?? null,
        realtimeQuietConfidence: quiet,
        combinedScore: combined.score,
      });
    }
  }

  const best = kinds.reduce<DataQuality>((q, k) => (dataQualityRank(k.historical.status) > dataQualityRank(q) ? k.historical.status : q), "insufficient");
  const evaluation: CommunityLoadEvaluation = {
    weekday: keys.weekday,
    dayType: dayTypeOfWeekday(keys.weekday),
    timeBucket: keys.timeBucket,
    realtimeApplicable,
    kinds,
    routing: {
      historicalPenalty: kinds.reduce((m, k) => Math.max(m, k.historicalPenalty), 0),
      realtimePenalty: kinds.reduce((m, k) => Math.max(m, k.realtimePenalty), 0),
      combinedPenalty: kinds.reduce((m, k) => Math.max(m, k.combinedPenalty), 0),
      confidence: kinds.reduce((m, k) => Math.max(m, k.combined.confidence), 0),
      historicalDataQuality: best,
    },
  };
  return options.includeBreakdown ? { evaluation, breakdown } : { evaluation };
}
