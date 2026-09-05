import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function periodToFrom(period: string): string {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case "yesterday": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return d.toISOString();
    }
    case "7d":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
    default:
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function periodToTo(period: string): string | null {
  if (period === "yesterday") {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const from = periodToFrom(period);
  const to = periodToTo(period);

  let installsQ = adminClient
    .from("pwa_stats").select("platform").eq("event_type", "install").gte("created_at", from);
  let sessionsQ = adminClient
    .from("pwa_stats").select("id").eq("event_type", "session").gte("created_at", from);

  if (to) {
    installsQ = installsQ.lt("created_at", to);
    sessionsQ = sessionsQ.lt("created_at", to);
  }

  const [{ data: installs }, { data: sessions }] = await Promise.all([installsQ, sessionsQ]);

  return NextResponse.json({
    totalInstalls: installs?.length ?? 0,
    androidInstalls: installs?.filter((r) => r.platform === "android").length ?? 0,
    iosInstalls: installs?.filter((r) => r.platform === "ios").length ?? 0,
    sessions: sessions?.length ?? 0,
  });
}
