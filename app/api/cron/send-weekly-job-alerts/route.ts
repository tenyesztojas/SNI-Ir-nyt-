import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";

export const runtime = "nodejs";

/**
 * Egyirányú token a leiratkozáshoz: HMAC-SHA256(secret, userId)
 * Nem tartjuk adatbázisban – a leiratkozási route ugyanígy számítja ki.
 */
function makeUnsubscribeToken(userId: string): string {
  const secret = process.env.CRON_SECRET ?? "fallback";
  return createHmac("sha256", secret).update(`unsub:${userId}`).digest("hex");
}

/**
 * Cron: heti lehetőségfigyelő e-mailek küldése
 * Vercel Cron hívja hétfőnként (vercel.json: "0 7 * * 1")
 * CRON_SECRET Bearer token védi.
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

  // ── 1. Aktív értesítőre feliratkozottak ────────────────────────
  const { data: alerts, error: alertsErr } = await admin
    .from("job_alerts")
    .select("user_id, categories, work_type, city, county, home_office, hybrid, part_time, open_to_neurodivergent, open_to_disabled, open_to_parents")
    .eq("enabled", true)
    .eq("frequency", "heti");

  if (alertsErr) {
    console.error("send-weekly-job-alerts: alerts lekérdezési hiba:", alertsErr.message);
    return NextResponse.json({ error: alertsErr.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Nincs aktív feliratkozó." });
  }

  // ── 2. Az elmúlt 7 napban közzétett hirdetések ─────────────────
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: jobs, error: jobsErr } = await admin
    .from("job_posts")
    .select(`
      id, title, city, county, work_type, home_office, hybrid, part_time,
      open_to_neurodivergent, open_to_disabled, open_to_parents,
      category, published_at,
      employers(company_name)
    `)
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false });

  if (jobsErr) {
    console.error("send-weekly-job-alerts: jobs lekérdezési hiba:", jobsErr.message);
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Nincs új hirdetés az elmúlt 7 napban." });
  }

  // ── 3. Felhasználói e-mail címek lekérése ─────────────────────
  const userIds = alerts.map((a) => a.user_id);
  const { data: { users: authUsers }, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });

  if (usersErr) {
    console.error("send-weekly-job-alerts: auth.users lekérdezési hiba:", (usersErr as Error).message);
    return NextResponse.json({ error: (usersErr as Error).message }, { status: 500 });
  }

  const emailMap = new Map<string, string>();
  for (const u of authUsers) {
    if (u.email && userIds.includes(u.id)) {
      emailMap.set(u.id, u.email);
    }
  }

  // ── 4. E-mailek küldése egyenként ─────────────────────────────
  let sent = 0;

  for (const alert of alerts) {
    const userEmail = emailMap.get(alert.user_id);
    if (!userEmail) continue;

    // Szűrés az értesítő beállításai szerint
    const matching = jobs.filter((job) => {
      if (alert.categories && alert.categories.length > 0) {
        if (!alert.categories.includes(job.category)) return false;
      }
      if (alert.work_type && job.work_type !== alert.work_type) return false;
      if (alert.city && job.city !== alert.city) return false;
      if (alert.county && job.county !== alert.county) return false;
      if (alert.home_office && !job.home_office) return false;
      if (alert.hybrid && !job.hybrid) return false;
      if (alert.part_time && !job.part_time) return false;
      // Befogadói szűrők: ha a user kéri, a hirdetésnek nyitottnak kell lennie
      if (alert.open_to_neurodivergent && !job.open_to_neurodivergent) return false;
      if (alert.open_to_disabled && !job.open_to_disabled) return false;
      if (alert.open_to_parents && !job.open_to_parents) return false;
      return true;
    });

    if (matching.length === 0) continue;

    const unsubToken = makeUnsubscribeToken(alert.user_id);
    const unsubUrl = `${baseUrl}/api/vedettmunka/ertesito/leiratkozas?uid=${alert.user_id}&token=${unsubToken}`;

    const jobListHtml = matching
      .map((job) => {
        const emp = (job.employers as { company_name: string }[] | null)?.[0];
        const company = emp?.company_name ?? "";
        return `
          <tr>
            <td style="padding:8px 0; border-bottom:1px solid #f0f0f0">
              <a href="${baseUrl}/vedettmunka/allasok/${job.id}" style="font-weight:700;color:#123A5C;text-decoration:none">${job.title}</a><br>
              <span style="font-size:12px;color:#666">${company}${job.city ? ` · ${job.city}` : ""}${job.county ? ` · ${job.county}` : ""}</span>
            </td>
          </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
        <div style="background:#123A5C;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="color:#34D8C3;font-size:20px;margin:0">VédettKarrier</h1>
          <p style="color:#e2e8f0;font-size:14px;margin:6px 0 0">Heti lehetőségfigyelő</p>
        </div>
        <div style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none">
          <p style="font-size:15px">Az elmúlt héten <strong>${matching.length} új lehetőség</strong> jelent meg, amely megfelel a lehetőségfigyelőd beállításainak:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            ${jobListHtml}
          </table>
          <a href="${baseUrl}/vedettmunka/allasok"
             style="display:inline-block;background:#34D8C3;color:#123A5C;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-top:8px">
            Összes lehetőség megtekintése
          </a>
        </div>
        <div style="background:#f9fafb;padding:16px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:11px;color:#888;margin:0">
            Ezt az értesítőt azért kaptad, mert feliratkoztál a VédettKarrier heti lehetőségfigyelőjére.<br>
            <a href="${unsubUrl}" style="color:#888">Leiratkozás egy kattintással</a> ·
            <a href="${baseUrl}/vedettmunka/ertesito" style="color:#888">Beállítások módosítása</a>
          </p>
        </div>
      </div>`;

    const { error: emailError } = await resend.emails.send({
      from: "VédettKarrier <ertesito@vedettsarok.hu>",
      to: userEmail,
      subject: `[VédettKarrier] ${matching.length} új lehetőség az elmúlt héten`,
      html,
    });

    if (emailError) {
      console.error(`send-weekly-job-alerts: e-mail hiba (uid=${alert.user_id}):`, emailError.message);
    } else {
      sent++;
    }
  }

  console.log(`send-weekly-job-alerts: ${sent}/${alerts.length} e-mail elküldve.`);
  return NextResponse.json({ ok: true, sent, total: alerts.length });
}
