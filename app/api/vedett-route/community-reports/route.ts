// POST /api/vedett-route/community-reports
//
// COMMUNITY REPORTS v1 (2026-10-06) — egyérintéses közlekedési/szenzoros
// jelzés fogadása. Anonim és bejelentkezett felhasználó is küldhet (a
// publikus Védett Útvonal guard szerint), de:
//   - a kliens SOHA nem ír közvetlenül a DB-be: a tábla RLS-e fail-closed,
//     anon/authenticated szerepkörnek nincs joga; csak ez a végpont ír,
//     service-role klienssel, KIZÁRÓLAG INSERT-et (nincs update/delete út);
//   - nincs olvasó végpont a nyers reportokhoz (nem dumpolható);
//   - NEM tárolunk user_id-t, IP-t, koordinátát, címet, szabad szöveget —
//     a rate-limit szereplő-kulcsa csak a rate limiter rövid életű tárában él;
//   - időpont/service_date/time_bucket/expires_at/source: szerver számolja.
//
// Kill switch: VEDETT_ROUTE_COMMUNITY_REPORTS_ENABLED=false -> 503.

import { NextResponse } from "next/server";
import { requireVedettRoutePublicRead, getVedettRouteClientIp } from "@/lib/vedett-route/access";
import { rateLimiter } from "@/lib/rate-limit";
import { communityReportSubmitSchema } from "@/lib/vedett-route/communityReports/schemas";
import {
  buildCommunityReportInsertRow,
  buildCommunityReportRateLimitKeys,
  communityReportActorKey,
} from "@/lib/vedett-route/communityReports/submission";
import { insertCommunityReport } from "@/lib/vedett-route/communityReports/repository";

export async function POST(request: Request) {
  const auth = await requireVedettRoutePublicRead(request);
  if (!auth.ok) return auth.response;

  if (process.env.VEDETT_ROUTE_COMMUNITY_REPORTS_ENABLED === "false") {
    return NextResponse.json({ ok: false, reason: "DISABLED" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = communityReportSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });
  }

  const actor = communityReportActorKey(auth.userId, getVedettRouteClientIp(request));
  const keys = buildCommunityReportRateLimitKeys(actor, parsed.data);
  for (const limit of [keys.burst, keys.sustained]) {
    const result = await rateLimiter.check(limit.key, limit.limit, limit.windowMs);
    if (!result.allowed) {
      return NextResponse.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
    }
  }

  // Ugyanaz a szereplő, ugyanaz a típus, ugyanaz a trip/route 10 percen belül:
  // nem írunk új sort (egy ember ne tudja egyedül felhúzni a confidence-t),
  // de a kliens felé sikeres választ adunk.
  const duplicate = await rateLimiter.check(keys.duplicate.key, keys.duplicate.limit, keys.duplicate.windowMs);
  if (!duplicate.allowed) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const stored = await insertCommunityReport(buildCommunityReportInsertRow(parsed.data, new Date()));
  if (!stored.ok) {
    return NextResponse.json({ ok: false, reason: "STORE_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
