// MAPBOX SEARCH BOX AUTOCOMPLETE — TISZTA (Next.js-mentes) segédfüggvények
// (2026-09-14, "kredittakarékos sprint — Mapbox Search Box autocomplete").
//
// Ezek a függvények SZÁNDÉKOSAN NEM importálnak semmit a "next/server"-ből
// (vagy más Next.js futásidejű modulból) — kizárólag ezért kerültek külön
// fájlba, hogy a projekt MEGLÉVŐ tesztelési mintája (pure function import +
// mock adat, lásd pl. lib/vedett-route/geocode.ts) itt is használható
// legyen a route.ts VALÓDI futtatása (Next.js runtime) nélkül. A HTTP-hívást
// és a Request/Response kezelést továbbra is a
// app/api/admin/vedett-utvonal/address-search/route.ts végzi, ez a modul
// csak a keresési szöveg összeállítását, a prefix-szűrést és a Mapbox
// suggestion -> saját formátum leképezést adja.

export type MapboxSuggestFeature = {
  mapbox_id?: string;
  name?: string;
  place_formatted?: string;
  full_address?: string;
  context?: {
    postcode?: { name?: string };
    place?: { name?: string };
    district?: { name?: string };
    locality?: { name?: string };
  };
};

export type AddressAutocompleteSuggestion = {
  id: string;
  label: string;
  name?: string;
  city?: string;
  postcode?: string;
  district?: string;
  sessionToken: string;
};

// KERESÉSI SZÖVEG — ha van város, "<q>, <city>[, <postalOrDistrict>]"
// (pl. "szab, Budaörs"), a postalOrDistrict csak akkor kerül bele, ha NEM
// 4 jegyű irányítószám (azt a Mapbox `q=` szövegébe fűzni félrevezető
// lenne — a Search Box API-nak nincs külön postalcode= paramétere a
// /suggest végponton, ezért a kerület-jelölést a szövegbe illesztjük).
export function buildMapboxSuggestSearchText(query: string, city?: string, postalOrDistrict?: string): string {
  if (!city) return query;
  const districtPart = postalOrDistrict && !/^\d{4}$/.test(postalOrDistrict) ? `, ${postalOrDistrict}` : "";
  return `${query}, ${city}${districtPart}`;
}

// Ékezetek/kis-nagybetű levágása — a projekt egyéb normalizáló
// segédfüggvényeivel (pl. normalizeTextForCompare a geocode.ts-ben)
// AZONOS elvet követi, de itt szándékosan önálló (ez a modul nem
// importál a geocode.ts-ből, hogy a régi Nominatim-kód és az új Mapbox-kód
// egymástól teljesen leválasztva maradjon).
export function normalizeForPrefixMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// PREFIX HARDENING — EGYSZERŰ prefix/token egyezés, NEM fuzzy. A találat
// `name` mezője releváns, ha VAGY a teljes (normalizált) szöveg a
// query-vel kezdődik, VAGY valamelyik szó-token a query-vel kezdődik (pl.
// "Petőfi Sándor utca" a "pet" query-re a "petőfi" tokenen egyezik,
// "Dózsa György utca" NEM egyezik semelyik tokenen).
export function matchesQueryPrefix(query: string, candidateText: string | undefined): boolean {
  const normalizedQuery = normalizeForPrefixMatch(query);
  if (!normalizedQuery) return true;
  if (!candidateText) return false;
  const normalizedCandidate = normalizeForPrefixMatch(candidateText);
  if (normalizedCandidate.startsWith(normalizedQuery)) return true;
  return normalizedCandidate.split(/\s+/).some((token) => token.startsWith(normalizedQuery));
}

// LABEL/MEZŐ-LEKÉPEZÉS — a Mapbox SAJÁT mezőiből épül, NEM találunk ki
// vagy építünk új szöveget. `full_address` a legteljesebb Mapbox-mező
// ("<utca> <házszám>, <település>, ..."), `place_formatted` egy rövidebb
// alternatíva, `name` a végső fallback.
export function toAutocompleteSuggestion(
  feature: MapboxSuggestFeature,
  sessionToken: string
): AddressAutocompleteSuggestion | null {
  const id = feature.mapbox_id;
  const label = feature.full_address ?? feature.place_formatted ?? feature.name;
  if (!id || !label) return null;
  return {
    id,
    label,
    name: feature.name,
    city: feature.context?.place?.name ?? feature.context?.locality?.name,
    postcode: feature.context?.postcode?.name,
    district: feature.context?.district?.name,
    sessionToken,
  };
}

// A TELJES /suggest válasz feldolgozása: prefix-szűrés -> leképezés ->
// max. `limit` találat. Ugyanezt a láncot hívja a route.ts is — innen
// importálva, hogy a Next.js runtime nélküli teszt is PONTOSAN ugyanazt a
// logikát futtassa, amit a végpont valójában használ.
export function processMapboxSuggestFeatures(
  features: MapboxSuggestFeature[],
  query: string,
  sessionToken: string,
  limit = 5
): AddressAutocompleteSuggestion[] {
  return features
    .filter((feature) => matchesQueryPrefix(query, feature.name))
    .map((feature) => toAutocompleteSuggestion(feature, sessionToken))
    .filter((s): s is AddressAutocompleteSuggestion => s !== null)
    .slice(0, limit);
}
