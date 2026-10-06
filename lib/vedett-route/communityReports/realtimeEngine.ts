// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE ENGINE (2026-10-06).
//
// Tiszta, determinisztikus függvények: friss report-rekordok + lekérdezési
// kulcs (trip / route / szakasz / geo_cell) -> állapot-fajtánkénti realtime
// közösségi állapot. Közvetlen input a későbbi rangsoroláshoz, routing
// penaltyhez, újratervezéshez és navigációs figyelmeztetéshez.
//
// Report-szintű bizonyíték:
//   e = freshness(kor, típus) * matchFactor(szint) * context_confidence
//       * (base_confidence / referencia)
//   (lejárt report: e = 0)
// Deduplikáció: azonos reporter_scope_token-ű reportok EGY független
// csoportot alkotnak, a csoport bizonyítéka a legerősebb tagjáé (max, nem összeg).
// Token nélküli (legacy) rekord saját csoport.
// Állapot:
//   E = Σ csoport-bizonyíték
//   confidence = min(cap, maxC * E / (E + K)) * ellen-bizonyíték-faktor,
//                ahol cap = singleReporterMax, ha csak 1 független csoport van
//   score (súlyosság 0..1) = csoport-bizonyítékkal súlyozott átlagos súlyosság
// Routing penalty (0..1) = kvantált(score * confidence * típussúly), csak
// küszöbök felett, egyébként 0.

import { getCommunityReportIntensity, type CommunityReportType } from "./config.ts";
import {
  ALLOWED_MATCH_LEVELS,
  COUNTER_EVIDENCE,
  DEFAULT_SEVERITY,
  FRESHNESS_HALF_LIFE_MINUTES,
  INTENSITY_SEVERITY,
  MATCH_LEVEL_FACTOR,
  REALTIME_CONFIDENCE_CONFIG,
  REALTIME_MATCH_LEVELS,
  REALTIME_ROUTING_PENALTY_CONFIG,
  REALTIME_STATE_KINDS,
  REPORT_TYPE_TO_STATE_KIND,
  type RealtimeMatchLevel,
  type RealtimeStateKind,
} from "./realtimeConfig.ts";

/** Egy DB-sor realtime szempontból releváns része (a szerver tölti fel). */
export interface RealtimeReportRecord {
  reportType: CommunityReportType;
  createdAt: string;
  expiresAt: string;
  intensity: number | null;
  /** v1 (legacy) soroknál a migráció alapértéke. */
  baseConfidence: number | null;
  contextConfidence: number | null;
  tripId: string | null;
  routeId: string | null;
  segmentKey: string | null;
  geoCell: string | null;
  /** Rövid életű, scope-olt dedup token; legacy soroknál null. SOHA nem hagyja el a szervert. */
  reporterToken: string | null;
}

export interface RealtimeStateQuery {
  tripId: string | null;
  routeId: string | null;
  segmentKey: string | null;
  geoCell: string | null;
  now: Date;
}

/** Publikus, aggregált állapot — nincs benne azonosító, koordináta, egyedi rekord. */
export interface CommunityRealtimeState {
  kind: RealtimeStateKind;
  /** Súlyosság 0..1. */
  score: number;
  /** 0..maxConfidence. */
  confidence: number;
  independentReportCount: number;
  freshestReportAgeSeconds: number;
  /** A hozzájáruló reportok legnagyobb intenzitása (csak ahol a UI ad intenzitást). */
  intensity: number | null;
  /** A legerősebb hozzájáruló egyezés szintje. */
  matchLevel: RealtimeMatchLevel;
  /** A legkésőbb lejáró hozzájáruló report lejárata (ISO). */
  expiresAt: string;
  /** Normalizált routing penalty 0..1 (0 = nincs hatás). */
  routingPenalty: number;
}

/** Belső magyarázat (tesztek / fejlesztői diagnosztika) — SOHA nem megy a kliensnek. */
export interface RealtimeStateBreakdown {
  kind: RealtimeStateKind;
  totalEvidence: number;
  counterEvidence: number;
  rawConfidence: number;
  capApplied: "none" | "single_reporter" | "max";
  groups: { evidence: number; severity: number; matchLevel: RealtimeMatchLevel; members: number }[];
}

export interface RealtimeEngineResult {
  states: CommunityRealtimeState[];
  breakdown?: RealtimeStateBreakdown[];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
// NaN / ±Infinity soha nem szivároghat ki: nem véges érték -> 0.
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Melyik szinten illeszkedik a rekord a lekérdezéshez (vagy null). */
export function resolveMatchLevel(record: RealtimeReportRecord, query: RealtimeStateQuery): RealtimeMatchLevel | null {
  const sameSegment = Boolean(query.segmentKey && record.segmentKey && query.segmentKey === record.segmentKey);
  if (query.tripId && record.tripId === query.tripId) return sameSegment ? "trip_segment" : "trip";
  if (query.routeId && record.routeId === query.routeId) {
    // Ugyanazon a vonalon, de MÁS (vagy ismeretlen) tripen.
    return sameSegment ? "route_segment" : "route";
  }
  // Földrajzi fallback KIZÁRÓLAG tisztán földrajzi lekérdezésnél.
  if (!query.tripId && !query.routeId && query.geoCell && record.geoCell === query.geoCell) return "area";
  return null;
}

export function realtimeFreshness(record: RealtimeReportRecord, now: Date): number {
  const created = new Date(record.createdAt).getTime();
  const expires = new Date(record.expiresAt).getTime();
  const t = now.getTime();
  if (!Number.isFinite(created) || !Number.isFinite(expires) || t >= expires || created > t) return 0;
  const kind = REPORT_TYPE_TO_STATE_KIND[record.reportType] ?? "quiet";
  const ageMinutes = (t - created) / 60_000;
  return Math.pow(0.5, ageMinutes / FRESHNESS_HALF_LIFE_MINUTES[kind]);
}

function severityOf(record: RealtimeReportRecord): number {
  const intensity = record.intensity ?? getCommunityReportIntensity(record.reportType);
  if (intensity === 1 || intensity === 2 || intensity === 3) return INTENSITY_SEVERITY[intensity];
  return DEFAULT_SEVERITY[record.reportType];
}

function reportEvidence(record: RealtimeReportRecord, level: RealtimeMatchLevel, now: Date): number {
  const contextConfidence = clamp01(record.contextConfidence ?? 0.2);
  const base = record.baseConfidence ?? REALTIME_CONFIDENCE_CONFIG.referenceBaseConfidence;
  const baseFactor = Math.min(2, Math.max(0, base / REALTIME_CONFIDENCE_CONFIG.referenceBaseConfidence));
  return realtimeFreshness(record, now) * MATCH_LEVEL_FACTOR[level] * contextConfidence * baseFactor;
}

interface ScoredRecord {
  record: RealtimeReportRecord;
  level: RealtimeMatchLevel;
  evidence: number;
  severity: number;
}

/** Független csoportok: azonos token = egy csoport (max bizonyíték); token nélkül saját csoport. */
function groupIndependent(scored: ScoredRecord[]): ScoredRecord[][] {
  const groups = new Map<string, ScoredRecord[]>();
  scored.forEach((item, index) => {
    const key = item.record.reporterToken ? `t:${item.record.reporterToken}` : `r:${index}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  });
  // Determinisztikus sorrend: kulcs szerint.
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, list]) => list);
}

function bestOf(group: ScoredRecord[]): ScoredRecord {
  return group.reduce((best, item) => (item.evidence > best.evidence ? item : best), group[0]);
}

export function quantizePenalty(value: number): number {
  const step = REALTIME_ROUTING_PENALTY_CONFIG.quantizationStep;
  return round3(clamp01(Math.floor(clamp01(value) / step + 1e-9) * step));
}

export function computeRealtimeRoutingPenalty(state: Omit<CommunityRealtimeState, "routingPenalty">): number {
  const cfg = REALTIME_ROUTING_PENALTY_CONFIG;
  if (state.confidence < cfg.minConfidence || state.independentReportCount < cfg.minIndependentReports) return 0;
  return quantizePenalty(state.score * state.confidence * cfg.kindWeight[state.kind]);
}

export function computeCommunityRealtimeState(
  records: readonly RealtimeReportRecord[],
  query: RealtimeStateQuery,
  options: { includeBreakdown?: boolean } = {}
): RealtimeEngineResult {
  const cfg = REALTIME_CONFIDENCE_CONFIG;
  const now = query.now;
  const states: CommunityRealtimeState[] = [];
  const breakdown: RealtimeStateBreakdown[] = [];

  for (const kind of REALTIME_STATE_KINDS) {
    const allowed = ALLOWED_MATCH_LEVELS[kind];
    const scoreRecords = (types: (type: CommunityReportType) => boolean): ScoredRecord[] =>
      records
        .filter((r) => types(r.reportType))
        .map((record) => {
          const level = resolveMatchLevel(record, query);
          if (!level || !allowed.includes(level)) return null;
          const evidence = reportEvidence(record, level, now);
          return evidence > 0 ? { record, level, evidence, severity: severityOf(record) } : null;
        })
        .filter((s): s is ScoredRecord => s !== null);

    const positive = scoreRecords((type) => REPORT_TYPE_TO_STATE_KIND[type] === kind);
    if (positive.length === 0) continue;
    const counterTypes = COUNTER_EVIDENCE[kind] ?? [];
    const counter = scoreRecords((type) => counterTypes.includes(type));

    const groups = groupIndependent(positive).map(bestOf);
    const independent = groups.filter((g) => g.evidence >= cfg.minEvidenceForIndependence);
    if (independent.length === 0) continue;
    const counterEvidence = groupIndependent(counter).map(bestOf).reduce((sum, g) => sum + g.evidence, 0);

    const totalEvidence = independent.reduce((sum, g) => sum + g.evidence, 0);
    const rawConfidence = (cfg.maxConfidence * totalEvidence) / (totalEvidence + cfg.evidenceSaturation);
    const cap = independent.length === 1 ? cfg.singleReporterMaxConfidence : cfg.maxConfidence;
    const capped = Math.min(cap, rawConfidence);
    const counterFactor = totalEvidence / (totalEvidence + cfg.counterEvidenceWeight * counterEvidence);
    const confidence = round3(capped * counterFactor);
    const score = round3(independent.reduce((sum, g) => sum + g.evidence * g.severity, 0) / totalEvidence);

    const contributing = independent.map((g) => g.record);
    const freshestCreated = Math.max(...contributing.map((r) => new Date(r.createdAt).getTime()));
    const latestExpiry = Math.max(...contributing.map((r) => new Date(r.expiresAt).getTime()));
    const intensities = contributing
      .map((r) => r.intensity ?? getCommunityReportIntensity(r.reportType))
      .filter((v): v is 1 | 2 | 3 => typeof v === "number");
    const matchLevel = REALTIME_MATCH_LEVELS.find((level) => independent.some((g) => g.level === level)) as RealtimeMatchLevel;

    const base = {
      kind,
      score,
      confidence,
      independentReportCount: independent.length,
      freshestReportAgeSeconds: Math.max(0, Math.round((now.getTime() - freshestCreated) / 1000)),
      intensity: intensities.length > 0 ? Math.max(...intensities) : null,
      matchLevel,
      expiresAt: new Date(latestExpiry).toISOString(),
    };
    states.push({ ...base, routingPenalty: computeRealtimeRoutingPenalty(base) });

    if (options.includeBreakdown) {
      breakdown.push({
        kind,
        totalEvidence: round3(totalEvidence),
        counterEvidence: round3(counterEvidence),
        rawConfidence: round3(rawConfidence),
        capApplied: rawConfidence > cap ? (cap === cfg.maxConfidence ? "max" : "single_reporter") : "none",
        groups: independent.map((g) => ({
          evidence: round3(g.evidence),
          severity: g.severity,
          matchLevel: g.level,
          members: positive.filter((p) => p.record.reporterToken && p.record.reporterToken === g.record.reporterToken).length || 1,
        })),
      });
    }
  }

  states.sort((a, b) => b.confidence - a.confidence || (a.kind < b.kind ? -1 : 1));
  return options.includeBreakdown ? { states, breakdown } : { states };
}

/** Összesített, korlátos routing penalty (0..1) egy lekérdezési kulcsra — a legerősebb állapot. */
export function aggregateRealtimeRoutingPenalty(states: readonly CommunityRealtimeState[]): number {
  return states.reduce((max, s) => Math.max(max, s.routingPenalty), 0);
}
