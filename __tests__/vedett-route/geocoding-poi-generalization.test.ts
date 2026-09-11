// VÉDETT ÚTVONAL — Geocoding generalizáció (2026-09-11, "csak klasszikus
// postai cím" production audit nyomán) — a specifikáció 12. pontjának A-M
// determinisztikus tesztesetei.
//
// Ez a fájl NEM helyettesíti, hanem KIEGÉSZÍTI a geocoding-hardening.test.ts
// (2026-09-10) és a structured-address-and-sensory-ux.test.ts (2026-09-XX)
// meglévő, VÁLTOZATLANUL futó tesztjeit — azok a klasszikus cím-egyeztetés
// (EXACT/APPROXIMATE) és a strukturált cím-modell regresszióját fedik, ez a
// fájl a nevesített OSM hely/POI/állomás-elfogadás ÚJ útját, és az induló/
// célpont szimmetriát fedi ugyanazzal a mintával (tiszta függvények valódi
// futtatása a geokódoláshoz + forráskód-szintű strukturális asszerciók a
// "use client" komponensekhez, amik plain `node --test` alatt nem
// renderelhetők).
//
//   node --test __tests__/vedett-route/geocoding-poi-generalization.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isBareRoadOnlyResult,
  scoreNamedPlaceResult,
  pickBestNamedPlaceMatch,
  parseExpectedAddressComponents,
  normalizeDistrictOrPostalCode,
  buildCanonicalFreeTextQuery,
  getResultPrimaryName,
  type NominatimRawResult,
} from "../../lib/vedett-route/geocode.ts";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const PICKER_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "DestinationMapPicker.tsx");
const pickerSrc = readFileSync(PICKER_PATH, "utf-8");

// Segéd egy nevesített OSM hely/POI/állomás Nominatim-szerű nyers
// eredményének felépítéséhez — a klasszikus cím-fixture-öktől (lásd
// geocoding-hardening.test.ts makeResult()) SZÁNDÉKOSAN külön, mert ezeknek
// jellemzően NINCS addr.road-juk (a saját nevük NEM ott él), és van
// namedetails.name-jük.
function makeNamedPlace(overrides: Partial<NominatimRawResult> = {}): NominatimRawResult {
  return {
    display_name: "Deák tér, Belváros-Lipótváros, Budapest, Magyarország",
    lat: "47.4979",
    lon: "19.0538",
    addresstype: "place",
    class: "place",
    type: "square",
    namedetails: { name: "Deák tér" },
    address: {
      city: "Budapest",
      suburb: "Belváros-Lipótváros",
      country_code: "hu",
    },
    ...overrides,
  };
}

function makeBareRoad(overrides: Partial<NominatimRawResult> = {}): NominatimRawResult {
  return {
    display_name: "Rákóczi út, Budapest, Magyarország",
    lat: "47.4980",
    lon: "19.0710",
    addresstype: "road",
    class: "highway",
    address: { road: "Rákóczi út", city: "Budapest", country_code: "hu" },
    ...overrides,
  };
}

describe("A) 'Deák tér' — nevesített hely, ház­szám nélkül -> elfogadva", () => {
  test("scoreNamedPlaceResult pontot ad egy pontos névegyezésre, isBareRoadOnlyResult false", () => {
    const place = makeNamedPlace();
    assert.equal(isBareRoadOnlyResult(place), false);
    const score = scoreNamedPlaceResult(place, "Deák tér");
    assert.ok(typeof score === "number" && score > 0, "a pontos névegyezésnek pontot kell adnia");
  });

  test("pickBestNamedPlaceMatch a 'Deák tér' találatot választja", () => {
    const results = [makeNamedPlace()];
    const best = pickBestNamedPlaceMatch(results, "Deák tér");
    assert.ok(best);
    assert.equal(getResultPrimaryName(best!), "Deák tér");
  });
});

describe("B) 'Deák tér 85' — házszám-levágásos fallback -> a levágott név alapján elfogadva", () => {
  test("parseExpectedAddressComponents a házszámot levágja, streetName == 'Deák tér'", () => {
    const expected = parseExpectedAddressComponents("Deák tér 85");
    assert.equal(expected.streetName, "Deák tér");
    assert.equal(expected.houseNumber, "85");
  });

  test("a levágott 'Deák tér' szöveggel a névegyeztetés MÉG elfogad egy konkrét helyet", () => {
    const expected = parseExpectedAddressComponents("Deák tér 85");
    const poiQuery = expected.streetName;
    const best = pickBestNamedPlaceMatch([makeNamedPlace()], poiQuery);
    assert.ok(best, "a házszám-levágás után a névnek egyeznie kell egy konkrét hellyel");
  });
});

describe("C) 'Etele Plaza' — bevásárlóközpont (shop/mall jellegű POI), NEM hardcode-olt névlistával, hanem a namedetails/display_name alapján", () => {
  test("egy shop/mall class/type-ú, névvel egyező találat elfogadott", () => {
    const etelePlaza: NominatimRawResult = {
      display_name: "Etele Plaza, Kelenföld, Budapest, Magyarország",
      lat: "47.4633",
      lon: "19.0466",
      addresstype: "mall",
      class: "shop",
      type: "mall",
      namedetails: { name: "Etele Plaza" },
      address: { city: "Budapest", suburb: "Kelenföld", country_code: "hu" },
    };
    assert.equal(isBareRoadOnlyResult(etelePlaza), false);
    const best = pickBestNamedPlaceMatch([etelePlaza], "Etele Plaza");
    assert.ok(best);
    assert.equal(getResultPrimaryName(best!), "Etele Plaza");
  });
});

describe("D) 'Kelenföld vasútállomás' — állomás (railway class), a keresett szöveg a saját név PREFIXE", () => {
  test("a 'Kelenföld vasútállomás' keresés a 'Kelenföld' nevű railway station találatra illik (szóhatáron vett prefix-egyezés)", () => {
    const station: NominatimRawResult = {
      display_name: "Kelenföld, Budapest, Magyarország",
      lat: "47.4652",
      lon: "19.0356",
      addresstype: "station",
      class: "railway",
      type: "station",
      namedetails: { name: "Kelenföld" },
      address: { city: "Budapest", country_code: "hu" },
    };
    assert.equal(isBareRoadOnlyResult(station), false);
    const best = pickBestNamedPlaceMatch([station], "Kelenföld vasútállomás");
    assert.ok(best, "a 'Kelenföld vasútállomás' keresésnek a 'Kelenföld' station találatra kell illenie");
  });

  test("egy TELJESEN más nevű találat NEM egyezik (nincs fuzzy/hasonlósági elfogadás)", () => {
    const unrelated: NominatimRawResult = {
      display_name: "Örs vezér tere, Budapest, Magyarország",
      lat: "47.5",
      lon: "19.15",
      addresstype: "station",
      class: "railway",
      namedetails: { name: "Örs vezér tere" },
      address: { city: "Budapest", country_code: "hu" },
    };
    const score = scoreNamedPlaceResult(unrelated, "Kelenföld vasútállomás");
    assert.equal(score, null);
  });
});

describe("E) 'Astoria' — több találat közül a Budapesti/relevánsabb kell nyerjen, egyenállásnál pedig NEM találgatunk", () => {
  test("egy Budapest-kontextusú találat magasabb pontszámot kap, mint egy egyébként azonos nevű, de Budapest-kontextus nélküli találat", () => {
    const budapestAstoria: NominatimRawResult = {
      display_name: "Astoria, Erzsébetváros, Budapest, Magyarország",
      lat: "47.4966",
      lon: "19.0614",
      addresstype: "public_transport",
      class: "public_transport",
      namedetails: { name: "Astoria" },
      address: { city: "Budapest", suburb: "Erzsébetváros", country_code: "hu" },
    };
    const noContextAstoria: NominatimRawResult = {
      display_name: "Astoria, Magyarország",
      lat: "47.1",
      lon: "18.9",
      addresstype: "amenity",
      class: "amenity",
      namedetails: { name: "Astoria" },
      address: { country_code: "hu" },
    };
    const scoreBudapest = scoreNamedPlaceResult(budapestAstoria, "Astoria");
    const scoreNoContext = scoreNamedPlaceResult(noContextAstoria, "Astoria");
    assert.ok(typeof scoreBudapest === "number" && typeof scoreNoContext === "number");
    assert.ok(scoreBudapest! > scoreNoContext!, "a Budapest-kontextusú találatnak magasabb pontszámot kell kapnia");

    const best = pickBestNamedPlaceMatch([noContextAstoria, budapestAstoria], "Astoria");
    assert.ok(best);
    assert.equal(best!.address?.suburb, "Erzsébetváros");
  });

  test("valódi egyenállás (két egyenlő pontszámú találat) esetén pickBestNamedPlaceMatch NEM találgat — null-t ad", () => {
    const a = makeNamedPlace({ display_name: "Astoria, Budapest, Magyarország", namedetails: { name: "Astoria" } });
    const b = makeNamedPlace({ display_name: "Astoria, Budapest, Magyarország", namedetails: { name: "Astoria" }, lat: "47.5", lon: "19.1" });
    const best = pickBestNamedPlaceMatch([a, b], "Astoria");
    assert.equal(best, null);
  });
});

describe("F) 'Rákóczi út 999' — nemlétező házszám, a levágott 'Rákóczi út' PUSZTA ÚT, SOSEM válik nevesített hellyé", () => {
  test("isBareRoadOnlyResult true egy road/highway, house_number nélküli találatra", () => {
    const bareRoad = makeBareRoad();
    assert.equal(isBareRoadOnlyResult(bareRoad), true);
  });

  test("egy puszta út SOSEM kap pontszámot a névegyeztetésen, még pontos névegyezés esetén sem", () => {
    const bareRoad = makeBareRoad();
    const score = scoreNamedPlaceResult(bareRoad, "Rákóczi út");
    assert.equal(score, null);
  });

  test("pickBestNamedPlaceMatch egy csak puszta utat tartalmazó találatlistára null-t ad — a hívó (geocodeAddress) így a KLASSZIKUS cím-ágra (APPROXIMATE) esik vissza, SOHA nem 'talál ki' egy pontos célt", () => {
    const best = pickBestNamedPlaceMatch([makeBareRoad()], "Rákóczi út");
    assert.equal(best, null);
  });

  test("ha VAN house_number, a találat már nem 'puszta út' (ez a cím-ág felelőssége, nem itt dől el EXACT/APPROXIMATE-ként)", () => {
    const withHouseNumber = makeBareRoad({ address: { road: "Rákóczi út", city: "Budapest", country_code: "hu", house_number: "12" } });
    assert.equal(isBareRoadOnlyResult(withHouseNumber), false);
  });
});

describe("G) kerület-normalizálás szimmetriája szabadszöveges/POI-keresésben — 'VIII' és 'Viii' azonos kanonikus alakot ad", () => {
  test("parseExpectedAddressComponents ugyanazt a kanonikus kerületet adja 'VIII'-ra és 'Viii'-re, a strukturált 3-mezős formátumban", () => {
    const upper = parseExpectedAddressComponents("Budapest, VIII, Illés utca 28");
    const mixedCase = parseExpectedAddressComponents("Budapest, Viii, Illés utca 28");
    assert.equal(upper.districtOrPostalCode, "VIII. kerület");
    assert.equal(mixedCase.districtOrPostalCode, "VIII. kerület");
    assert.equal(upper.districtOrPostalCode, mixedCase.districtOrPostalCode);
  });

  test("a kanonikus free-text lekérdezés is azonos a két bemenetre (a Nominatim felé küldött szöveg szintjén)", () => {
    const upper = parseExpectedAddressComponents("Budapest, VIII, Illés utca 28");
    const mixedCase = parseExpectedAddressComponents("Budapest, Viii, Illés utca 28");
    assert.equal(buildCanonicalFreeTextQuery(upper), buildCanonicalFreeTextQuery(mixedCase));
    assert.match(buildCanonicalFreeTextQuery(upper), /VIII\. kerület/);
  });

  test("normalizeDistrictOrPostalCode SOHA nem mangleli a bemenetet, ha az nem ismerhető fel biztonságosan (pl. egy POI neve)", () => {
    assert.equal(normalizeDistrictOrPostalCode("Deák tér"), "Deák tér");
  });
});

describe("H) origin (indulási) oldali nevesített hely / POI keresés — a RouteOrigin típus MAP_PICKED módot is ismer, szimmetrikusan a destinationnal", () => {
  test("a RouteOrigin típus a MANUAL/CURRENT_LOCATION mellett MAP_PICKED variánst is felvesz", () => {
    assert.match(formSrc, /type RouteOrigin =[\s\S]*?\| \{ type: "MAP_PICKED"; name: string; latitude: number; longitude: number \}/);
  });

  test("az induló mező szabadszöveges (Város/Kerület nélküli) elfogadása KIZÁRÓLAG akkor engedett, ha az Utca/hely mező ki van töltve — isManualAddressComplete", () => {
    // A függvényt magából a forrásból nyerjük ki és futtatjuk (ugyanaz a
    // minta, mint structured-address-and-sensory-ux.test.ts-ben) — hogy a
    // TÉNYLEGES production logika fusson, ne egy második, kézzel
    // karbantartott másolat.
    const start = formSrc.indexOf(
      "function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {"
    );
    assert.ok(start > -1, "hiányzik az isManualAddressComplete függvény");
    const braceStart = formSrc.indexOf("{", start + "function isManualAddressComplete(addr: ".length);
    // Egyensúlyozott {}-számlálással kinyerjük a teljes törzset (lásd a
    // structured-address-and-sensory-ux.test.ts extractFunctionSource()
    // segédjének indoklását: a paraméter TÍPUS-annotációja is egy
    // egyensúlyban lévő {}-pár, ezért a signature VÉGÉNÉL, nem az első
    // "{" előfordulásánál kell kezdeni a mélység-számlálást).
    const sigEnd = formSrc.indexOf(
      "function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {"
    ) + "function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {".length - 1;
    let depth = 0;
    let end = -1;
    for (let i = sigEnd; i < formSrc.length; i++) {
      if (formSrc[i] === "{") depth++;
      else if (formSrc[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    assert.ok(end > -1, "nem sikerült megtalálni a függvény végét");
    const src = formSrc
      .slice(start, end)
      .replace(/\(addr: \{ city: string; districtOrPostalCode: string; street: string \}\)/, "(addr)")
      .replace(/\): boolean \{/, ") {");
    // eslint-disable-next-line no-new-func
    const isManualAddressComplete = new Function(`${src}\nreturn isManualAddressComplete;`)();

    // GEOCODING KORREKCIÓ (2026-09-11, C4.2, "3. PLACE-ONLY INPUT LEGYEN
    // ÉRVÉNYES" pont) — a City mező ALAPÉRTELMEZETTEN "Budapest", ezért a
    // korábbi "Város ÉS Kerület egyszerre üres" bypass a gyakorlatban SOSEM
    // aktiválódott (egy "Arena Plaza" keresésnél City="Budapest" marad,
    // District="" — ez a RÉGI szabály szerint HIÁNYOS volt, ez okozta a
    // valós Preview-ban tapasztalt, geokódolás ELŐTTI blokkolást). Az ÚJ,
    // explicit üzleti szabály szerint a Város/Kerület/irányítószám
    // OPCIONÁLIS, szűkítő kontextus — KIZÁRÓLAG az Utca/hely mező kötelező.
    // Ez SZÁNDÉKOS viselkedés-változás (nem "teszt-gyengítés"): a City/
    // District mezők hiánya vagy jelenléte TÖBBÉ NEM dönt a kérés
    // elküldhetőségéről — a földrajzi szűkítést a szerver oldali
    // GeoContextConstraint hard constraint érvényesíti (lásd geocode.ts).
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Kossuth Lajos utca 12." }), true);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "" }), false);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);

    // Bare, szabadszöveges POI-keresés: Város ÉS Kerület egyszerre üres, de
    // az Utca/hely mező egy nevesített helyet tartalmaz — TOVÁBBRA IS true.
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "", street: "Deák tér" }), true);
    // Az Utca/hely mező hiánya TOVÁBBRA IS hiányos, FÜGGETLENÜL attól, hogy
    // Város/Kerület ki van-e töltve — ez az EGYETLEN kötelező feltétel.
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "" }), false);
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "", street: "" }), false);
  });
});

describe("I) destination (célpont) oldali nevesített hely / POI keresés — UGYANAZ a pickBestNamedPlaceMatch, nincs destination-only POI logika", () => {
  test("a geocode.ts POI-elfogadó függvényei NEM különböznek origin/destination szerint (nincs 'from'/'to' paraméterük) — ez maga a szimmetria bizonyítéka", () => {
    // A pickBestNamedPlaceMatch/scoreNamedPlaceResult/isBareRoadOnlyResult
    // szignatúrája (result, query) — SEMMILYEN "from"/"to"/"origin"/
    // "destination" paramétert nem vesznek át, ezért a geocodeAddress()
    // MINDKÉT mezőre (from/to, lásd route.ts) ugyanazt a hívást futtatja.
    const geocodeSrc = readFileSync(join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts"), "utf-8");
    assert.match(geocodeSrc, /export function pickBestNamedPlaceMatch\(results: NominatimRawResult\[\], query: string\)/);
    assert.doesNotMatch(geocodeSrc, /function pickBestNamedPlaceMatch\([^)]*\b(from|to|origin|destination)\b/i);
  });
});

describe("J) origin térképes kijelölő — handleOriginMapPickerConfirm/Cancel, szimmetrikusan a destination oldallal", () => {
  test("handleOriginMapPickerConfirm KIZÁRÓLAG setOrigin-t hív MAP_PICKED típussal, nincs fetch/localStorage", () => {
    const block = formSrc.match(/function handleOriginMapPickerConfirm\(lat: number, lon: number\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleOriginMapPickerConfirm handler");
    assert.match(block, /type: "MAP_PICKED"/);
    assert.match(block, /latitude: lat/);
    assert.match(block, /longitude: lon/);
    assert.match(block, /setOriginMapPickerOpen\(false\)/);
    assert.doesNotMatch(block, /fetch\(/);
    assert.doesNotMatch(block, /localStorage/);
  });

  test("handleOriginMapPickerCancel NEM módosítja az origint, csak a picker bezárását végzi", () => {
    const block = formSrc.match(/function handleOriginMapPickerCancel\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleOriginMapPickerCancel handler");
    assert.doesNotMatch(block, /setOrigin\(/);
    assert.doesNotMatch(block, /handleSubmit/);
    assert.match(block, /setOriginMapPickerOpen\(false\)/);
  });

  test("a DestinationMapPicker komponens 'mode' propot fogad el, és origin módban eltérő, de ugyanolyan struktúrájú szöveget ad", () => {
    assert.match(pickerSrc, /mode\?: "origin" \| "destination"/);
    assert.match(pickerSrc, /const isOrigin = mode === "origin";/);
    assert.match(pickerSrc, /isOrigin \? "Ez legyen az indulás" : "Ez legyen a cél"/);
  });

  test("a form az origin picker-t mode=\"origin\"-nel mountolja, a destination picker-t alapértelmezett (destination) móddal", () => {
    assert.match(formSrc, /originMapPickerOpen && approximateOrigin[\s\S]{0,40}<DestinationMapPicker\s*\n\s*mode="origin"/);
    assert.match(formSrc, /destinationMapPickerOpen && approximateDestination[\s\S]{0,40}<DestinationMapPicker\s*\n(?!\s*mode=)/);
  });
});

describe("K) a szerver address_approximate válasza mindkét mezőre (from/to) szimmetrikusan kezelt a kliensen — nincs többé hardcode-olt 'to'-only ág", () => {
  test("a kliens KÉT külön CTA-t renderel — egyet a 'from', egyet a 'to' mezőre, mindkettő a saját approximate-state-jét nézi", () => {
    assert.match(formSrc, /result\.field === "from" && approximateOrigin/);
    assert.match(formSrc, /result\.field === "to" && approximateDestination/);
  });

  test("a data.field alapú state-mentés mindkét mezőre külön ágon fut (from -> setApproximateOrigin, to -> setApproximateDestination)", () => {
    assert.match(formSrc, /data\.field === "to" && data\.approximateLocation\) \{\s*\n\s*setApproximateDestination\(data\.approximateLocation\);/);
    assert.match(formSrc, /data\.field === "from" && data\.approximateLocation\) \{\s*\n\s*setApproximateOrigin\(data\.approximateLocation\);/);
  });
});

describe("L) a térképen kijelölt induló pont koordinátája SOSEM geokódolódik újra (ugyanaz az invariáns, mint a destination MAP_PICKED-nél)", () => {
  test("a MAP_PICKED origin a fromCoordinates ágon megy, nincs buildStructuredAddress/geocodeAddress hívás ezen az ágon", () => {
    const originFieldsBlock =
      formSrc.match(
        /origin\.type === "CURRENT_LOCATION"\s*\n\s*\? \{ fromCoordinates:[\s\S]*?\}\s*\n\s*: \{ from: buildStructuredAddress\(origin\) \};/
      )?.[0] ?? "";
    assert.ok(originFieldsBlock.length > 0, "meg kell találni az originFields teljes elágazását");
    assert.match(originFieldsBlock, /origin\.type === "MAP_PICKED"/);
    // A buildStructuredAddress/geocodeAddress hívás KIZÁRÓLAG a végső,
    // MANUAL-ági `: { from: buildStructuredAddress(origin) };` részben
    // fordulhat elő — az ELŐTTE lévő CURRENT_LOCATION/MAP_PICKED ágakban
    // nem.
    const beforeFinalElse = originFieldsBlock.split(": { from: buildStructuredAddress(origin) };")[0];
    assert.doesNotMatch(beforeFinalElse, /buildStructuredAddress|geocodeAddress/);
  });
});

describe("M) geokódolási hiba/timeout esetén a meglévő fail-safe UX VÁLTOZATLAN — regresszióvédelem", () => {
  test("a handleSubmit catch ága 'routing_engine_unavailable' reason-t és a specifikáció szerinti szöveget adja, a geocoding generalizáció ezt nem érinti", () => {
    const catchBlock = formSrc.match(/\} catch \{\s*\n\s*setResult\(\{ ok: false, reason: "routing_engine_unavailable"[\s\S]*?\}\);/)?.[0] ?? "";
    assert.ok(catchBlock.length > 0, "hiányzik a routing_engine_unavailable fail-safe ág");
    assert.match(catchBlock, /Az útvonaltervezés átmenetileg nem érhető el\./);
  });
});
