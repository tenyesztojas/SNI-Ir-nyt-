"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/data";
import { hasFamilyBetaAccess } from "@/lib/family/config";

export type FamilyActionState =
  | null
  | { error: string }
  | { success: true; familyId?: string; childId?: string };

const CURRENT_YEAR = new Date().getFullYear();

// A Supabase/Postgres NYERS hibaüzeneteit sosem adjuk vissza a
// felhasználónak — csak a mi SAJÁT, tudatosan magyar nyelvű RAISE
// EXCEPTION szövegeinket a create_family_with_owner /
// create_child_profile_for_family RPC-kből. Ezek mind a Postgres
// default "P0001" (raise_exception) SQLSTATE-tel érkeznek (lásd
// supabase/migrations/20260926_family_db_foundation.sql — sehol nincs
// explicit SQLSTATE megadva a RAISE EXCEPTION-öknél), tehát a code
// alapján biztonságosan megkülönböztethetők a technikai
// hibáktól (constraint violation, permission denied, hálózati hiba
// stb.), amik egy generikus, felhasználóbarát üzenetet kapnak.
function friendlyRpcError(
  error: { code?: string; message?: string } | null,
  fallback: string
): string {
  if (error?.code === "P0001" && error.message) {
    return error.message;
  }
  return fallback;
}

function parseBirthYear(
  raw: string
): { value: number | null } | { error: string } {
  if (!raw) return { value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return { error: "Érvénytelen születési év." };
  }
  if (parsed < 1900) {
    return { error: "Túl régi születési év." };
  }
  if (parsed > CURRENT_YEAR) {
    return { error: "A születési év nem lehet jövőbeli." };
  }
  return { value: parsed };
}

export async function createFamilyAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const nameRaw = String(formData.get("name") ?? "").trim();
  const name = nameRaw.length > 0 ? nameRaw : null;

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő create_family_with_owner(text) RPC — nincs
  // kliensoldali/szerver akcióbeli direkt INSERT a families táblára.
  const { data, error } = await supabase.rpc("create_family_with_owner", {
    p_name: name,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elkészíteni a családot. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, familyId: data as string };
}

export async function addChildAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const familyId = String(formData.get("familyId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();

  if (!familyId) return { error: "Hiányzó család azonosító." };
  if (!firstName) return { error: "A keresztnév megadása kötelező." };

  const birthYearResult = parseBirthYear(birthYearRaw);
  if ("error" in birthYearResult) return { error: birthYearResult.error };

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő create_child_profile_for_family(uuid,text,integer)
  // RPC — nincs kliensoldali/szerver akcióbeli direkt INSERT a
  // child_profiles vagy family_children táblára.
  const { data, error } = await supabase.rpc(
    "create_child_profile_for_family",
    {
      p_family_id: familyId,
      p_first_name: firstName,
      p_birth_year: birthYearResult.value,
    }
  );

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült létrehozni a gyermekprofilt. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, childId: data as string };
}

export async function updateChildAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const childId = String(formData.get("childId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();

  if (!childId) return { error: "Hiányzó gyermek azonosító." };
  if (!firstName) return { error: "A keresztnév megadása kötelező." };

  const birthYearResult = parseBirthYear(birthYearRaw);
  if ("error" in birthYearResult) return { error: birthYearResult.error };

  // Nincs dedikált RPC ehhez — nem is kell: ez egyetlen egysoros
  // UPDATE, amit a meglévő "child_profiles_update_via_family_owner"
  // RLS policy (lásd
  // supabase/migrations/20260926_family_db_foundation.sql) már önmagában
  // biztonságosan lefed — csak a kapcsolt family aktív ownerje (vagy
  // admin) módosíthatja. Nincs service_role, nincs admin client, nincs
  // RLS-megkerülés.
  //
  // FONTOS: ha RLS blokkolja a módosítást (pl. mert a hívó nem owner),
  // a PostgREST UPDATE NEM hibát ad, hanem csendben 0 sort módosít —
  // ezért a .select("id")-t explicit ellenőrizzük, hogy ezt észleljük
  // és ne mutassunk hamis sikert.
  const supabase = createClient();
  const { data, error } = await supabase
    .from("child_profiles")
    .update({ first_name: firstName, birth_year: birthYearResult.value })
    .eq("id", childId)
    .select("id");

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült menteni a módosítást. Próbáld újra."
      ),
    };
  }
  if (!data || data.length === 0) {
    return {
      error: "Nincs jogosultságod ehhez a módosításhoz, vagy a gyermekprofil nem található.",
    };
  }

  revalidatePath("/csalad");
  return { success: true, childId };
}

export async function inviteGuardianAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const familyId = String(formData.get("familyId") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();

  if (!familyId) return { error: "Hiányzó család azonosító." };
  if (!emailRaw) return { error: "Az e-mail-cím megadása kötelező." };

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő invite_family_guardian(uuid,text) RPC — nincs
  // kliensoldali/szerver akcióbeli direkt INSERT a
  // family_guardian_invitations táblára. Az RPC saját maga ellenőrzi
  // az owner jogosultságot, normalizálja és validálja az e-mail-t.
  const { error } = await supabase.rpc("invite_family_guardian", {
    p_family_id: familyId,
    p_email: emailRaw,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elküldeni a meghívást. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, familyId };
}

export async function revokeGuardianInvitationAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Hiányzó meghívás azonosító." };

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő revoke_family_guardian_invitation(uuid) RPC —
  // nincs kliensoldali/szerver akcióbeli direkt UPDATE a
  // family_guardian_invitations táblára. Az RPC saját maga ellenőrzi,
  // hogy a hívó a meghívás mögötti family aktív ownerje-e.
  const { error } = await supabase.rpc("revoke_family_guardian_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült visszavonni a meghívást. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true };
}

