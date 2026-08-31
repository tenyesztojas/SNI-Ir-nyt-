import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cron: Védett Akadémia emlékeztető e-mailek
 * Vercel Cron hívja naponta (vercel.json: "0 8 * * *")
 * CRON_SECRET Bearer token védi.
 *
 * Logika:
 *  - "invited" státuszú enrollments, amelyeknél az invited_at > 3 napja, de nem nyitották meg
 *  - "in_progress" státuszú enrollments, amelyeknél az updated_at > 5 napja
 *  - "test_failed" státuszú enrollments, amelyeknél az updated_at > 3 napja
 * Minden esetben az invitation token alapján generált magic link kerül az e-mailbe.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET nincs konfigurálva." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan." }, { status: 401 });
  }

  const admin = createAdminClient();
  const resend = getResend();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedettsarok.hu";
  const now = new Date();

  // ── 1. Emlékeztetőre szoruló enrollmentek lekérdezése ────────────
  const thresholds = {
    invited: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),   // 3 napja meghívott, nem nyitott
    in_progress: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 napja inaktív
    test_failed: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 napja failed, nem próbálta újra
  };

  // 2 napja nem küldtünk emlékeztetőt (vagy még sosem küldtünk)
  const reminderCooldown = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitedEnrollments } = await admin
    .from("academy_enrollments")
    .select(`
      id, status, reminder_sent_at,
      participant:academy_participants(first_name, email),
      course_version:academy_course_versions(version, course:academy_courses(title)),
      invitation:academy_invitations(raw_token)
    `)
    .eq("status", "invited")
    .is("opened_at", null)
    .lt("created_at", thresholds.invited)
    .is("revoked_at", null)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${reminderCooldown}`);

  const { data: inProgressEnrollments } = await admin
    .from("academy_enrollments")
    .select(`
      id, status, reminder_sent_at,
      participant:academy_participants(first_name, email),
      course_version:academy_course_versions(version, course:academy_courses(title)),
      invitation:academy_invitations(raw_token)
    `)
    .eq("status", "in_progress")
    .lt("last_activity_at", thresholds.in_progress)
    .is("revoked_at", null)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${reminderCooldown}`);

  const { data: failedEnrollments } = await admin
    .from("academy_enrollments")
    .select(`
      id, status, reminder_sent_at,
      participant:academy_participants(first_name, email),
      course_version:academy_course_versions(version, course:academy_courses(title)),
      invitation:academy_invitations(raw_token)
    `)
    .eq("status", "test_failed")
    .lt("last_activity_at", thresholds.test_failed)
    .is("revoked_at", null)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${reminderCooldown}`);

  const allEnrollments = [
    ...(invitedEnrollments ?? []),
    ...(inProgressEnrollments ?? []),
    ...(failedEnrollments ?? []),
  ];

  if (allEnrollments.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Nincs emlékeztetőre szoruló beiratkozás." });
  }

  // ── 2. E-mailek küldése ──────────────────────────────────────────
  let sent = 0;
  let skipped = 0;

  for (const enr of allEnrollments) {
    const participant = enr.participant as unknown as { first_name: string; email: string } | null;
    const cv = enr.course_version as unknown as { version: string; course?: { title: string } | null } | null;
    const invitation = enr.invitation as unknown as { raw_token: string } | null;

    if (!participant?.email || !invitation?.raw_token) {
      skipped++;
      continue;
    }

    const courseTitle = cv?.course?.title ?? "Védett Akadémia képzés";
    const magicLink = `${baseUrl}/akademia/meghivo/${invitation.raw_token}`;
    const firstName = participant.first_name;

    const subjectMap: Record<string, string> = {
      invited: `[Védett Akadémia] Emlékeztető: ${courseTitle} – meg sem nyitottad`,
      in_progress: `[Védett Akadémia] Emlékeztető: ${courseTitle} – folytasd a tanulást`,
      test_failed: `[Védett Akadémia] Emlékeztető: ${courseTitle} – próbáld újra a tesztet`,
    };

    const bodyMap: Record<string, string> = {
      invited: `<p>Meghívót kaptál a <strong>${courseTitle}</strong> képzésre, de még nem kezdted el.</p>
        <p>Lépj be a képzésbe és tedd meg az első lépést!</p>`,
      in_progress: `<p>A <strong>${courseTitle}</strong> képzésed folyamatban van – ne add fel!</p>
        <p>Lépj be és folytasd ott, ahol abbahagytad.</p>`,
      test_failed: `<p>A <strong>${courseTitle}</strong> képzés tesztjét még nem teljesítetted sikeresen.</p>
        <p>Nézd át az anyagot és próbáld újra – sikerülni fog!</p>`,
    };

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
        <div style="background:#123A5C;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="color:#34D8C3;font-size:20px;margin:0">Védett Akadémia</h1>
          <p style="color:#e2e8f0;font-size:14px;margin:6px 0 0">Emlékeztető</p>
        </div>
        <div style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none">
          <p style="font-size:15px">Szia ${firstName}!</p>
          ${bodyMap[enr.status] ?? ""}
          <a href="${magicLink}"
             style="display:inline-block;background:#34D8C3;color:#123A5C;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-top:16px">
            Belépés a képzésbe
          </a>
        </div>
        <div style="background:#f9fafb;padding:16px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:11px;color:#888;margin:0">
            Ez az értesítő automatikusan keletkezett a Védett Sarok rendszeréből.<br>
            Ha nem szeretnél több emlékeztetőt kapni, vedd fel a kapcsolatot a szerveződdel.
          </p>
        </div>
      </div>`;

    const { error: emailError } = await resend.emails.send({
      from: "Védett Akadémia <akademia@vedettsarok.hu>",
      to: participant.email,
      subject: subjectMap[enr.status] ?? `[Védett Akadémia] Emlékeztető: ${courseTitle}`,
      html,
    });

    if (emailError) {
      console.error(`akademia-emlekeztetok: e-mail hiba (enr=${enr.id}):`, emailError.message);
      continue;
    }

    // reminder_sent_at frissítése
    await admin
      .from("academy_enrollments")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", enr.id);

    sent++;
  }

  console.log(`akademia-emlekeztetok: ${sent} e-mail elküldve, ${skipped} kihagyva.`);
  return NextResponse.json({ ok: true, sent, skipped, total: allEnrollments.length });
}
