// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — validált kérés -> DB sor (tiszta függvények).

import { COMMUNITY_REPORT_RATE_LIMITS, getCommunityReportCategory, type CommunityReportCategory, type CommunityReportType } from "./config.ts";
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
}

export function buildCommunityReportInsertRow(input: CommunityReportSubmitInput, now: Date): CommunityReportInsertRow {
  const ctx = input.context ?? {};
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
