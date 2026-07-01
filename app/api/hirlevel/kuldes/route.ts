import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getResend } from "@/lib/resend";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function emailHtml(body: string, unsubUrl: string) {
  const paragraphs = body
    .split("\n")
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("");
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;color:#1f2937">
  <img src="https://vedettsarok.vercel.app/logo.png" alt="VédettSarok" style="height:48px;margin-bottom:24px" />
  ${paragraphs}
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb"/>
  <p style="font-size:12px;color:#9ca3af">
    Ha nem szeretnél több hírlevelet kapni,
    <a href="${unsubUrl}" style="color:#0a4a6e">kattints ide a leiratkozáshoz</a>.
    A feliratkozást bármikor visszaállíthatod a profilodban.
  </p>
</body></html>`;
}

export async function POST(request: Request) {
  // Admin auth ellenőrzés
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Csak admin küldhet hírlevelet" }, { status: 403 });
  }

  const { subject, body } = await request.json() as { subject: string; body: string };
  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Tárgy és szövegtörzs kötelező" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Feliratkozott felhasználók
  const { data: subs } = await admin
    .from("profiles")
    .select("id")
    .eq("newsletter_subscribed", true);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nincs aktív feliratkozó." });
  }

  // E-mail címek az auth.admin API-ból
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const subIds = new Set(subs.map((s) => s.id));
  const recipients = (authData?.users ?? []).filter(
    (u) => subIds.has(u.id) && u.email
  );

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vedettsarok.vercel.app";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const emails = recipients.map((u) => ({
    from: `VédettSarok <${fromEmail}>`,
    to: u.email!,
    subject,
    html: emailHtml(body, `${baseUrl}/api/leiratkozas?token=${u.id}`),
  }));

  // 100-as kötegekben küld (Resend limit)
  const resend = getResend();
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    await resend.batch.send(emails.slice(i, i + 100));
    sent += Math.min(100, emails.length - i);
  }

  return NextResponse.json({ sent, message: `${sent} e-mail sikeresen elküldve.` });
}
