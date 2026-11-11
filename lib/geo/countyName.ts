// VédettSarok — megyenevek EGYETLEN normalizáló forrása (2026-11-07).
//
// Terminológia: a felületen mindenhol „megye” (nem „vármegye”).
//   * Belső azonosítók, adatbázismezők (county, lakhely_megye) és a tárolt
//     értékek NEM változnak: a kanonikus tárolt érték a puszta megyenév
//     („Pest”, „Győr-Moson-Sopron”), Budapestnél „Budapest”.
//   * Budapest önálló területi egység, NEM Pest megye része; címkéje
//     „Budapest” (nincs „Budapest megye”).
//   * Visszafelé kompatibilis bemenet: „Pest megye”, „Pest vármegye”,
//     „pest varmegye”, „Pest megyei” … mind „Pest”-re normalizálódik, így a
//     régi kifejezéssel is ugyanaz a találat jön.
//   * Külső szolgáltatótól (pl. Mapbox) érkező, „… vármegye” szöveget csak
//     MEGJELENÍTÉSKOR írjuk át (replaceVarmegyeInText); a külső kérés
//     paraméterei nem változnak.

export const BUDAPEST = "Budapest";

/** Magyarország 19 megyéje (KSH szerinti hivatalos név, „megye” szó nélkül). */
export const HUNGARIAN_COUNTY_NAMES: readonly string[] = [
  "Bács-Kiskun",
  "Baranya",
  "Békés",
  "Borsod-Abaúj-Zemplén",
  "Csongrád-Csanád",
  "Fejér",
  "Győr-Moson-Sopron",
  "Hajdú-Bihar",
  "Heves",
  "Jász-Nagykun-Szolnok",
  "Komárom-Esztergom",
  "Nógrád",
  "Pest",
  "Somogy",
  "Szabolcs-Szatmár-Bereg",
  "Tolna",
  "Vas",
  "Veszprém",
  "Zala",
];

function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_BY_KEY: ReadonlyMap<string, string> = new Map([
  ...HUNGARIAN_COUNTY_NAMES.map((n) => [foldKey(n), n] as [string, string]),
  [foldKey(BUDAPEST), BUDAPEST],
  ["budapest fovaros", BUDAPEST],
  ["fovaros", BUDAPEST],
]);

// „vármegye”, „varmegye”, „megye”, „megyei” végződés (ékezet nélküli kulcson).
const SUFFIX_RE = /\s+(?:var)?megyei?$/;

/**
 * Bármilyen (régi vagy új) megye-kifejezésből a tárolt, kanonikus név.
 * Üres bemenet → null. Ismeretlen név → a „(vár)megye” végződés nélküli,
 * megtisztított eredeti szöveg (adat nem vész el).
 */
export function normalizeCountyName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const key = foldKey(trimmed).replace(SUFFIX_RE, "").trim();
  const canonical = CANONICAL_BY_KEY.get(key);
  if (canonical) return canonical;
  const stripped = trimmed.replace(/\s+(?:[Vv][áa]r)?[Mm]egyei?$/, "").trim();
  return stripped || null;
}

export function isKnownCounty(raw: string | null | undefined): boolean {
  const n = normalizeCountyName(raw);
  return n !== null && CANONICAL_BY_KEY.get(foldKey(n)) === n;
}

/** Felhasználói címke: „Pest megye”, Budapestnél „Budapest”. */
export function formatCountyLabel(raw: string | null | undefined): string | null {
  const n = normalizeCountyName(raw);
  if (!n) return null;
  if (n === BUDAPEST) return BUDAPEST;
  if (isKnownCounty(n)) return `${n} megye`;
  return replaceVarmegyeInText(n);
}

/** Két megye-kifejezés ugyanazt a területet jelöli-e (régi/új alak, kis-nagybetű). */
export function countiesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCountyName(a);
  const nb = normalizeCountyName(b);
  if (!na || !nb) return false;
  return foldKey(na) === foldKey(nb);
}

/**
 * Adatbázis-szűréshez (`.in(...)`): a kanonikus név és a korábban szabad
 * szövegként eltárolhatott alakok, hogy a régi értékek is találatot adjanak.
 */
export function countyQueryVariants(raw: string | null | undefined): string[] {
  const n = normalizeCountyName(raw);
  if (!n) return [];
  const out = new Set<string>([n]);
  if (n === BUDAPEST) {
    out.add("Budapest főváros");
  } else {
    for (const suffix of ["megye", "Megye", "vármegye", "Vármegye", "megyei"]) out.add(`${n} ${suffix}`);
  }
  const original = (raw ?? "").replace(/\s+/g, " ").trim();
  if (original) out.add(original);
  return [...out];
}

// Csak az ÖNÁLLÓ „vármegye” szó és ragozott alakjai (vármegye, vármegyei,
// vármegyék, vármegyében, vármegyéből …); összetett tulajdonnév (pl.
// „Vármegyeháza”) érintetlen marad.
const VARMEGYE_WORD_RE =
  /(?<!\p{L})(V\u00c1RMEGY|V\u00e1rmegy|v\u00e1rmegy)(e|ei|\u00e9k|\u00e9kben|\u00e9kre|\u00e9kb\u0151l|\u00e9i|\u00e9ben|\u00e9b\u0151l|\u00e9be|\u00e9hez|\u00e9t|\u00e9nek|\u00e9re|\u00e9r\u0151l|\u00e9t\u0151l|\u00e9n|E|EI)(?!\p{L})/gu;

/** Külső szövegben (pl. Mapbox-cím) a „vármegye” szóalakok „megye”-re cserélése. */
export function replaceVarmegyeInText(text: string): string;
export function replaceVarmegyeInText(text: string | null | undefined): string | null | undefined;
export function replaceVarmegyeInText(text: string | null | undefined): string | null | undefined {
  if (!text) return text;
  return text.replace(VARMEGYE_WORD_RE, (_m, stem: string, rest: string) => {
    const megy = stem === "V\u00c1RMEGY" ? "MEGY" : stem.startsWith("V") ? "Megy" : "megy";
    return megy + rest;
  });
}
