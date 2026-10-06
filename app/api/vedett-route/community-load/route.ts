// POST /api/vedett-route/community-load
//
// HISTORICAL SENSORY LOAD (2026-10-06) — várható (historikus) + pillanatnyi
// (historikus + realtime) közösségi terhelés BATCH-ben, legfeljebb 12
// kontextusra (pl. egy journey összes TRANSIT szakasza, vagy több alternatíva).
// N+1 nélkül: a profilok EGY lekérdezésből, a realtime jelöltek legfeljebb
// KÉT lekérdezésből jönnek. Csak aggregált érték megy ki (toPublicLoadEvaluation):
// nincs nyers report, token, koordináta vagy belső breakdown.
// Routingot NEM módosít — a kimenet a következő blokk routing adapterének bemenete.

import { NextResponse } from "next/server";
import { requireVedettRoutePublicRead, getVedettRouteClientIp } from "@/lib/vedett-route/access";
import { rateLimiter } from "@/lib/rate-limit";
import { expectedLoadRequestSchema, resolveDepartureTime, toPublicLoadEvaluation } from "@/lib/vedett-route/communityReports/loadSchemas";
import { EXPECTED_LOAD_API, ADJACENT_BUCKET_RADIUS, dayTypeOfWeekday } from "@/lib/vedett-route/communityReports/historicalConfig";
import { buildSegmentKey, computeCommunityReportTimeKeys } from "@/lib/vedett-route/communityReports/context";
import { evaluateCommunityLoad, isRealtimeApplicable } from "@/lib/vedett-route/communityReports/expectedLoadEngine";
import { fetchLoadProfilesForLookup } from "@/lib/vedett-route/communityReports/historicalRepository";
import { fetchRealtimeCandidateReportsBatch } from "@/lib/vedett-route/communityReports/repository";
import { communityReportActorKey } from "@/lib/vedett-route/communityReports/submission";

export async function POST(request: Request) {
  const auth = await requireVedettRoutePublicRead(request);
  if (!auth.ok) return auth.response;

  if (process.env.VEDETT_ROUTE_COMMUNITY_REPORTS_ENABLED === "false") {
    return NextResponse.json({ ok: false, reason: "DISABLED" }, { status: 503 });
  }

  const actor = communityReportActorKey(auth.userId, getVedettRouteClientIp(request));
  const limit = await rateLimiter.check(`vedett-route:community-load:${actor}`, EXPECTED_LOAD_API.rateLimit.limit, EXPECTED_LOAD_API.rateLimit.windowMs);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expectedLoadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });
  }

  const now = new Date();
  const contexts = [];
  for (const c of parsed.data.contexts) {
    const at = resolveDepartureTime(c.departureTime, now);
    if (!at) return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });
    contexts.push({ routeId: c.routeId, tripId: c.tripId ?? null, segmentKey: buildSegmentKey(c.fromStopId, c.toStopId), at });
  }

  // Egyetlen profil-lekérdezéshez szükséges kulcsok (naptípus összes napja, ±1 sáv).
  const routeIds = new Set<string>();
  const weekdays = new Set<number>();
  const buckets = new Set<number>();
  for (const ctx of contexts) {
    const keys = computeCommunityReportTimeKeys(ctx.at);
    routeIds.add(ctx.routeId);
    for (let d = 1; d <= 7; d++) if (dayTypeOfWeekday(d) === dayTypeOfWeekday(keys.weekday)) weekdays.add(d);
    for (let b = keys.timeBucket - ADJACENT_BUCKET_RADIUS; b <= keys.timeBucket + ADJACENT_BUCKET_RADIUS; b++) if (b >= 0 && b <= 95) buckets.add(b);
  }
  const profiles = (await fetchLoadProfilesForLookup([...routeIds], [...weekdays], [...buckets])) ?? [];

  const realtimeContexts = contexts.filter((ctx) => isRealtimeApplicable(ctx.at, now));
  const realtimeRecords =
    realtimeContexts.length > 0
      ? (await fetchRealtimeCandidateReportsBatch(
          realtimeContexts.map((c) => c.tripId).filter((t): t is string => Boolean(t)),
          realtimeContexts.map((c) => c.routeId),
          now
        )) ?? []
      : [];

  const results = contexts.map((context, index) => ({
    index,
    ...toPublicLoadEvaluation(evaluateCommunityLoad({ context, profiles, realtimeRecords, now }).evaluation),
  }));
  return NextResponse.json({ ok: true, generatedAt: now.toISOString(), results });
}
