// Közösségi segítség bejelentések adatmegőrzési cleanup
// Futtatás: naponta egyszer (vercel.json)
// Feladatok:
//   1. retentionUntil lejárt + nincs legalHold + nincs nyitott fellebbezés → anonimizálás
//   2. Régi, lezárt, anonim bejelentések (> 24 hónap) törlése — CSAK ha nincs
//      megőrzendő fellebbezés (nyitott, vagy lezárva 3 évnél rövidebb ideje,
//      vagy ismeretlen lezárási idejű). Lásd lib/community/retention.ts és
//      docs/account-deletion/REPORT_RETENTION.md.
//
// JAVÍTÁS (2026-10-18): az anonimizálás korábban a reporter_user_id-t csupa
// nulla UUID-ra állította; ez auth.users FK-t sértett (nincs ilyen user), így az
// UPDATE elbukott. Most NULL — ehhez a reporter_user_id nullable kell legyen
// (docs/account-deletion/migration/20261021000000_community_report_retention_fk.DRAFT.sql).
// Hibánál (pl. hiányzó oszlop a migráció előtt) a cron NEM töröl semmit.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ANONYMIZED_REPORT_DELETE_AFTER_MONTHS,
  OPEN_REPORT_STATUSES,
  addMonths,
  hasOpenAppeal,
  selectDeletableReportIds,
  type RetentionAppeal,
} from "@/lib/community/retention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPEN_STATUS_FILTER = `(${OPEN_REPORT_STATUSES.join(",")})`;

export async function GET(request: Request) {
  // Vercel cron authorization
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();

  // ── 1. Anonimizálás ─────────────────────────────────────────
  const { data: toAnonymize, error: fetchErr } = await admin
    .from("community_user_reports")
    .select("id")
    .lt("retention_until", now)
    .eq("legal_hold", false)
    .is("anonymized_at", null)
    .not("status", "in", OPEN_STATUS_FILTER);

  if (fetchErr) {
    console.error("[community-report-cleanup] fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let anonymized = 0;
  const anonCandidateIds = (toAnonymize ?? []).map((r) => r.id as string);
  if (anonCandidateIds.length) {
    const { data: anonAppeals, error: anonAppealErr } = await admin
      .from("community_report_appeals")
      .select("report_id, status")
      .in("report_id", anonCandidateIds);
    if (anonAppealErr) {
      console.error("[community-report-cleanup] appeal fetch error:", anonAppealErr.message);
      return NextResponse.json({ error: anonAppealErr.message }, { status: 500 });
    }
    const appeals = (anonAppeals ?? []) as RetentionAppeal[];
    const ids = anonCandidateIds.filter((id) => !hasOpenAppeal(id, appeals));
    if (ids.length) {
      const { error: anonErr } = await admin
        .from("community_user_reports")
        .update({
          description: "[anonimizálva]",
          reporter_user_id: null,
          anonymized_at: now,
          updated_at: now,
        })
        .in("id", ids)
        .eq("legal_hold", false)
        .is("anonymized_at", null);
      if (anonErr) {
        console.error("[community-report-cleanup] anonymize error:", anonErr.message);
      } else {
        anonymized = ids.length;
      }
    }
  }

  // ── 2. Törlés (24 hónappal az anonimizálás után) ────────────
  const deleteCutoff = addMonths(nowDate, -ANONYMIZED_REPORT_DELETE_AFTER_MONTHS).toISOString();
  const { data: delCandidates, error: delFetchErr } = await admin
    .from("community_user_reports")
    .select("id")
    .lt("anonymized_at", deleteCutoff)
    .eq("legal_hold", false)
    .not("status", "in", OPEN_STATUS_FILTER);

  if (delFetchErr) {
    console.error("[community-report-cleanup] delete fetch error:", delFetchErr.message);
    return NextResponse.json({ ok: false, anonymized, deleted: 0, error: delFetchErr.message }, { status: 500 });
  }

  let deleted = 0;
  const delCandidateIds = (delCandidates ?? []).map((r) => r.id as string);
  if (delCandidateIds.length) {
    // closed_at: docs/account-deletion/migration/20261021000100_community_report_appeals_closed_at.DRAFT.sql
    // Ha az oszlop még nincs meg, a lekérdezés hibát ad → nincs törlés (biztonságos).
    const { data: delAppeals, error: delAppealErr } = await admin
      .from("community_report_appeals")
      .select("report_id, status, closed_at")
      .in("report_id", delCandidateIds);
    if (delAppealErr) {
      console.error("[community-report-cleanup] appeal fetch error (no deletion):", delAppealErr.message);
      return NextResponse.json({ ok: false, anonymized, deleted: 0, error: delAppealErr.message }, { status: 500 });
    }
    const deletableIds = selectDeletableReportIds(delCandidateIds, (delAppeals ?? []) as RetentionAppeal[], nowDate);
    if (deletableIds.length) {
      // A fellebbezés → bejelentés FK RESTRICT (a migráció után): a már nem
      // megőrzendő fellebbezéseket előbb törölni kell.
      const { error: appealDelErr } = await admin
        .from("community_report_appeals")
        .delete()
        .in("report_id", deletableIds);
      if (appealDelErr) {
        console.error("[community-report-cleanup] appeal delete error:", appealDelErr.message);
        return NextResponse.json({ ok: false, anonymized, deleted: 0, error: appealDelErr.message }, { status: 500 });
      }
      const { count, error: delErr } = await admin
        .from("community_user_reports")
        .delete({ count: "exact" })
        .in("id", deletableIds)
        .lt("anonymized_at", deleteCutoff)
        .eq("legal_hold", false)
        .not("status", "in", OPEN_STATUS_FILTER);
      if (delErr) {
        console.error("[community-report-cleanup] delete error:", delErr.message);
      } else {
        deleted = count ?? 0;
      }
    }
  }

  console.log(`[community-report-cleanup] done: anonymized=${anonymized} deleted=${deleted}`);
  return NextResponse.json({ ok: true, anonymized, deleted });
}
