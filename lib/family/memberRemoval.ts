// Családtag eltávolítása / önkéntes kilépés — függőségmentes, tesztelhető
// segédek. A felület ezek alapján dönti el, kinek mutat gombot; a tényleges
// jogosultságot MINDIG a szerveroldali RPC ellenőrzi
// (remove_family_member / leave_family, lásd
// supabase/migrations/20261103000000_family_member_removal.sql).

export type MemberRole = "owner" | "guardian";

export interface MemberActionViewer {
  userId: string;
  role: MemberRole;
}

export interface MemberActionTarget {
  userId: string;
  role: MemberRole;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Owner láthat eltávolító gombot más, nem owner tagnál. */
export function canRemoveMember(viewer: MemberActionViewer | null | undefined, target: MemberActionTarget): boolean {
  if (!viewer || !isUuid(viewer.userId)) return false;
  return viewer.role === "owner" && target.role !== "owner" && target.userId !== viewer.userId;
}

/** Nem owner (gondviselő) tag láthatja a kilépés gombot. */
export function canLeaveFamily(viewer: MemberActionViewer | null | undefined): boolean {
  return !!viewer && isUuid(viewer.userId) && viewer.role === "guardian";
}

export type RemoveMemberInput = { familyId: string; userId: string };

export function parseRemoveMemberInput(get: (key: string) => unknown): RemoveMemberInput | null {
  const familyId = String(get("familyId") ?? "").trim();
  const userId = String(get("userId") ?? "").trim();
  if (!isUuid(familyId) || !isUuid(userId)) return null;
  return { familyId, userId };
}

export function parseLeaveFamilyInput(get: (key: string) => unknown): { familyId: string } | null {
  const familyId = String(get("familyId") ?? "").trim();
  return isUuid(familyId) ? { familyId } : null;
}

// Sikeres művelet utáni visszajelzés: a server action a /csalad oldalra
// irányít a `csaladtag` paraméterrel (az eltávolított tag sora, illetve
// kilépéskor a teljes családkártya eltűnik, ezért az üzenet az oldal tetején
// jelenik meg). Ismeretlen értékre nincs üzenet.
export const MEMBER_ACTION_NOTICE_PARAM = "csaladtag";
export const MEMBER_ACTION_NOTICES = {
  eltavolitva: "A családtagot eltávolítottad. A gyermekekre vonatkozó jogosultságai is megszűntek.",
  kilepve: "Kiléptél a családból. A gyermekekre vonatkozó jogosultságaid megszűntek.",
  atadva: "Átadtad a család tulajdonjogát. Mostantól gondviselőként vagy a család tagja.",
} as const;
export type MemberActionNoticeCode = keyof typeof MEMBER_ACTION_NOTICES;

export function memberActionNotice(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MEMBER_ACTION_NOTICES, v)
    ? MEMBER_ACTION_NOTICES[v as MemberActionNoticeCode]
    : null;
}
