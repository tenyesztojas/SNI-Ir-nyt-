// VÉDETT ÚTVONAL — Cím autocomplete (2026-09-14, "cím-bevitel UX" sprint;
// 2026-09-14 "kredittakarékos sprint — Mapbox Search Box autocomplete":
// a provider Nominatimról Mapbox Search Box /suggest + /retrieve-re
// váltott).
//
// Kicsi, célzott teszt (a projekt már meglévő mintáját követve): a
// route.ts-ek (next/server importja miatt) mockolás nélküli, valódi
// futtatása külön infrastruktúrát igényelne, amit ez a kis UX-sprint nem
// indokol — ezeket FORRÁSKÓD-SZINTEN (regex) ellenőrizzük. A Mapbox
// suggestion -> saját formátum leképezés, a keresési szöveg összeállítása
// és a PREFIX HARDENING viszont TISZTA (Next.js-mentes) függvényekben él
// (lib/vedett-route/addressAutocompleteMapbox.ts) — ezeket VALÓDI
// függvényhívással, mock Mapbox adattal teszteljük.
//
//   node --test __tests__/vedett-route/address-autocomplete.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMapboxSuggestSearchText,
  matchesQueryPrefix,
  normalizeForPrefixMatch,
  processMapboxSuggestFeatures,
  toAutocompleteSuggestion,
  type MapboxSuggestFeature,
} from "../../lib/vedett-route/addressAutocompleteMapbox.ts";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "address-search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

const RETRIEVE_ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "address-retrieve", "route.ts");
const retrieveRouteSrc = readFileSync(RETRIEVE_ROUTE_PATH, "utf-8");

const WORKSPACE_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalWorkspace.tsx");
const workspaceSrc = readFileSync(WORKSPACE_PATH, "utf-8");

const HOOK_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "useAddressAutocomplete.ts");
const hookSrc = readFileSync(HOOK_PATH, "utf-8");

const SEARCH_FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const searchFormSrc = readFileSync(SEARCH_FORM_PATH, "utf-8");

function mockFeature(overrides: Partial<MapboxSuggestFeature>): MapboxSuggestFeature {
  return { mapbox_id: "mock-id", name: "mock", ...overrides };
}

describe("cím autocomplete — /api/admin/vedett-utvonal/address-search MOST a Mapbox Search Box /suggest-et hívja (Nominatim helyett)", () => {
  test("a végpont admin/feature-flag gate-et használ (requireVedettRouteAccess, ugyanaz mint a többi VédettÚtvonal végponton)", () => {
    assert.match(routeSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(routeSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a Mapbox Search Box /suggest végpontot hívja, NEM a régi Nominatim-alapú searchPlaceCandidates()-et", () => {
    assert.match(routeSrc, /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/suggest/);
    // A régi searchPlaceCandidates()-nek CSAK a fejlécben (magyarázó
    // kommentben, "ez volt az egyetlen hívóhelye") szabad szerepelnie —
    // a KÓDBAN (import/hívás) nem.
    assert.doesNotMatch(routeSrc, /import[\s\S]*?searchPlaceCandidates/);
    assert.doesNotMatch(routeSrc, /searchPlaceCandidates\(/);
  });

  test("a Mapbox access tokent a MEGLÉVŐ MAPBOX_ACCESS_TOKEN env variable-ből olvassa (ugyanaz, mint a /car-route végponton), SEHOL nincs hardcode-olva", () => {
    assert.match(routeSrc, /process\.env\.MAPBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(routeSrc, /pk\.[A-Za-z0-9._-]{20,}/, "nem lehet hardcode-olt Mapbox token a forráskódban");
  });

  test("language=hu és limit=5 paraméterrel hívja a Mapboxot, a KLIENS session tokenjét továbbadva (nem generál újat)", () => {
    assert.match(routeSrc, /params\.set\("language", "hu"\)/);
    assert.match(routeSrc, /params\.set\("limit", "5"\)/);
    assert.match(routeSrc, /params\.set\("session_token", sessionToken\)/);
    assert.doesNotMatch(routeSrc, /crypto\.randomUUID/, "a route.ts NEM generál session tokent, csak a hook");
  });

  test("minimum 3 karakter ÉS session token kötelező — különben nincs Mapbox-hívás, üres listát ad", () => {
    assert.match(routeSrc, /q\.length < 3 \|\| !sessionToken/);
    assert.match(routeSrc, /return NextResponse\.json\(\[\]\);/);
  });

  test("hiba/timeout/hiányzó token esetén is 200 OK + üres tömböt ad — az autocomplete hibája NEM blokkolhatja a kézi címbevitelt/routingot", () => {
    assert.match(routeSrc, /if \(!accessToken\) \{\s*\n\s*return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /\} catch \{\s*\n\s*return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /if \(!mapboxResponse\.ok\) \{\s*\n\s*return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /AbortSignal\.timeout\(5000\)/);
  });

  test("a PREFIX HARDENING + leképezés a TISZTA addressAutocompleteMapbox.ts modulból jön (processMapboxSuggestFeatures) — a route.ts csak a HTTP-hívást végzi", () => {
    assert.match(routeSrc, /import\s*\{[\s\S]*?processMapboxSuggestFeatures[\s\S]*?\}\s*from\s*"@\/lib\/vedett-route\/addressAutocompleteMapbox"/);
    assert.match(routeSrc, /processMapboxSuggestFeatures\(rawSuggestions, q, sessionToken, 5\)/);
  });

  test("a Nominatim geocoder KÓDJA VÁLTOZATLANUL megmarad (geocode.ts nem törölt) — csak az interaktív autocomplete providere váltott", () => {
    const GEOCODE_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts");
    const geocodeSrc = readFileSync(GEOCODE_PATH, "utf-8");
    assert.match(geocodeSrc, /export async function searchPlaceCandidates/);
    assert.match(geocodeSrc, /export async function geocodeAddress/);
  });
});

describe("cím autocomplete — /api/admin/vedett-utvonal/address-retrieve (Mapbox Search Box /retrieve)", () => {
  test("a végpont admin/feature-flag gate-et használ, ugyanazt, mint a /search", () => {
    assert.match(retrieveRouteSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(retrieveRouteSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a Mapbox Search Box /retrieve/{mapbox_id} végpontot hívja, UGYANAZZAL a session_tokennel", () => {
    assert.match(retrieveRouteSrc, /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/retrieve\//);
    assert.match(retrieveRouteSrc, /params\.set\("session_token", sessionToken\)/);
    assert.doesNotMatch(retrieveRouteSrc, /crypto\.randomUUID/, "a retrieve NEM generál új session tokent, a hívóét kapja meg");
  });

  test("id vagy sessionToken hiányában, illetve hiányzó MAPBOX_ACCESS_TOKEN/hiba/timeout esetén null-t ad — nem blokkolja a manuális címbevitelt", () => {
    assert.match(retrieveRouteSrc, /if \(!id \|\| !sessionToken\) \{\s*\n\s*return NextResponse\.json\(null\);/);
    assert.match(retrieveRouteSrc, /if \(!accessToken\) \{\s*\n\s*return NextResponse\.json\(null\);/);
    assert.match(retrieveRouteSrc, /\} catch \{\s*\n\s*return NextResponse\.json\(null\);/);
    assert.match(retrieveRouteSrc, /AbortSignal\.timeout\(5000\)/);
  });

  test("a válasz a longitude/latitude-ot és a teljes labelt tárolja (lat/lon/label) — a teljes Mapbox response NEM megy vissza", () => {
    assert.match(retrieveRouteSrc, /const \[lon, lat\] = coordinates;/);
    assert.match(retrieveRouteSrc, /return NextResponse\.json\(\{ lat, lon, label \}\);/);
  });
});

describe("cím autocomplete — addressAutocompleteMapbox.ts (TISZTA, Next.js-mentes) — valódi függvényhívással, mock Mapbox adattal", () => {
  test("KERESÉSI SZÖVEG — ha van város, '<q>, <city>' (pl. 'szab, Budaörs')", () => {
    assert.equal(buildMapboxSuggestSearchText("szab", "Budaörs"), "szab, Budaörs");
    assert.equal(buildMapboxSuggestSearchText("pet", "Sóskút"), "pet, Sóskút");
  });

  test("KERESÉSI SZÖVEG — város nélkül a nyers query marad", () => {
    assert.equal(buildMapboxSuggestSearchText("Kossuth Lajos utca 5"), "Kossuth Lajos utca 5");
  });

  test("KERESÉSI SZÖVEG — Budapest + kerület esetén a kerület is a szövegbe kerül (nem 4 jegyű irányítószám)", () => {
    assert.equal(buildMapboxSuggestSearchText("Kossuth Lajos utca", "Budapest", "V. kerület"), "Kossuth Lajos utca, Budapest, V. kerület");
  });

  test("KERESÉSI SZÖVEG — 4 jegyű irányítószám NEM kerül a szabad szövegbe (a Search Box /suggest-nek nincs postalcode= paramétere)", () => {
    assert.equal(buildMapboxSuggestSearchText("Kossuth Lajos utca", "Budapest", "1053"), "Kossuth Lajos utca, Budapest");
  });

  test("1) city='Budaörs' + q='szab' — a mock Mapbox suggestion (Szabadság út) megjelenik", () => {
    const features: MapboxSuggestFeature[] = [
      mockFeature({ mapbox_id: "mbx-1", name: "Szabadság út", full_address: "Szabadság út, 2040 Budaörs, Magyarország" }),
    ];
    const result = processMapboxSuggestFeatures(features, "szab", "session-a");
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "Szabadság út, 2040 Budaörs, Magyarország");
    assert.equal(result[0].sessionToken, "session-a");
  });

  test("2) city='Sóskút' + q='pet' — a mock Mapbox suggestion (Petőfi Sándor utca) megjelenik", () => {
    const features: MapboxSuggestFeature[] = [
      mockFeature({ mapbox_id: "mbx-2", name: "Petőfi Sándor utca", full_address: "Petőfi Sándor utca, 2038 Sóskút, Magyarország" }),
    ];
    const result = processMapboxSuggestFeatures(features, "pet", "session-b");
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "Petőfi Sándor utca, 2038 Sóskút, Magyarország");
  });

  test("3) query='pet' — Petőfi Sándor utca és Dózsa György utca mock suggestion közül a Dózsa KIESIK (PREFIX HARDENING)", () => {
    const features: MapboxSuggestFeature[] = [
      mockFeature({ mapbox_id: "mbx-3", name: "Petőfi Sándor utca", full_address: "Petőfi Sándor utca, Sóskút" }),
      mockFeature({ mapbox_id: "mbx-4", name: "Dózsa György utca", full_address: "Dózsa György utca, Sóskút" }),
    ];
    const result = processMapboxSuggestFeatures(features, "pet", "session-c");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Petőfi Sándor utca");
  });

  test("PREFIX HARDENING — matchesQueryPrefix ékezet- és kis-nagybetű-független, EGYSZERŰ prefix/token egyezés (nem agresszív fuzzy)", () => {
    assert.equal(matchesQueryPrefix("pet", "Petőfi Sándor utca"), true);
    assert.equal(matchesQueryPrefix("pet", "Dózsa György utca"), false);
    assert.equal(matchesQueryPrefix("szab", "Szabadság út"), true);
    assert.equal(matchesQueryPrefix("szabadsá", "Szabadság út"), true);
    // token-egyezés: nem csak a szöveg elején, egy külön szó elején is:
    assert.equal(matchesQueryPrefix("sza", "Kis Szabadság köz"), true);
  });

  test("normalizeForPrefixMatch — ékezetek/kis-nagybetű levágása", () => {
    assert.equal(normalizeForPrefixMatch("Szabadság út"), "szabadsag ut");
    assert.equal(normalizeForPrefixMatch("Petőfi Sándor utca"), "petofi sandor utca");
  });

  test("toAutocompleteSuggestion — a Mapbox SAJÁT mezőiből épít labelt (full_address > place_formatted > name), id nélkül null", () => {
    const withFullAddress = toAutocompleteSuggestion(
      mockFeature({ mapbox_id: "x", name: "Szabadság út", full_address: "Szabadság út, 2040 Budaörs", place_formatted: "Budaörs" }),
      "sess"
    );
    assert.equal(withFullAddress?.label, "Szabadság út, 2040 Budaörs");

    const withoutId = toAutocompleteSuggestion(mockFeature({ mapbox_id: undefined, name: "X" }), "sess");
    assert.equal(withoutId, null);
  });

  test("4/5) a max. 5 találat szabály a PREFIX-szűrés UTÁN vágja a listát", () => {
    const features: MapboxSuggestFeature[] = Array.from({ length: 8 }, (_, i) =>
      mockFeature({ mapbox_id: `mbx-${i}`, name: `Petőfi utca ${i}` })
    );
    const result = processMapboxSuggestFeatures(features, "pet", "session-d", 5);
    assert.equal(result.length, 5);
  });
});

describe("cím autocomplete — KÖZÖS useAddressAutocomplete() hook (lib/vedett-route/useAddressAutocomplete.ts) — Mapbox Search Box session kezelés", () => {
  test("minimum 3 karakter és 300ms debounce a kereséshez — VÁLTOZATLAN", () => {
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_MIN_CHARS = 3/);
    assert.match(hookSrc, /ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 300/);
    assert.match(hookSrc, /setTimeout\(\(\) => \{/);
    assert.match(hookSrc, /query\.length < ADDRESS_AUTOCOMPLETE_MIN_CHARS/);
    assert.match(hookSrc, /setSuggestions\(\[\]\);\s*\n\s*return;/);
  });

  test("a hook a MEGLÉVŐ /api/admin/vedett-utvonal/address-search végpontot hívja, a city/postalOrDistrict ÉS a sessionToken-t is elküldve", () => {
    assert.match(hookSrc, /fetch\("\/api\/admin\/vedett-utvonal\/address-search"/);
    assert.match(hookSrc, /body: JSON\.stringify\(\{ q: query, city, postalOrDistrict, sessionToken \}\)/);
  });

  test("6) SESSION TOKEN — egyszer generálódik (lazy useState init), NEM minden billentyűleütésnél: a useEffect a `value` változásra fut, a sessionToken generálása NEM a value-tól függ", () => {
    assert.match(hookSrc, /const \[sessionToken, setSessionToken\] = useState<string>\(\(\) => generateSessionToken\(\)\);/);
    // A generateSessionToken() hívás KIZÁRÓLAG a lazy useState initializerben és a resetSession()-ben szerepel — a fő useEffect-ben (ami `value`-ra fut) nem hívja újra.
    const effectMatch = hookSrc.match(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[value, disabled, city, postalOrDistrict, sessionToken\]\);/);
    assert.ok(effectMatch, "meg kell találni a fő useEffect blokkot");
    assert.doesNotMatch(effectMatch![0], /generateSessionToken\(/);
  });

  test("a hook külön 'új session' indítási lehetőséget ad (resetSession), amit a hívó suggestion-kiválasztás után vagy új keresés kezdetén hívhat — de ezt SENKI nem hívja automatikusan minden keystroke-nál", () => {
    assert.match(hookSrc, /const resetSession = useCallback\(\(\) => setSessionToken\(generateSessionToken\(\)\), \[\]\);/);
    assert.match(hookSrc, /return \[suggestions, setSuggestions, sessionToken, resetSession\] as const;/);
  });

  test("7) RETRIEVE — retrieveAddressSuggestion(id, sessionToken) UGYANAZT a sessionTokent küldi tovább a /address-retrieve végpontnak, amit paraméterként kapott (nem generál újat)", () => {
    const fnMatch = hookSrc.match(/export async function retrieveAddressSuggestion\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "meg kell találni a retrieveAddressSuggestion() függvényt");
    const fn = fnMatch![0];
    assert.match(fn, /fetch\("\/api\/admin\/vedett-utvonal\/address-retrieve"/);
    assert.match(fn, /body: JSON\.stringify\(\{ id, sessionToken \}\)/);
    assert.doesNotMatch(fn, /generateSessionToken\(/);
  });

  test("8) Mapbox hiba esetén a retrieveAddressSuggestion is null-t ad (nem dob kivételt) — a form/UI nem törik el", () => {
    const fnMatch = hookSrc.match(/export async function retrieveAddressSuggestion\([\s\S]*?\n\}/);
    const fn = fnMatch![0];
    assert.match(fn, /\} catch \{\s*\n\s*return null;/);
    assert.match(fn, /if \(!res\.ok\) return null;/);
  });

  test("a hook city/postalOrDistrict paramétere OPCIONÁLIS (nincs második hook) — a car ág enélkül is hívhatja", () => {
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
    assert.match(searchFormSrc, /import\s*\{\s*useAddressAutocomplete,\s*retrieveAddressSuggestion\s*\}\s*from\s*"@\/lib\/vedett-route\/useAddressAutocomplete"/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*origin\.type === "MANUAL" \? origin\.street : ""/);
    assert.match(searchFormSrc, /useAddressAutocomplete\(\s*\n\s*destination\.type === "MANUAL" \? destination\.street : ""/);
  });

  test("a transit hívás a KÜLÖN Város és Irányítószám/kerület mezőt is átadja a hooknak (city-aware autocomplete)", () => {
    assert.match(searchFormSrc, /city: origin\.type === "MANUAL" \? origin\.city : undefined,/);
    assert.match(searchFormSrc, /postalOrDistrict: origin\.type === "MANUAL" \? origin\.districtOrPostalCode : undefined,/);
    assert.match(searchFormSrc, /city: destination\.type === "MANUAL" \? destination\.city : undefined,/);
    assert.match(searchFormSrc, /postalOrDistrict: destination\.type === "MANUAL" \? destination\.districtOrPostalCode : undefined,/);
  });

  test("javaslat kiválasztása MOST a selectOriginSuggestion/selectDestinationSuggestion-t hívja (retrieve + MAP_PICKED bekötés), a régi updateOriginManualField/updateDestinationManualField('street', ...) FALLBACKKÉNT megmaradt a függvényeken belül", () => {
    assert.match(searchFormSrc, /void selectOriginSuggestion\(s\)/);
    assert.match(searchFormSrc, /void selectDestinationSuggestion\(s\)/);
    assert.match(searchFormSrc, /async function selectOriginSuggestion/);
    assert.match(searchFormSrc, /async function selectDestinationSuggestion/);
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

describe("KOORDINÁTA-ÁTADÁS (2026-09-14, 'Mapbox autocomplete koordináta a routingnak' sprint) — a retrieve eredménye a MEGLÉVŐ MAP_PICKED wire-invariánson megy a routingnak, NEM geokódol újra", () => {
  test("1) selectOriginSuggestion/selectDestinationSuggestion a retrieveAddressSuggestion(id, sessionToken)-t hívja, UGYANAZZAL a hook session tokenjével", () => {
    const originFnMatch = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n {2}\}/);
    assert.ok(originFnMatch, "meg kell találni a selectOriginSuggestion() függvényt");
    assert.match(originFnMatch![0], /retrieveAddressSuggestion\(s\.id, originAutocompleteSessionToken\)/);

    const destinationFnMatch = searchFormSrc.match(/async function selectDestinationSuggestion\([\s\S]*?\n {2}\}/);
    assert.ok(destinationFnMatch, "meg kell találni a selectDestinationSuggestion() függvényt");
    assert.match(destinationFnMatch![0], /retrieveAddressSuggestion\(s\.id, destinationAutocompleteSessionToken\)/);
  });

  test("2) sikeres retrieve esetén MAP_PICKED-re állítja az origin/destination state-et (fromCoordinates/toCoordinates ág, NEM MANUAL string) — a régi geocodeAddress()-t a szerver ekkor NEM hívja", () => {
    const originFnMatch = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n {2}\}/);
    assert.match(originFnMatch![0], /setOrigin\(\{ type: "MAP_PICKED", name: s\.label, latitude: retrieved\.lat, longitude: retrieved\.lon \}\)/);

    const destinationFnMatch = searchFormSrc.match(/async function selectDestinationSuggestion\([\s\S]*?\n {2}\}/);
    assert.match(destinationFnMatch![0], /setDestination\(\{ type: "MAP_PICKED", name: s\.label, latitude: retrieved\.lat, longitude: retrieved\.lon \}\)/);
  });

  test("2b) a MEGLÉVŐ (pure, Next.js-mentes) searchRequestBuilder valódi hívással bizonyítja: egy MAP_PICKED origin/destination fromCoordinates/toCoordinates-t ad, SOSEM from/to szöveget — ez a wire-szintű bizonyítéka, hogy a retrieve-elt koordinátára nem futna újra geokódolás", async () => {
    const { buildSearchRequestOriginFields, buildSearchRequestDestinationFields } = await import("../../lib/vedett-route/searchRequestBuilder.ts");
    const originFields = buildSearchRequestOriginFields({ type: "MAP_PICKED", name: "2040 Budaörs, Szabadság út", latitude: 47.4569, longitude: 18.9531 });
    assert.deepEqual(originFields.fromCoordinates, { latitude: 47.4569, longitude: 18.9531 });
    assert.equal("from" in originFields, false, "MAP_PICKED esetén NEM szabad from: string mezőt küldeni (az geokódolást indítana)");

    const destinationFields = buildSearchRequestDestinationFields({ type: "MAP_PICKED", name: "2038 Sóskút, Petőfi Sándor utca", latitude: 47.3417, longitude: 18.8329 });
    assert.deepEqual(destinationFields.toCoordinates, { latitude: 47.3417, longitude: 18.8329 });
    assert.equal("to" in destinationFields, false, "MAP_PICKED esetén NEM szabad to: string mezőt küldeni (az geokódolást indítana)");
  });

  test("3) sikertelen retrieve (nincs id / hiba) esetén a MEGLÉVŐ manuális mező-kitöltés a fallback — ekkor (VÁLTOZATLANUL) a szerver geokódol", () => {
    const originFnMatch = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n {2}\}/);
    assert.match(originFnMatch![0], /\} else \{\s*\n\s*updateOriginManualField\("street", s\.label\);/);

    const destinationFnMatch = searchFormSrc.match(/async function selectDestinationSuggestion\([\s\S]*?\n {2}\}/);
    assert.match(destinationFnMatch![0], /\} else \{\s*\n\s*updateDestinationManualField\("street", s\.label\);/);
  });

  test("4) kézi átírás AZONNAL nullázza/érvényteleníti a tárolt koordinátát — a MEGLÉVŐ updateOriginManualField/handleDestinationOverrideChange MINDIG friss MANUAL objektumot épít, ha az előző state MAP_PICKED volt (nincs lat/lon az új objektumban)", () => {
    // origin: updateOriginManualField MAP_PICKED (nem MANUAL) prev esetén ÚJ MANUAL bázisból indul, nincs benne latitude/longitude.
    const updateOriginFnMatch = searchFormSrc.match(/function updateOriginManualField\([\s\S]*?\n {2}\}/);
    assert.match(updateOriginFnMatch![0], /const base = prev\.type === "MANUAL" \? prev : \{ type: "MANUAL" as const, city: "Budapest", districtOrPostalCode: "", street: "" \};/);

    // destination: a MAP_PICKED-kor megjelenő input handleDestinationOverrideChange-et hívja, ami KÖZVETLENÜL egy friss MANUAL objektumra állít (lat/lon nélkül).
    const overrideFnMatch = searchFormSrc.match(/function handleDestinationOverrideChange\([\s\S]*?\n {2}\}/);
    assert.match(overrideFnMatch![0], /setDestination\(\{ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: value \}\);/);
    assert.doesNotMatch(overrideFnMatch![0], /latitude|longitude/);
  });

  test("5) HA nincs kiválasztott suggestion (a felhasználó csak gépel), a MEGLÉVŐ MANUAL → geocodeAddress() fallback teljesen érintetlen (a hook/JSX nem MAP_PICKED-re, hanem a normál mezőkre épül)", () => {
    assert.match(searchFormSrc, /origin\.type === "MANUAL" && !isManualAddressComplete\(origin\)/);
    assert.match(searchFormSrc, /destination\.type === "MANUAL" && !isManualAddressComplete\(destination\)/);
  });

  test("6) origin és destination EGYMÁSTÓL FÜGGETLEN sessiont/retrieve-et használ (külön hook-hívás, külön session token, külön select-függvény)", () => {
    assert.match(searchFormSrc, /const \[originStreetSuggestions, setOriginStreetSuggestions, originAutocompleteSessionToken, resetOriginAutocompleteSession\] = useAddressAutocomplete\(/);
    assert.match(searchFormSrc, /const \[destinationStreetSuggestions, setDestinationStreetSuggestions, destinationAutocompleteSessionToken, resetDestinationAutocompleteSession\] = useAddressAutocomplete\(/);
    assert.notEqual(
      searchFormSrc.match(/originAutocompleteSessionToken/g)?.length,
      undefined
    );
  });

  test("MOTIS/route scoring/pihenőpontok/Mapbox Directions/car routing/térkép/kedvencek/auth NEM módosult — ez a sprint KIZÁRÓLAG a suggestion-választás -> origin/destination state bekötést érinti", () => {
    assert.doesNotMatch(searchFormSrc, /searchbox\/v1\/directions/);
    // A handleSubmit MOTIS/orchestrator hívása körüli kódot NEM ez a sprint módosította — a selectOriginSuggestion/selectDestinationSuggestion ÖNÁLLÓ, a state-en kívül semmi mást nem érintő függvény.
    const originFnMatch = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n {2}\}/);
    assert.doesNotMatch(originFnMatch![0], /handleSubmit|MOTIS|orchestrat/i);
  });
});
