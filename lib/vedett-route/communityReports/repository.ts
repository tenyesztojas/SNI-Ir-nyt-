// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — SZERVER-OLDALI tároló + community adapter.
//
// KIZÁRÓLAG szerveren (API route) használható: service-role klienssel ír/olvas,
// mert a tábla RLS-e fail-closed (anon/authenticated szerepkörnek NINCS
// semmilyen joga — se SELECT, se INSERT, se UPDATE, se DELETE).

import { createAdminClient } from "@/lib/supabase/admin";
import type { CommunityReportType } from "./config.ts";
import type { CommunityVehicleType } from "./context.ts";
import {
  communityReportToObservation,
  matchesObservationQuery,
  type TrafficObservation,
  type TrafficObservationAdapter,
  type TrafficObservationQuery,
} from "./observation.ts";
import type { CommunityReportInsertRow } from "./submission.ts";
import type { RealtimeReportRecord, RealtimeStateQuery } from "./realtimeEngine.ts";
import { REALTIME_QUERY_WINDOW_MINUTES } from "./realtimeConfig.ts";

export const COMMUNITY_REPORTS_TABLE = "vedett_route_community_reports";

export async function insertCommunityReport(row: CommunityReportInsertRow): Promise<{ ok: true } | { ok: false }> {
  try {
    const client = createAdminClient();
    let { error } = await client.from(COMMUNITY_REPORTS_TABLE).insert(row);
    // Átmeneti kompatibilitás: ha a 20261008 migráció (reporter_scope_token)
    // még nincs alkalmazva, a jelzés token nélkül (legacy módon) mentődik,
    // a Jelzés funkció nem áll le.
    if (error && "reporter_scope_token" in row) {
      const { reporter_scope_token: _omitted, ...legacyRow } = row;
      ({ error } = await client.from(COMMUNITY_REPORTS_TABLE).insert(legacyRow));
    }
    if (error) {
      console.error("[vedett-route] community report insert failed", { code: error.code });
      return { ok: false };
    }
    return { ok: true };
  } catch {
    console.error("[vedett-route] community report insert threw");
    return { ok: false };
  }
}

interface CommunityReportRow {
  report_type: CommunityReportType;
  created_at: string;
  expires_at: string;
  route_id: string | null;
  trip_id: string | null;
  vehicle_id: string | null;
  direction_id: 0 | 1 | null;
  from_stop_id: string | null;
  to_stop_id: string | null;
  vehicle_type: CommunityVehicleType | null;
  context_confidence: number | null;
}

/** Community forrás-adapter: friss (aktív) reportok egy route/irány/szakasz kulcsra. */
export const communityTrafficObservationAdapter: TrafficObservationAdapter = {
  source: "community",
  async fetchObservations(query: TrafficObservationQuery): Promise<TrafficObservation[]> {
    const windowStart = new Date(query.now.getTime() - query.windowMinutes * 60_000).toISOString();
    let request = createAdminClient()
      .from(COMMUNITY_REPORTS_TABLE)
      .select("report_type, created_at, expires_at, route_id, trip_id, vehicle_id, direction_id, from_stop_id, to_stop_id, vehicle_type, context_confidence")
      .gte("created_at", windowStart)
      .gt("expires_at", query.now.toISOString())
      .limit(500);
    if (query.routeId !== null) request = request.eq("route_id", query.routeId);
    if (query.fromStopId !== null) request = request.eq("from_stop_id", query.fromStopId);
    if (query.toStopId !== null) request = request.eq("to_stop_id", query.toStopId);
    const { data, error } = await request;
    if (error || !data) return [];
    return (data as CommunityReportRow[])
      .map((row) => ({
        ...communityReportToObservation({
          reportType: row.report_type,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          context: {
            routeId: row.route_id,
            tripId: row.trip_id,
            vehicleId: row.vehicle_id,
            directionId: row.direction_id,
            fromStopId: row.from_stop_id,
            toStopId: row.to_stop_id,
            vehicleType: row.vehicle_type,
          },
        }),
        // A jelzés kontextushoz köthetősége (fázisból) forrás-súlyként.
        sourceWeight: typeof row.context_confidence === "number" ? row.context_confidence : 1,
      }))
      .filter((observation) => matchesObservationQuery(observation, query));
  },
};

// ── REALTIME COMMUNITY INTELLIGENCE (2026-10-06) ─────────────────────────────


interface RealtimeRow {
  id: string;
  report_type: CommunityReportType;
  created_at: string;
  expires_at: string;
  intensity: number | null;
  base_confidence: number | null;
  context_confidence: number | null;
  trip_id: string | null;
  route_id: string | null;
  segment_key: string | null;
  geo_cell: string | null;
  reporter_scope_token?: string | null;
}

const REALTIME_COLUMNS =
  "id, report_type, created_at, expires_at, intensity, base_confidence, context_confidence, trip_id, route_id, segment_key, geo_cell, reporter_scope_token";
const REALTIME_COLUMNS_LEGACY =
  "id, report_type, created_at, expires_at, intensity, base_confidence, context_confidence, trip_id, route_id, segment_key, geo_cell";

/**
 * Aktív (nem lejárt, ablakon belüli) jelöltek a lekérdezési kulcsra. Kulcsonként
 * külön, paraméterezett lekérdezés (nincs string-összefűzött .or() szűrő), az
 * eredmény id szerint egyesítve. A reporter tokent a motor csak a szerveren látja.
 */
export async function fetchRealtimeCandidateReports(query: RealtimeStateQuery): Promise<RealtimeReportRecord[] | null> {
  try {
    const client = createAdminClient();
    const windowStart = new Date(query.now.getTime() - REALTIME_QUERY_WINDOW_MINUTES * 60_000).toISOString();
    const nowIso = query.now.toISOString();
    const base = (columns: string) =>
      client.from(COMMUNITY_REPORTS_TABLE).select(columns).gte("created_at", windowStart).gt("expires_at", nowIso).limit(300);
    const requests: ((columns: string) => ReturnType<typeof base>)[] = [];
    const tripId = query.tripId;
    const routeId = query.routeId;
    const geoCell = query.geoCell;
    if (tripId) requests.push((columns) => base(columns).eq("trip_id", tripId));
    if (routeId) requests.push((columns) => base(columns).eq("route_id", routeId));
    if (!tripId && !routeId && geoCell) requests.push((columns) => base(columns).eq("geo_cell", geoCell));
    let results = await Promise.all(requests.map((build) => build(REALTIME_COLUMNS)));
    // Átmeneti kompatibilitás a 20261008 migráció előtt: token oszlop nélkül.
    if (results.some((r) => r.error)) results = await Promise.all(requests.map((build) => build(REALTIME_COLUMNS_LEGACY)));
    const byId = new Map<string, RealtimeRow>();
    for (const { data, error } of results) {
      if (error) return null;
      for (const row of (data ?? []) as unknown as RealtimeRow[]) byId.set(row.id, row);
    }
    return [...byId.values()].map((row) => ({
      reportType: row.report_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      intensity: row.intensity,
      baseConfidence: row.base_confidence,
      contextConfidence: row.context_confidence,
      tripId: row.trip_id,
      routeId: row.route_id,
      segmentKey: row.segment_key,
      geoCell: row.geo_cell,
      reporterToken: row.reporter_scope_token ?? null,
    }));
  } catch {
    console.error("[vedett-route] community realtime fetch threw");
    return null;
  }
}

/**
 * Batch realtime jelöltek több kontextushoz: legfeljebb KÉT lekérdezés
 * (trip_id IN, route_id IN), id szerint egyesítve — nincs N+1.
 */
export async function fetchRealtimeCandidateReportsBatch(tripIds: readonly string[], routeIds: readonly string[], now: Date): Promise<RealtimeReportRecord[] | null> {
  if (tripIds.length === 0 && routeIds.length === 0) return [];
  try {
    const client = createAdminClient();
    const windowStart = new Date(now.getTime() - REALTIME_QUERY_WINDOW_MINUTES * 60_000).toISOString();
    const nowIso = now.toISOString();
    const run = (columns: string) => {
      const base = () => client.from(COMMUNITY_REPORTS_TABLE).select(columns).gte("created_at", windowStart).gt("expires_at", nowIso).limit(1000);
      const requests = [];
      if (tripIds.length > 0) requests.push(base().in("trip_id", [...tripIds]));
      if (routeIds.length > 0) requests.push(base().in("route_id", [...routeIds]));
      return Promise.all(requests);
    };
    let results = await run(REALTIME_COLUMNS);
    if (results.some((r) => r.error)) results = await run(REALTIME_COLUMNS_LEGACY);
    const byId = new Map<string, RealtimeRow>();
    for (const { data, error } of results) {
      if (error) return null;
      for (const row of (data ?? []) as unknown as RealtimeRow[]) byId.set(row.id, row);
    }
    return [...byId.values()].map((row) => ({
      reportType: row.report_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      intensity: row.intensity,
      baseConfidence: row.base_confidence,
      contextConfidence: row.context_confidence,
      tripId: row.trip_id,
      routeId: row.route_id,
      segmentKey: row.segment_key,
      geoCell: row.geo_cell,
      reporterToken: row.reporter_scope_token ?? null,
    }));
  } catch {
    console.error("[vedett-route] community realtime batch fetch threw");
    return null;
  }
}
