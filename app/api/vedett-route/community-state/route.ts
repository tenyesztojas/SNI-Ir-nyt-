// POST /api/vedett-route/community-state
//
// REALTIME COMMUNITY INTELLIGENCE (2026-10-06) — egy trip / route / szakasz /
// földrajzi cella AKTUÁLIS, AGGREGÁLT közösségi állapota. CSAK aggregált,
// állapot-fajtánkénti eredmény megy ki: nincs nyers report, nincs reporter
// token, nincs koordináta, nincs egyedi rekord-azonosító. A belső breakdown
// (diagnosztika) SOHA nem kerül a válaszba.
// Jogosultság: publikus Védett Útvonal olvasás (anonim is), saját rate limit.

import { NextResponse } from "next/server";
import { requireVedettRoutePublicRead, getVedettRouteClientIp } from "@/lib/vedett-route/access";
import { rateLimiter } from "@/lib/rate-limit";
import { communityStateQuerySchema } from "@/lib/vedett-route/communityReports/realtimeSchemas";
import { buildSegmentKey } from "@/lib/vedett-route/communityReports/context";
import { computeCommunityRealtimeState } from "@/lib/vedett-route/communityReports/realtimeEngine";
import { fetchRealtimeCandidateReports } from "@/lib/vedett-route/communityReports/repository";
import { COMMUNITY_STATE_RATE_LIMIT } from "@/lib/vedett-route/communityReports/realtimeConfig";
import { communityReportActorKey } from "@/lib/vedett-route/communityReports/submission";

export async function POST(request: Request) {
  const auth = await requireVedettRoutePublicRead(request);
  if (!auth.ok) return auth.response;

  if (process.env.VEDETT_ROUTE_COMMUNITY_REPORTS_ENABLED === "false") {
    return NextResponse.json({ ok: false, reason: "DISABLED" }, { status: 503 });
  }

  const actor = communityReportActorKey(auth.userId, getVedettRouteClientIp(request));
  const limit = await rateLimiter.check(`vedett-route:community-state:${actor}`, COMMUNITY_STATE_RATE_LIMIT.limit, COMMUNITY_STATE_RATE_LIMIT.windowMs);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = communityStateQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });
  }

  const now = new Date();
  const query = {
    tripId: parsed.data.tripId ?? null,
    routeId: parsed.data.routeId ?? null,
    segmentKey: buildSegmentKey(parsed.data.fromStopId, parsed.data.toStopId),
    geoCell: parsed.data.geoCell ?? null,
    now,
  };
  const records = await fetchRealtimeCandidateReports(query);
  if (records === null) {
    // Tároló hiba: üres, de őszinte állapot — a navigációt nem zavarja.
    return NextResponse.json({ ok: true, available: false, states: [], generatedAt: now.toISOString() });
  }

  const { states } = computeCommunityRealtimeState(records, query);
  return NextResponse.json({ ok: true, available: true, states, generatedAt: now.toISOString() });
}
