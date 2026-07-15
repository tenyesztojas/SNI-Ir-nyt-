import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await request.json() as { endpoint: string; keys: { p256dh: string; auth: string } };
  if (!sub?.endpoint || !sub?.keys) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, keys: sub.keys, user_id: user.id },
    { onConflict: "endpoint" }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json() as { endpoint: string };
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
