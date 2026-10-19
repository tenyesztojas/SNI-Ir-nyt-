// Fióktörlési állapotok — stabil API contract a /api/account/delete,
// a /api/account/transfer-owner és a Profil UI között. Az állapotot a DB
// (get_account_deletion_state_v2 / delete_own_account RPC) állapítja meg
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
  // delete_own_account / get_account_deletion_state_v2: megőrzendő vagy
  // automatikusan nem törölhető rekordok (pl. nyitott fellebbezés, jogi
  // visszatartás, admin-napló, DB-kényszer). Soha nem sikeres törlés.
  "RECORDS_MANUAL_REVIEW",
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
  "RECORDS_MANUAL_REVIEW",
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

export const RECORDS_MANUAL_REVIEW_MESSAGE =
  "A fiókodhoz olyan adatok kapcsolódnak (például folyamatban lévő ügy vagy megőrzési kötelezettség alá eső nyilvántartás), amelyek miatt a törlést nem tudjuk automatikusan elvégezni. A fiókod nem törlődött, a törlést egyedileg kezeljük. Kérjük, írj a kapcsolat@vedettsarok.hu címre.";

export const OWNER_TRANSFER_REQUIRED_MESSAGE =
  "Mielőtt törölheted a fiókodat, át kell adnod a család tulajdonjogát egy másik aktív családtagnak.";

export const SOLE_OWNER_CONFIRMATION_REQUIRED_MESSAGE =
  "A család és a kizárólagos gyermekadatok törléséhez külön megerősítés szükséges.";

export const ACCOUNT_DELETION_GENERIC_ERROR = "A fiók törlése most nem sikerült. Próbáld újra később.";

// A törlést blokkoló állapot felhasználói (magyar) üzenete.
export function deletionBlockedMessage(state: AccountDeletionState): string {
  if (state === "CHILD_ACCOUNT_USER") return CHILD_ACCOUNT_USER_MESSAGE;
  if (state === "RECORDS_MANUAL_REVIEW") return RECORDS_MANUAL_REVIEW_MESSAGE;
  if (state === "OWNER_TRANSFER_REQUIRED") return OWNER_TRANSFER_REQUIRED_MESSAGE;
  if (state === "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED") return SOLE_OWNER_CONFIRMATION_REQUIRED_MESSAGE;
  return MANUAL_REVIEW_MESSAGE;
}

export interface DeletionApiResult {
  status: number;
  body: Record<string, unknown>;
  // true KIZÁRÓLAG akkor, ha a delete_own_account RPC ok:true-t adott vissza.
  deleted: boolean;
  // Csak szerveroldali naplózásra; soha nem kerül a kliens válaszába.
  diagnostics?: { blocked_by?: string; sqlstate?: string };
}

// GET /api/account/delete — get_account_deletion_state_v2() válaszának leképezése.
export function interpretDeletionStateRpc(data: unknown, error: unknown): DeletionApiResult {
  const status = error ? null : parseAccountDeletionStatus(data);
  if (!status) return { status: 500, body: { ok: false, message: ACCOUNT_DELETION_GENERIC_ERROR }, deleted: false };
  return { status: 200, body: { ok: true, ...status }, deleted: false };
}

// POST /api/account/delete — delete_own_account(p_confirm_family_deletion) válaszának
// leképezése. Fail closed: csak a szigorúan ok === true válasz számít sikeres
// törlésnek; minden ok:false (kézi ügyintézés is) 409, minden ismeretlen/hibás válasz 500.
export function interpretDeleteOwnAccountRpc(data: unknown, error: unknown): DeletionApiResult {
  const fail: DeletionApiResult = { status: 500, body: { ok: false, message: ACCOUNT_DELETION_GENERIC_ERROR }, deleted: false };
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return fail;
  const r = data as Record<string, unknown>;
  if (r.ok === true) return { status: 200, body: { ok: true }, deleted: true };
  if (r.ok !== false) return fail;
  const status = parseAccountDeletionStatus(r);
  if (!status) return fail;
  const diagnostics: { blocked_by?: string; sqlstate?: string } = {};
  if (typeof r.blocked_by === "string") diagnostics.blocked_by = r.blocked_by;
  if (typeof r.sqlstate === "string") diagnostics.sqlstate = r.sqlstate;
  return {
    status: 409,
    body: { ok: false, code: status.state, message: deletionBlockedMessage(status.state), ...status },
    deleted: false,
    diagnostics: Object.keys(diagnostics).length ? diagnostics : undefined,
  };
}
