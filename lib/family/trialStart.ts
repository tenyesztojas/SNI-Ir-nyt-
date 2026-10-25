// Védett Család — 14 napos próbaidő indításának szerveroldali magja
// (függőségmentes, tesztelhető). A tényleges bekötés: lib/actions/familyTrial.ts.
//
// Jogosultság: KIZÁRÓLAG a család aktív ownere (family_members role='owner',
// status='active' — a DB is_family_owner() függvénye, auth.uid() alapján).
// A családazonosító a kliensé, de csak azt jelöli ki, MELYIK családról van szó:
// a jogosultságot a DB a session-userre ellenőrzi, így idegen családazonosító
// nem ad jogot. Dátumot a kliens nem küldhet (a DB számol 14 napot).

export type TrialStartResult =
  | { ok: true; started: boolean } // started=false: már folyamatban (ismételt kérés)
  | { ok: false; error: "disabled" | "invalid_family" | "not_authenticated" | "not_owner" | "not_eligible" | "unavailable" };

export interface TrialStartDeps {
  enabled(): boolean;
  getUserId(): Promise<string | null>;
  // public.start_family_trial(p_family_id) a SESSION-kliensen (auth.uid()):
  // tulajdonjog-ellenőrzés + indítás egy tranzakcióban, családonkénti zárral.
  startTrialRpc(familyId: string): Promise<unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RPC_ERRORS = new Set(["not_authenticated", "not_owner", "not_eligible"]);

export function isFamilyTrialStartEnabled(env: Record<string, string | undefined>): boolean {
  return env.FAMILY_TRIAL_START_ENABLED === "true";
}

// Az RPC által használt idempotencia-kulcs (DB: 'trial_start:' || family_id).
export function trialStartEventId(familyId: string): string {
  return `trial_start:${familyId.toLowerCase()}`;
}

// Szigorú leképezés: csak az ismert RPC-válaszok; minden más 'unavailable'.
export function mapTrialStartRpc(data: unknown): TrialStartResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "unavailable" };
  const r = data as { ok?: unknown; started?: unknown; error?: unknown };
  if (r.ok === true && typeof r.started === "boolean") return { ok: true, started: r.started };
  if (r.ok === false && typeof r.error === "string" && RPC_ERRORS.has(r.error)) {
    return { ok: false, error: r.error as "not_authenticated" | "not_owner" | "not_eligible" };
  }
  return { ok: false, error: "unavailable" };
}

export async function startFamilyTrialCore(deps: TrialStartDeps, rawFamilyId: unknown): Promise<TrialStartResult> {
  if (!deps.enabled()) return { ok: false, error: "disabled" };
  if (typeof rawFamilyId !== "string" || !UUID_RE.test(rawFamilyId)) return { ok: false, error: "invalid_family" };
  const familyId = rawFamilyId.toLowerCase();
  try {
    if (!(await deps.getUserId())) return { ok: false, error: "not_authenticated" };
    return mapTrialStartRpc(await deps.startTrialRpc(familyId));
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export const TRIAL_START_MESSAGES: Record<Exclude<TrialStartResult, { ok: true }>["error"], string> = {
  disabled: "A próbaidő indítása még nem érhető el.",
  invalid_family: "Érvénytelen család.",
  not_authenticated: "Jelentkezz be a folytatáshoz.",
  not_owner: "A próbaidőt csak a család tulajdonosa indíthatja.",
  not_eligible: "Ez a család már igénybe vette a próbaidőt, vagy aktív előfizetése van.",
  unavailable: "A próbaidő indítása most nem sikerült. Próbáld újra később.",
};
