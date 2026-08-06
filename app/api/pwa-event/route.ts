import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { event_type, platform } = await req.json();
    if (!["install", "session"].includes(event_type)) {
      return NextResponse.json({ error: "invalid event_type" }, { status: 400 });
    }
    const adminClient = createAdminClient();
    await adminClient.from("pwa_stats").insert({ event_type, platform: platform ?? "other" });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
