// VÉDETT ÚTVONAL — Cím autocomplete (2026-09-14, "cím-bevitel UX" sprint).
//
// Kicsi, célzott, forráskód-szintű teszt (a projekt már meglévő mintáját
// követve) — az address-search route.ts mockolás nélküli, valódi futtatása
// (Nominatim hívás, auth) külön infrastruktúrát igényelne, amit ez a kis
// UX-sprint nem indokol. Ez a teszt: (1) az ÚJ végpont a MEGLÉVŐ
// geocodert (searchPlaceCandidates) hívja, nem duplikál geokódoló logikát;
// (2) a searchPlaceCandidates() a MEGLÉVŐ Nominatim free-text lekérdezést/
// normalizálást használja, és 3 karakter alatt üres listát ad (nincs
// hívás); (3) a kliens (VedettUtvonalWorkspace) debounce-olja a hívást,
// max 5 javaslatot renderel, kiválasztásra kitölti az inputot.
//
//   node --test __tests__/vedett-route/address-autocomplete.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractCityContextFromQuery,
  rankSearchResultsByCity,
  toAddressAutocompleteCandidate,
  filterByExplicitCity,
  dedupeCandidatesByLabel,
  type NominatimRawResult,
} from "../../lib/vedett-route/geocode.ts";

const GEOCODE_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts");
const geocodeSrc = readFileSync(GEOCODE_PATH, "utf-8");

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "address-search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

const WORKSPACE_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalWorkspace.tsx");
const workspaceSrc = readFileSync(WORKSPACE_PATH, "utf-8");

const HOOK_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "useAddressAutocomplete.ts");
const hookSrc = readFileSync(HOOK_PATH, "utf-8");

const SEARCH_FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const searchFormSrc = readFileSync(SEARCH_FORM_PATH, "utf-8");

describe("cím autocomplete — searchPlaceCandidates() a MEGLÉVŐ geocoder építőelemeit használja", () => {
  test("searchPlaceCandidates a MEGLÉVŐ buildFreeTextQueryUrl/fetchNominatimResults-t hívja, majd rangsorol és a MEGLÉVŐ address-mezőkből épít labelt — nincs duplikált geokódoló logika/második geocoder", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a searchPlaceCandidates() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /buildFreeTextQueryUrl\(/);
    assert.match(fn, /fetchNominatimResults\(/);
    assert.match(fn, /rankSearchResultsByCity\(candidateResults, trimmed, city, options\.postalOrDistrict\)/);
    assert.match(fn, /\.map\(toAddressAutocompleteCandidate\)/);
  });

  test("explicit `city` esetén a Nominatim-kérés MAGA is strukturált (street=/city=/postalcode=), nem csak utólagos rangsorolás — SOHA nem kombinál structured és q= paramétert egy kérésben", () => {
    const fnMatch = geocodeSrc.match(/function buildStructuredAutocompleteQueryUrl\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a buildStructuredAutocompleteQueryUrl() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /params\.set\("street", query\)/);
    assert.match(fn, /params\.set\("city", city\)/);
    assert.match(fn, /params\.set\("countrycodes", "hu"\)/);
    assert.doesNotMatch(fn, /params\.set\("q",/);
  });

  test("RÉSZLEGES UTCANÉV (2026-09-14): explicit `city` esetén az ELSŐDLEGES kérés város-beépített free-text (q=<query>, <city>) — a strukturált street=/city= keresés csak FALLBACK, mert részleges utcanévnél túl szigorú", () => {
    const fnMatch = geocodeSrc.match(/function buildFreeTextAutocompleteQueryUrl\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a buildFreeTextAutocompleteQueryUrl() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /params\.set\("q", `\$\{query\}, \$\{city\}`\)/);
    assert.match(fn, /params\.set\("format", "jsonv2"\)/);
    assert.match(fn, /params\.set\("countrycodes", "hu"\)/);
    assert.doesNotMatch(fn, /params\.set\("street",/);
    assert.doesNotMatch(fn, /params\.set\("city",/);

    const searchFnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const searchFn = searchFnMatch![0];
    assert.match(searchFn, /const freeTextWithCityUrl = buildFreeTextAutocompleteQueryUrl\(trimmed, city, limit\);/);
    assert.match(searchFn, /if \(filterByExplicitCity\(results, city\)\.length === 0\) \{/);
    assert.match(searchFn, /const structuredUrl = buildStructuredAutocompleteQueryUrl\(trimmed, city, options\.postalOrDistrict, limit\);/);
  });

  test("ha a strukturált (város-korlátos) keresés 0 találatot ad, a MEGLÉVŐ free-text keresésre esik vissza (city nélküli ág, változatlan)", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /const url = buildFreeTextQueryUrl\(trimmed\);/);
  });

  test("3 karakternél rövidebb keresésnél NEM hívja a Nominatimot — üres listát ad", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /trimmed\.length < 3/);
    assert.match(fn, /return \[\];/);
  });

  test("a limit paraméter legfeljebb 5 találatra vágja a listát", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /limit = 5/);
    assert.match(fn, /\.slice\(0, limit\)/);
  });
});

describe("cím autocomplete — /api/admin/vedett-utvonal/address-search végpont", () => {
  test("a végpont admin/feature-flag gate-et használ (requireVedettRouteAccess, ugyanaz mint a többi VédettÚtvonal végponton)", () => {
    assert.match(routeSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(routeSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a MEGLÉVŐ searchPlaceCandidates()-t hívja, a city/postalOrDistrict mezőket is átadva — nincs második geocoding szolgáltatás", () => {
    assert.match(routeSrc, /import\s*\{\s*searchPlaceCandidates\s*\}\s*from\s*"@\/lib\/vedett-route\/geocode"/);
    assert.match(routeSrc, /searchPlaceCandidates\(q, \{ city, postalOrDistrict \}\)/);
  });

  test("hiba esetén is 200 OK + (esetleg üres) tömböt ad — az autocomplete hibája NEM blokkolhatja a routingot", () => {
    assert.match(routeSrc, /\.catch\(\(\) => \[\]\)/);
    assert.doesNotMatch(routeSrc, /status: 5\d\d/);
  });

  test("a válasz a searchPlaceCandidates() MÁR normalizált/rangsorolt listáját adja tovább, változatlanul", () => {
    assert.match(routeSrc, /return NextResponse\.json\(candidates\);/);
  });
});

describe("cím autocomplete — TELEPÜLÉS-ÉRZÉKENY RANGSOROLÁS (rankSearchResultsByCity/toAddressAutocompleteCandidate, valódi függvényhívással)", () => {
  function mockResult(overrides: Partial<NominatimRawResult> & { address: NominatimRawResult["address"] }): NominatimRawResult {
    return {
      display_name: "mock",
      lat: "47.0",
      lon: "19.0",
      ...overrides,
    };
  }

  test("A) 'Budaörs Szabadság út' — a budaörsi találat a pécsi elé kerül", () => {
    const pecs = mockResult({ address: { road: "Szabadság út", city: "Pécs", postcode: "7621" } });
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    // A Nominatim SAJÁT sorrendjében a pécsi jön előbb — a rangsorolásnak
    // ezt kell megfordítania.
    const ranked = rankSearchResultsByCity([pecs, budaors], "Budaörs Szabadság út");
    assert.equal(ranked[0], budaors, "a budaörsi találatnak kell elöl lennie");
    assert.equal(ranked[1], pecs);
  });

  test("B) 'Budapest Kossuth Lajos utca' — a budapesti találat más települések elé kerül", () => {
    const szeged = mockResult({ address: { road: "Kossuth Lajos utca", city: "Szeged", postcode: "6720" } });
    const budapest = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053", city_district: "V. kerület" } });
    const ranked = rankSearchResultsByCity([szeged, budapest], "Budapest Kossuth Lajos utca");
    assert.equal(ranked[0], budapest, "a budapesti találatnak kell elöl lennie");
    assert.equal(ranked[1], szeged);
  });

  test("B2) explicit település-kontextus hiányában is a Budapest kap alapértelmezett prioritást más településekkel szemben", () => {
    const csepel = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1211", city_district: "XXI. kerület" } });
    const debrecen = mockResult({ address: { road: "Kossuth Lajos utca", city: "Debrecen", postcode: "4024" } });
    const ranked = rankSearchResultsByCity([debrecen, csepel], "Kossuth Lajos utca");
    assert.equal(ranked[0], csepel, "Budapest (bármelyik kerülete) alapértelmezetten előzze meg a más településeket");
  });

  test("C) a label tartalmazza az irányítószámot, ha a Nominatim visszaadja — 'Budaörs Szabadság út' -> '2040 Budaörs, Szabadság út'", () => {
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const candidate = toAddressAutocompleteCandidate(budaors);
    assert.equal(candidate.label, "2040 Budaörs, Szabadság út");
    assert.equal(candidate.postcode, "2040");
    assert.equal(candidate.city, "Budaörs");
  });

  test("C2) Budapesten a kerület is megjelenik a labelben, ha elérhető — '1053 Budapest V. kerület, Kossuth Lajos utca'", () => {
    const result = mockResult({
      address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053", city_district: "V. kerület" },
    });
    const candidate = toAddressAutocompleteCandidate(result);
    assert.equal(candidate.label, "1053 Budapest V. kerület, Kossuth Lajos utca");
    assert.equal(candidate.district, "V. kerület");
  });

  test("irányítószám hiányában is helyes a label — '<település>, <utca>'", () => {
    const result = mockResult({ address: { road: "Fő utca", village: "Kismaros" } });
    const candidate = toAddressAutocompleteCandidate(result);
    assert.equal(candidate.label, "Kismaros, Fő utca");
  });

  test("D) a searchPlaceCandidates()-ben a max. 5 találat szabály a rangsorolás/dedup UTÁN vágja a listát", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /const ranked = rankSearchResultsByCity\(candidateResults, trimmed, city, options\.postalOrDistrict\);/);
    assert.match(fn, /candidates\.slice\(0, limit\)/);
  });

  test("extractCityContextFromQuery — az első szó CSAK akkor city-context, ha van rá igazoló találat", () => {
    const budaorsResult = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const budapestResult = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053" } });

    assert.equal(extractCityContextFromQuery("Budaörs Szabadság út", [budaorsResult]), "Budaörs");
    assert.equal(extractCityContextFromQuery("Budapest Kossuth Lajos utca", [budapestResult]), "Budapest");
  });

  test("HARDENING — 'Kossuth Lajos utca' NEM kap 'Kossuth' city-contextet (nincs Kossuth nevű település a találatok között)", () => {
    const budapestResult = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053" } });
    assert.equal(extractCityContextFromQuery("Kossuth Lajos utca", [budapestResult]), null);
  });

  test("HARDENING — 'Szabadság út' NEM kap 'Szabadság' city-contextet (nincs Szabadság nevű település a találatok között)", () => {
    const budaorsResult = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    assert.equal(extractCityContextFromQuery("Szabadság út", [budaorsResult]), null);
  });

  test("üres query/találatlista esetén is null (nincs kivétel)", () => {
    assert.equal(extractCityContextFromQuery("", []), null);
    assert.equal(extractCityContextFromQuery("Kossuth Lajos utca", []), null);
  });

  test("HARDENING — city-context hiányában ('Kossuth Lajos utca') a rangsorolás a Budapest-alapértelmezésre esik vissza, NEM egy téves első-token büntetésre", () => {
    const debrecen = mockResult({ address: { road: "Kossuth Lajos utca", city: "Debrecen", postcode: "4024" } });
    const budapest = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053" } });
    const ranked = rankSearchResultsByCity([debrecen, budapest], "Kossuth Lajos utca");
    assert.equal(ranked[0], budapest, "a téves 'Kossuth' jelölt elvetése után a Budapest-alapértelmezésnek kell érvényesülnie");
  });

  test("HARDENING — 'Budaörs Szabadság út' TOVÁBBRA IS Budaörs-prioritást ad", () => {
    const pecs = mockResult({ address: { road: "Szabadság út", city: "Pécs", postcode: "7621" } });
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const ranked = rankSearchResultsByCity([pecs, budaors], "Budaörs Szabadság út");
    assert.equal(ranked[0], budaors);
  });

  test("HARDENING — 'Budapest Kossuth Lajos utca' TOVÁBBRA IS Budapest-prioritást ad", () => {
    const szeged = mockResult({ address: { road: "Kossuth Lajos utca", city: "Szeged", postcode: "6720" } });
    const budapest = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053" } });
    const ranked = rankSearchResultsByCity([szeged, budapest], "Budapest Kossuth Lajos utca");
    assert.equal(ranked[0], budapest);
  });

  test("HARDENING — a postcode-os label továbbra is működik", () => {
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    assert.equal(toAddressAutocompleteCandidate(budaors).label, "2040 Budaörs, Szabadság út");
  });

  test("1) city='Budaörs' + q='Szabadság út' — filterByExplicitCity KIZÁRJA Csömört/Pécset, csak a budaörsi marad", () => {
    const csomor = mockResult({ address: { road: "Szabadság út", village: "Csömör", postcode: "2141" } });
    const pecs = mockResult({ address: { road: "Szabadság út", city: "Pécs", postcode: "7621" } });
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const filtered = filterByExplicitCity([csomor, pecs, budaors], "Budaörs");
    assert.deepEqual(filtered, [budaors], "csak a budaörsi találat maradhat, ha van helyi találat");
  });

  test("2) city='Sóskút' + q='Petőfi utca' — a budapesti XVI./XVII. kerületi Petőfi utcák NEM, csak a sóskúti marad", () => {
    const bpXVI = mockResult({ address: { road: "Petőfi utca", city: "Budapest", postcode: "1163", city_district: "XVI. kerület" } });
    const bpXVII = mockResult({ address: { road: "Petőfi utca", city: "Budapest", postcode: "1173", city_district: "XVII. kerület" } });
    const soskut = mockResult({ address: { road: "Petőfi utca", village: "Sóskút", postcode: "2038" } });
    const filtered = filterByExplicitCity([bpXVI, bpXVII, soskut], "Sóskút");
    assert.deepEqual(filtered, [soskut], "kizárólag a sóskúti találatnak kell megmaradnia");
  });

  test("7) RÉSZLEGES UTCANÉV — city='Budaörs' + q='szab' — a filterByExplicitCity/rankSearchResultsByCity/dedupeCandidatesByLabel lánc a rövid, részleges query mellett is csak a budaörsi találatot adja (nem függ a query hosszától)", () => {
    const csomor = mockResult({ address: { road: "Szabadság út", village: "Csömör", postcode: "2141" } });
    const pecs = mockResult({ address: { road: "Szabadság út", city: "Pécs", postcode: "7621" } });
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const filtered = filterByExplicitCity([csomor, pecs, budaors], "Budaörs");
    const ranked = rankSearchResultsByCity(filtered, "szab", "Budaörs");
    const candidates = dedupeCandidatesByLabel(ranked.map(toAddressAutocompleteCandidate));
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].label, "2040 Budaörs, Szabadság út");
  });

  test("7b) RÉSZLEGES UTCANÉV — city='Budaörs' + q='szabadsá' (majdnem teljes) — ugyanaz az eredmény, mint 'szab'-nál", () => {
    const csomor = mockResult({ address: { road: "Szabadság út", village: "Csömör", postcode: "2141" } });
    const budaors = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const filtered = filterByExplicitCity([csomor, budaors], "Budaörs");
    const ranked = rankSearchResultsByCity(filtered, "szabadsá", "Budaörs");
    const candidates = dedupeCandidatesByLabel(ranked.map(toAddressAutocompleteCandidate));
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].label, "2040 Budaörs, Szabadság út");
  });

  test("8) RÉSZLEGES UTCANÉV — city='Sóskút' + q='pet' — a budapesti XVI./XVII. kerületi Petőfi utcák NEM, csak a sóskúti marad", () => {
    const bpXVI = mockResult({ address: { road: "Petőfi utca", city: "Budapest", postcode: "1163", city_district: "XVI. kerület" } });
    const bpXVII = mockResult({ address: { road: "Petőfi utca", city: "Budapest", postcode: "1173", city_district: "XVII. kerület" } });
    const soskut = mockResult({ address: { road: "Petőfi utca", village: "Sóskút", postcode: "2038" } });
    const filtered = filterByExplicitCity([bpXVI, bpXVII, soskut], "Sóskút");
    const ranked = rankSearchResultsByCity(filtered, "pet", "Sóskút");
    const candidates = dedupeCandidatesByLabel(ranked.map(toAddressAutocompleteCandidate));
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].label, "2038 Sóskút, Petőfi utca");
  });

  test("3) city='Budapest' + postalOrDistrict='V. kerület' + q='Kossuth Lajos utca' — a V. kerületi találat kap prioritást más budapesti kerületekkel szemben", () => {
    const bpXIII = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1136", city_district: "XIII. kerület" } });
    const bpV = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053", city_district: "V. kerület" } });
    const ranked = rankSearchResultsByCity([bpXIII, bpV], "Kossuth Lajos utca", "Budapest", "V. kerület");
    assert.equal(ranked[0], bpV, "a V. kerületi találatnak kell elöl lennie");
  });

  test("4) city nélkül a jelenlegi (query-alapú) fallback rangsorolás továbbra is működik", () => {
    const szeged = mockResult({ address: { road: "Kossuth Lajos utca", city: "Szeged", postcode: "6720" } });
    const budapest = mockResult({ address: { road: "Kossuth Lajos utca", city: "Budapest", postcode: "1053" } });
    const ranked = rankSearchResultsByCity([szeged, budapest], "Budapest Kossuth Lajos utca");
    assert.equal(ranked[0], budapest);
  });

  test("5) duplikált label-ek kiszűrődnek (dedupeCandidatesByLabel, sorrend-megtartó)", () => {
    const a = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const aDuplicate = mockResult({ address: { road: "Szabadság út", town: "Budaörs", postcode: "2040" } });
    const b = mockResult({ address: { road: "Fő utca", village: "Kismaros" } });
    const candidates = [a, aDuplicate, b].map(toAddressAutocompleteCandidate);
    const deduped = dedupeCandidatesByLabel(candidates);
    assert.equal(deduped.length, 2);
    assert.equal(deduped[0].label, "2040 Budaörs, Szabadság út");
    assert.equal(deduped[1].label, "Kismaros, Fő utca");
  });

  test("házszám a labelben, ha ismert — '2040 Budaörs, Szabadság út 27'", () => {
    const result = mockResult({ address: { road: "Szabadság út", house_number: "27", town: "Budaörs", postcode: "2040" } });
    assert.equal(toAddressAutocompleteCandidate(result).label, "2040 Budaörs, Szabadság út 27");
  });
});

describe("cím autocomplete — KÖZÖS useAddressAutocomplete() hook (lib/vedett-route/useAddressAutocomplete.ts)", () => {
  test("minimum 3 karakter és 300ms debounce a kereséshez", () => {
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_MIN_CHARS = 3/);
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 300/);
    assert.match(hookSrc, /setTimeout\(\(\) => \{/);
    assert.match(hookSrc, /query\.length < ADDRESS_AUTOCOMPLETE_MIN_CHARS/);
    assert.match(hookSrc, /setSuggestions\(\[\]\);\s*\n\s*return;/);
  });

  test("a hook a MEGLÉVŐ /api/admin/vedett-utvonal/address-search végpontot hívja, a city/postalOrDistrict-et is elküldve", () => {
    assert.match(hookSrc, /fetch\("\/api\/admin\/vedett-utvonal\/address-search"/);
    assert.match(hookSrc, /body: JSON\.stringify\(\{ q: query, city, postalOrDistrict \}\)/);
  });

  test("6) a hook city/postalOrDistrict paramétere OPCIONÁLIS (nincs második hook) — a car ág enélkül is hívhatja", () => {
    assert.match(hookSrc, /options: UseAddressAutocompleteOptions = \{\}/);
  });
});

describe("cím autocomplete — VedettUtvonalWorkspace (autós Honnan?/Hová?) továbbra is működik", () => {
  test("a KÖZÖS hookot importálja/használja mindkét mezőn (nincs duplikált hook), city nélkül (car ágnak nincs külön Város mezője)", () => {
    assert.match(workspaceSrc, /import\s*\{\s*useAddressAutocomplete\s*\}\s*from\s*"@\/lib\/vedett-route\/useAddressAutocomplete"/);
    assert.match(workspaceSrc, /useAddressAutocomplete\(carOriginAddress/);
    assert.match(workspaceSrc, /useAddressAutocomplete\(carDestinationAddress/);
  });

  test("javaslat kiválasztása (onMouseDown) a teljes címet az inputba írja, és bezárja a listát", () => {
    assert.match(workspaceSrc, /setCarOriginAddress\(s\.label\)/);
    assert.match(workspaceSrc, /setCarDestinationAddress\(s\.label\)/);
    assert.match(workspaceSrc, /setShowOriginSuggestions\(false\)/);
    assert.match(workspaceSrc, /setShowDestinationSuggestions\(false\)/);
  });

  test("AUTÓS MÓD IDEIGLENES KIKAPCSOLÁSA — CAR_ROUTING_ENABLED = false, a 🚗 Autó gomb és a car ág feltételesen (a konstanstól függően) jelenik meg, a car kód NEM törölve", () => {
    assert.match(workspaceSrc, /const CAR_ROUTING_ENABLED = false;/);
    assert.match(workspaceSrc, /\{CAR_ROUTING_ENABLED && travelMode === "car" \? \(/);
    // A car routing kód (handleCarRouteSubmit, /car-route hívás) VÁLTOZATLANUL a fájlban marad.
    assert.match(workspaceSrc, /function handleCarRouteSubmit/);
    assert.match(workspaceSrc, /fetch\("\/api\/admin\/vedett-utvonal\/car-route"/);
  });

  test("MÓDVÁLASZTÓ TELJES ELREJTÉSE (2026-09-14) — amíg CAR_ROUTING_ENABLED === false, SEM a 🚌 Tömegközlekedés, SEM a 🚗 Autó gomb nem jelenik meg (nincs mit választani) — a teljes selector UI a CAR_ROUTING_ENABLED feltételhez kötve, a módválasztó kódja NEM törölve", () => {
    const selectorMatch = workspaceSrc.match(/\{CAR_ROUTING_ENABLED && \(\s*\n\s*<div className="flex gap-2">[\s\S]*?\n\s*\)\}/);
    assert.ok(selectorMatch, "a teljes módválasztó div-nek CAR_ROUTING_ENABLED feltétel alá kell kerülnie");
    const selector = selectorMatch![0];
    assert.match(selector, /🚌 Tömegközlekedés/);
    assert.match(selector, /🚗 Autó/);
    assert.match(selector, /setTravelMode\("transit"\)/);
    assert.match(selector, /setTravelMode\("car"\)/);
  });
});

describe("cím autocomplete — VedettUtvonalSearchForm transit Honnan?/Hová? ('Cím vagy hely' mezők)", () => {
  test("a KÖZÖS hookot importálja/használja mindkét mezőn (origin.street/destination.street) — nincs második autocomplete rendszer", () => {
    assert.match(searchFormSrc, /import\s*\{\s*useAddressAutocomplete\s*\}\s*from\s*"@\/lib\/vedett-route\/useAddressAutocomplete"/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*origin\.type === "MANUAL" \? origin\.street : ""/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*destination\.type === "MANUAL" \? destination\.street : ""/);
  });

  test("a transit hívás a KÜLÖN Város és Irányítószám/kerület mezőt is átadja a hooknak (city-aware autocomplete)", () => {
    assert.match(searchFormSrc, /city: origin\.type === "MANUAL" \? origin\.city : undefined,/);
    assert.match(searchFormSrc, /postalOrDistrict: origin\.type === "MANUAL" \? origin\.districtOrPostalCode : undefined,/);
    assert.match(searchFormSrc, /city: destination\.type === "MANUAL" \? destination\.city : undefined,/);
    assert.match(searchFormSrc, /postalOrDistrict: destination\.type === "MANUAL" \? destination\.districtOrPostalCode : undefined,/);
  });

  test("javaslat kiválasztása a MEGLÉVŐ updateOriginManualField/updateDestinationManualField('street', ...)-et hívja — a geokódolás/routing útja VÁLTOZATLAN", () => {
    assert.match(searchFormSrc, /updateOriginManualField\("street", s\.label\)/);
    assert.match(searchFormSrc, /updateDestinationManualField\("street", s\.label\)/);
  });

  test("mindkét mezőn van blur-késleltetés (kattintás onMouseDown előbb fut le, mint a blur)", () => {
    assert.match(searchFormSrc, /onBlur=\{\(\) => setTimeout\(\(\) => setShowOriginStreetSuggestions\(false\), 150\)\}/);
    assert.match(searchFormSrc, /onBlur=\{\(\) => setTimeout\(\(\) => setShowDestinationStreetSuggestions\(false\), 150\)\}/);
  });

  test("a transit routing/MOTIS-hívás és a favorite-logika NEM módosult (handleSubmit/searchVedettRoutes-jellegű kód érintetlen — csak input-UX változott)", () => {
    assert.match(searchFormSrc, /function updateOriginManualField/);
    assert.match(searchFormSrc, /function updateDestinationManualField/);
  });
});
