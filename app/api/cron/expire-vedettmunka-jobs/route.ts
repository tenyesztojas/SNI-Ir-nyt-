import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Cron: lejárt VédettMunka hirdetések lezárása
 * Vercel Cron hívja naponta (vercel.json: "0 3 * * *")
 * CRON_SECRET fejléc védi jogosulatlan hívás ellen.
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

  const { data: expired, error } = await admin
    .from("job_posts")
    .update({ status: "expired" })
    .eq("status", "published")
    .lt("expires_at", new Date().toISOString())
    .select("id, title");

  if (error) {
    console.error("expire-vedettmunka-jobs hiba:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = expired?.length ?? 0;
  console.log(`expire-vedettmunka-jobs: ${count} hirdetés lezárva.`);

  return NextResponse.json({ ok: true, expired: count });
}
