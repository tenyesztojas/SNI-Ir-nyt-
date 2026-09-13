// FONTOS UX MÓDOSÍTÁS — VÉDETT ÚTVONAL (2026-09-09) — regresszió-tesztek
// TASK A (Egyetlen Megosztott Térkép) és TASK B ("Aktuális helyzetem" mint
// indulási pont) számára.
//
// Ez a projekt a React komponensek viselkedését (marker<->lista kattintás-
// szinkron, DOM-eseménykezelés stb.) NEM böngésző/DOM-tesztkörnyezetben
// (nincs jsdom/@testing-library/react a devDependencies között), hanem
// forráskód-szintű, strukturális regresszió-tesztekkel fedi le — lásd a
// már meglévő map-rendering-fix.test.ts / rest-point-map-fitbounds.test.ts
// mintáját. Ez a fájl ugyanezt a mintát követi: a TÉNYLEGES forráskódot
// olvassa be és ellenőrzi a specifikációban kért strukturális garanciákat.
//
//   node --test --experimental-strip-types __tests__/vedett-route/single-shared-map-and-current-location.test.ts
//
// LEFEDI (a felhasználó kérése szerinti A-M tesztlista, forráskód-szinten
// ellenőrizhető résszel):
//   A) nincs második <VedettUtvonalMap> mount — RestStopFlowPanel.tsx nem
//      importál/rendereli a VedettUtvonalMap-et
//   B) a RankedJourneyCard EGYETLEN <VedettUtvonalMap> hívása kapja meg a
//      pihenőpont-markereket (restStopMapState-ből egyesítve)
//   F) "Ide megyek" -> a props-egyesítés legsOverride-ot használ ugyanazon
//      a <VedettUtvonalMap> híváson (nincs route-váltás új komponensre)
//   G) "Folytatom az utat" -> ROUTE_RESUMED állapotban a panel INACTIVE
//      map state-et jelent (a bázis legs, azaz az újratervezett route,
//      veszi át a nézetet)
//   H/I) CURRENT_LOCATION origin: a form fromCoordinates-t küld, SOSEM
//      geokódolandó "Aktuális helyzetem" stringet
//   J) kézi gépelés -> MANUAL módra állítás
//   K) permission denied/timeout/unavailable szövegek jelen vannak
//   L) GPS privacy — a form/panel forráskódja SEHOL nem logolja/perzisztálja
//      a nyers lat/lon-t (vedettRouteLog hívásban, vagy adatbázis-írásban)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSearchRequestOriginFields,
} from "../../lib/vedett-route/searchRequestBuilder.ts";

const PANEL_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "RestStopFlowPanel.tsx");
const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const MAP_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalMap.tsx");

const panelSrc = readFileSync(PANEL_PATH, "utf-8");
const formSrc = readFileSync(FORM_PATH, "utf-8");
const mapSrc = readFileSync(MAP_PATH, "utf-8");

describe("TASK A — Egyetlen Megosztott Térkép (RestStopFlowPanel NEM hoz létre saját térképet)", () => {
  test("A) RestStopFlowPanel.tsx NEM importál next/dynamic-ot (a korábbi, saját MapLibre mount-pontja megszűnt)", () => {
    assert.ok(
      !/from "next\/dynamic"/.test(panelSrc),
      "a panel nem tarthat fenn saját, második MapLibre mount-pontot — a next/dynamic import eltávolítása bizonyítja, hogy nincs saját dynamic() térkép-betöltés"
    );
  });

  test("A) RestStopFlowPanel.tsx sehol nem renderel <VedettUtvonalMap JSX elemet (a szövegben csak MAGYARÁZÓ KOMMENT-mentés szerepelhet, JSX-tag props-szal soha)", () => {
    // A JSX-hívásnak mindig van legalább egy prop, tehát whitespace követi
    // közvetlenül a komponensnevet ("<VedettUtvonalMap legs=..." vagy
    // "<VedettUtvonalMap\n  legs=..."); a kommentekben szereplő puszta
    // "<VedettUtvonalMap>" említések ("...jén jelennek meg") ettől
    // megkülönböztethetők, mert utánuk nincs whitespace, hanem ">" jön.
    assert.ok(
      !/<VedettUtvonalMap\s/.test(panelSrc),
      "a panelnek KIZÁRÓLAG onMapStateChange-en keresztül szabad térkép-állapotot jelentenie, sosem saját JSX-ben térképet rendereljen"
    );
  });

  test("RestStopFlowPanel.tsx exportálja a RestStopMapState típust és fogad egy onMapStateChange callback propot", () => {
    assert.match(panelSrc, /export interface RestStopMapState/);
    assert.match(panelSrc, /onMapStateChange\?:\s*\(state: RestStopMapState\) => void/);
  });

  test("B) VedettUtvonalSearchForm.tsx RankedJourneyCard-ja PONTOSAN EGY <VedettUtvonalMap JSX hívást tartalmaz", () => {
    // Lásd a fenti (panelSrc-re vonatkozó) teszt kommentjét: a JSX-hívást a
    // közvetlenül utána következő whitespace különbözteti meg a kommentekben
    // szereplő puszta "<VedettUtvonalMap>" említésektől.
    const matches = formSrc.match(/<VedettUtvonalMap\s/g) ?? [];
    assert.equal(matches.length, 1, "csak egyetlen <VedettUtvonalMap> JSX-hívás lehet a fájlban (a kártyánkénti EGYETLEN megosztott térkép)");
  });

  test("B) az egyetlen <VedettUtvonalMap> hívás a restStopMapState-ből egyesített restPoints/selectedRestPointId/onSelectRestPoint/restPointFocusMode props-okat kapja", () => {
    const mapCallMatch = formSrc.match(/<VedettUtvonalMap\s/);
    assert.ok(mapCallMatch, "meg kell találni a tényleges (props-szal rendelkező) <VedettUtvonalMap JSX hívást");
    const mapCallStart = mapCallMatch!.index!;
    const mapCallEnd = formSrc.indexOf("/>", mapCallStart);
    const mapCallProps = formSrc.slice(mapCallStart, mapCallEnd);
    assert.match(mapCallProps, /restStopMapState\.active/);
    assert.match(mapCallProps, /restPointFocusMode=\{restStopMapState\.active && restStopMapState\.focusOnRestPoints\}/);
    assert.match(mapCallProps, /mergeRestPointMarkers\(/);
  });

  test("F/G) VedettUtvonalSearchForm.tsx a legs propot legsOverride-dal (ha aktív) VAGY a saját displayedJourney.legs-szel adja át — az eredeti route SOSEM veszik el", () => {
    assert.match(
      formSrc,
      /legs=\{restStopMapState\.active && restStopMapState\.legsOverride \? restStopMapState\.legsOverride : displayedJourney\.legs\}/
    );
  });

  test("F) RestStopFlowPanel.tsx a NAVIGATING_TO_REST_POINT állapotban legsOverride-ot jelent (a pihenőponthoz vezető route-ot)", () => {
    assert.match(panelSrc, /case "NAVIGATING_TO_REST_POINT":/);
    assert.match(panelSrc, /legsOverride: restPointJourney\?\.legs,/);
  });

  test("G) RestStopFlowPanel.tsx ROUTE_RESUMED állapotban INACTIVE map state-et jelent (a bázis/újratervezett route veszi át a nézetet)", () => {
    assert.match(panelSrc, /case "ROUTE_RESUMED": \{[\s\S]{0,500}?onMapStateChange\(INACTIVE_MAP_STATE\);/);
  });

  test("REGRESSZIÓ: VedettUtvonalMap.tsx marker<->kártya szinkron props-jai (selectedRestPointId/onSelectRestPoint) érintetlenek", () => {
    assert.match(mapSrc, /selectedRestPointId\?:\s*string \| null;/);
    assert.match(mapSrc, /onSelectRestPoint\?:\s*\(id: string\) => void;/);
  });
});

describe("TASK B — „Aktuális helyzetem” mint indulási pont", () => {
  test("H) CURRENT_LOCATION módban a form fromCoordinates-t küld a routing kérésben", () => {
    // ÁTÍRVA (2026-09-12): az inline fromCoordinates összeállítás
    // buildSearchRequestOriginFields()-ba lett kiszervezve (searchRequestBuilder.ts)
    // — az inline regex stale lenne. Viselkedési assert: CURRENT_LOCATION →
    // { fromCoordinates } (nincs geokódolás, nincs 'from' string).
    const fields = buildSearchRequestOriginFields({
      type: "CURRENT_LOCATION",
      latitude: 47.497,
      longitude: 19.040,
    });
    assert.ok("fromCoordinates" in fields, "CURRENT_LOCATION → fromCoordinates jelen van");
    assert.ok(!("from" in fields), "CURRENT_LOCATION: 'from' string NEM szerepel (nem kerül geokódolásra)");
    // A form importálja a buildSearchRequestOriginFields-t (strukturális)
    assert.match(formSrc, /buildSearchRequestOriginFields/);
  });

  test("I) a form SOHA nem küldi az 'Aktuális helyzetem' feliratot geokódolandó 'from' mezőként — a CURRENT_LOCATION ág nem tartalmaz 'from:' kulcsot", () => {
    // ÁTÍRVA (2026-09-12): az originFields összeállítás buildSearchRequestOriginFields()-ba
    // lett kiszervezve (searchRequestBuilder.ts) — az inline { from: buildStructuredAddress(origin) }
    // regex és a string.indexOf stale lenne. Viselkedési assert:
    // CURRENT_LOCATION → fromCoordinates VAN, 'from' NINCS;
    // MANUAL → 'from' VAN, fromCoordinates NINCS.
    const clFields = buildSearchRequestOriginFields({
      type: "CURRENT_LOCATION",
      latitude: 47.497,
      longitude: 19.040,
    });
    assert.ok("fromCoordinates" in clFields, "CURRENT_LOCATION → fromCoordinates jelen van");
    assert.ok(!("from" in clFields), "CURRENT_LOCATION: 'from' string NEM szerepel (nem geokódolandó)");

    const manualFields = buildSearchRequestOriginFields({
      type: "MANUAL",
      city: "Budapest",
      districtOrPostalCode: "VIII. kerület",
      street: "Baross utca 1",
    });
    assert.ok("from" in manualFields, "MANUAL → 'from' string jelen van (geokódolandó)");
    assert.ok(!("fromCoordinates" in manualFields), "MANUAL: 'fromCoordinates' NEM szerepel");

    // Strukturális assert: a form body az originFields/destinationFields szétbontott szerkezetét használja
    assert.match(
      formSrc,
      /const body\s*=\s*\{\s*\.\.\.originFields,\s*\.\.\.destinationFields,/,
      "a request body-nak az originFields és destinationFields szétbontott szerkezetét kell használnia"
    );
  });

  test("I) app/api/admin/vedett-utvonal/search/route.ts fromCoordinates jelenlétekor NEM hívja meg a geocodeAddress()-t az induló pontra", () => {
    const routePath = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
    const routeSrc = readFileSync(routePath, "utf-8");
    // Geocoding hardening (2026-09-10) óta az objektum explicit
    // `quality: "EXACT" as const` mezőt kap — az invariáns változatlan:
    // a geocodeAddress() hívást ez az ág TELJESEN kihagyja.
    // FRISSÍTVE (2026-09-12): regex nem kötelezi `})` lezárót — TypeScript
    // típus-annotáció (`as GeocodeResult`) megjelenhet a `}` után.
    // Két részben ellenőrizzük: (1) a fromCoordinates ág alakja, (2) az ELSE ág.
    assert.match(
      routeSrc,
      /fromCoordinates\s*\n\s*\?\s*Promise\.resolve\(\{ name: fromName \?\? "Jelenlegi hely", lat: fromCoordinates\.latitude, lon: fromCoordinates\.longitude, quality: "EXACT" as const/,
      "fromCoordinates esetén a geocodeAddress() hívást teljesen ki kell hagyni, a fromName hiányában statikus 'Jelenlegi hely' névvel kell helyettesíteni"
    );
    // Az ELSE (MANUAL) ágon geocodeAddress fut:
    assert.match(routeSrc, /:\s*geocodeAddress\(from as string\)/);
  });

  test("J) kézi gépelés BÁRMELYIK induló címmezőbe MANUAL módra állítja vissza az origin-t", () => {
    // Strukturált címbevitel (2026-09-XX) óta a régi, egyetlen
    // handleOriginAddressChange helyett updateOriginManualField kezeli
    // mindhárom (Város/Irányítószám vagy kerület/Utca, házszám) mezőt —
    // ugyanaz az invariáns (bármelyik mezőbe gépelés MANUAL-ra vált).
    assert.match(
      formSrc,
      /function updateOriginManualField\(field: "city" \| "districtOrPostalCode" \| "street", value: string\) \{\s*\n[\s\S]{0,400}?setOrigin\(\(prev\) => \{\s*\n[\s\S]{0,300}?return \{ \.\.\.base, type: "MANUAL", \[field\]: value \};/
    );
  });

  test("K) a permission denied / timeout / unavailable hibaszövegek szó szerint megegyeznek a specifikációval", () => {
    assert.match(formSrc, /denied: "A helyzeted használatához engedélyezd a helymeghatározást\."/);
    assert.match(formSrc, /unavailable: "Az aktuális helyzeted most nem érhető el\."/);
    assert.match(formSrc, /timeout: "Nem sikerült időben meghatározni a helyzeted\. Próbáld újra\."/);
  });

  test("B5) a forráskód SOHA nem jelenít meg nyers technikai kivételt — a hibaágak mindig a fenti, előre definiált szövegtérképből olvasnak", () => {
    assert.ok(!/setOriginError\(\s*err/.test(formSrc), "originError sosem tölthető fel közvetlenül egy nyers hibaobjektum/kivétel szövegével");
  });

  test("B5) egyszerre nem indítható el több párhuzamos 'Aktuális helyzetem' kérés — a handler korai return-nel véd 'requesting' állapotban", () => {
    assert.match(formSrc, /function handleUseCurrentLocation\(\) \{\s*\n[\s\S]{0,300}?if \(originGeo\.status === "requesting"\) return;/);
  });

  test("L) GPS PRIVACY: a form/panel forráskódja SEHOL nem ad át nyers lat\\/lon-t vedettRouteLog()-nak", () => {
    assert.ok(!/vedettRouteLog\(/.test(formSrc), "a form nem hívhat vedettRouteLog()-ot (a GPS-koordináta soha nem logolható)");
    assert.ok(!/vedettRouteLog\(/.test(panelSrc), "a panel nem hívhat vedettRouteLog()-ot (a GPS-koordináta soha nem logolható)");
  });

  test("L) GPS PRIVACY: a form/panel forráskódja SEHOL nem ír Supabase-be/adatbázisba a folyamatos GPS-koordinátából (csak az explicit 'Pihenőpont hozzáadása' mentés kivétel, ami külön komponens)", () => {
    assert.ok(!/supabase/i.test(formSrc), "a form nem érhet közvetlenül Supabase-hez — a GPS-koordináta kizárólag React state-ben élhet");
    assert.ok(!/supabase/i.test(panelSrc), "a panel nem érhet közvetlenül Supabase-hez — a GPS-koordináta kizárólag React state-ben élhet");
  });

  test("REGRESSZIÓ (M): a MANUAL induló címmezők onChange-e továbbra is a beírt szöveget állítja be — nincs elveszett funkcionalitás (a strukturált címbevitel után is)", () => {
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.city : ""\}/);
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.districtOrPostalCode : ""\}/);
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.street : ""\}/);
    assert.match(formSrc, /onChange=\{\(e\) => updateOriginManualField\("city", e\.target\.value\)\}/);
    assert.match(formSrc, /onChange=\{\(e\) => updateOriginManualField\("districtOrPostalCode", e\.target\.value\)\}/);
    assert.match(formSrc, /onChange=\{\(e\) => updateOriginManualField\("street", e\.target\.value\)\}/);
  });
});
