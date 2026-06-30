/**
 * Tartalomszűrő: érzékeny egészségügyi / SNI-vel kapcsolatos szavak.
 * Ha az értékelés szövege ilyen szavakat tartalmaz, a felhasználónak
 * megerősítő nyilatkozatot kell tennie (nem személyes adatközlés).
 */

const SENSITIVE_WORDS = [
  "autizmus", "autista", "autisztikus",
  "adhd", "figyelemhiányos",
  "diagnózis", "diagnosztizál", "diagnosztizált",
  "fogyatékos", "fogyatékosság", "fogyatékkal",
  "sni", "sajátos nevelési",
  "érintett", "érintettség",
  "tünet", "tünetek",
  "terápia", "terápiás",
  "fejlesztés", "fejlesztő",
  "gyógypedagóg", "pszichológus", "pszichiáter",
  "gyógyszer", "medicin",
  "spektrum", "asperger",
  "diszlexia", "diszkalkulia", "diszpraxia",
];

/** Visszaadja az érzékeny szavak listáját, ha a szövegben találhatók. */
export function detectSensitiveWords(text: string): string[] {
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.filter((word) => lower.includes(word));
}

/** Gyors ellenőrzés: van-e érzékeny szó a szövegben? */
export function hasSensitiveContent(text: string): boolean {
  return detectSensitiveWords(text).length > 0;
}

/** Ellenőrzi az összes szöveges mezőt egyszerre. */
export function checkReviewForSensitiveContent(fields: {
  title?: string;
  positiveText?: string;
  warningText?: string;
}): boolean {
  const combined = [fields.title, fields.positiveText, fields.warningText]
    .filter(Boolean)
    .join(" ");
  return hasSensitiveContent(combined);
}
