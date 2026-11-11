// Családtulajdonosi szerep átadása — függőségmentes, tesztelhető segédek.
// A felület ezek alapján dönti el, kinek mutatja az átadást és kik
// választhatók; a tényleges jogosultságot MINDIG a szerveroldali RPC
// ellenőrzi (handover_family_ownership, lásd
// supabase/migrations/20261104000000_family_ownership_handover.sql).

import { isUuid, type MemberActionViewer, type MemberRole } from "./memberRemoval.ts";

export interface HandoverMember {
  userId: string;
  role: MemberRole;
  displayName: string;
}

/** Választható új tulajdonosok: a család (aktív) gondviselői, a néző kivételével. */
export function handoverCandidates(
  viewer: MemberActionViewer | null | undefined,
  members: readonly HandoverMember[]
): HandoverMember[] {
  if (!viewer || viewer.role !== "owner" || !isUuid(viewer.userId)) return [];
  return members.filter((m) => m.role === "guardian" && m.userId !== viewer.userId && isUuid(m.userId));
}

/** Az átadás akkor jelenik meg, ha a néző owner és van legalább egy jelölt. */
export function canHandOverOwnership(
  viewer: MemberActionViewer | null | undefined,
  members: readonly HandoverMember[]
): boolean {
  return handoverCandidates(viewer, members).length > 0;
}

export function parseHandoverInput(get: (key: string) => unknown): { familyId: string; newOwnerUserId: string } | null {
  const familyId = String(get("familyId") ?? "").trim();
  const newOwnerUserId = String(get("newOwnerUserId") ?? "").trim();
  if (!isUuid(familyId) || !isUuid(newOwnerUserId)) return null;
  return { familyId, newOwnerUserId };
}
