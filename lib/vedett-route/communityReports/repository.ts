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

export const COMMUNITY_REPORTS_TABLE = "vedett_route_community_reports";

export async function insertCommunityReport(row: CommunityReportInsertRow): Promise<{ ok: true } | { ok: false }> {
  try {
    const { error } = await createAdminClient().from(COMMUNITY_REPORTS_TABLE).insert(row);
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
