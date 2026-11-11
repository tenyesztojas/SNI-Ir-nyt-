// Programajánló beküldése szerveroldalon (függőségmentes, tesztelhető; a
// server action csak beköti a függőségeket: app/programajanlok/actions.ts).
//
// Folyamat: validálás → sebességkorlát → EGY beszúrás → sikeres beszúrás
// után LEGFELJEBB EGY admin push-kísérlet. A push hibája nem okoz újabb
// beszúrást vagy újrapróbálkozást, és nem rontja el a beküldés eredményét.
// Kézbesítési garancia nincs: külön beküldések (pl. dupla kattintás, hálózati
// újraküldés) külön programsort és külön értesítést hozhatnak létre.

export const PROGRAM_NOTIFY_TITLE = "📅 Új programajánlás";
export const PROGRAM_NOTIFY_URL = "/admin/programok";

export const PROGRAM_SUBMIT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 } as const;

export const PROGRAM_SUBMIT_ERRORS = {
  generic: "Hiba történt a beküldés során. Próbáld újra.",
  rateLimited: "Túl sok beküldés rövid időn belül. Kérjük, próbáld újra néhány perc múlva.",
  invalid: "Hiányzó vagy hibás adat. Ellenőrizd a kötelező mezőket.",
  invalidDate: "Érvénytelen dátum.",
  invalidUrl: "A webcím csak http:// vagy https:// kezdetű lehet.",
  tooLong: "Valamelyik mező túl hosszú.",
} as const;

const LIMITS = { name: 200, location: 200, description: 4000, url: 500, contact: 200 } as const;

export interface ProgramInput {
  name: string;
  location: string;
  event_date: string;
  description: string;
  url: string | null;
  contact: string | null;
}

export type ProgramValidation = { ok: true; value: ProgramInput } | { ok: false; error: string };

const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() : null);

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateProgramInput(raw: unknown): ProgramValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalid };
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  const location = str(r.location);
  const eventDate = str(r.eventDate);
  const description = str(r.description);
  if (!name || !location || !eventDate || !description) return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalid };
  for (const v of [r.url, r.contact]) {
    if (v !== undefined && v !== null && typeof v !== "string") return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalid };
  }
  const url = str(r.url) || null;
  const contact = str(r.contact) || null;
  if (
    name.length > LIMITS.name || location.length > LIMITS.location || description.length > LIMITS.description ||
    (url !== null && url.length > LIMITS.url) || (contact !== null && contact.length > LIMITS.contact)
  ) {
    return { ok: false, error: PROGRAM_SUBMIT_ERRORS.tooLong };
  }
  if (!isValidIsoDate(eventDate)) return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalidDate };
  if (url !== null) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalidUrl };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: PROGRAM_SUBMIT_ERRORS.invalidUrl };
  }
  return { ok: true, value: { name, location, event_date: eventDate, description, url, contact } };
}

export interface ProgramSubmitDeps {
  /** true = a kérés belefér a korlátba (a számlálót is növeli). Hibánál dobhat. */
  allowByRateLimit(): Promise<boolean>;
  /** Egyetlen beszúrási kísérlet; true = sikeres. Hibánál dobhat. */
  insert(value: ProgramInput): Promise<boolean>;
  notifyAdmins(title: string, body: string, url: string): Promise<void>;
}

export type ProgramSubmitResult = { ok: true } | { ok: false; error: string };

export async function submitProgram(raw: unknown, deps: ProgramSubmitDeps): Promise<ProgramSubmitResult> {
  const v = validateProgramInput(raw);
  if (!v.ok) return v;

  let allowed = false;
  try {
    allowed = await deps.allowByRateLimit();
  } catch {
    return { ok: false, error: PROGRAM_SUBMIT_ERRORS.generic }; // fail closed
  }
  if (!allowed) return { ok: false, error: PROGRAM_SUBMIT_ERRORS.rateLimited };

  let inserted = false;
  try {
    inserted = await deps.insert(v.value);
  } catch {
    inserted = false;
  }
  if (!inserted) return { ok: false, error: PROGRAM_SUBMIT_ERRORS.generic };

  try {
    await deps.notifyAdmins(PROGRAM_NOTIFY_TITLE, `${v.value.name} - ${v.value.location}`, PROGRAM_NOTIFY_URL);
  } catch {
    // A push hibája nem érinti a már sikeres beküldést; nincs újrapróbálkozás.
  }
  return { ok: true };
}
