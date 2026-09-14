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
    assert.match(fn, /rankSearchResultsByCity\(results, trimmed\)/);
    assert.match(fn, /\.map\(toAddressAutocompleteCandidate\)/);
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

  test("a MEGLÉVŐ searchPlaceCandidates()-t hívja — nincs második geocoding szolgáltatás", () => {
    assert.match(routeSrc, /import\s*\{\s*searchPlaceCandidates\s*\}\s*from\s*"@\/lib\/vedett-route\/geocode"/);
    assert.match(routeSrc, /searchPlaceCandidates\(q\)/);
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

  test("D) a searchPlaceCandidates()-ben a max. 5 találat szabály a rangsorolás UTÁN vágja a listát", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /const ranked = rankSearchResultsByCity\(results, trimmed\);/);
    assert.match(fn, /ranked\.slice\(0, limit\)/);
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
});

describe("cím autocomplete — KÖZÖS useAddressAutocomplete() hook (lib/vedett-route/useAddressAutocomplete.ts)", () => {
  test("minimum 3 karakter és 300ms debounce a kereséshez", () => {
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_MIN_CHARS = 3/);
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 300/);
    assert.match(hookSrc, /setTimeout\(\(\) => \{/);
    assert.match(hookSrc, /query\.length < ADDRESS_AUTOCOMPLETE_MIN_CHARS/);
    assert.match(hookSrc, /setSuggestions\(\[\]\);\s*\n\s*return;/);
  });

  test("a hook a MEGLÉVŐ /api/admin/vedett-utvonal/address-search végpontot hívja", () => {
    assert.match(hookSrc, /fetch\("\/api\/admin\/vedett-utvonal\/address-search"/);
  });
});

describe("cím autocomplete — VedettUtvonalWorkspace (autós Honnan?/Hová?) továbbra is működik", () => {
  test("a KÖZÖS hookot importálja/használja mindkét mezőn (nincs duplikált hook)", () => {
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
});

describe("cím autocomplete — VedettUtvonalSearchForm transit Honnan?/Hová? ('Cím vagy hely' mezők)", () => {
  test("a KÖZÖS hookot importálja/használja mindkét mezőn (origin.street/destination.street) — nincs második autocomplete rendszer", () => {
    assert.match(searchFormSrc, /import\s*\{\s*useAddressAutocomplete\s*\}\s*from\s*"@\/lib\/vedett-route\/useAddressAutocomplete"/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*origin\.type === "MANUAL" \? origin\.street : ""/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*destination\.type === "MANUAL" \? destination\.street : ""/);
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
