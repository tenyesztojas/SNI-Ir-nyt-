// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — validált kérés -> DB sor (tiszta függvények).

import {
  COMMUNITY_REPORT_BASE_CONFIDENCE,
  COMMUNITY_REPORT_RATE_LIMITS,
  COMMUNITY_REPORT_SCHEMA_VERSION,
  getCommunityReportCategory,
  getCommunityReportIntensity,
  type CommunityReportCategory,
  type CommunityReportType,
} from "./config.ts";
import {
  COMMUNITY_CONTEXT_PHASE_CONFIDENCE,
  computeGeoCell,
  roundCoord,
  type CommunityContextPhase,
  type CommunityContextSource,
} from "./eventContext.ts";
import { buildSegmentKey, computeCommunityReportTimeKeys, type CommunityVehicleType } from "./context.ts";
import { computeCommunityReportExpiresAt } from "./ttl.ts";
import type { CommunityReportSubmitInput } from "./schemas.ts";

/** A `vedett_route_community_reports` tábla insert-sora. NINCS benne user-azonosító. */
export interface CommunityReportInsertRow {
  report_type: CommunityReportType;
  report_category: CommunityReportCategory;
  source: "community";
  route_id: string | null;
  trip_id: string | null;
  vehicle_id: string | null;
  direction_id: 0 | 1 | null;
  from_stop_id: string | null;
  to_stop_id: string | null;
  segment_key: string | null;
  vehicle_type: CommunityVehicleType | null;
  service_date: string;
  time_bucket: number;
  weekday: number;
  created_at: string;
  expires_at: string;
  // ── v2: community intelligence esemény-kontextus ──
  schema_version: number;
  intensity: 1 | 2 | 3 | null;
  base_confidence: number;
  context_phase: CommunityContextPhase;
  context_source: CommunityContextSource;
  /** Mennyire köthető a jelzés a trip/szakasz kontextushoz (0..1), a fázisból. */
  context_confidence: number;
  headsign: string | null;
  segment_from_lat: number | null;
  segment_from_lon: number | null;
  segment_to_lat: number | null;
  segment_to_lon: number | null;
  geo_cell: string | null;
}

export function buildCommunityReportInsertRow(input: CommunityReportSubmitInput, now: Date): CommunityReportInsertRow {
  const ctx = input.context ?? {};
  const event = input.event ?? null;
  const phase: CommunityContextPhase = event?.phase ?? "unknown";
  const segment = event?.segment ?? null;
  const hasTo = typeof segment?.toLat === "number" && typeof segment?.toLon === "number";
  const keys = computeCommunityReportTimeKeys(now);
  const fromStopId = ctx.fromStopId ?? null;
  const toStopId = ctx.toStopId ?? null;
  return {
    report_type: input.reportType,
    report_category: getCommunityReportCategory(input.reportType),
    source: "community",
    route_id: ctx.routeId ?? null,
    trip_id: ctx.tripId ?? null,
    vehicle_id: ctx.vehicleId ?? null,
    direction_id: ctx.directionId ?? null,
    from_stop_id: fromStopId,
    to_stop_id: toStopId,
    segment_key: buildSegmentKey(fromStopId, toStopId),
    vehicle_type: ctx.vehicleType ?? null,
    service_date: keys.serviceDate,
    time_bucket: keys.timeBucket,
    weekday: keys.weekday,
    created_at: now.toISOString(),
    expires_at: computeCommunityReportExpiresAt(input.reportType, now).toISOString(),
    schema_version: COMMUNITY_REPORT_SCHEMA_VERSION,
    intensity: getCommunityReportIntensity(input.reportType),
    base_confidence: COMMUNITY_REPORT_BASE_CONFIDENCE,
    context_phase: phase,
    context_source: event?.contextSource ?? "none",
    context_confidence: COMMUNITY_CONTEXT_PHASE_CONFIDENCE[phase],
    headsign: event?.headsign ?? null,
    segment_from_lat: segment ? roundCoord(segment.fromLat) : null,
    segment_from_lon: segment ? roundCoord(segment.fromLon) : null,
    segment_to_lat: hasTo ? roundCoord(segment!.toLat as number) : null,
    segment_to_lon: hasTo ? roundCoord(segment!.toLon as number) : null,
    geo_cell: segment ? computeGeoCell(segment.fromLat, segment.fromLon) : null,
  };
}

/**
 * Rate-limit kulcsok. Az `actor` (userId vagy IP) KIZÁRÓLAG a rate limiter
 * rövid életű kulcsában él (Upstash/memória TTL), SOHA nem kerül a DB-be,
 * így a historikus aggregátum nem köthető userhez.
 */
export function buildCommunityReportRateLimitKeys(actor: string, input: CommunityReportSubmitInput) {
  const target = input.context?.tripId ?? input.context?.routeId ?? "none";
  return {
    burst: { key: `vedett-route:community-report:burst:${actor}`, ...COMMUNITY_REPORT_RATE_LIMITS.burst },
    sustained: { key: `vedett-route:community-report:hour:${actor}`, ...COMMUNITY_REPORT_RATE_LIMITS.sustained },
    duplicate: {
      key: `vedett-route:community-report:dup:${actor}:${input.reportType}:${target}`,
      limit: 1,
      windowMs: COMMUNITY_REPORT_RATE_LIMITS.duplicateWindowMs,
    },
  };
}

export function communityReportActorKey(userId: string | null, clientIp: string): string {
  return userId ? `u:${userId}` : `ip:${clientIp}`;
}
