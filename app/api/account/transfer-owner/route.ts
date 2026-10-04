import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Owner transfer: a hívó identitása KIZÁRÓLAG a session (supabase.auth.getUser()).
// A jogosultságot (aktív owner a Familyben; a célszemély aktív guardian ugyanabban
// a Familyben) a transfer_family_ownership security-definer RPC ellenőrzi
// auth.uid() alapján — a kliens állításainak nem hiszünk.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Nem vagy bejelentkezve." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const familyId = typeof body?.familyId === "string" ? body.familyId : "";
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
  if (!UUID_RE.test(familyId) || !UUID_RE.test(targetUserId)) {
    return NextResponse.json({ ok: false, message: "Érvénytelen kérés." }, { status: 400 });
  }

  const { error } = await supabase.rpc("transfer_family_ownership", {
    p_family_id: familyId,
    p_target_user_id: targetUserId,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, message: "A tulajdonjog átadása nem sikerült. Csak a család aktív ownere adhatja át egy aktív guardian családtagnak." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
