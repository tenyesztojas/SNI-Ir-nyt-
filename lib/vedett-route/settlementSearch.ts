// Védett Útvonal — település-autocomplete: TISZTA (pure), adatforrástól
// FÜGGETLEN keresési/rangsorolási logika ("UX-fejlesztés, főoldali
// kiemelés és a Béta megjelölés eltávolítása" kör, A) rész).
//
// SZÁNDÉKOSAN nincs ebben a fájlban semmilyen JSON-import vagy fájl-I/O —
// ez tisztán a normalizálási/rangsorolási algoritmust tartalmazza, hogy
// mind a kliens oldali komponens (lib/vedett-route/settlements.ts, ami a
// data/hungarian-settlements.json-t importálja és ezt a modult hívja),
// mind a node --test alatt futó egységtesztek (ami a JSON-t egyszerű
// readFileSync-cel olvassa be, elkerülve a Node natív ESM JSON-import
// attribútum-követelményét) UGYANAZT a logikát használják — nincs
// duplikált keresési/rangsorolási kód.
//
// TELJESÍTMÉNY (spec "PERFORMANCE" szakasz): a normalizálást (ékezet- és
// kis/nagybetű-függetlenítés) settlement-enként CSAK EGYSZER, a
// buildSearchIndex() hívásakor végezzük el — nem minden keystroke-on az
// egész listán újra —, így a keresés maga (searchSettlements) már csak a
// már normalizált értékeken dolgozik.

export interface Settlement {
  name: string;
  // Budapestnek NINCS megyéje — ez a mező NULL Budapest esetén (lásd
  // data/hungarian-settlements.json és formatCountyLabel() lent), hogy a
  // dropdown másodlagos sora ne mutasson értelmetlen "Budapest megye"
  // szöveget.
  county: string | null;
}

interface IndexedSettlement extends Settlement {
  normalizedName: string;
  normalizedWords: string[];
}

export interface SettlementSearchIndex {
  entries: IndexedSettlement[];
}

export const SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH = 2;
export const SETTLEMENT_AUTOCOMPLETE_MAX_RESULTS = 8;

// Ékezet- és kis/nagybetű-független normalizálás. NFD felbontás után a
// kombináló ékezet-karaktereket (Unicode "Mn" — Mark, nonspacing —
// kategória) egyszerű regex-tartománnyal (̀-ͯ) távolítjuk el,
// ami lefedi a magyar (és a legtöbb latin-alapú) ékezeteket.
export function normalizeSettlementQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function buildSettlementSearchIndex(settlements: Settlement[]): SettlementSearchIndex {
  const entries: IndexedSettlement[] = settlements.map((s) => {
    const normalizedName = normalizeSettlementQuery(s.name);
    return {
      ...s,
      normalizedName,
      // Szóhatár-egyezéshez (spec 4. pont, "szó eleje egyezik") — a magyar
      // településnevek túlnyomó része egybeírt egy szó, de a logika
      // szándékosan felkészült a szóközzel/kötőjellel tagolt nevekre is.
      normalizedWords: normalizedName.split(/[\s-]+/).filter(Boolean),
    };
  });
  return { entries };
}

// Rangsorolási prioritás (spec 4. pont) — minél kisebb a szám, annál
// előrébb kerül a találat:
//   0 = pontos egyezés
//   1 = településnév eleje egyezik
//   2 = szó eleje egyezik
//   3 = településnév tartalmazza a keresett szöveget
// null = nincs egyezés.
function matchTier(normalizedQuery: string, entry: IndexedSettlement): 0 | 1 | 2 | 3 | null {
  if (entry.normalizedName === normalizedQuery) return 0;
  if (entry.normalizedName.startsWith(normalizedQuery)) return 1;
  if (entry.normalizedWords.some((w) => w.startsWith(normalizedQuery))) return 2;
  if (entry.normalizedName.includes(normalizedQuery)) return 3;
  return null;
}

// 0 karakter → [], 1 karakter → [] (spec "AUTOCOMPLETE" 1. és a tesztlista
// "0 karakter"/"1 karakter" pontjai) — a küszöb a TRIMMELT, nyers (nem
// normalizált) bemenet hosszán dől el, hogy egyetlen ékezetes karakter
// (ami NFD-bontás után is 1 karakter hosszú marad a kombináló jel
// eltávolítása után) ne adjon eltérő eredményt, mint egy ékezet nélküli.
export function searchSettlements(
  index: SettlementSearchIndex,
  query: string,
  maxResults: number = SETTLEMENT_AUTOCOMPLETE_MAX_RESULTS
): Settlement[] {
  const trimmed = query.trim();
  if (trimmed.length < SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH) return [];

  const normalizedQuery = normalizeSettlementQuery(trimmed);
  if (!normalizedQuery) return [];

  const scored: { entry: IndexedSettlement; tier: 0 | 1 | 2 | 3 }[] = [];
  for (const entry of index.entries) {
    const tier = matchTier(normalizedQuery, entry);
    if (tier !== null) scored.push({ entry, tier });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.entry.name.localeCompare(b.entry.name, "hu");
  });

  return scored.slice(0, maxResults).map(({ entry }) => ({ name: entry.name, county: entry.county }));
}

// Megjelenítési segédfüggvény a dropdown másodlagos sorához — Budapest
// (county: null) esetén NINCS másodlagos sor (lásd Settlement.county
// komment).
export function formatSettlementCountyLabel(county: string | null): string | null {
  if (!county) return null;
  return `${county} megye`;
}
