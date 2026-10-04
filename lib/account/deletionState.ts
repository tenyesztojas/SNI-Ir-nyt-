// Fióktörlési állapotok — stabil API contract a /api/account/delete,
// a /api/account/transfer-owner és a Profil UI között. Az állapotot a DB
// (get_account_deletion_state / prepare_account_deletion RPC) állapítja meg
// a bejelentkezett user alapján; a kliens soha nem küld user_id-t.

export const ACCOUNT_DELETION_STATES = [
  "READY",
  "GUARDIAN_READY",
  "OTHER_OWNER_READY",
  "OWNER_TRANSFER_REQUIRED",
  "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED",
  "COMPLEX_FAMILY_MANUAL_REVIEW",
  "CHILD_ACCOUNT_MANUAL_REVIEW",
  "CHILD_ACCOUNT_USER",
] as const;
export type AccountDeletionState = (typeof ACCOUNT_DELETION_STATES)[number];

export interface TransferCandidate {
  user_id: string;
  display_name: string;
}
export interface TransferFamily {
  family_id: string;
  family_name: string | null;
  candidates: TransferCandidate[];
}
export interface FamilyDeletionInfo {
  family_id: string;
  family_name: string | null;
  child_count: number;
}
export interface AccountDeletionStatus {
  state: AccountDeletionState;
  transfer: TransferFamily[];
  family_deletion: FamilyDeletionInfo[];
}

// Ezekben az állapotokban a törlés (megerősítés nélkül vagy azzal) végrehajtható.
export const DELETE_ALLOWED_STATES: readonly AccountDeletionState[] = [
  "READY",
  "GUARDIAN_READY",
  "OTHER_OWNER_READY",
];

export const MANUAL_REVIEW_STATES: readonly AccountDeletionState[] = [
  "COMPLEX_FAMILY_MANUAL_REVIEW",
  "CHILD_ACCOUNT_MANUAL_REVIEW",
  "CHILD_ACCOUNT_USER",
];

export function parseAccountDeletionStatus(raw: unknown): AccountDeletionStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.state;
  if (typeof state !== "string" || !(ACCOUNT_DELETION_STATES as readonly string[]).includes(state)) return null;
  return {
    state: state as AccountDeletionState,
    transfer: Array.isArray(r.transfer) ? (r.transfer as TransferFamily[]) : [],
    family_deletion: Array.isArray(r.family_deletion) ? (r.family_deletion as FamilyDeletionInfo[]) : [],
  };
}

export const MANUAL_REVIEW_MESSAGE =
  "A fiókod olyan családi vagy gyermekfiók-adatokhoz kapcsolódik, amelyek automatikus törlése más felhasználó adatait vagy hozzáférését is érintheti. A törlést egyedileg kell kezelnünk. Kérjük, írj a kapcsolat@vedettsarok.hu címre.";

export const CHILD_ACCOUNT_USER_MESSAGE =
  "Ez egy gyermekfiók. A gyermekfiók törlését nem tudjuk automatikusan elvégezni, külön kezelést igényel. Kérjük, a gyermek szülője vagy gondviselője írjon a kapcsolat@vedettsarok.hu címre.";
