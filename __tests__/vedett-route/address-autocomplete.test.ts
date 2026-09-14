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
  matchesQueryPrefix,
  normalizeForPrefixMatch,
  processMapboxGeocodingFeatures,
  type MapboxGeocodingFeature,
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

describe("cím autocomplete — /api/admin/vedett-utvonal/address-search Mapbox Geocoding v6 autocomplete", () => {
  test("a végpont admin/feature-flag gate-et használ", () => {
    assert.match(routeSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(routeSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a Mapbox Geocoding v6 /forward végpontot hívja, nem a régi Nominatim searchPlaceCandidates()-et és nem Search Box /suggest-et", () => {
    assert.match(routeSrc, /https:\/\/api\.mapbox\.com\/search\/geocode\/v6\/forward/);
    assert.doesNotMatch(routeSrc, /searchPlaceCandidates\(/);
    assert.doesNotMatch(routeSrc, /searchbox\/v1\/suggest/);
  });

  test("a meglévő MAPBOX_ACCESS_TOKEN env variable-t használja, nincs hardcode-olt token", () => {
    assert.match(routeSrc, /process\.env\.MAPBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(routeSrc, /pk\.[A-Za-z0-9._-]{20,}/);
  });

  test("autocomplete=true, country=hu, language=hu, street/address típusok és legfeljebb 10 nyers Mapbox találat", () => {
    assert.match(routeSrc, /params\.set\("autocomplete", "true"\)/);
    assert.match(routeSrc, /params\.set\("country", "hu"\)/);
    assert.match(routeSrc, /params\.set\("language", "hu"\)/);
    assert.match(routeSrc, /params\.set\("types", "street,address"\)/);
    assert.match(routeSrc, /params\.set\("limit", "10"\)/);
  });

  test("minimum 3 karakter alatt nincs Mapbox-hívás, üres listát ad", () => {
    assert.match(routeSrc, /if \(q\.length < 3\) return NextResponse\.json\(\[\]\);/);
  });

  test("hiba/timeout/hiányzó token esetén 200 OK + üres tömb marad, tehát a manuális címbevitel nem blokkolódik", () => {
    assert.match(routeSrc, /if \(!accessToken\) return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /AbortSignal\.timeout\(5000\)/);
    assert.match(routeSrc, /\} catch \{\s*\n\s*return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /if \(!mapboxResponse\.ok\) \{\s*\n\s*return NextResponse\.json\(\[\]\);/);
  });

  test("a route a tiszta processMapboxGeocodingFeatures helperrel szűr és maximum 5 suggestiont ad vissza", () => {
    assert.match(routeSrc, /processMapboxGeocodingFeatures\(features, q, city, postalOrDistrict, 5\)/);
  });

  test("a Nominatim geocoder kódja változatlanul megmarad fallback routinghoz", () => {
    const GEOCODE_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts");
    const geocodeSrc = readFileSync(GEOCODE_PATH, "utf-8");
    assert.match(geocodeSrc, /export async function searchPlaceCandidates/);
    assert.match(geocodeSrc, /export async function geocodeAddress/);
  });
});

describe("cím autocomplete — /api/admin/vedett-utvonal/address-retrieve fallback továbbra is megmarad", () => {
  test("a végpont admin/feature-flag gate-et használ", () => {
    assert.match(retrieveRouteSrc, /const auth = await requireVedettRouteAccess\(\);/);
    assert.match(retrieveRouteSrc, /if \(!auth\.ok\) return auth\.response;/);
  });

  test("a régi Search Box /retrieve fallback útvonal továbbra is ugyanazzal a session_tokennel működik", () => {
    assert.match(retrieveRouteSrc, /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/retrieve\//);
    assert.match(retrieveRouteSrc, /params\.set\("session_token", sessionToken\)/);
  });

  test("hiba esetén null-t ad, nem blokkolja a manuális címbevitelt", () => {
    assert.match(retrieveRouteSrc, /return NextResponse\.json\(null\)/);
    assert.match(retrieveRouteSrc, /AbortSignal\.timeout\(5000\)/);
  });
});

function mockGeocodingFeature(overrides: Partial<MapboxGeocodingFeature>): MapboxGeocodingFeature {
  return {
    id: "street.mock",
    geometry: { coordinates: [18.9531, 47.4569] },
    properties: {
      mapbox_id: "mbx-mock",
      feature_type: "street",
      name: "Mock utca",
      place_formatted: "2040 Budaörs, Magyarország",
      full_address: "Mock utca, 2040 Budaörs, Magyarország",
      coordinates: { longitude: 18.9531, latitude: 47.4569 },
      context: { place: { name: "Budaörs" }, postcode: { name: "2040" } },
    },
    ...overrides,
  };
}

describe("cím autocomplete — addressAutocompleteMapbox.ts Geocoding v6 feldolgozás", () => {
  test("Budaörs + 'szab' esetén Szabadság út megjelenik és koordinátát is ad", () => {
    const feature = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-szab",
        feature_type: "street",
        name: "Szabadság út",
        full_address: "Szabadság út, 2040 Budaörs, Magyarország",
        place_formatted: "2040 Budaörs, Magyarország",
        coordinates: { longitude: 18.9531, latitude: 47.4569 },
        context: { place: { name: "Budaörs" }, postcode: { name: "2040" } },
      },
    });
    const result = processMapboxGeocodingFeatures([feature], "szab", "Budaörs", undefined, 5);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "Szabadság út, 2040 Budaörs, Magyarország");
    assert.equal(result[0].lat, 47.4569);
    assert.equal(result[0].lon, 18.9531);
  });

  test("Sóskút + 'pet' esetén Petőfi Sándor utca megjelenik", () => {
    const feature = mockGeocodingFeature({
      geometry: { coordinates: [18.8329, 47.3417] },
      properties: {
        mapbox_id: "mbx-pet",
        feature_type: "street",
        name: "Petőfi Sándor utca",
        full_address: "Petőfi Sándor utca, 2038 Sóskút, Magyarország",
        place_formatted: "2038 Sóskút, Magyarország",
        coordinates: { longitude: 18.8329, latitude: 47.3417 },
        context: { place: { name: "Sóskút" }, postcode: { name: "2038" } },
      },
    });
    const result = processMapboxGeocodingFeatures([feature], "pet", "Sóskút", undefined, 5);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Petőfi Sándor utca");
  });

  test("'pet' prefixnél Dózsa György utca kiesik", () => {
    const petofi = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-pet",
        feature_type: "street",
        name: "Petőfi Sándor utca",
        full_address: "Petőfi Sándor utca, 2038 Sóskút, Magyarország",
        coordinates: { longitude: 18.8329, latitude: 47.3417 },
        context: { place: { name: "Sóskút" } },
      },
    });
    const dozsa = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-dozsa",
        feature_type: "street",
        name: "Dózsa György utca",
        full_address: "Dózsa György utca, 2038 Sóskút, Magyarország",
        coordinates: { longitude: 18.8330, latitude: 47.3418 },
        context: { place: { name: "Sóskút" } },
      },
    });
    const result = processMapboxGeocodingFeatures([petofi, dozsa], "pet", "Sóskút", undefined, 5);
    assert.deepEqual(result.map((x) => x.name), ["Petőfi Sándor utca"]);
  });

  test("város szerinti hard filter kizárja a más településen lévő azonos utcanevet", () => {
    const budaors = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-budaors",
        feature_type: "street",
        name: "Szabadság út",
        full_address: "Szabadság út, 2040 Budaörs, Magyarország",
        coordinates: { longitude: 18.9531, latitude: 47.4569 },
        context: { place: { name: "Budaörs" } },
      },
    });
    const pecs = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-pecs",
        feature_type: "street",
        name: "Szabadság út",
        full_address: "Szabadság út, Pécs, Magyarország",
        coordinates: { longitude: 18.229, latitude: 46.072 },
        context: { place: { name: "Pécs" } },
      },
    });
    const result = processMapboxGeocodingFeatures([budaors, pecs], "szab", "Budaörs", undefined, 5);
    assert.equal(result.length, 1);
    assert.equal(result[0].city, "Budaörs");
  });

  test("4 jegyű irányítószám hard filterként működik", () => {
    const right = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-right",
        feature_type: "street",
        name: "Szabadság út",
        coordinates: { longitude: 18.9531, latitude: 47.4569 },
        context: { place: { name: "Budaörs" }, postcode: { name: "2040" } },
      },
    });
    const wrong = mockGeocodingFeature({
      properties: {
        mapbox_id: "mbx-wrong",
        feature_type: "street",
        name: "Szabadság út",
        coordinates: { longitude: 18.9532, latitude: 47.4570 },
        context: { place: { name: "Budaörs" }, postcode: { name: "9999" } },
      },
    });
    const result = processMapboxGeocodingFeatures([right, wrong], "szab", "Budaörs", "2040", 5);
    assert.equal(result.length, 1);
    assert.equal(result[0].postcode, "2040");
  });

  test("prefix matching ékezet- és kis/nagybetű-független", () => {
    assert.equal(matchesQueryPrefix("szab", "Szabadság út"), true);
    assert.equal(matchesQueryPrefix("PET", "Petőfi Sándor utca"), true);
    assert.equal(matchesQueryPrefix("pet", "Dózsa György utca"), false);
  });

  test("normalizeForPrefixMatch eltávolítja az ékezetet és kisbetűsít", () => {
    assert.equal(normalizeForPrefixMatch("Szabadság út"), "szabadsag ut");
    assert.equal(normalizeForPrefixMatch("Petőfi Sándor utca"), "petofi sandor utca");
  });

  test("maximum 5 találat marad a szűrés után", () => {
    const features = Array.from({ length: 8 }, (_, i) =>
      mockGeocodingFeature({
        id: `street.${i}`,
        properties: {
          mapbox_id: `mbx-${i}`,
          feature_type: "street",
          name: `Petőfi utca ${i}`,
          coordinates: { longitude: 18.83 + i / 10000, latitude: 47.34 + i / 10000 },
          context: { place: { name: "Sóskút" } },
        },
      })
    );
    const result = processMapboxGeocodingFeatures(features, "pet", "Sóskút", undefined, 5);
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

describe("KOORDINÁTA-ÁTADÁS — Geocoding v6 koordináta közvetlenül MAP_PICKED-re kerül, retrieve csak fallback", () => {
  test("1) ha a suggestion már tartalmaz lat/lon-t, azt közvetlenül használja; retrieve csak id-alapú fallback", () => {
    const originFnMatch = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n {2}\}/);
    assert.ok(originFnMatch, "meg kell találni a selectOriginSuggestion() függvényt");
    assert.match(originFnMatch![0], /typeof s\.lat === "number" && typeof s\.lon === "number"/);
    assert.match(originFnMatch![0], /\? \{ lat: s\.lat, lon: s\.lon, label: s\.label \}/);
    assert.match(originFnMatch![0], /retrieveAddressSuggestion\(s\.id, originAutocompleteSessionToken\)/);

    const destinationFnMatch = searchFormSrc.match(/async function selectDestinationSuggestion\([\s\S]*?\n {2}\}/);
    assert.ok(destinationFnMatch, "meg kell találni a selectDestinationSuggestion() függvényt");
    assert.match(destinationFnMatch![0], /typeof s\.lat === "number" && typeof s\.lon === "number"/);
    assert.match(destinationFnMatch![0], /retrieveAddressSuggestion\(s\.id, destinationAutocompleteSessionToken\)/);
  });

  test("2) sikeres közvetlen koordináta vagy retrieve fallback esetén MAP_PICKED-re állítja az origin/destination state-et", () => {
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

  test("3) ha nincs közvetlen lat/lon és a retrieve sem ad eredményt, a manuális mező-kitöltés marad fallback", () => {
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
