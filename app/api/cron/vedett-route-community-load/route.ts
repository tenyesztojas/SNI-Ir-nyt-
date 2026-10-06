// GET /api/cron/vedett-route-community-load
//
// Védett Útvonal — historikus közösségi terhelés aggregáció + reporter token purge.
// Napi futás (vercel.json), manuális újrafuttatás és backfill (?from=YYYY-MM-DD&to=YYYY-MM-DD[&force=1]).
// Idempotens újraépítés (lásd lib/vedett-route/communityReports/historicalJob.ts).
// Auth: Vercel Cron "Authorization: Bearer <CRON_SECRET>" — FAIL-CLOSED: ha a
// CRON_SECRET nincs beállítva, minden kérés 401. Logba csak összesítő számok kerülnek.

import { NextResponse } from "next/server";
import { runCommunityLoadAggregation } from "@/lib/vedett-route/communityReports/historicalJob";
import { createSupabaseCommunityLoadStore } from "@/lib/vedett-route/communityReports/historicalRepository";
import { isAuthorizedCronRequest } from "@/lib/vedett-route/communityReports/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const result = await runCommunityLoadAggregation(createSupabaseCommunityLoadStore(), {
    now: new Date(),
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    force: url.searchParams.get("force") === "1",
  });
  if (!result.ok && "error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  console.info("[vedett-route-community-load]", JSON.stringify(result));
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
