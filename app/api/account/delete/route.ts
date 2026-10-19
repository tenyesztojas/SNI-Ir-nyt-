import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { interpretDeleteOwnAccountRpc, interpretDeletionStateRpc } from "@/lib/account/deletionState";

export const dynamic = "force-dynamic";

// Fióktörlés (web /profil és iOS /vedett-utvonal/fiok közös API-ja).
// Az identitás KIZÁRÓLAG a bejelentkezett session (auth.getUser + a user JWT-je,
// amellyel az RPC fut, auth.uid()); kliens által küldött user id-t nem használunk.
// A törlés egyetlen tranzakciós RPC: public.delete_own_account — családadatok,
// saját rekordok és az auth.users sor együtt törlődik vagy semmi. Service role
// / admin.deleteUser ebben az útvonalban nincs.

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Nem vagy bejelentkezve." }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("get_account_deletion_state_v2");
  if (error) console.error("[account/delete] get_account_deletion_state_v2 failed", error.code ?? "");
  const result = interpretDeletionStateRpc(data, error);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Nem vagy bejelentkezve." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.confirm !== true) {
    return NextResponse.json({ ok: false, message: "A törlés megerősítése hiányzik." }, { status: 400 });
  }
  const confirmFamilyDeletion = body.confirmFamilyDeletion === true;

  const { data, error } = await supabase.rpc("delete_own_account", {
    p_confirm_family_deletion: confirmFamilyDeletion,
  });
  if (error) console.error("[account/delete] delete_own_account failed", error.code ?? "");
  const result = interpretDeleteOwnAccountRpc(data, error);
  if (result.diagnostics) console.warn("[account/delete] manual review", result.diagnostics);

  if (!result.deleted) {
    return NextResponse.json(result.body, { status: result.status });
  }

  // Az auth.users sor már törlődött; a session-sütiket takarítjuk.
  try {
    await supabase.auth.signOut();
  } catch {}
  cookies().set({ name: "vu_signed_out", value: "1", path: "/", maxAge: 60, sameSite: "lax" });
  return NextResponse.json({ ok: true });
}
