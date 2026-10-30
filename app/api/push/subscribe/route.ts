import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideSubscribeWrite, parsePushEndpoint, parsePushSubscriptionBody } from "@/lib/pushSubscription";

// Push-feliratkozás mentése/törlése (admin és Védett Család közös útja).
// A user KIZÁRÓLAG a session-ből jön. Más user sorát a beküldött végpont
// alapján SEM átvenni, SEM törölni nem lehet: saját sor frissíthető, új sor
// beszúrható, idegen sor esetén 409 (a kliens előbb a böngészős
// unsubscribe()-bal új végpontot kér). Hogy KINEK megy családi értesítés, azt
// a küldéskor a claim_child_travel_notification() dönti el (DB).

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
  // Párhuzamosan beszúrt (más user) sor: egyedi kulcs ütközés -> nincs átvétel.
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
