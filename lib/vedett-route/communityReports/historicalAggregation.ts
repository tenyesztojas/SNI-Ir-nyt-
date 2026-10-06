// VÉDETT ÚTVONAL — HISTORICAL SENSORY LOAD — aggregáció (tiszta függvények).
//
// Két lépcső, mindkettő determinisztikus és idempotens:
//   1. buildDailyLoadPartials(): egy szolgáltatási nap nyers reportjaiból napi
//      részaggregátumok (decay NÉLKÜL). Ez a tartós "igazságforrás": a nyers
//      reportok később (retention) törölhetők, a napi aggregátum marad.
//      A reporter token CSAK itt, a deduplikációhoz kell — a kimenetben nincs.
//   2. buildLoadProfiles(): a napi részaggregátumokból egy adott napra (asOf)
//      vonatkozó, lassú decay-jel súlyozott profil (hét napja + 15 perces sáv).
// Ugyanaz az input -> bitre ugyanaz az output (rendezett, kerekített).

import type { CommunityReportType } from "./config.ts";
import { getCommunityReportIntensity } from "./config.ts";
import {
  COUNTER_EVIDENCE,
  DEFAULT_SEVERITY,
  INTENSITY_SEVERITY,
  REPORT_TYPE_TO_STATE_KIND,
  type RealtimeStateKind,
} from "./realtimeConfig.ts";
import {
  DATA_QUALITY_LEVELS,
  HISTORICAL_CONFIDENCE,
  HISTORICAL_DECAY,
  HISTORICAL_SOURCE,
  HISTORICAL_WEIGHTS,
  dayTypeOfWeekday,
  type DataQuality,
  type DayType,
  type LoadScopeType,
} from "./historicalConfig.ts";

/** Egy nyers report historikusan releváns része (szerver tölti, a DB-sorból). */
export interface HistoricalReportRow {
  id: string;
  reportType: CommunityReportType;
  createdAt: string;
  serviceDate: string;
  weekday: number;
  timeBucket: number;
  intensity: number | null;
  contextConfidence: number | null;
  routeId: string | null;
  segmentKey: string | null;
  /** Csak a deduplikációhoz; a kimenetbe SOHA nem kerül. */
  reporterToken: string | null;
}

export interface LoadKeyBase {
  source: typeof HISTORICAL_SOURCE;
  scopeType: LoadScopeType;
  routeId: string;
  /** "" a vonal-szintű (route) hatókörnél. */
  segmentKey: string;
  weekday: number;
  timeBucket: number;
  kind: RealtimeStateKind;
}

export interface DailyLoadPartial extends LoadKeyBase {
  serviceDate: string;
  sampleCount: number;
  legacySampleCount: number;
  strength: number;
  scoreSum: number;
  positiveStrength: number;
  negativeStrength: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface LoadProfile extends LoadKeyBase {
  dayType: DayType;
  sampleCount: number;
  distinctDays: number;
  effectiveSampleStrength: number;
  weightedScoreSum: number;
  positiveStrength: number;
  negativeStrength: number;
  expectedScore: number | null;
  confidence: number;
  dataQuality: DataQuality;
  firstObservedAt: string;
  lastObservedAt: string;
  computedForDate: string;
}

const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function historicalSeverity(type: CommunityReportType, intensity: number | null): number {
  const level = intensity ?? getCommunityReportIntensity(type);
  if (level === 1 || level === 2 || level === 3) return INTENSITY_SEVERITY[level];
  return DEFAULT_SEVERITY[type];
}

/** Mely (fajta, érték) mintákat ad egy report: pozitív jelzés, vagy "Nyugodt" ellen-bizonyíték. */
export function historicalSignalsOf(type: CommunityReportType, intensity: number | null): { kind: RealtimeStateKind; value: number; polarity: "pos" | "neg" }[] {
  const kind = REPORT_TYPE_TO_STATE_KIND[type];
  if (kind) return [{ kind, value: historicalSeverity(type, intensity), polarity: "pos" }];
  return (Object.entries(COUNTER_EVIDENCE) as [RealtimeStateKind, CommunityReportType[]][])
    .filter(([, counters]) => counters.includes(type))
    .map(([counterKind]) => ({ kind: counterKind, value: 0, polarity: "neg" as const }));
}

export function loadKeyString(key: LoadKeyBase): string {
  return [key.source, key.scopeType, key.routeId, key.segmentKey, key.weekday, key.timeBucket, key.kind].join("|");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 1. lépcső: egy nap nyers reportjai -> napi részaggregátumok.
 * Deduplikáció: azonos (kulcs, reporter token, polaritás) csoportból CSAK a
 * legerősebb minta számít (az ismétlés nem növeli a sample_countot). Token
 * nélküli (legacy) sor saját csoport, de legacyWeight súllyal.
 */
export function buildDailyLoadPartials(rows: readonly HistoricalReportRow[]): DailyLoadPartial[] {
  type Candidate = { key: LoadKeyBase; serviceDate: string; weight: number; value: number; polarity: "pos" | "neg"; legacy: boolean; createdAt: string; lastAt: string; id: string };
  const groups = new Map<string, Candidate>();

  const sortedRows = [...rows].sort((a, b) => compare(a.id, b.id));
  for (const row of sortedRows) {
    if (!row.routeId) continue; // vonal nélkül nincs historikus kulcs (dokumentált korlát)
    const legacy = !row.reporterToken;
    const contextConfidence = clamp01(row.contextConfidence ?? HISTORICAL_WEIGHTS.defaultContextConfidence);
    const scopes: { scopeType: LoadScopeType; segmentKey: string }[] = [];
    if (row.segmentKey) scopes.push({ scopeType: "route_segment", segmentKey: row.segmentKey });
    scopes.push({ scopeType: "route", segmentKey: "" });

    for (const signal of historicalSignalsOf(row.reportType, row.intensity)) {
      for (const scope of scopes) {
        const key: LoadKeyBase = {
          source: HISTORICAL_SOURCE,
          scopeType: scope.scopeType,
          routeId: row.routeId,
          segmentKey: scope.segmentKey,
          weekday: row.weekday,
          timeBucket: row.timeBucket,
          kind: signal.kind,
        };
        const weight = contextConfidence * HISTORICAL_WEIGHTS.scopeQuality[scope.scopeType] * (legacy ? HISTORICAL_WEIGHTS.legacyWeight : 1);
        if (weight <= 0) continue;
        const dedup = legacy ? `row:${row.id}` : `tok:${row.reporterToken}`;
        const groupKey = `${loadKeyString(key)}#${row.serviceDate}#${signal.polarity}#${dedup}`;
        const candidate: Candidate = { key, serviceDate: row.serviceDate, weight, value: signal.value, polarity: signal.polarity, legacy, createdAt: row.createdAt, lastAt: row.createdAt, id: row.id };
        const existing = groups.get(groupKey);
        // A csoport időtartománya (első/utolsó megfigyelés) minden tagot lefed.
        const firstAt = existing && compare(existing.createdAt, candidate.createdAt) < 0 ? existing.createdAt : candidate.createdAt;
        const lastAt = existing && compare(existing.lastAt, candidate.lastAt) > 0 ? existing.lastAt : candidate.lastAt;
        const winner =
          !existing || candidate.weight > existing.weight || (candidate.weight === existing.weight && candidate.value > existing.value)
            ? candidate
            : existing;
        groups.set(groupKey, { ...winner, createdAt: firstAt, lastAt });
      }
    }
  }

  const partials = new Map<string, DailyLoadPartial>();
  for (const candidate of [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([, c]) => c)) {
    const id = `${loadKeyString(candidate.key)}#${candidate.serviceDate}`;
    const current = partials.get(id) ?? {
      ...candidate.key,
      serviceDate: candidate.serviceDate,
      sampleCount: 0,
      legacySampleCount: 0,
      strength: 0,
      scoreSum: 0,
      positiveStrength: 0,
      negativeStrength: 0,
      firstObservedAt: candidate.createdAt,
      lastObservedAt: candidate.lastAt,
    };
    current.sampleCount += 1;
    if (candidate.legacy) current.legacySampleCount += 1;
    current.strength += candidate.weight;
    current.scoreSum += candidate.weight * candidate.value;
    if (candidate.polarity === "pos") current.positiveStrength += candidate.weight;
    else current.negativeStrength += candidate.weight;
    if (compare(candidate.createdAt, current.firstObservedAt) < 0) current.firstObservedAt = candidate.createdAt;
    if (compare(candidate.lastAt, current.lastObservedAt) > 0) current.lastObservedAt = candidate.lastAt;
    partials.set(id, current);
  }

  return [...partials.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, p]) => ({
      ...p,
      strength: r4(p.strength),
      scoreSum: r4(p.scoreSum),
      positiveStrength: r4(p.positiveStrength),
      negativeStrength: r4(p.negativeStrength),
    }));
}

export function serviceDateAgeDays(serviceDate: string, asOfDate: string): number {
  const a = Date.parse(`${serviceDate}T00:00:00Z`);
  const b = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

export function historicalDecayWeight(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > HISTORICAL_DECAY.historyWindowDays) return 0;
  return Math.pow(0.5, ageDays / HISTORICAL_DECAY.halfLifeDays);
}

export interface SampleStats {
  sampleCount: number;
  distinctDays: number;
  effectiveSampleStrength: number;
}

export function historicalConfidence(stats: SampleStats): number {
  const c = HISTORICAL_CONFIDENCE;
  const s = Math.max(0, stats.effectiveSampleStrength);
  const dayFactor = Math.min(1, stats.distinctDays / c.fullConfidenceDays);
  return r4(clamp01(c.maxConfidence * (s / (s + c.strengthSaturation)) * dayFactor));
}

export function classifyDataQuality(stats: SampleStats, confidence: number): DataQuality {
  const c = HISTORICAL_CONFIDENCE;
  if (stats.sampleCount < c.minSampleCount || stats.distinctDays < c.minDistinctDays || stats.effectiveSampleStrength < c.minEffectiveStrength) {
    return "insufficient";
  }
  if (confidence >= c.strongMinConfidence && stats.distinctDays >= c.strongMinDistinctDays) return "strong";
  if (confidence >= c.usableMinConfidence) return "usable";
  return "low";
}

export function dataQualityRank(quality: DataQuality): number {
  return DATA_QUALITY_LEVELS.indexOf(quality);
}

/** 2. lépcső: napi részaggregátumok -> decayed profilok egy adott napra. */
export function buildLoadProfiles(partials: readonly DailyLoadPartial[], asOfDate: string): LoadProfile[] {
  const groups = new Map<string, LoadProfile & { days: Set<string> }>();
  const sorted = [...partials].sort((a, b) => compare(`${loadKeyString(a)}#${a.serviceDate}`, `${loadKeyString(b)}#${b.serviceDate}`));
  for (const p of sorted) {
    const decay = historicalDecayWeight(serviceDateAgeDays(p.serviceDate, asOfDate));
    if (decay <= 0 || p.sampleCount <= 0) continue;
    const id = loadKeyString(p);
    const g =
      groups.get(id) ??
      ({
        source: p.source,
        scopeType: p.scopeType,
        routeId: p.routeId,
        segmentKey: p.segmentKey,
        weekday: p.weekday,
        timeBucket: p.timeBucket,
        kind: p.kind,
        dayType: dayTypeOfWeekday(p.weekday),
        sampleCount: 0,
        distinctDays: 0,
        effectiveSampleStrength: 0,
        weightedScoreSum: 0,
        positiveStrength: 0,
        negativeStrength: 0,
        expectedScore: null,
        confidence: 0,
        dataQuality: "insufficient",
        firstObservedAt: p.firstObservedAt,
        lastObservedAt: p.lastObservedAt,
        computedForDate: asOfDate,
        days: new Set<string>(),
      } as LoadProfile & { days: Set<string> });
    g.sampleCount += p.sampleCount;
    g.days.add(p.serviceDate);
    g.effectiveSampleStrength += p.strength * decay;
    g.weightedScoreSum += p.scoreSum * decay;
    g.positiveStrength += p.positiveStrength * decay;
    g.negativeStrength += p.negativeStrength * decay;
    if (compare(p.firstObservedAt, g.firstObservedAt) < 0) g.firstObservedAt = p.firstObservedAt;
    if (compare(p.lastObservedAt, g.lastObservedAt) > 0) g.lastObservedAt = p.lastObservedAt;
    groups.set(id, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, g]) => {
      const { days, ...profile } = g;
      const stats = { sampleCount: profile.sampleCount, distinctDays: days.size, effectiveSampleStrength: profile.effectiveSampleStrength };
      const confidence = historicalConfidence(stats);
      return {
        ...profile,
        distinctDays: days.size,
        effectiveSampleStrength: r4(profile.effectiveSampleStrength),
        weightedScoreSum: r4(profile.weightedScoreSum),
        positiveStrength: r4(profile.positiveStrength),
        negativeStrength: r4(profile.negativeStrength),
        expectedScore: profile.effectiveSampleStrength > 0 ? r4(clamp01(profile.weightedScoreSum / profile.effectiveSampleStrength)) : null,
        confidence,
        dataQuality: classifyDataQuality(stats, confidence),
      };
    });
}
