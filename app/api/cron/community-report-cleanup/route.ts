// Közösségi segítség bejelentések adatmegőrzési cleanup
// Futtatás: naponta egyszer (vercel.json)
// Feladatok:
//   1. retentionUntil lejárt + nincs legalHold + nincs nyitott fellebbezés → anonimizálás
//   2. Régi, lezárt, anonim bejelentések (> 24 hónap) törlése

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel cron authorization
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. Anonimizálás: retentionUntil lejárt, nincs legal hold, még nem anonimizálva
  const { data: toAnonymize, error: fetchErr } = await admin
    .from("community_user_reports")
    .select("id")
    .lt("retention_until", now)
    .eq("legal_hold", false)
    .is("anonymized_at", null)
    .not("status", "in", "(pending,under_review)");

  if (fetchErr) {
    console.error("[community-report-cleanup] fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let anonymized = 0;
  if (toAnonymize?.length) {
    // Anonimizálás: description és reporter_user_id nullifikálása
    const { error: anonErr } = await admin
      .from("community_user_reports")
      .update({
        description: "[anonimizálva]",
        reporter_user_id: "00000000-0000-0000-0000-000000000000",
        anonymized_at: now,
        updated_at: now,
      })
      .in("id", toAnonymize.map((r) => r.id));

    if (anonErr) {
      console.error("[community-report-cleanup] anonymize error:", anonErr.message);
    } else {
      anonymized = toAnonymize.length;
    }
  }

  // 2. Törlés: anonimizálva > 24 hónapja + lezárva
  const twoYearsAgo = new Date();
  twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);

  const { count: deleted, error: delErr } = await admin
    .from("community_user_reports")
    .delete({ count: "exact" })
    .lt("anonymized_at", twoYearsAgo.toISOString())
    .eq("legal_hold", false)
    .not("status", "in", "(pending,under_review)");

  if (delErr) {
    console.error("[community-report-cleanup] delete error:", delErr.message);
  }

  console.log(`[community-report-cleanup] done: anonymized=${anonymized} deleted=${deleted ?? 0}`);
  return NextResponse.json({ ok: true, anonymized, deleted: deleted ?? 0 });
}
