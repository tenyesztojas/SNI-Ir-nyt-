// Meglévő család kezelésének szerveroldali előszűrése (függőségmentes,
// tesztelhető döntés). Szabály: a hívó AKTÍV szerepe az ADOTT családban dönt
// (vagy admin) — személyes pilotjog (family_db_beta) NEM kell hozzá.
// Új család létrehozása ettől függetlenül béta-kapus marad
// (createFamilyAction + create_family_with_owner).
// Ez csak előszűrés: a végső jogosultságot az adatbázis (RPC/RLS) dönti el.

export type FamilyRoleOrNone = "owner" | "guardian" | null;
export type AllowedFamilyRole = "owner" | "guardian";

export const FAMILY_ACCESS_DENIED_OWNER = "Ehhez a művelethez a család aktív tulajdonosának kell lenned.";
export const FAMILY_ACCESS_DENIED_MEMBER = "Ehhez a művelethez a család aktív tagjának kell lenned.";

export function decideFamilyRoleAccess(input: {
  isAdmin: boolean;
  role: FamilyRoleOrNone;
  allowed: readonly AllowedFamilyRole[];
}): boolean {
  if (input.isAdmin) return true;
  return input.role !== null && input.allowed.includes(input.role);
}

export function familyAccessDeniedMessage(allowed: readonly AllowedFamilyRole[]): string {
  return allowed.length === 1 && allowed[0] === "owner" ? FAMILY_ACCESS_DENIED_OWNER : FAMILY_ACCESS_DENIED_MEMBER;
}
