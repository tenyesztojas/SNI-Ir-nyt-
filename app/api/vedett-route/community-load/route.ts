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
import { EXPECTED_LOAD_API } from "@/lib/vedett-route/communityReports/historicalConfig";
import { buildSegmentKey } from "@/lib/vedett-route/communityReports/context";
import { evaluateCommunityLoadContexts } from "@/lib/vedett-route/communityReports/communityLoadBatch";
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

  // Közös batch-értékelő: EGY profil-lekérdezés + legfeljebb KÉT realtime lekérdezés (nincs N+1).
  const evaluations = await evaluateCommunityLoadContexts(contexts, now);

  const results = evaluations.map((evaluation, index) => ({ index, ...toPublicLoadEvaluation(evaluation) }));
  return NextResponse.json({ ok: true, generatedAt: now.toISOString(), results });
}
