// VÉDETT ÚTVONAL — HISTORICAL SENSORY LOAD — Supabase tároló (KIZÁRÓLAG szerver).
// service_role kliens; a táblák RLS-e fail-closed. Hibaüzenetet nem logolunk
// adattartalommal (azonosító, token, koordináta soha nem kerül logba).

import { createAdminClient } from "@/lib/supabase/admin";
import { AGGREGATION_JOB, HISTORICAL_MODEL_VERSION } from "./historicalConfig.ts";
import type { DailyLoadPartial, HistoricalReportRow, LoadProfile } from "./historicalAggregation.ts";
import type { CommunityLoadStore } from "./historicalJob.ts";
import type { CommunityReportType } from "./config.ts";
import type { RealtimeStateKind } from "./realtimeConfig.ts";
import type { DataQuality, DayType, LoadScopeType } from "./historicalConfig.ts";

const RAW = "vedett_route_community_reports";
const DAILY = "vedett_route_community_load_daily";
const PROFILES = "vedett_route_community_load_profiles";
const DAYS = "vedett_route_community_load_days";
const DAILY_CONFLICT = "source,scope_type,route_id,segment_key,service_date,time_bucket,kind";
const PROFILE_CONFLICT = "source,scope_type,route_id,segment_key,weekday,time_bucket,kind";
const CHUNK = 500;

function fail(step: string): never {
  console.error(`[vedett-route] community load store failed: ${step}`);
  throw new Error(step);
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

interface ProfileRow {
  source: "community";
  scope_type: LoadScopeType;
  route_id: string;
  segment_key: string;
  weekday: number;
  day_type: DayType;
  time_bucket: number;
  kind: RealtimeStateKind;
  sample_count: number;
  distinct_days: number;
  effective_sample_strength: number;
  weighted_score_sum: number;
  positive_strength: number;
  negative_strength: number;
  expected_score: number | null;
  confidence: number;
  data_quality: DataQuality;
  first_observed_at: string;
  last_observed_at: string;
  computed_for_date: string;
}

export function mapProfileRow(row: ProfileRow): LoadProfile {
  return {
    source: row.source,
    scopeType: row.scope_type,
    routeId: row.route_id,
    segmentKey: row.segment_key,
    weekday: row.weekday,
    timeBucket: row.time_bucket,
    kind: row.kind,
    dayType: row.day_type,
    sampleCount: row.sample_count,
    distinctDays: row.distinct_days,
    effectiveSampleStrength: Number(row.effective_sample_strength),
    weightedScoreSum: Number(row.weighted_score_sum),
    positiveStrength: Number(row.positive_strength),
    negativeStrength: Number(row.negative_strength),
    expectedScore: row.expected_score === null ? null : Number(row.expected_score),
    confidence: Number(row.confidence),
    dataQuality: row.data_quality,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    computedForDate: row.computed_for_date,
  };
}

export function createSupabaseCommunityLoadStore(): CommunityLoadStore {
  const db = createAdminClient();
  return {
    async listBuiltDays(dates) {
      if (dates.length === 0) return new Set();
      const { data, error } = await db.from(DAYS).select("service_date").in("service_date", [...dates]);
      if (error) fail("list_built_days");
      return new Set((data ?? []).map((r: { service_date: string }) => r.service_date));
    },
    async fetchRawReportsForDay(serviceDate) {
      const out: HistoricalReportRow[] = [];
      for (let offset = 0; ; offset += AGGREGATION_JOB.pageSize) {
        const { data, error } = await db
          .from(RAW)
          .select("id, report_type, created_at, service_date, weekday, time_bucket, intensity, context_confidence, route_id, segment_key, reporter_scope_token")
          .eq("service_date", serviceDate)
          .order("id", { ascending: true })
          .range(offset, offset + AGGREGATION_JOB.pageSize - 1);
        if (error) fail("fetch_raw");
        const rows = (data ?? []) as {
          id: string; report_type: CommunityReportType; created_at: string; service_date: string; weekday: number; time_bucket: number;
          intensity: number | null; context_confidence: number | null; route_id: string | null; segment_key: string | null; reporter_scope_token: string | null;
        }[];
        for (const r of rows) {
          out.push({
            id: r.id, reportType: r.report_type, createdAt: r.created_at, serviceDate: r.service_date, weekday: r.weekday, timeBucket: r.time_bucket,
            intensity: r.intensity, contextConfidence: r.context_confidence === null ? null : Number(r.context_confidence),
            routeId: r.route_id, segmentKey: r.segment_key, reporterToken: r.reporter_scope_token,
          });
        }
        if (rows.length < AGGREGATION_JOB.pageSize) break;
      }
      return out;
    },
    async replaceDailyPartials(serviceDate, partials, runStartedAt) {
      for (const part of chunks(partials)) {
        const { error } = await db.from(DAILY).upsert(
          part.map((p) => ({
            source: p.source, scope_type: p.scopeType, route_id: p.routeId, segment_key: p.segmentKey, service_date: p.serviceDate,
            weekday: p.weekday, time_bucket: p.timeBucket, kind: p.kind, sample_count: p.sampleCount, legacy_sample_count: p.legacySampleCount,
            strength: p.strength, score_sum: p.scoreSum, positive_strength: p.positiveStrength, negative_strength: p.negativeStrength,
            first_observed_at: p.firstObservedAt, last_observed_at: p.lastObservedAt, model_version: HISTORICAL_MODEL_VERSION, updated_at: runStartedAt,
          })),
          { onConflict: DAILY_CONFLICT }
        );
        if (error) fail("upsert_daily");
      }
      // Az adott nap e futásban el nem ért (elavult) részaggregátumai.
      const { error } = await db.from(DAILY).delete().eq("service_date", serviceDate).lt("updated_at", runStartedAt);
      if (error) fail("prune_daily");
    },
    async markDayBuilt(serviceDate, reportCount, partialCount, runStartedAt) {
      const { error } = await db.from(DAYS).upsert(
        { service_date: serviceDate, report_count: reportCount, partial_count: partialCount, model_version: HISTORICAL_MODEL_VERSION, built_at: runStartedAt },
        { onConflict: "service_date" }
      );
      if (error) fail("mark_day");
    },
    async fetchDailyPartialsSince(fromServiceDate) {
      const out: DailyLoadPartial[] = [];
      for (let offset = 0; ; offset += AGGREGATION_JOB.pageSize) {
        const { data, error } = await db
          .from(DAILY)
          .select("source, scope_type, route_id, segment_key, service_date, weekday, time_bucket, kind, sample_count, legacy_sample_count, strength, score_sum, positive_strength, negative_strength, first_observed_at, last_observed_at")
          .gte("service_date", fromServiceDate)
          .order("id", { ascending: true })
          .range(offset, offset + AGGREGATION_JOB.pageSize - 1);
        if (error) fail("fetch_daily");
        const rows = (data ?? []) as Record<string, unknown>[];
        for (const r of rows) {
          out.push({
            source: "community", scopeType: r.scope_type as LoadScopeType, routeId: String(r.route_id), segmentKey: String(r.segment_key),
            serviceDate: String(r.service_date), weekday: Number(r.weekday), timeBucket: Number(r.time_bucket), kind: r.kind as RealtimeStateKind,
            sampleCount: Number(r.sample_count), legacySampleCount: Number(r.legacy_sample_count), strength: Number(r.strength), scoreSum: Number(r.score_sum),
            positiveStrength: Number(r.positive_strength), negativeStrength: Number(r.negative_strength),
            firstObservedAt: String(r.first_observed_at), lastObservedAt: String(r.last_observed_at),
          });
        }
        if (rows.length < AGGREGATION_JOB.pageSize) break;
      }
      return out;
    },
    async replaceProfiles(profiles, runStartedAt) {
      for (const part of chunks(profiles)) {
        const { error } = await db.from(PROFILES).upsert(
          part.map((p) => ({
            source: p.source, scope_type: p.scopeType, route_id: p.routeId, segment_key: p.segmentKey, weekday: p.weekday, day_type: p.dayType,
            time_bucket: p.timeBucket, kind: p.kind, sample_count: p.sampleCount, distinct_days: p.distinctDays,
            effective_sample_strength: p.effectiveSampleStrength, weighted_score_sum: p.weightedScoreSum, positive_strength: p.positiveStrength,
            negative_strength: p.negativeStrength, expected_score: p.expectedScore, confidence: p.confidence, data_quality: p.dataQuality,
            first_observed_at: p.firstObservedAt, last_observed_at: p.lastObservedAt, computed_for_date: p.computedForDate,
            model_version: HISTORICAL_MODEL_VERSION, updated_at: runStartedAt,
          })),
          { onConflict: PROFILE_CONFLICT }
        );
        if (error) fail("upsert_profiles");
      }
      const { error } = await db.from(PROFILES).delete().lt("updated_at", runStartedAt);
      if (error) fail("prune_profiles");
    },
    async purgeTokensBefore(serviceDate) {
      const { data, error } = await db.rpc("vedett_route_purge_reporter_tokens_before", { p_before: serviceDate });
      if (error) fail("purge_tokens");
      return typeof data === "number" ? data : 0;
    },
  };
}

/** Expected-load API: az összes kontextushoz szükséges profil EGY lekérdezésben (nincs N+1). */
export async function fetchLoadProfilesForLookup(routeIds: readonly string[], weekdays: readonly number[], timeBuckets: readonly number[]): Promise<LoadProfile[] | null> {
  if (routeIds.length === 0 || weekdays.length === 0 || timeBuckets.length === 0) return [];
  try {
    const { data, error } = await createAdminClient()
      .from(PROFILES)
      .select("source, scope_type, route_id, segment_key, weekday, day_type, time_bucket, kind, sample_count, distinct_days, effective_sample_strength, weighted_score_sum, positive_strength, negative_strength, expected_score, confidence, data_quality, first_observed_at, last_observed_at, computed_for_date")
      .in("route_id", [...routeIds])
      .in("weekday", [...weekdays])
      .in("time_bucket", [...timeBuckets])
      .limit(5000);
    if (error) return null;
    return ((data ?? []) as ProfileRow[]).map(mapProfileRow);
  } catch {
    return null;
  }
}
