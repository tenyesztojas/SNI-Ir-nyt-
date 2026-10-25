import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifySyncOwner, parsePushEndpoint } from "@/lib/pushSubscription";

export const dynamic = "force-dynamic";

// Böngészős feliratkozás és a bejelentkezett user összehangolása. CSAK OLVAS:
// a kliens által küldött végpont nem jogosít más user sorának törlésére vagy
// átvételére. Válasz: { ok, linked, stale }.
//   linked=true  — a végpont a jelenlegi user saját, mentett feliratkozása;
//   stale=true   — a végpont MÁS user nevén van (pl. fiókváltás ugyanabban a
//                  böngészőben). Ilyenkor a kliens a böngészős unsubscribe()-bal
//                  érvényteleníti a végpontot; a régi sort a küldő a push-
//                  szolgáltató 410-es válaszára a tulajdonosa nevén törli.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = parsePushEndpoint(body?.endpoint);
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint);
  if (error || !data) return NextResponse.json({ ok: false }, { status: 500 });

  const owners = data.map((r) => r.user_id as string | null);
  return NextResponse.json({ ok: true, ...classifySyncOwner(owners, user.id) });
}
