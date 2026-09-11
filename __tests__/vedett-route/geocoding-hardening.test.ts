// VÉDETT ÚTVONAL — Geocoding hardening + térképes célpont-kijelölés
// (2026-09-10, "Alacskai út 63" audit nyomán) — a specifikáció 18. pontjának
// 20 kötelező tesztesetét fedi le.
//
// Az 1-7. és 20. eset a geocode.ts-ből exportált TISZTA függvényeken
// (semmi hálózat, semmi Nominatim-hívás) fut valóban — ezek pontosan
// ugyanaz a kód, amit a production geocodeAddress() is használ. A 8-19.
// esetek szerver/kliens integrációs pontok (a routing motorra való
// automatikus átadás tilalma, a három elkülönített felhasználói hibaállapot,
// a térképes picker huzalozása, a toCoordinates-flow, és a regressziós
// tételek) — ezeket, a projekt már meglévő vedett-route tesztjeinek
// mintáját követve (lásd structured-address-and-sensory-ux.test.ts fejléce),
// forráskód-szintű strukturális asszerciókkal fedjük le, mivel a "use
// client" React komponensek és a Next.js route handler plain `node --test`
// alatt, bundler nélkül nem renderelhetők/futtathatók.
//
//   node --test __tests__/vedett-route/geocoding-hardening.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  splitStreetAndHouseNumber,
  normalizeHouseNumberForCompare,
  normalizeTextForCompare,
  normalizeDistrictOrPostalCode,
  parseExpectedAddressComponents,
  evaluateNominatimResult,
  pickBestGeocodeMatch,
  type NominatimRawResult,
} from "../../lib/vedett-route/geocode.ts";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const PICKER_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "DestinationMapPicker.tsx");
const pickerSrc = readFileSync(PICKER_PATH, "utf-8");

// A forrás magyarázó fejléc-kommentjei SZÁNDÉKOSAN megnevezik azt, amit a
// kód NEM csinál (pl. "nincs Google Maps", "nem hívunk Nominatimot innen",
// "nem küldünk reverse-geocode kérést") — ez dokumentáció, nem tényleges
// kódhasználat. A "nincs X a valós kódban" jellegű asszerciók ezért a
// KOMMENTEKTŐL MEGTISZTÍTOTT forráson futnak, hogy egy ilyen magyarázó
// megjegyzés önmagában sose buktathasson el egy tesztet.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const pickerCode = stripComments(pickerSrc);
const formCode = stripComments(formSrc);

// ---------------------------------------------------------------------------
// Segédek a tesztfixture-ökhöz: egy Nominatim-szerű nyers eredmény felépítése
// ---------------------------------------------------------------------------
function makeResult(overrides: Partial<NominatimRawResult["address"]> & { display_name?: string; lat?: string; lon?: string; addresstype?: string; class?: string } = {}): NominatimRawResult {
  const { display_name, lat, lon, addresstype, class: klass, ...address } = overrides;
  return {
    display_name: display_name ?? "Teszt cím, Budapest, Magyarország",
    lat: lat ?? "47.4979",
    lon: lon ?? "19.0402",
    addresstype: addresstype ?? "house",
    class: klass ?? "building",
    address: {
      road: "Alacskai út",
      city: "Budapest",
      country_code: "hu",
      house_number: "63",
      ...address,
    },
  };
}

describe("1-7, 20. eset — geokódolási minőség (EXACT/APPROXIMATE/NOT EXACT), tiszta függvényeken", () => {
  test("1) pontos utca + házszám egyezés -> EXACT", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ house_number: "63" });
    assert.equal(evaluateNominatimResult(result, expected), "EXACT");
  });

  test("2) pontos utca, hiányzó házszám a Nominatim válaszban -> APPROXIMATE", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ house_number: undefined });
    assert.equal(evaluateNominatimResult(result, expected), "APPROXIMATE");
  });

  test("3) pontos utca, ELTÉRŐ házszám -> NEM EXACT (APPROXIMATE-re esik vissza, sosem EXACT)", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ house_number: "12" });
    const quality = evaluateNominatimResult(result, expected);
    assert.notEqual(quality, "EXACT");
    assert.equal(quality, "APPROXIMATE");
  });

  test("4) road/highway szintű találat házszám nélkül -> APPROXIMATE (sosem EXACT)", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ house_number: undefined }, );
    (result as unknown as { addresstype: string; class: string }).addresstype = "road";
    (result as unknown as { addresstype: string; class: string }).class = "highway";
    const quality = evaluateNominatimResult(result, expected);
    assert.notEqual(quality, "EXACT");
    assert.equal(quality, "APPROXIMATE");
  });

  test("5) eltérő utcanév -> NOT_FOUND (null) a kiértékelésben", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ road: "Teljesen Más Utca" });
    assert.equal(evaluateNominatimResult(result, expected), null);
  });

  test("6) eltérő település -> NOT_FOUND (null) a kiértékelésben", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const result = makeResult({ city: "Debrecen" });
    assert.equal(evaluateNominatimResult(result, expected), null);
  });

  test("7) limit=5 találat közül az ELSŐ APPROXIMATE, egy KÉSŐBBI EXACT -> a KÉSŐBBI EXACT-ot kell kiválasztani", () => {
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const results = [
      makeResult({ house_number: undefined }), // APPROXIMATE, első
      makeResult({ city: "Debrecen" }), // NOT_FOUND (null), köztes zaj
      makeResult({ house_number: "63" }), // EXACT, harmadik
    ];
    const best = pickBestGeocodeMatch(results, expected);
    assert.ok(best);
    assert.equal(best?.quality, "EXACT");
    assert.equal(best?.result.address?.house_number, "63");
  });

  test("20) 'Alacskai út 63' fixture — valós Nominatim road-válasz házszám nélkül -> APPROXIMATE, SOSEM EXACT", () => {
    // A production audit során valóban kapott alakot tükrözi: csak
    // road/highway szintű találat, addresstype=road, nincs house_number.
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    const alacskaiRoadFixture: NominatimRawResult = {
      display_name: "Alacskai út, Budapest, XVIII. kerület, Magyarország",
      lat: "47.4389",
      lon: "19.1706",
      addresstype: "road",
      class: "highway",
      address: {
        road: "Alacskai út",
        city: "Budapest",
        country_code: "hu",
        // szándékosan NINCS house_number — ez bizonyítottan az OSM jelenlegi
        // adatállapota erre a házszámra (lásd geocode.ts fejléce / Overpass
        // audit: RESULT COUNT = 0 a 63-as házszámra).
      },
    };
    const quality = evaluateNominatimResult(alacskaiRoadFixture, expected);
    assert.notEqual(quality, "EXACT");
    assert.equal(quality, "APPROXIMATE");
  });

  test("trailing pont a házszámban ('63.') sosem okozhat hamis mismatchet", () => {
    assert.equal(normalizeHouseNumberForCompare("63."), normalizeHouseNumberForCompare("63"));
    const expected = parseExpectedAddressComponents("Budapest, XVIII. kerület, Alacskai út 63.");
    assert.equal(expected.houseNumber, "63");
    const result = makeResult({ house_number: "63" });
    assert.equal(evaluateNominatimResult(result, expected), "EXACT");
  });

  test("splitStreetAndHouseNumber helyesen bontja szét az utcanevet és a házszámot", () => {
    assert.deepEqual(splitStreetAndHouseNumber("Alacskai út 63."), { streetName: "Alacskai út", houseNumber: "63" });
    assert.deepEqual(splitStreetAndHouseNumber("Alacskai út"), { streetName: "Alacskai út", houseNumber: null });
  });

  test("normalizeTextForCompare eltávolítja a trailing pontot és normalizál kis/nagybetűt", () => {
    assert.equal(normalizeTextForCompare("Budapest."), normalizeTextForCompare("budapest"));
  });

  test("kerület-normalizálás: 18 / 18. / XVIII / XVIII. / XVIII. kerület mind 'XVIII. kerület'-té normalizálódik", () => {
    for (const raw of ["18", "18.", "XVIII", "XVIII.", "XVIII. kerület", "xviii. kerület"]) {
      assert.equal(normalizeDistrictOrPostalCode(raw), "XVIII. kerület", `bemenet: ${raw}`);
    }
  });

  test("4 jegyű irányítószám változatlanul megmarad (nem konvertálódik kerületté)", () => {
    assert.equal(normalizeDistrictOrPostalCode("1182"), "1182");
  });

  test("kerület SOHA nem konvertálódik irányítószámmá (a kerületnek több irányítószáma is lehet)", () => {
    const result = normalizeDistrictOrPostalCode("XVIII.");
    assert.doesNotMatch(result, /^\d{4}$/);
    assert.equal(result, "XVIII. kerület");
  });
});

describe("8-9. eset — APPROXIMATE sosem indít automatikus routingot, elkülönített felhasználói állapot", () => {
  test("8) az APPROXIMATE elágazás a route.ts-ben KORÁBBAN van, mint a searchVedettRoutes() (MOTIS) hívás — sosem juthat el odáig", () => {
    const approximateBranchIdx = routeSrc.indexOf('reason: "address_approximate"');
    const motisCallIdx = routeSrc.indexOf("searchVedettRoutes(");
    assert.ok(approximateBranchIdx > -1, "hiányzik az address_approximate ág");
    assert.ok(motisCallIdx > -1, "hiányzik a searchVedettRoutes hívás");
    assert.ok(approximateBranchIdx < motisCallIdx, "az APPROXIMATE ágnak a MOTIS-hívás ELŐTT kell visszatérnie (early return)");
  });

  test("8b) az APPROXIMATE ág explicit early return-nel zár (NextResponse.json(...) return-ölve), nem csak logol", () => {
    const match = routeSrc.match(/if \(fromGeo\.quality === "APPROXIMATE" \|\| toGeo\.quality === "APPROXIMATE"\) \{[\s\S]*?return NextResponse\.json\(/);
    assert.ok(match, "az APPROXIMATE branch-nek return NextResponse.json(...)-szal kell zárnia");
  });

  test("9) address_approximate egy ÖNÁLLÓ reason-érték, nem azonos az address_not_found vagy a routing 'no_route_found' szövegével", () => {
    assert.match(routeSrc, /reason: "address_approximate"/);
    assert.match(routeSrc, /reason: "address_not_found"/);
    // A két reason string ténylegesen eltérő literál a forrásban.
    assert.notEqual(
      routeSrc.match(/reason: "address_approximate"/)?.[0],
      routeSrc.match(/reason: "address_not_found"/)?.[0]
    );
  });
});

describe("10. eset — a három felhasználói hibaállapot (ADDRESS_NOT_FOUND / ADDRESS_APPROXIMATE / NO_ROUTE_FOUND) elkülönítve, a specifikáció szerinti szöveggel", () => {
  test("ADDRESS_NOT_FOUND szövege pontosan 'Nem találtuk ezt a címet.'", () => {
    assert.match(routeSrc, /reason: "address_not_found"[\s\S]{0,120}message: "Nem találtuk ezt a címet\."/);
  });

  test("ADDRESS_APPROXIMATE szövege és helperMessage-e pontosan a specifikáció szerint", () => {
    assert.match(routeSrc, /message: "Az utcát megtaláltuk, de a pontos címet nem\."/);
    assert.match(routeSrc, /helperMessage: "Jelöld meg a célpontot a térképen, hogy biztosan jó helyre tervezzünk\."/);
  });

  test("NO_ROUTE_FOUND szövege ('Nem található útvonal...') NEM a route.ts-ben, hanem az orchestrator/kliens oldalon él, és route.ts-ben nem keveredik az address-hibákkal", () => {
    // route.ts-ben a "Nem található útvonal" szöveg nem jelenik meg szó
    // szerint — ez az orchestrator.ts / kliens felelőssége (10. pont: külön
    // reason-ök, nincs összemosás) — ez a teszt azt védi, hogy a jövőben se
    // kerüljön bele route.ts-be egy harmadik, összemosott hibaágként.
    assert.doesNotMatch(routeSrc, /"Nem található útvonal/);
  });
});

describe("11-13. eset — térképes célpont-kijelölő: MapLibre/OpenFreeMap, marker, toCoordinates-flow", () => {
  test("11) a picker a MEGLÉVŐ mapStyle.ts-ből importál (MAP_STYLE_URL/MAP_ATTRIBUTION_FALLBACK), nincs új térkép-provider/Google Maps a TÉNYLEGES kódban", () => {
    assert.match(pickerSrc, /from "@\/lib\/vedett-route\/mapStyle"/);
    // A fejléc-komment SZÁNDÉKOSAN megnevezi, hogy "nincs Google Maps" (11.
    // pont dokumentálása) — ezért a kommentektől megtisztított kódot
    // vizsgáljuk, nem a teljes forrást.
    assert.doesNotMatch(pickerCode, /google/i);
  });

  test("11b) a picker maplibre-gl-t használ, nem egy második térkép-könyvtárat", () => {
    assert.match(pickerSrc, /import maplibregl from "maplibre-gl"/);
  });

  test("12) marker kattintásra és húzásra is mozdul (mind map.on(\"click\"), mind marker draggable/dragend van huzalozva)", () => {
    assert.match(pickerSrc, /draggable: true/);
    assert.match(pickerSrc, /marker\.on\("dragend"/);
    assert.match(pickerSrc, /map\.on\("click"/);
  });

  test("12b) van 'Ez legyen a cél' megerősítő és 'Mégse' gomb, mindkettő legalább 44px érintési célterülettel (min-h-[44px])", () => {
    assert.match(pickerSrc, /Ez legyen a cél/);
    assert.match(pickerSrc, /Mégse/);
    const confirmButtonBlock = pickerSrc.match(/onClick=\{handleConfirmClick\}[\s\S]{0,220}/)?.[0] ?? "";
    const cancelButtonBlock = pickerSrc.match(/onClick=\{onCancel\}[\s\S]{0,120}/)?.[0] ?? "";
    assert.match(confirmButtonBlock, /min-h-\[44px\]/);
    assert.match(cancelButtonBlock, /min-h-\[44px\]/);
  });

  test("13) a jóváhagyott célpont közvetlenül onConfirm(lat, lon)-t hív — nincs benne re-geokódolás, fetch, vagy Nominatim-hívás", () => {
    // A fejléc-komment SZÁNDÉKOSAN megnevezi a Nominatimot (magyarázatként,
    // hogy MIÉRT nincs itt geokódolás) — a kommentektől megtisztított
    // kódban ellenőrizzük a tényleges hiányát.
    assert.doesNotMatch(pickerCode, /nominatim/i);
    assert.doesNotMatch(pickerCode, /fetch\(/);
    // RUNTIME UX HOTFIX (2026-09-10) óta a confirm handler egy
    // selectedPoint-ot olvas ki (nem a régi, mindig-inicializált
    // pickedPosition-t) — lásd a "RUNTIME UX HOTFIX" describe blokkot lent
    // a teljes state-modell tesztjeihez.
    assert.match(pickerSrc, /onConfirm\(selectedPoint\.lat, selectedPoint\.lon\)/);
  });

  test("13b) a form oldalon a MAP_PICKED cél UGYANAZON toCoordinates/toName ágon megy a szerver felé, mint a KNOWN_PLACE (nincs re-geokódolás, nincs saveFavorite auto-persist)", () => {
    assert.match(
      formSrc,
      /destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED"\s*\n\s*\? \{\s*\n\s*toCoordinates:/
    );
  });

  test("14) handleMapPickerConfirm KIZÁRÓLAG React state-et (setDestination) állít, nincs benne fetch/localStorage/adatbázis-hívás (nincs auto-persist, nincs analytics)", () => {
    const block = formSrc.match(/function handleMapPickerConfirm\([\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleMapPickerConfirm handler");
    assert.doesNotMatch(block, /fetch\(/);
    assert.doesNotMatch(block, /localStorage/);
    assert.match(block, /setDestination\(/);
  });

  test("15) 'Mégse' (handleMapPickerCancel) csak a picker bezárását végzi, semmilyen routing-indítást vagy state-módosítást a célponton", () => {
    const block = formSrc.match(/function handleMapPickerCancel\([\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleMapPickerCancel handler");
    // FIGYELEM: /setDestination\(/-t kell keresni, NEM /setDestination/-t —
    // a setDestinationMapPickerOpen(...) hívás maga is tartalmazza a
    // "setDestination" ALSTRINGET, ami egy sima /setDestination/ regexet
    // hamis pozitívra futtatna (a cél destination state-jét viszont
    // valójában nem módosítja).
    assert.doesNotMatch(block, /setDestination\(/);
    assert.doesNotMatch(block, /handleSubmit/);
    assert.match(block, /setDestinationMapPickerOpen\(false\)/);
  });
});

describe("16. eset — privacy: nincs teljes cím/házszám/koordináta a diagnosztikai logban", () => {
  test("a routing_error log KIZÁRÓLAG fromQuality/toQuality/phase mezőket tartalmaz, NEM a fromGeo.name/toGeo.name (teljes Nominatim display_name)-et", () => {
    const logCall = routeSrc.match(/vedettRouteLog\("routing_error", "info", \{[\s\S]*?\}\);/)?.[0] ?? "";
    assert.ok(logCall.length > 0, "hiányzik a vedettRouteLog hívás");
    assert.doesNotMatch(logCall, /fromGeo\.name/);
    assert.doesNotMatch(logCall, /toGeo\.name/);
    assert.doesNotMatch(logCall, /fromGeo\.lat/);
    assert.doesNotMatch(logCall, /toGeo\.lat/);
    assert.match(logCall, /fromQuality: fromGeo\.quality/);
    assert.match(logCall, /toQuality: toGeo\.quality/);
  });

  test("az approximateLocation válasz a KLIENSNEK szól (UI-hoz szükséges a térkép-központozáshoz), NEM a szerver naplójába kerül", () => {
    // Az approximateLocation KIZÁRÓLAG a NextResponse.json(...) hívásban
    // jelenik meg, NEM a vedettRouteLog(...) hívásban.
    const logCall = routeSrc.match(/vedettRouteLog\("routing_error", "info", \{[\s\S]*?\}\);/)?.[0] ?? "";
    assert.doesNotMatch(logCall, /approximateLocation/);
  });
});

describe("17. eset — regresszióvédelem: meglévő ágak (CURRENT_LOCATION, KNOWN_PLACE, MANUAL) és a szerver/MOTIS-határ változatlan", () => {
  test("CURRENT_LOCATION (fromCoordinates) továbbra is KIHAGYJA a geocodeAddress()-t, quality: EXACT-tal", () => {
    assert.match(
      routeSrc,
      /fromCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: "Jelenlegi hely", lat: fromCoordinates\.latitude, lon: fromCoordinates\.longitude, quality: "EXACT" as const \}\)/
    );
  });

  test("KNOWN_PLACE (toCoordinates) továbbra is KIHAGYJA a geocodeAddress()-t, quality: EXACT-tal", () => {
    assert.match(
      routeSrc,
      /toCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: toName \?\? "Kiválasztott cél", lat: toCoordinates\.latitude, lon: toCoordinates\.longitude, quality: "EXACT" as const \}\)/
    );
  });

  test("a MANUAL (szabadszöveges) cím-ág továbbra is a geocodeAddress()-en megy át", () => {
    assert.match(routeSrc, /: geocodeAddress\(from as string\)/);
    assert.match(routeSrc, /: geocodeAddress\(to as string\)/);
  });

  test("a böngésző továbbra sem hívja a MOTIS-t közvetlenül — a route.ts szerver oldalon importálja a searchVedettRoutes()-t, nincs kliens-oldali MOTIS URL/fetch a form komponensben", () => {
    assert.match(routeSrc, /import \{ searchVedettRoutes \} from "@\/lib\/vedett-route\/orchestrator"/);
    // A form-komponens kódjában TÖBB legitim, nem-hívás jellegű "motis"
    // említés is van (kommentek, és a szerver által már kiszámolt
    // result.dataCoverage.motisImportedAt megjelenítési mező kiolvasása) —
    // ezért nem a puszta "motis" szó hiányát, hanem a tényleges
    // hálózati-hívás mintázatok (MOTIS_BASE_URL, a MOTIS API végpontja,
    // vagy egy fetch(...motis...) hívás) hiányát ellenőrizzük.
    assert.doesNotMatch(formCode, /MOTIS_BASE_URL/);
    assert.doesNotMatch(formCode, /\/api\/v6\/plan/);
    assert.doesNotMatch(formCode, /fetch\([^)]*motis/i);
  });

  test("a kedvenc-mentés (handleSaveFavorite) MANUAL ága továbbra is city/districtOrPostalCode/street-et küld, nem sérült a MAP_PICKED hozzáadásával", () => {
    assert.match(
      formSrc,
      /destinationManual: \{ city: destination\.city, districtOrPostalCode: destination\.districtOrPostalCode, street: destination\.street \}/
    );
  });

  test("a currentFavoriteDestinationLabel() a MANUAL ágon továbbra is destination.street || destination.city fallback-kel dolgozik", () => {
    const block = formSrc.match(/function currentFavoriteDestinationLabel\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.match(block, /destination\.street \|\| destination\.city \|\| "Cél"/);
  });
});

describe("18-19. eset — privacy invariant + nincs kliens-oldali re-geokódolás a MAP_PICKED célra", () => {
  test("a MAP_PICKED destination típus name/latitude/longitude mezőkre bomlik, nincs benne nyers GPS-jelzésű mező vagy reverse-geocode eredmény", () => {
    assert.match(formSrc, /\| \{ type: "MAP_PICKED"; name: string; latitude: number; longitude: number \}/);
  });

  test("a form nem hív reverse-geocode-ot a MAP_PICKED kiválasztás után (nincs 'reverse' kulcsszó, nincs extra Nominatim-hívás a kliensben)", () => {
    // A handleMapPickerConfirm melletti komment SZÁNDÉKOSAN megnevezi, hogy
    // "nem küldünk reverse-geocode kérést" (13. pont dokumentálása) — a
    // kommentektől megtisztított kódban ellenőrizzük a tényleges hiányát.
    assert.doesNotMatch(formCode, /reverse.?geocod/i);
  });
});

// ---------------------------------------------------------------------------
// RUNTIME UX HOTFIX (2026-09-10) — a "Ez legyen a cél" gomb valós böngészőben
// nem látszott. Root cause: `bg-sni-primary`/`text-sni-primary` osztályok
// egy NEM LÉTEZŐ Tailwind színt hivatkoztak (tailwind.config.ts
// theme.extend.colors.sni csak bg/blue/bluedark/green/greendark/beige/
// text/warn/brand.teal/brand.blue/brand.navy kulcsokat ismer — "primary"
// nincs köztük), ezért a gomb háttere transzparens maradt, a fehér szöveg
// pedig fehér/átlátszó alapon láthatatlanná vált. Javítás: a globals.css-ben
// bizonyítottan MŰKÖDŐ .btn-primary/.btn-secondary osztályok. Emellett a
// state-modell is szétvált: `selectedPoint` (a felhasználó TÉNYLEGES
// kijelölése) különbözik az `initialLat`/`initialLon` (a szülőtől kapott,
// csak tájékozódási célú APPROXIMATE koordináta) propoktól — a confirm
// gomb csak akkor enabled, ha van selectedPoint.
//
// Ezek a tesztek a jelenlegi teszt-infrastruktúra korlátai miatt (nincs
// jsdom/@testing-library/react a devDependencies között — lásd
// __tests__/vedett-route/README.md és a projekt már meglévő vedett-route
// tesztjeinek mintája) NEM valódi React-interakció tesztek (nincs tényleges
// kattintás-szimuláció DOM-on), hanem a lehető legerősebb forráskód-szintű
// strukturális/state-machine asszerciók: azt ellenőrzik, hogy a KAPCSOLÓDÓ
// KÓD (a state-változó neve, a feltétel, a CSS-osztály, a handler-hívás)
// ténylegesen megvan és a helyes szerkezetben — nem pedig azt, hogy egy
// böngésző ezt vizuálisan hogyan rendereli.
// ---------------------------------------------------------------------------
describe("RUNTIME UX HOTFIX — DestinationMapPicker footer mindig látható, selectedPoint state-gép", () => {
  test("root cause regresszióvédelem: a picker SEHOL nem használ nem létező 'sni-primary' Tailwind osztályt (bg-sni-primary/text-sni-primary/border-sni-primary)", () => {
    assert.doesNotMatch(pickerCode, /sni-primary/);
  });

  test("a confirm gomb a bizonyítottan működő .btn-primary osztályt használja (globals.css-ben definiált, valós sni-brand-teal/sni-brand-blue színekkel)", () => {
    const confirmButtonBlock = pickerSrc.match(/<button\s[\s\S]{0,400}?Ez legyen a cél/)?.[0] ?? "";
    assert.ok(confirmButtonBlock.length > 0, "meg kell találni a confirm gomb JSX-ét");
    assert.match(confirmButtonBlock, /className="[^"]*\bbtn-primary\b/);
  });

  test("1) a confirm gomb MINDIG renderelődik — nincs feltételes JSX, ami a gomb ELEMÉT (nem csak az enabled állapotát) eltüntetné", () => {
    // A footer JSX blokkban a "Ez legyen a cél" szöveg nem állhat egy
    // `{valami && (...)}`-szerű feltételes renderelés belsejében — csak a
    // `disabled`/`aria-disabled` attribútum függhet állapottól.
    const footerBlock = pickerSrc.match(/paddingBottom:[\s\S]*?<\/div>\s*\);/)?.[0] ?? "";
    assert.ok(footerBlock.length > 0, "meg kell találni a footer blokkot");
    assert.match(footerBlock, /Ez legyen a cél/);
    assert.match(footerBlock, /Mégse/);
    // Nincs `{selectedPoint && (` vagy hasonló feltételes wrapper a KÉT gomb
    // körül — csak a `disabled={!selectedPoint}` attribútumban jelenik meg
    // a state.
    assert.doesNotMatch(footerBlock, /\{selectedPoint && \(/);
  });

  test("2) selectedPoint kezdetben null — a confirm gomb induláskor disabled", () => {
    assert.match(pickerSrc, /useState<\{ lat: number; lon: number \} \| null>\(null\)/);
    assert.match(pickerSrc, /disabled=\{!selectedPoint\}/);
  });

  test("3) map click után selectedPoint frissül (enabled állapotba kerül)", () => {
    const clickHandlerBlock = pickerSrc.match(/const handleMapClick = \(e: maplibregl\.MapMouseEvent\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
    assert.ok(clickHandlerBlock.length > 0, "meg kell találni a handleMapClick handlert");
    assert.match(clickHandlerBlock, /setSelectedPoint\(\{ lat: e\.lngLat\.lat, lon: e\.lngLat\.lng \}\)/);
  });

  test("4) marker dragend után selectedPoint frissül (enabled állapotba kerül)", () => {
    const dragendBlock = pickerSrc.match(/marker\.on\("dragend", \(\) => \{[\s\S]*?\n    \}\);/)?.[0] ?? "";
    assert.ok(dragendBlock.length > 0, "meg kell találni a marker dragend handlerét");
    assert.match(dragendBlock, /setSelectedPoint\(\{ lat, lon: lng \}\)/);
  });

  test("5) confirm a selectedPoint koordinátájával hívja az onConfirm-ot (nem az initialLat/initialLon propokkal)", () => {
    const confirmFn = pickerSrc.match(/function handleConfirmClick\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(confirmFn.length > 0, "meg kell találni a handleConfirmClick függvényt");
    assert.match(confirmFn, /if \(!selectedPoint\) return;/);
    assert.match(confirmFn, /onConfirm\(selectedPoint\.lat, selectedPoint\.lon\)/);
  });

  test("6) a szülő komponensben (VedettUtvonalSearchForm.tsx) a confirm callback (handleMapPickerConfirm) MAP_PICKED destination-t hoz létre", () => {
    const block = formSrc.match(/function handleMapPickerConfirm\(lat: number, lon: number\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleMapPickerConfirm handler");
    assert.match(block, /type: "MAP_PICKED"/);
    assert.match(block, /latitude: lat/);
    assert.match(block, /longitude: lon/);
  });

  test("7) MAP_PICKED destination a toCoordinates ágon megy a szerver felé (ugyanúgy, mint KNOWN_PLACE)", () => {
    assert.match(
      formSrc,
      /destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED"\s*\n\s*\? \{\s*\n\s*toCoordinates:/
    );
  });

  test("8) a MAP_PICKED cél SOHA nem geokódolódik újra — a picker kódjában nincs fetch/Nominatim-hívás, a form MAP_PICKED ágában nincs geocodeAddress/buildStructuredAddress hívás", () => {
    assert.doesNotMatch(pickerCode, /fetch\(/);
    assert.doesNotMatch(pickerCode, /nominatim/i);
    const destinationFieldsBlock = formSrc.match(/destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED"\s*\n\s*\? \{[\s\S]*?\}\s*\n\s*: \{ to: buildStructuredAddress\(destination\) \};/)?.[0] ?? "";
    assert.ok(destinationFieldsBlock.length > 0, "meg kell találni a destinationFields KNOWN_PLACE/MAP_PICKED elágazását");
    assert.doesNotMatch(destinationFieldsBlock.split(": {")[0], /buildStructuredAddress|geocodeAddress/);
  });

  test("9) cancel (handleMapPickerCancel) NEM módosítja a destinationt — csak a picker bezárását végzi", () => {
    const block = formSrc.match(/function handleMapPickerCancel\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleMapPickerCancel handler");
    assert.doesNotMatch(block, /setDestination\(/);
    assert.doesNotMatch(block, /handleSubmit/);
    assert.match(block, /setDestinationMapPickerOpen\(false\)/);
  });

  test("10) a footerben EGYSZERRE van jelen a 'Mégse' ÉS az 'Ez legyen a cél' gomb, ugyanabban a flex-shrink-0 footer konténerben", () => {
    const footerContainerMatch = pickerSrc.match(/className="flex flex-shrink-0 gap-2 bg-white[\s\S]*?<\/div>/);
    assert.ok(footerContainerMatch, "meg kell találni a flex-shrink-0 footer konténert");
    assert.match(footerContainerMatch![0], /Mégse/);
    assert.match(footerContainerMatch![0], /Ez legyen a cél/);
  });

  test("a footer explicit flex-shrink-0-t kap, a térkép-terület explicit min-h-0-t — a footer sosem nyomódhat ki a látható területről", () => {
    assert.match(pickerSrc, /className="flex flex-shrink-0 gap-2 bg-white/);
    assert.match(pickerSrc, /className="min-h-0 flex-1"/);
  });

  test("a külső konténer figyelembe veszi a mobil dinamikus viewportot (h-dvh) a fixed inset-0 mellett", () => {
    assert.match(pickerSrc, /className="fixed inset-0 z-\[70\] flex h-dvh flex-col/);
  });

  test("a footer figyelembe veszi a rendszer alsó safe area-ját (env(safe-area-inset-bottom))", () => {
    assert.match(pickerSrc, /env\(safe-area-inset-bottom\)/);
  });
});
