import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideSubscribeWrite, parsePushEndpoint, parsePushSubscriptionBody } from "@/lib/pushSubscription";

// Push-feliratkoz├ís ment├ęse/t├Ârl├ęse (admin ├ęs V├ędett Csal├íd k├Âz├Âs ├║tja).
// A user KIZ├üR├ôLAG a session-b┼Ĺl j├Ân. M├ís user sor├ít a bek├╝ld├Âtt v├ęgpont
// alapj├ín SEM ├ítvenni, SEM t├Âr├Âlni nem lehet: saj├ít sor friss├şthet┼Ĺ, ├║j sor
// besz├║rhat├│, idegen sor eset├ęn 409 (a kliens el┼Ĺbb a b├Âng├ęsz┼Ĺs
// unsubscribe()-bal ├║j v├ęgpontot k├ęr). Hogy KINEK megy csal├ídi ├ęrtes├şt├ęs, azt
// a k├╝ld├ęskor a claim_child_travel_notification() d├Ânti el (DB).

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sub = parsePushSubscriptionBody(await request.json().catch(() => null));
  if (!sub) {
    return NextResponse.json({ ok: false, error: "Invalid subscription" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", sub.endpoint);
  if (readError || !existing) {
    console.error("[push/subscribe] read failed", readError?.code ?? "");
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: 500 });
  }
  const write = decideSubscribeWrite(existing.map((r) => r.user_id as string | null), user.id);
  if (write === "conflict") {
    return NextResponse.json({ ok: false, error: "Endpoint in use" }, { status: 409 });
  }
  const { error } =
    write === "update"
      ? await admin.from("push_subscriptions").update({ keys: sub.keys }).eq("endpoint", sub.endpoint).eq("user_id", user.id)
      : await admin.from("push_subscriptions").insert({ endpoint: sub.endpoint, keys: sub.keys, user_id: user.id });
  // P├írhuzamosan besz├║rt (m├ís user) sor: egyedi kulcs ├╝tk├Âz├ęs -> nincs ├ítv├ętel.
  if (error?.code === "23505") {
    return NextResponse.json({ ok: false, error: "Endpoint in use" }, { status: 409 });
  }
  if (error) {
    console.error("[push/subscribe] save failed", error.code ?? "");
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = parsePushEndpoint(body?.endpoint);
  if (!endpoint) return NextResponse.json({ ok: false, error: "Invalid endpoint" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  if (error) {
    console.error("[push/subscribe] delete failed", error.code ?? "");
    return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
