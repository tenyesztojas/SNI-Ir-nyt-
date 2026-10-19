// Közösségi bejelentések / fellebbezések megőrzése — tiszta (DB-független) logika.
// Forrás: Adatkezelési Tájékoztató KS AT 2–4 (app/adatkezelesi-tajekoztato):
//   - bejelentés: retention_until után anonimizálás, majd 24 hónap múlva törlés
//     (legal_hold és nyitott ügy esetén soha);
//   - fellebbezés: a LEZÁRÁSTÓL számított 3 évig megőrzendő.
// Lásd docs/account-deletion/REPORT_RETENTION.md.
//
// BIZTONSÁGI ALAPELV: ha a lezárás időpontja ismeretlen (closed_at hiányzik),
// a fellebbezést megőrzendőnek tekintjük — időpontot nem találunk ki.

export const OPEN_REPORT_STATUSES = ["pending", "under_review"] as const;
export const OPEN_APPEAL_STATUSES = ["pending", "under_review"] as const;
export const CLOSED_APPEAL_STATUSES = ["upheld", "rejected"] as const;
export const APPEAL_RETENTION_MONTHS = 36;
export const ANONYMIZED_REPORT_DELETE_AFTER_MONTHS = 24;

export interface RetentionAppeal {
  report_id: string;
  status: string;
  closed_at?: string | null;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Igaz, ha a fellebbezést (és így a hozzá tartozó bejelentést) meg kell őrizni. */
export function isAppealRetained(appeal: RetentionAppeal, now: Date): boolean {
  if (!(CLOSED_APPEAL_STATUSES as readonly string[]).includes(appeal.status)) return true; // nyitott / ismeretlen státusz
  if (!appeal.closed_at) return true; // lezárás ideje ismeretlen → megőrzés
  const closedAt = new Date(appeal.closed_at);
  if (Number.isNaN(closedAt.getTime())) return true;
  return addMonths(closedAt, APPEAL_RETENTION_MONTHS) > now;
}

/** Igaz, ha a bejelentéshez nyitott fellebbezés tartozik (ilyenkor nem anonimizálunk). */
export function hasOpenAppeal(reportId: string, appeals: readonly RetentionAppeal[]): boolean {
  return appeals.some(
    (a) => a.report_id === reportId && (OPEN_APPEAL_STATUSES as readonly string[]).includes(a.status),
  );
}

/**
 * A törlési jelöltekből (már anonimizált, lejárt, legal_hold nélküli, lezárt
 * bejelentések) azok, amelyekhez NEM tartozik megőrzendő fellebbezés.
 */
export function selectDeletableReportIds(
  candidateIds: readonly string[],
  appeals: readonly RetentionAppeal[],
  now: Date,
): string[] {
  const retained = new Set(appeals.filter((a) => isAppealRetained(a, now)).map((a) => a.report_id));
  return candidateIds.filter((id) => !retained.has(id));
}
