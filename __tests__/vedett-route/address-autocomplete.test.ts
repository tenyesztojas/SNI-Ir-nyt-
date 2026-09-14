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
  test("searchPlaceCandidates a MEGLÉVŐ buildFreeTextQueryUrl/fetchNominatimResults/toPlaceCandidate-et hívja — nincs duplikált geokódoló logika", () => {
    const fnMatch = geocodeSrc.match(/export async function searchPlaceCandidates\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a searchPlaceCandidates() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /buildFreeTextQueryUrl\(/);
    assert.match(fn, /fetchNominatimResults\(/);
    assert.match(fn, /\.map\(toPlaceCandidate\)/);
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

  test("a válasz KIZÁRÓLAG {label, lat, lon} alakú tömb — nincs nyers Nominatim/nyers GeocodePlaceCandidate a kliensnek", () => {
    assert.match(routeSrc, /label:\s*c\.secondary/);
    assert.match(routeSrc, /lat:\s*c\.lat/);
    assert.match(routeSrc, /lon:\s*c\.lon/);
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
