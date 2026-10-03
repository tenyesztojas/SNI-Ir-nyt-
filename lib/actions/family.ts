"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/data";
import { hasFamilyBetaAccess } from "@/lib/family/config";

export type FamilyActionState =
  | null
  | { error: string }
  | {
      success: true;
      familyId?: string;
      childId?: string;
      // KIZÁRÓLAG a create_child_account_invitation RPC válaszában,
      // EGYETLEN EGYSZER megjelenő plaintext token (lásd
      // createChildAccountInvitationAction) — a DB SOSE tárolja
      // plaintext formában (csak a SHA-256 hash-t, lásd
      // supabase/migrations/20260927_child_account_foundation.sql).
      // A kliens ebből állítja össze a gyermeknek továbbadandó linket.
      childAccountInvitationToken?: string;
    };

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

// Owner-only: egy adott (guardian, child) pár Napirend-releváns
// jogosultságának (can_view_schedule / can_manage_schedule) módosítása.
// KIZÁRÓLAG a meglévő upsert_guardian_child_permission(...) RPC-t hívja
// (lásd supabase/migrations/20260927_child_account_foundation.sql) — a
// tényleges owner-jogosultságot ott, az RPC belsejében ellenőrzi
// (is_child_family_owner(p_child_id) + has_pilot_access('family_db_beta'),
// ugyanaz a beta-flag, amit a hasFamilyBetaAccess() FE-gate is megkövetel
// MINDEN family actionnél, tehát ez nem új/extra korlátozás). Soha NEM
// hívja a revoke_guardian_child_permission(...) RPC-t — az a teljes sort
// visszavonja és MINDEN flaget (a jövőbeli journey/GPS flageket is)
// false-ra állítja, ami ennek a célnak (csak a két schedule-flag
// módosítása) túl durva és nem biztonságos eszköz lenne.
//
// A journey/GPS flagek (can_start_supervised_journey,
// can_view_active_journey, can_view_live_location) MEGŐRZÉSE: a kliens
// ezeket SOHA nem küldi (nem is látja), ezért itt, a módosítás
// pillanatában, egy friss SELECT-tel olvassuk vissza a meglévő sort, és
// changetlenül visszaküldjük az upsert hívásban. A
// guardian_child_permissions SELECT RLS
// (is_child_family_owner(child_id) or guardian_user_id = auth.uid())
// miatt ez a SELECT ownerként mindig látja a saját gyermeke sorát, ha
// van; ha a hívó NEM owner, a SELECT egyszerűen 0 sort ad (nem hibát) —
// a tényleges védelmet ettől függetlenül az upsert RPC saját
// owner-ellenőrzése adja.
export async function updateGuardianChildScheduleAccessAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const childId = String(formData.get("childId") ?? "").trim();
  const guardianUserId = String(formData.get("guardianUserId") ?? "").trim();
  // PRODUCTION HOTFIX (2026-10-01) — a checkbox-ok MOST már maguk a
  // beküldött mezők (lásd GuardianChildScheduleAccessRow.tsx), natív
  // böngésző checkbox-szemantikával: bejelölve a mező JELEN VAN a
  // FormData-ban, kijelölés nélkül HIÁNYZIK belőle. Ezért a jelenlétet
  // (`has`), NEM egy konkrét string-érték egyezést ("=== 'true'")
  // ellenőrzünk — korábban egy KÜLÖN, React state-et "value" propon
  // keresztül tükröző hidden-input páros hordozta ezt az információt, és
  // production proof igazolta, hogy ez a tükrözés elszakadhatott a
  // látható checkbox állapotától a mentés pillanatában.
  const canViewSchedule = formData.has("canViewSchedule");
  let canManageSchedule = formData.has("canManageSchedule");

  if (!childId) return { error: "Hiányzó gyermek azonosító." };
  if (!guardianUserId) return { error: "Hiányzó gondviselő azonosító." };

  // "Napirend kezelése" sosem lehet igaz "Napirend megtekintése" nélkül
  // (lásd a feladat 3. szekcióját) — a UI ezt már eleve helyesen küldi,
  // de a szerveroldali akció is kikényszeríti, ne csak a kliensre
  // bízzuk.
  if (!canViewSchedule) {
    canManageSchedule = false;
  }

  const supabase = createClient();

  // A jövőbeli (journey/GPS) flagek megőrzése — lásd a fenti megjegyzést.
  const { data: existingRow, error: existingRowError } = await supabase
    .from("guardian_child_permissions")
    .select(
      "can_start_supervised_journey, can_view_active_journey, can_view_live_location"
    )
    .eq("child_id", childId)
    .eq("guardian_user_id", guardianUserId)
    .maybeSingle();

  if (existingRowError) {
    return {
      error: friendlyRpcError(
        existingRowError,
        "Nem sikerült betölteni a jelenlegi jogosultságokat. Próbáld újra."
      ),
    };
  }

  const { error } = await supabase.rpc("upsert_guardian_child_permission", {
    p_child_id: childId,
    p_guardian_user_id: guardianUserId,
    p_can_view_schedule: canViewSchedule,
    p_can_manage_schedule: canManageSchedule,
    p_can_start_supervised_journey:
      existingRow?.can_start_supervised_journey ?? false,
    p_can_view_active_journey: existingRow?.can_view_active_journey ?? false,
    p_can_view_live_location: existingRow?.can_view_live_location ?? false,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült menteni a napirend-jogosultságot. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, childId };
}

// MEGHÍVOTT (recipiens) oldali elfogadás/elutasítás — SZÁNDÉKOSAN NEM
// gateli hasFamilyBetaAccess()-szel, ellentétben a modul fenti, owner-
// oldali actionjeivel. Ez a kör-függőségi hibajegy LÉNYEGE: egy
// meghívott, NEM béta-userhez szóló meghívást pontosan EZEKKEL az
// actionökkel kell tudnia elfogadni/elutasítani, a béta-kaputól
// FÜGGETLENÜL — a tényleges jogosultságot a MEGLÉVŐ
// accept_family_guardian_invitation(uuid) / decline_family_guardian_
// invitation(uuid) RPC-k saját, auth.email()-alapú ellenőrzése adja
// (lásd supabase/migrations/20260927_family_guardian_invitation_foundation.sql
// — NINCS has_pilot_access('family_db_beta') ellenőrzés ezekben az
// RPC-kben), nem ez a szerveroldali action. Nincs kliensoldali/szerver
// akcióbeli e-mail-cím paraméter — az RPC a SAJÁT session-jéből olvassa
// (auth.email()), a kliens SOSE adhat át e-mail-cím-paramétert, amit a
// szerver "elhinne".
export async function acceptGuardianInvitationAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Hiányzó meghívás azonosító." };

  const supabase = createClient();
  const { error } = await supabase.rpc("accept_family_guardian_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elfogadni a meghívást. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  revalidatePath("/profil");
  return { success: true };
}

export async function declineGuardianInvitationAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Hiányzó meghívás azonosító." };

  const supabase = createClient();
  const { error } = await supabase.rpc("decline_family_guardian_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elutasítani a meghívást. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  revalidatePath("/profil");
  return { success: true };
}

function parseDaysOfWeek(formData: FormData): number[] {
  return formData
    .getAll("daysOfWeek")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

export async function createChildScheduleItemAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const childId = String(formData.get("childId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const scheduleType = String(formData.get("scheduleType") ?? "").trim();
  const timeLocal = String(formData.get("timeLocal") ?? "").trim();
  const arrivalTimeRaw = String(formData.get("arrivalTimeLocal") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  const originLabelRaw = String(formData.get("originLabel") ?? "").trim();
  const destinationLabelRaw = String(formData.get("destinationLabel") ?? "").trim();

  if (!childId) return { error: "Hiányzó gyermek azonosító." };
  if (!title) return { error: "A megnevezés megadása kötelező." };
  if (scheduleType !== "one_time" && scheduleType !== "recurring") {
    return { error: "Érvénytelen napirend-típus." };
  }
  if (!timeLocal) return { error: "A kezdési idő megadása kötelező." };
  if (scheduleType === "one_time" && !startDateRaw) {
    return { error: "Egyszeri napirendi elemhez a dátum megadása kötelező." };
  }
  const daysOfWeek = scheduleType === "recurring" ? parseDaysOfWeek(formData) : [];
  if (scheduleType === "recurring" && daysOfWeek.length === 0) {
    return { error: "Ismétlődő napirendi elemhez legalább egy nap kiválasztása kötelező." };
  }

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő create_child_schedule_item(...) RPC — nincs
  // kliensoldali/szerver akcióbeli direkt INSERT a
  // child_schedule_items táblára. Az RPC saját maga ellenőrzi az
  // owner(+family_db_beta)/explicit can_manage_schedule-jogosultságú
  // guardian/admin jogosultságot (lásd
  // supabase/migrations/20260927_guardian_child_permission_hardening_v1.sql)
  // és a schedule-specifikus validációt (title, days_of_week,
  // dátumok, koordinátapár) — a fentiek csak a leggyorsabb,
  // kliensoldali visszajelzéshez szükséges, a backenddel KONZISZTENS
  // minimális mezőellenőrzések, nincs új szabály kitalálva.
  const { error } = await supabase.rpc("create_child_schedule_item", {
    p_child_id: childId,
    p_title: title,
    p_schedule_type: scheduleType,
    p_time_local: timeLocal,
    p_description: descriptionRaw || null,
    p_start_date: scheduleType === "one_time" ? startDateRaw : null,
    p_arrival_time_local: arrivalTimeRaw || null,
    p_days_of_week: scheduleType === "recurring" ? daysOfWeek : null,
    p_origin_label: originLabelRaw || null,
    p_destination_label: destinationLabelRaw || null,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült létrehozni a napirendi elemet. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, childId };
}

export async function updateChildScheduleItemAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const itemId = String(formData.get("itemId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const scheduleType = String(formData.get("scheduleType") ?? "").trim();
  const timeLocal = String(formData.get("timeLocal") ?? "").trim();
  const arrivalTimeRaw = String(formData.get("arrivalTimeLocal") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  const originLabelRaw = String(formData.get("originLabel") ?? "").trim();
  const destinationLabelRaw = String(formData.get("destinationLabel") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "true").trim();

  if (!itemId) return { error: "Hiányzó napirendi elem azonosító." };
  if (!title) return { error: "A megnevezés megadása kötelező." };
  if (scheduleType !== "one_time" && scheduleType !== "recurring") {
    return { error: "Érvénytelen napirend-típus." };
  }
  if (!timeLocal) return { error: "A kezdési idő megadása kötelező." };
  if (scheduleType === "one_time" && !startDateRaw) {
    return { error: "Egyszeri napirendi elemhez a dátum megadása kötelező." };
  }
  const daysOfWeek = scheduleType === "recurring" ? parseDaysOfWeek(formData) : [];
  if (scheduleType === "recurring" && daysOfWeek.length === 0) {
    return { error: "Ismétlődő napirendi elemhez legalább egy nap kiválasztása kötelező." };
  }

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő update_child_schedule_item(...) RPC — ugyanaz
  // az elv, mint a create actionnél: a jogosultság-ellenőrzés és a
  // schedule-specifikus validáció teljes egészében az RPC-ben történik.
  const { error } = await supabase.rpc("update_child_schedule_item", {
    p_id: itemId,
    p_title: title,
    p_schedule_type: scheduleType,
    p_time_local: timeLocal,
    p_description: descriptionRaw || null,
    p_start_date: scheduleType === "one_time" ? startDateRaw : null,
    p_arrival_time_local: arrivalTimeRaw || null,
    p_days_of_week: scheduleType === "recurring" ? daysOfWeek : null,
    p_origin_label: originLabelRaw || null,
    p_destination_label: destinationLabelRaw || null,
    p_is_active: isActiveRaw !== "false",
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült menteni a napirendi elemet. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true };
}

export async function deleteChildScheduleItemAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return { error: "Hiányzó napirendi elem azonosító." };

  // Nincs dedikált delete RPC — a MEGLÉVŐ
  // "child_schedule_items_delete_via_family_owner" RLS policy (lásd
  // supabase/migrations/20260927_guardian_child_permission_hardening_v1.sql)
  // már önmagában biztonságosan lefedi a DELETE jogosultságot (owner +
  // family_db_beta, VAGY explicit can_manage_schedule jogosultságú
  // aktív guardian, VAGY admin) — a feladat is kifejezetten ezt kéri,
  // ha az RLS már biztonságosan lefedi, nincs szükség új RPC-re.
  // FONTOS: ha RLS blokkolja, a DELETE NEM hibát ad, hanem csendben 0
  // sort érint — ezért a .select("id")-t explicit ellenőrizzük
  // (ugyanaz a minta, mint updateChildAction-ben).
  const supabase = createClient();
  const { data, error } = await supabase
    .from("child_schedule_items")
    .delete()
    .eq("id", itemId)
    .select("id");

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült törölni a napirendi elemet. Próbáld újra."
      ),
    };
  }
  if (!data || data.length === 0) {
    return {
      error:
        "Nincs jogosultságod ehhez a törléshez, vagy a napirendi elem nem található.",
    };
  }

  revalidatePath("/csalad");
  return { success: true };
}


// ────────────────────────────────────────────────────────────────
// Gyermekfiók — OWNER-oldali meghívás/visszavonás (lásd
// supabase/migrations/20260927_child_account_foundation.sql). Ugyanaz
// a beta-gate minta, mint a modul fenti összes owner-oldali actionjénél
// — a create_child_account_invitation RPC saját maga is megköveteli a
// has_pilot_access('family_db_beta')-t, a revoke_child_account_invitation
// és a revoke_child_account RPC-k nem, de a konzisztencia kedvéért
// (ugyanaz a UI-gate minden owner-oldali Family actionnél) ide is
// kirakjuk.
// ────────────────────────────────────────────────────────────────

export async function createChildAccountInvitationAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const childId = String(formData.get("childId") ?? "").trim();
  if (!childId) return { error: "Hiányzó gyermek azonosító." };

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő create_child_account_invitation(uuid, integer)
  // RPC — nincs kliensoldali/szerver akcióbeli direkt INSERT a
  // child_account_invitations táblára. Az RPC saját maga ellenőrzi az
  // owner jogosultságot, és a plaintext tokent KIZÁRÓLAG itt, a
  // visszatérési értékben adja ki — a DB-ben csak a hash tárolódik.
  const { data, error } = await supabase
    .rpc("create_child_account_invitation", { p_child_id: childId })
    .maybeSingle();

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elkészíteni a gyermekfiók-meghívót. Próbáld újra."
      ),
    };
  }
  if (!data) {
    return {
      error: "Nem sikerült elkészíteni a gyermekfiók-meghívót. Próbáld újra.",
    };
  }

  // A Supabase kliens (Database generic nélkül, lásd lib/family/data.ts
  // fejléc-kommentjét) a table-visszatérésű RPC-k sorát `{}`-ként
  // infereli fordítási időben — ugyanaz a type boundary-elv, mint a
  // normalizeToOneRelation()-nél: EGYETLEN, explicit castban kezeljük,
  // a függvény többi része nem `any`-vel dolgozik.
  const invitationRow = data as { invitation_id: string; token: string; expires_at: string };

  revalidatePath("/csalad");
  return {
    success: true,
    childId,
    childAccountInvitationToken: invitationRow.token,
  };
}

export async function revokeChildAccountInvitationAction(
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
  // KIZÁRÓLAG a meglévő revoke_child_account_invitation(uuid) RPC — az
  // RPC saját maga ellenőrzi, hogy a hívó a meghívás mögötti child
  // family aktív ownerje-e, és hogy a meghívó még pending státuszú.
  const { error } = await supabase.rpc("revoke_child_account_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült visszavonni a gyermekfiók-meghívót. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true };
}

// FONTOS: a revoke_child_account(uuid) RPC a visszavonást VÉGLEGESEN
// rögzíti — a child_accounts_guard_status_transition trigger (lásd
// supabase/migrations/20260927_child_account_foundation.sql) blokkol
// minden revoked -> bármi átmenetet, tehát ez a leválasztás NEM
// vonható vissza egy új meghívó elfogadásával sem (a child_accounts
// sor child_id-ja unique, és a meglévő, revoked sor megmarad). Ez a UI
// (ChildAccountSection.tsx) szövegében is jelzi.
export async function revokeChildAccountAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };
  if (!hasFamilyBetaAccess(profile)) {
    return { error: "Ez a funkció még nem elérhető a fiókodhoz." };
  }

  const childId = String(formData.get("childId") ?? "").trim();
  if (!childId) return { error: "Hiányzó gyermek azonosító." };

  const supabase = createClient();
  // KIZÁRÓLAG a meglévő revoke_child_account(uuid) RPC — az RPC saját
  // maga ellenőrzi, hogy a hívó a child family aktív ownerje-e.
  const { error } = await supabase.rpc("revoke_child_account", {
    p_child_id: childId,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült leválasztani a gyermekfiókot. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  return { success: true, childId };
}

// ────────────────────────────────────────────────────────────────
// Gyermekfiók — MEGHÍVOTT (a tokent birtokló) oldali elfogadás.
// SZÁNDÉKOSAN NEM gateli hasFamilyBetaAccess()-szel — ugyanaz az elv,
// mint acceptGuardianInvitationAction-nél fent: egy meghívott gyermek
// NEM feltétlenül béta-user, és a tényleges jogosultságot a MEGLÉVŐ
// accept_child_account_invitation(text) RPC saját ellenőrzése adja
// (auth.uid() + "nincs már aktív family_members sora" check — lásd
// supabase/migrations/20260927_child_account_foundation.sql), nem ez a
// szerveroldali action. A kliens KIZÁRÓLAG a tokent küldi (amit a
// szülőtől, out-of-band kapott linkből olvasott ki) — a szerver sosem
// "hisz el" semmilyen felhasználó-/gyermek-azonosítót a formData-ból.
export async function acceptChildAccountInvitationAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const { user } = await getCurrentUserAndProfile();
  if (!user) return { error: "Nem vagy bejelentkezve." };

  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Hiányzó vagy érvénytelen meghívó link." };

  const supabase = createClient();
  const { error } = await supabase.rpc("accept_child_account_invitation", {
    p_token: token,
  });

  if (error) {
    return {
      error: friendlyRpcError(
        error,
        "Nem sikerült elfogadni a gyermekfiók-meghívást. Próbáld újra."
      ),
    };
  }

  revalidatePath("/csalad");
  revalidatePath("/profil");

  // UX JAVITAS (20261003): a sikeres elfogadas UTAN szandekosan EXPLICIT
  // szerver-oldali redirect() a /csalad-ra, NEM { success: true }
  // visszaadasa. Ha itt sima state-et adnank vissza, a Next.js a Server
  // Action valaszakent a JELENLEGI (/gyermek-meghivo) route-ot is ujra-
  // renderelne, mielott a kliens useEffect-je a router.push("/csalad")-ot
  // lefuttatna -- az immar elfogadott (status=accepted) token ekkor a
  // previewChildAccountInvitation()-ben helyesen ervenytelennek minosulne,
  // es a "Ez a meghivas mar nem ervenyes." uzenet roviden felvillanna
  // SIKERES elfogadas utan is. A redirect() a Server Action-bol KIHAGYJA
  // a jelenlegi route ujra-renderelesét, egyenesen a /csalad RSC payload-
  // jat kuldi -- igy az invalid-token ujraellenorzes itt sosem fut le. A
  // normal (nem sikeres elfogadas utan megnyitott) ervenytelen/lejart/
  // visszavont/mar felhasznalt meghivo-oldal viselkedese
  // (app/gyermek-meghivo/page.tsx) ettol fuggetlenul, valtozatlanul
  // "Ez a meghivas mar nem ervenyes."-t jeleniti meg.
  redirect("/csalad");
}
