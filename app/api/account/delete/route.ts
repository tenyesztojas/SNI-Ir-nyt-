import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHILD_ACCOUNT_USER_MESSAGE,
  MANUAL_REVIEW_MESSAGE,
  parseAccountDeletionStatus,
} from "@/lib/account/deletionState";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "A fiók törlése most nem sikerült. Próbáld újra később.";

// A törlési állapotot (deletion state) a DB állapítja meg a bejelentkezett
// user alapján (get_account_deletion_state / prepare_account_deletion RPC,
// auth.uid()). A request body-ból SOHA nem olvasunk user azonosítót; a törölt
// user mindig a supabase.auth.getUser() eredménye.

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Nem vagy bejelentkezve." }, { status: 401 });

  const { data, error } = await supabase.rpc("get_account_deletion_state");
  const status = parseAccountDeletionStatus(data);
  if (error || !status) return NextResponse.json({ ok: false, message: GENERIC_ERROR }, { status: 500 });
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Nem vagy bejelentkezve." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || body.confirm !== true) {
    return NextResponse.json({ ok: false, message: "A törlés megerősítése hiányzik." }, { status: 400 });
  }
  const confirmFamilyDeletion = body.confirmFamilyDeletion === true;

  // Egy tranzakcióban: Family-kapcsolatok eltávolítása (és egyszerű sole-owner
  // Family explicit megerősítéssel történő törlése). Fail closed minden más esetben.
  const { data, error } = await supabase.rpc("prepare_account_deletion", {
    p_confirm_family_deletion: confirmFamilyDeletion,
  });
  const result = data as { ok?: boolean } | null;
  const status = parseAccountDeletionStatus(data);
  if (error || !result || !status) {
    return NextResponse.json({ ok: false, message: GENERIC_ERROR }, { status: 500 });
  }

  if (!result.ok) {
    const code = status.state;
    let message = MANUAL_REVIEW_MESSAGE;
    if (code === "CHILD_ACCOUNT_USER") message = CHILD_ACCOUNT_USER_MESSAGE;
    else if (code === "OWNER_TRANSFER_REQUIRED")
      message = "Mielőtt törölheted a fiókodat, át kell adnod a család tulajdonjogát egy másik aktív családtagnak.";
    else if (code === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED")
      message = "A család és a kizárólagos gyermekadatok törléséhez külön megerősítés szükséges.";
    return NextResponse.json({ ok: false, code, message, ...status }, { status: 409 });
  }
  // Szolgáltatói (service role) törlés — kizárólag a session-ből származó user.id.
  const admin = createAdminClient();
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    return NextResponse.json({ ok: false, message: GENERIC_ERROR }, { status: 500 });
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // a user már törölve van; a kijelentkezés best-effort
  }
  // Kijelentkezés/törlés jelző: a kliens ebből törli az eszközön tárolt navigációs sessiont.
  cookies().set({ name: "vu_signed_out", value: "1", path: "/", maxAge: 60, sameSite: "lax" });
  return NextResponse.json({ ok: true });
}
