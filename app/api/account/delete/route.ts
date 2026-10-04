// POST /api/account/delete — a bejelentkezett felhasználó SAJÁT fiókjának
// végleges törlése. A törlendő user KIZÁRÓLAG a hitelesített Supabase
// sessionből jön (supabase.auth.getUser()); a kérés törzséből SOSEM.
// A service-role kulcs csak szerver oldalon él (lib/supabase/admin.ts).
//
// FAMILY VÉDELEM: ha a fiókhoz Family-adat kapcsolódik (family_members,
// guardian_child_permissions, child_accounts), a törlés MEGTAGADVA (409),
// mert az auth.users törlés cascade-je árva családot / gyerekprofilt
// hagyhatna maga után (families.created_by és child_profiles nem cascade-el
// a family_members-től). Ezt külön döntés/folyamat szabályozza.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const FAMILY_BLOCK_MESSAGE =
  "A fiókhoz Család-funkció adatai (családtagság, gyermekprofil vagy gyámi jogosultság) kapcsolódnak, ezért ezt most nem tudjuk automatikusan törölni. Kérjük, vedd fel velünk a kapcsolatot a Kapcsolat oldalon keresztül.";

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

  const admin = createAdminClient();

  // Fail-closed Family ellenőrzés.
  const checks = await Promise.all([
    admin.from("family_members").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("guardian_child_permissions").select("id", { count: "exact", head: true }).eq("guardian_user_id", user.id),
    admin.from("child_accounts").select("id", { count: "exact", head: true }).eq("auth_user_id", user.id),
  ]);
  if (checks.some((c) => c.error)) {
    return NextResponse.json({ ok: false, message: "A fiók törlése most nem sikerült. Próbáld újra később." }, { status: 500 });
  }
  if (checks.some((c) => (c.count ?? 0) > 0)) {
    return NextResponse.json({ ok: false, code: "family_data_present", message: FAMILY_BLOCK_MESSAGE }, { status: 409 });
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ ok: false, message: "A fiók törlése most nem sikerült. Próbáld újra később." }, { status: 500 });
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // a user már törölve; a session sütik lejárnak / érvénytelenek
  }
  cookies().set({ name: "vu_signed_out", value: "1", path: "/", maxAge: 60, sameSite: "lax" });
  return NextResponse.json({ ok: true });
}
