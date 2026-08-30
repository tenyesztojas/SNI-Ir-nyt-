import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Egy kattintásos leiratkozás a heti állásértesítőről.
 * URL formátum: /api/vedettmunka/ertesito/leiratkozas?uid=<uuid>&token=<hex>
 *
 * Token ellenőrzés: HMAC-SHA256(CRON_SECRET, "unsub:" + uid)
 * Ugyanúgy generálja a send-weekly-job-alerts cron.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  if (!uid || !token) {
    return new NextResponse("Érvénytelen leiratkozási link.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new NextResponse("Szerverhiba.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Token ellenőrzés
  const expected = createHmac("sha256", secret).update(`unsub:${uid}`).digest("hex");
  if (token !== expected) {
    return new NextResponse("Érvénytelen vagy lejárt leiratkozási link.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Értesítő kikapcsolása
  const admin = createAdminClient();
  const { error } = await admin
    .from("job_alerts")
    .update({ enabled: false })
    .eq("user_id", uid);

  if (error) {
    console.error("leiratkozas: DB hiba:", error.message);
    return new NextResponse("Szerverhiba a leiratkozás során.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Sikeres leiratkozás — visszairányítás egy barátságos oldalra
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedettsarok.hu";
  return NextResponse.redirect(`${baseUrl}/vedettmunka/ertesito?leiratkozas=ok`, { status: 302 });
}
