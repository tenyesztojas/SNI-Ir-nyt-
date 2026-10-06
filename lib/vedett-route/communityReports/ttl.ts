// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — TTL / aktív vs. lejárt.
// A lejárt rekordot NEM töröljük (historikus feldolgozáshoz kell); a friss
// állapot-számítás egyszerűen kiszűri.

import { COMMUNITY_REPORT_DEFINITIONS, type CommunityReportType } from "./config.ts";

export function getCommunityReportTtlMinutes(type: CommunityReportType): number {
  return COMMUNITY_REPORT_DEFINITIONS[type].ttlMinutes;
}

export function computeCommunityReportExpiresAt(type: CommunityReportType, createdAt: Date): Date {
  return new Date(createdAt.getTime() + getCommunityReportTtlMinutes(type) * 60_000);
}

/** Aktív, ha now < expires_at (a lejárat pillanatában már lejárt). Érvénytelen dátum -> nem aktív. */
export function isCommunityReportActive(report: { expiresAt: string | Date }, now: Date = new Date()): boolean {
  const expires = new Date(report.expiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return now.getTime() < expires;
}
