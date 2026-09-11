// VÉDETT ÚTVONAL — Strukturált címbevitel + érthető szenzoros prioritás UI
// (2026-09-XX) — regressziós tesztek a specifikáció 13-14. pontjának A-J
// (címbevitel) és K-R (prioritási UI) tesztlistájához.
//
// Ugyanazt a mintát követi, mint a projekt már meglévő vedett-route
// tesztjei: a VedettUtvonalSearchForm.tsx "use client" React komponens
// plain `node --test` alatt, Next.js bundler nélkül nem futtatható/
// renderelhető — ezért forráskód-szintű, strukturális regresszió-
// tesztekkel fedjük le. A geokódolandó cím-string összeállítását
// (buildStructuredAddress) VISZONT valóban futásidőben teszteljük: a
// függvényt magából a forrásból dinamikusan kinyerve és kiértékelve (nincs
// next/* importja, pure string-manipuláció).
//
//   node --test --experimental-strip-types __tests__/vedett-route/structured-address-and-sensory-ux.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

// buildStructuredAddress futásidejű, valódi kiértékelése — a függvény
// forrását magából a komponens-fájlból nyerjük ki (nincs next/* importja,
// tisztán string-manipuláció), hogy NE kelljen egy második, kézzel
// karbantartott másolatot fenntartani ugyanabból a logikából.
function extractFunctionSource(src: string, signature: string): string {
  // A `signature` MINDIG a törzset megnyitó "{" karakterrel zárul (lásd a
  // hívásokat lent) — ezért a törzs kezdetét a signature VÉGÉNÉL kell
  // venni, nem az első "{" előfordulásánál a signature UTÁN, mert az a
  // paraméter TÍPUS-annotációjában lévő "{ city: string; ... }" literál
  // lenne (ami önmagában is egy egyensúlyban lévő {}-pár, és korábban
  // ezért állt meg ott a mélység-számlálás, egy hibás, csonka kivonatot
  // eredményezve).
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`nem található a függvény: ${signature}`);
  if (!signature.endsWith("{")) throw new Error("a signature-nek a törzset nyitó '{' karakterrel kell végződnie");
  const braceStart = start + signature.length - 1;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`nem sikerült megtalálni a függvény végét: ${signature}`);
}

// A kinyert forrás még TypeScript (paraméter- és visszatérési típus-
// annotációkkal) — a `new Function` sima JS-t vár, ezért ezt a NÉHÁNY,
// pontosan ismert annotációt (nem a teljes logikát!) levágjuk, mielőtt
// kiértékeljük. A tényleges algoritmus (a string-összeállítás) innentől
// SZÓ SZERINT a production kódból fut.
function stripKnownTypeAnnotations(src: string): string {
  return src
    .replace(/\(addr: \{ city: string; districtOrPostalCode: string; street: string \}\)/, "(addr)")
    .replace(/\): string \{/, ") {")
    .replace(/\): boolean \{/, ") {");
}

const buildStructuredAddressSrc = stripKnownTypeAnnotations(
  extractFunctionSource(
    formSrc,
    "function buildStructuredAddress(addr: { city: string; districtOrPostalCode: string; street: string }): string {"
  )
);
// eslint-disable-next-line no-new-func
const buildStructuredAddress = new Function(`${buildStructuredAddressSrc}\nreturn buildStructuredAddress;`)();

const isManualAddressCompleteSrc = stripKnownTypeAnnotations(
  extractFunctionSource(
    formSrc,
    "function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {"
  )
);
// eslint-disable-next-line no-new-func
const isManualAddressComplete = new Function(`${isManualAddressCompleteSrc}\nreturn isManualAddressComplete;`)();

describe("TASK — Strukturált címbevitel: adatmodell (4. pont)", () => {
  test("A) RouteOrigin MANUAL típusa city/districtOrPostalCode/street mezőkre bomlik (nem egy szabadszöveges 'address')", () => {
    assert.match(
      formSrc,
      /type RouteOrigin =\s*\n\s*\| \{ type: "MANUAL"; city: string; districtOrPostalCode: string; street: string \}/
    );
  });

  test("B) RouteDestination MANUAL típusa UGYANÍGY city/districtOrPostalCode/street mezőkre bomlik", () => {
    assert.match(
      formSrc,
      /type RouteDestination =\s*\n\s*\| \{ type: "MANUAL"; city: string; districtOrPostalCode: string; street: string \}/
    );
  });

  test("nincs felesleges párhuzamos adatmodell — a wire-formátum (from/to stringek a szervernek) VÁLTOZATLAN, csak a kliens állítja össze a strukturált mezőkből", () => {
    assert.match(formSrc, /: \{ from: buildStructuredAddress\(origin\) \};/);
    assert.match(formSrc, /: \{ to: buildStructuredAddress\(destination\) \};/);
  });
});

describe("TASK — Geokódolási string összeállítása (5. pont)", () => {
  test("C) irányítószám esetén a magyar postai formátum (\"1136 Budapest, Kossuth Lajos utca 12.\")", () => {
    assert.equal(
      buildStructuredAddress({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }),
      "1136 Budapest, Kossuth Lajos utca 12."
    );
  });

  test("D) kerület esetén a kerület információ NEM dobódik el a geokódolás előtt — mindhárom infó (város, kerület, utca) szerepel a stringben", () => {
    assert.equal(
      buildStructuredAddress({ city: "Budapest", districtOrPostalCode: "XIII. kerület", street: "Kossuth Lajos utca 12." }),
      "Budapest, XIII. kerület, Kossuth Lajos utca 12."
    );
  });

  test("E) azonos utcanév (\"Kossuth utca\") esetén a city + district/postal + street mind megmarad a végső geokódolandó stringben — nincs információvesztés", () => {
    const withPostal = buildStructuredAddress({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth utca 3." });
    assert.match(withPostal, /Budapest/);
    assert.match(withPostal, /1136/);
    assert.match(withPostal, /Kossuth utca 3\./);

    const withDistrict = buildStructuredAddress({ city: "Budapest", districtOrPostalCode: "XIII. kerület", street: "Kossuth utca 3." });
    assert.match(withDistrict, /Budapest/);
    assert.match(withDistrict, /XIII\. kerület/);
    assert.match(withDistrict, /Kossuth utca 3\./);
    // A két eltérő kerület/irányítószám ütközés esetén ELTÉRŐ végső
    // stringet ad — épp ez csökkenti az utcanév-ütközést.
    assert.notEqual(withPostal, withDistrict);
  });

  test("házszám nélküli utca is elfogadott (a házszám a specifikáció szerint opcionális)", () => {
    assert.equal(
      buildStructuredAddress({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth Lajos utca" }),
      "1136 Budapest, Kossuth Lajos utca"
    );
  });
});

describe("TASK — CURRENT_LOCATION / KNOWN_PLACE regresszió a strukturált címbevitel után (F/G/H)", () => {
  test("F) CURRENT_LOCATION origin továbbra is fromCoordinates-t küld (nem érinti a strukturált cím bevezetése)", () => {
    assert.match(
      formSrc,
      /origin\.type === "CURRENT_LOCATION"\s*\n\s*\? \{ fromCoordinates: \{ latitude: origin\.latitude, longitude: origin\.longitude \} \}/
    );
  });

  test("G) KNOWN_PLACE destination továbbra is toCoordinates+toName-t küld", () => {
    // Geocoding hardening (2026-09-10) óta ez a feltétel a térképen
    // kijelölt (MAP_PICKED) célt is magába foglalja — mindkettő egy már
    // ismert koordinátájú cél, UGYANAZON toCoordinates/toName ágon megy
    // (lásd DestinationMapPicker.tsx fejléce, 13. pont), az invariáns maga
    // (KNOWN_PLACE -> toCoordinates+toName, nincs újra-geokódolás)
    // változatlan.
    assert.match(formSrc, /destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED"\s*\n\s*\? \{/);
    assert.match(formSrc, /toCoordinates: \{ latitude: destination\.latitude, longitude: destination\.longitude \},/);
    assert.match(formSrc, /toName: destination\.name,/);
  });

  test("H) KNOWN_PLACE esetén NEM hívódik buildStructuredAddress — nincs felesleges újra-geokódolás egy már ismert koordinátájú Védett Helyre", () => {
    const knownPlaceBranch = formSrc.match(/destination\.type === "KNOWN_PLACE" \|\| destination\.type === "MAP_PICKED"\s*\n\s*\? \{[\s\S]*?\}\s*\n\s*: \{ to: buildStructuredAddress\(destination\) \};/);
    assert.ok(knownPlaceBranch, "meg kell találni a destinationFields KNOWN_PLACE/MAP_PICKED/MANUAL elágazását");
    assert.ok(
      !/buildStructuredAddress/.test(knownPlaceBranch![0].split(": {")[0]),
      "a KNOWN_PLACE/MAP_PICKED ág nem hívhatja a buildStructuredAddress()-t"
    );
  });
});

describe("TASK — Kézi módosítás KNOWN_PLACE -> MANUAL (I)", () => {
  test("I) a KNOWN_PLACE nézet 'Hová?' mezőjébe gépelés handleDestinationOverrideChange-et hív, ami MANUAL módra vált", () => {
    const fnMatch = formSrc.match(/function handleDestinationOverrideChange\(value: string\) \{[\s\S]*?\n  \}/);
    assert.ok(fnMatch, "handleDestinationOverrideChange függvénynek léteznie kell");
    assert.match(fnMatch![0], /setDestination\(\{ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: value \}\);/);
    assert.match(formSrc, /onChange=\{\(e\) => handleDestinationOverrideChange\(e\.target\.value\)\}/);
  });
});

describe("TASK — Validáció (6. pont) — kulturált magyar hibaüzenet, NEM Zod/technikai hiba (J)", () => {
  // GEOCODING KORREKCIÓ (2026-09-11, C4.2, "3. PLACE-ONLY INPUT LEGYEN
  // ÉRVÉNYES" pont) — a City mező alapértelmezetten "Budapest", ezért a
  // korábbi hármas-validáció a gyakorlatban blokkolt egy sima "Arena
  // Plaza"-szerű keresést is (lásd VedettUtvonalSearchForm.tsx
  // isManualAddressComplete komment). Az ÚJ szabály szerint KIZÁRÓLAG az
  // Utca/hely mező kötelező — Város/Kerület/irányítószám opcionális,
  // szűkítő kontextus. Ez SZÁNDÉKOS, a specifikáció által előírt
  // viselkedés-változás, nem a teszt gyengítése.
  test("J) isManualAddressComplete KIZÁRÓLAG az Utca/hely mezőt követeli meg — Város/Kerület/irányítószám opcionális szűkítő kontextus", () => {
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Kossuth Lajos utca 12." }), true);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "" }), false);
    assert.equal(isManualAddressComplete({ city: "  ", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);
    // Az EGYETLEN kötelező feltétel: az Utca/hely mező üres.
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "   " }), false);
    // Place-only keresés (pl. "Arena Plaza") — a valós Preview-ban
    // tapasztalt hiba pontosan ez volt: City="Budapest" (alapérték),
    // District="" — ez a régi szabály szerint hiányos volt.
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Arena Plaza" }), true);
  });

  test("J) handleSubmit a hiányos strukturált cím esetén a specifikáció szó szerinti magyar hibaüzenetét jeleníti meg, NEM egy Zod/technikai hibát", () => {
    assert.match(
      formSrc,
      /if \(origin\.type === "MANUAL" && !isManualAddressComplete\(origin\)\) \{\s*\n\s*setFormError\("Add meg a várost, az irányítószámot vagy kerületet és az utcát\."\);/
    );
    assert.match(
      formSrc,
      /if \(destination\.type === "MANUAL" && !isManualAddressComplete\(destination\)\) \{\s*\n\s*setFormError\("Add meg a várost, az irányítószámot vagy kerületet és az utcát\."\);/
    );
    // SOSEM jelenik meg nyers Zod-hiba a felhasználónak ezen az úton — a
    // formError mindig a fenti, előre megírt magyar szöveg.
    assert.ok(!/setFormError\(\s*(err|error|issue)/i.test(formSrc), "formError sosem tölthető fel nyers hibaobjektum/Zod-issue szövegével");
  });

  test("a Város / Irányítószám vagy kerület / Cím vagy hely mezők mindegyik strukturált blokkban (origin ÉS destination MANUAL) megjelennek, a specifikáció szerinti placeholderekkel", () => {
    // UI/SZÖVEGEZÉSI KORREKCIÓ (2026-09-11, "utolsó, kizárólag UI/
    // szövegezési módosítás" kör, 1. pont) — a harmadik mező felirata
    // "Utca, házszám"-ról "Cím vagy hely"-re változott, a placeholder és
    // egy easy-language segítő szöveg is bővült — ez a mögötte álló
    // state-et/logikát (origin.street/destination.street,
    // buildStructuredAddress, isManualAddressComplete) NEM érinti.
    //
    // RESZPONZÍV LAYOUT KORREKCIÓ (2026-09-11, a "Cím vagy hely"
    // placeholder/helper-text kilógását javító kör) — a placeholder és a
    // helper text tovább rövidült/tördelhetővé vált, hogy ne lógjon ki a
    // keskenyebb (tablet/mobil) konténerből; ez is KIZÁRÓLAG szöveg/CSS,
    // nem érinti a fenti state-et/logikát.
    const cityLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Város<\/label>/g) ?? []).length;
    const districtLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Irányítószám vagy kerület<\/label>/g) ?? []).length;
    const streetLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Cím vagy hely<\/label>/g) ?? []).length;
    assert.equal(cityLabelCount, 2, "két strukturált cím-blokk van (origin + MANUAL destination), mindkettőnek Város mezője van");
    assert.equal(districtLabelCount, 2);
    assert.equal(streetLabelCount, 2);
    assert.match(formSrc, /placeholder="pl\. 1136 vagy XIII\. kerület"/);
    const streetPlaceholderCount = (formSrc.match(/placeholder="pl\. Astoria vagy Váci utca 12"/g) ?? []).length;
    assert.equal(streetPlaceholderCount, 2);
    // A korábbi placeholderek TELJESEN lecserélve — sehol nem maradhat a
    // régi szöveg (sem a klasszikus-cím-only, sem az előző, hosszabb
    // "Váci utca 12, Astoria vagy Déli pályaudvar" verzió).
    assert.doesNotMatch(formSrc, /placeholder="pl\. Kossuth Lajos utca 12\."/);
    assert.doesNotMatch(formSrc, /placeholder="pl\. Váci utca 12, Astoria vagy Déli pályaudvar"/);
    const helperTextCount = (formSrc.match(/Írhatsz címet vagy helyet is, pl\. Déli pályaudvar\./g) ?? []).length;
    assert.equal(helperTextCount, 2, "az easy-language segítő szövegnek mindkét (origin+destination) blokkban meg kell jelennie");
    // A korábbi, rövidebb helper text szövege sehol ne maradjon.
    assert.doesNotMatch(formSrc, /Írhatsz címet vagy egy hely nevét is\./);
    // A helper text tudjon több sorba törni és ne lógjon ki a
    // konténerből: whitespace-normal + break-words (nowrap tilos).
    const helperTextWrapCount = (
      formSrc.match(
        /<p className="mt-0\.5 w-full whitespace-normal break-words text-\[11px\] text-gray-400">\s*\n\s*Írhatsz címet vagy helyet is, pl\. Déli pályaudvar\.\s*\n\s*<\/p>/g
      ) ?? []
    ).length;
    assert.equal(helperTextWrapCount, 2, "a helper text <p>-nek whitespace-normal + break-words osztályokkal kell tördelnie, sortörést engedve");
    assert.doesNotMatch(formSrc, /className="[^"]*\bwhitespace-nowrap\b[^"]*">\s*\n?\s*Írhatsz címet vagy helyet is/);
  });

  test("a Város / Irányítószám vagy kerület / Cím vagy hely reszponzív grid mindkét (origin + destination MANUAL) blokkban 3 lépcsőben törik: mobil 1 oszlop, tablet (sm) 2 oszlop + a Cím vagy hely teljes sort kap, desktop (lg) 3 egyenlő oszlop", () => {
    // RESZPONZÍV LAYOUT KORREKCIÓ (2026-09-11) — a korábbi, csak
    // grid-cols-1 → sm:grid-cols-3 törésű grid helyett most egy köztes
    // tablet-lépcső is van (sm:grid-cols-2), ahol a "Cím vagy hely" mező
    // sm:col-span-2 miatt saját, teljes szélességű sort kap a Város+Kerület
    // páros alatt; desktopon (lg:grid-cols-3 + lg:col-span-1) visszaáll a
    // jelenlegi hárommezős, egy soros elrendezés. Ez KIZÁRÓLAG CSS/layout,
    // az input-mezők értékei/onChange-ei/state-je nem változott.
    const gridContainerCount = (
      formSrc.match(/grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/g) ?? []
    ).length;
    assert.equal(gridContainerCount, 2, "mindkét (origin + destination MANUAL) strukturált cím-blokk grid konténerének 3 lépcsős törést kell használnia");
    assert.doesNotMatch(formSrc, /grid grid-cols-1 gap-2 sm:grid-cols-3/, "a régi, köztes tablet-lépcső nélküli grid osztálynak sehol nem szabad maradnia");
    const streetColSpanCount = (
      formSrc.match(/<div className="min-w-0 sm:col-span-2 lg:col-span-1">/g) ?? []
    ).length;
    assert.equal(streetColSpanCount, 2, "a 'Cím vagy hely' mezőt tartalmazó div-nek sm:col-span-2 lg:col-span-1 osztályokkal kell teljes tablet-sort, majd desktopon egy oszlopot kapnia");
  });

  test("a 'Cím vagy hely' input mindkét (origin + destination) blokkban width:100% + min-width:0, hogy ne okozzon horizontal overflow-t szűk konténerben", () => {
    // RESZPONZÍV LAYOUT KORREKCIÓ (2026-09-11) — a Tailwind w-full már
    // korábban is megvolt, most min-w-0 is bekerült, hogy a grid-item
    // implicit min-width:auto viselkedése sose feszítse szét a konténert
    // (funkcionális logika, value/onChange változatlan).
    const minWFullInputCount = (
      formSrc.match(
        /placeholder="pl\. Astoria vagy Váci utca 12"\s*\n\s*disabled=\{disabled\}\s*\n\s*className="mt-0\.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1\.5 text-sm disabled:bg-gray-100"/g
      ) ?? []
    ).length;
    assert.equal(minWFullInputCount, 2, "mindkét 'Cím vagy hely' inputnak w-full ÉS min-w-0 osztállyal kell rendelkeznie");
  });
});

describe("TASK — Budapest BÉTA korlát diszkrét jelzése (7. pont) — nincs hardcode-olt architektúra", () => {
  test("mindkét strukturált cím-blokk közelében megjelenik a diszkrét BÉTA-lefedettségi jelzés", () => {
    const count = (formSrc.match(/Jelenleg Budapesten tesztelhető\./g) ?? []).length;
    assert.equal(count, 2);
  });

  test("a Város mező induló értéke 'Budapest' egy egyszerű kezdőértékként (state default), nem egy hardcode-olt, más településeket kizáró architektúra részeként", () => {
    // A Budapest alapérték az useState<RouteOrigin>(...) inicializáló
    // kifejezés FALLBACK ágában él (amikor nincs betöltött kedvenc preset
    // — lásd initialFavoritePreset), nem egy önmagában álló, zárt
    // objektum-literálban. A regex ezért kifejezetten a ": { type:
    // "MANUAL", city: "Budapest", ... }" fallback-ágra illik, ami a
    // ternary "else" oldala.
    assert.match(formSrc, /useState<RouteOrigin>\(/);
    assert.match(formSrc, /: \{ type: "MANUAL", city: "Budapest", districtOrPostalCode: "", street: "" \}/);
    // A city mező egy sima, szabadon szerkeszthető szöveges input — nem
    // egy zárt, Budapestre korlátozott enum/select.
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.city : ""\}/);
    assert.match(formSrc, /onChange=\{\(e\) => updateOriginManualField\("city", e\.target\.value\)\}/);
  });
});

describe("TASK — Szenzoros prioritás UX (8-11. pont): a felhasználó SOSEM lát nyers 0/1/2-t vagy technikai szavakat", () => {
  test("K/N) belső érték 0 <-> UI \"🙅 Nem fontos\" — a mapping pontosan megegyezik a specifikációval", () => {
    assert.match(formSrc, /\{ value: 0, emoji: "🙅", label: "Nem fontos" \}/);
  });

  test("L/O) belső érték 1 <-> UI \"🙂 Fontos\"", () => {
    assert.match(formSrc, /\{ value: 1, emoji: "🙂", label: "Fontos" \}/);
  });

  test("M/P) belső érték 2 <-> UI \"⭐ Nagyon fontos\"", () => {
    assert.match(formSrc, /\{ value: 2, emoji: "⭐", label: "Nagyon fontos" \}/);
  });

  test("a slider belső value-ja (Sensory Engine felé küldött weights[key]) PONTOSAN 0/1/2 marad — a lépésköz 1-re szűkült (a korábbi folytonos 0.25 helyett)", () => {
    assert.match(formSrc, /min=\{0\}\s*\n\s*max=\{2\}\s*\n\s*step=\{1\}\s*\n\s*value=\{weights\[key\]\}/);
  });

  test("Q) \"alapértelmezett\" és \"kétszeresen fontos\" NEM jelenik meg a felhasználói szenzoros-prioritás UI szövegeiben", () => {
    // A vizsgálat KIZÁRÓLAG a szenzoros prioritás JSX-blokkjára szűkül (a
    // "Mennyire fontosak..." h3-tól a blokk utáni, stabil {formError &&
    // ...} markerig) — más, ezen a blokkon kívüli forráskód-kommentek
    // (pl. "a Város alapértelmezetten Budapest") NEM user-facing szöveg,
    // azokat nem ellenőrizzük itt.
    //
    // KORÁBBI, TÖRÉKENY VÉGSŐ MARKER (javítva): egy két-soros
    // "</div>\n        </div>" LF-alapú literál string-illesztés volt,
    // ami a projekt CRLF ("\r\n") sorvégeivel mentett .tsx fájljában
    // SOSEM illeszkedik — a "</div>" karakterek után mindig "\r\n" jön,
    // nem sima "\n", és a hardcode-olt 8 szóköz indentálás is bármelyik
    // JSX-átalakítással könnyen elcsúszhat. A teszt ezért lokálisan
    // (LF-re konvertált tükörmásolaton) PASS-elt, de a valódi, CRLF
    // forrás ellen futtatva ("npm run test:vedett-route") megbukott —
    // ez okozta a "meg kell találni a szenzoros prioritás blokk végét"
    // hibát. Az új, stabil végmarker a `formError` feltételes JSX blokk
    // kezdete, amely a szenzoros blokk UTÁN, de a submit gomb ELŐTT áll,
    // és nem függ sorvégjel-típustól vagy indentálástól.
    const blockStart = formSrc.indexOf("Ami nekem fontos");
    assert.ok(blockStart !== -1, "meg kell találni a szenzoros prioritás blokk kezdetét");
    const blockEnd = formSrc.indexOf("{formError &&", blockStart);
    assert.ok(blockEnd !== -1, "meg kell találni a szenzoros blokk utáni stabil {formError && ...} markert");
    const sensoryBlock = formSrc.slice(blockStart, blockEnd);

    assert.ok(!/alapértelmezett/.test(sensoryBlock), "'alapértelmezett' sehol nem szerepelhet a felhasználó felé a szenzoros prioritás UI-ban");
    assert.ok(!/kétszeresen fontos/.test(sensoryBlock), "'kétszeresen fontos' sehol nem szerepelhet a felhasználó felé");
    assert.ok(!/\bweight\b/i.test(sensoryBlock), "a 'weight' szó nem szerepelhet felhasználó-néző szövegben");
    assert.ok(!/\bscore\b/i.test(sensoryBlock), "a 'score' szó nem szerepelhet ebben a blokkban felhasználó-néző szövegként");
    assert.ok(!/\bmultiplier\b/i.test(sensoryBlock), "a 'multiplier' szó nem szerepelhet felhasználó-néző szövegben");
    // Easy-language + "preferencia" kivezetés sprint (2026-09-10, 13. pont):
    // a "preferencia"/"személyes preferencia"/"preferenciák" szavak sem
    // szerepelhetnek user-facing szövegként ebben a blokkban (a BELSŐ
    // kódnevek — preferences/personalization/weights — nem érintettek,
    // ott nem is keresünk).
    assert.ok(!/preferenci/i.test(sensoryBlock), "'preferencia' (vagy toldalékolt alakja) sehol nem szerepelhet a felhasználó felé ebben a blokkban");
  });

  test("Z-AB) a blokk fő címe, alcíme és segédszövege a specifikáció szerinti easy-language megfogalmazásra frissült (\"Ami nekem fontos\" / \"Mi számít neked utazás közben?\" / segédszöveg)", () => {
    assert.match(formSrc, /<h3 className="text-sm font-semibold text-sni-text">Ami nekem fontos<\/h3>/);
    assert.match(formSrc, /<p className="mt-1 text-xs text-gray-500">Mi számít neked utazás közben\?<\/p>/);
    assert.match(
      formSrc,
      /Állítsd be, hogy neked mi fontos\. Így olyan útvonalakat tudunk mutatni, amelyek jobban megfelelnek neked\./
    );
    // A korábbi, technikaibb megfogalmazás ("Mennyire fontosak..." /
    // "...preferenciádat...") eltűnt — ez TESZT-ELAVULÁS, nem regresszió
    // (lásd a mobil UX / easy-language sprint jelentését).
    assert.ok(!/Mennyire fontosak neked ezek a szempontok\?/.test(formSrc));
    assert.ok(!/személyes preferenciádat/.test(formSrc));
  });

  test("R) aria-valuetext a slideren mindig a magyar megfogalmazást adja, sosem a nyers számot", () => {
    assert.match(formSrc, /aria-valuetext=\{sensoryPriorityLabel\(weights\[key\]\)\}/);
    // Nincs látható numerikus tick-label (0/1/2 bare szám) a UI-ban — a
    // korábbi <span className="w-8 ...">{weights[key]}</span> jellegű
    // nyers-szám kijelzés eltávolítva.
    assert.ok(
      !/<span className="w-8 text-right text-xs text-gray-600">\{weights\[key\]\}<\/span>/.test(formSrc),
      "a korábbi nyers 0/1/2 numerikus kijelzésnek el kell tűnnie"
    );
  });

  test("REGRESSZIÓ (12. pont): a WEIGHT_FIELDS kulcsok (transfers/modeSwitches/underground/walking/duration/waiting) és a weights state alapértéke (mind 1) változatlan — a belső mapping és a backend súlyozási szemantika nem módosult", () => {
    assert.match(formSrc, /\{ key: "transfers", label: "Átszállások zavarnak" \}/);
    assert.match(formSrc, /\{ key: "modeSwitches", label: "Közlekedési mód váltása zavar" \}/);
    assert.match(formSrc, /\{ key: "underground", label: "Földalatti \(metró\) szakasz zavar" \}/);
    assert.match(formSrc, /\{ key: "walking", label: "Sok gyaloglás zavar" \}/);
    assert.match(formSrc, /\{ key: "duration", label: "Hosszú utazási idő zavar" \}/);
    assert.match(formSrc, /\{ key: "waiting", label: "Várakozás zavar" \}/);
    // A "mind 1" alapérték a useState<PersonalizationWeights>(...)
    // inicializáló kifejezés FALLBACK ágában él (a "??" jobb oldalán,
    // amikor nincs betöltött kedvenc preset — lásd initialFavoritePreset)
    // — a mapping és az alapértékek maguk nem módosultak.
    assert.match(formSrc, /useState<PersonalizationWeights>\(\s*\n\s*initialFavoritePreset\?\.weights \?\? \{/);
    assert.match(
      formSrc,
      /\?\? \{\s*\n\s*transfers: 1,\s*\n\s*modeSwitches: 1,\s*\n\s*underground: 1,\s*\n\s*walking: 1,\s*\n\s*duration: 1,\s*\n\s*waiting: 1,\s*\n\s*\}/
    );
    // A ranking/calculateSensoryScore hívás módja (a weights objektum a
    // request body-ban) nem módosult. FONTOS: a fájlban KÉT "const body = {"
    // blokk is szerepel (a kedvenc-mentés body-ja ÉS a tényleges keresési
    // kérés body-ja) — a keresési body-t a benne szereplő `departAt:` mező
    // alapján különítjük el egyértelműen, mert csak abban van jelen.
    //
    // SZÁNDÉKOSAN NEM egyetlen, pontos mezősorrendet megkövetelő nagy
    // regex (ez volt a korábbi, törékeny változat, ami a Task C
    // Akadálymentes/Lépcsőmentes MVP `stepFreeRequired` mezőjének
    // hozzáadásakor elszállt) — helyette a body blokkot KÜLÖN, célzott
    // assert-ekkel vizsgáljuk, hogy egy jövőbeli, hasonlóan legitim új
    // mező (a meglévők sorrendjét/tartalmát nem érintve) ne törhesse el
    // ismét ezt a regressziós tesztet.
    const searchBodyBlockMatch = formSrc.match(/const body = \{[\s\S]{0,2000}?\n\s*\};/g)?.find((block) => /departAt:/.test(block));
    assert.ok(
      searchBodyBlockMatch,
      "meg kell találni a keresési kérés body blokkját (a departAt mező alapján megkülönböztetve a kedvenc-mentés body-jától)"
    );
    const searchBodyBlock = searchBodyBlockMatch!;

    assert.match(searchBodyBlock, /\.\.\.originFields,/, "1) ...originFields benne van a body-ban");
    assert.match(searchBodyBlock, /\.\.\.destinationFields,/, "2) ...destinationFields benne van a body-ban");
    assert.match(searchBodyBlock, /departAt:/, "3) departAt benne van a body-ban");
    assert.match(searchBodyBlock, /\n\s*weights,\s*\n/, "4) weights benne van a body-ban (önálló mezőként, nem beágyazva)");
    // 7) AKADÁLYMENTES / LÉPCSŐMENTES MVP (Task C, 2026-09-11) — a
    // stepFreeRequired mező a body-ban SZÁNDÉKOS és ELVÁRT, nem
    // regresszió — ez a teszt ezt mostantól explicit MEGENGEDETTKÉNT (és
    // jelenlévőként) dokumentálja, nem tiltja.
    assert.match(searchBodyBlock, /\n\s*stepFreeRequired,?\s*\n/, "7) stepFreeRequired jelenléte a body-ban elvárt (Task C)");
  });

  test("a 3 állapot-skála (emoji + szöveg, nem csak szín alapján) egyszer, közösen jelenik meg a blokk tetején stabil grid-cols-3 layoutban — SZEMANTIKUS invariánsok, nem egy pontos, teljes className string", () => {
    // TESZT-ELAVULÁS JAVÍTÁSA, MÁSODIK KÖR (kompakt slider UX sprint,
    // 2026-09-10): a korábbi architektúra a 3 állapot-labelt MINDEN EGYES
    // sliderhez külön renderelte, dinamikus aktív/inaktív className-
    // elágazással (weights[key] === level.value ? font-semibold : gray).
    // A kompakt slider UX sprint ezt egy KÖZÖS, statikus, a blokk tetején
    // egyszer megjelenő skálára cserélte (lásd a feladat 15-19. pontját és
    // mobile-ux-slider-and-favorites.test.ts "B) Kompakt slider UX"
    // leírását) — a per-slider dinamikus félkövér/szürke elágazás emiatt
    // MEGSZŰNT, ez NEM regresszió. A teszt ezért az ÚJ architektúra
    // szemantikus invariánsait ellenőrzi: a közös skála stabil grid-cols-3
    // layoutot használ, mindhárom állapot emoji+szöveggel jelenik meg, és
    // a skála forrása (SENSORY_PRIORITY_LEVELS.map + {level.label}) csak
    // EGYSZER fordul elő a blokkban.
    const blockStart = formSrc.indexOf("Ami nekem fontos");
    assert.ok(blockStart !== -1, "meg kell találni a szenzoros prioritás blokk kezdetét");
    const blockEnd = formSrc.indexOf("{formError &&", blockStart);
    assert.ok(blockEnd !== -1, "meg kell találni a szenzoros blokk utáni stabil {formError && ...} markert");
    const sensoryBlock = formSrc.slice(blockStart, blockEnd);

    // A közös, stabil 3 azonos szélességű oszlopos layout (a bizonyított
    // Android PWA layout-shift javítás, most a közös felső skálán).
    assert.match(
      sensoryBlock,
      /className="mt-3 grid grid-cols-3 items-center gap-1 rounded border border-sni-primary\/20 bg-white\/70 px-2 py-2 text-center text-xs font-medium text-sni-text"/,
      "a közös skála konténerének a stabil grid-cols-3 layoutot kell használnia"
    );

    // emoji + szöveg mapping megmaradt, és PONTOSAN EGYSZER fordul elő a
    // blokkban (nem sliderenként ismételve).
    const labelRefs = sensoryBlock.match(/\{level\.label\}/g) ?? [];
    assert.equal(labelRefs.length, 1, "a {level.label} referenciának pontosan egyszer kell megjelennie a blokkban");
    const mapCalls = sensoryBlock.match(/\{SENSORY_PRIORITY_LEVELS\.map\(\(level\) => \(/g) ?? [];
    assert.equal(mapCalls.length, 1, "a SENSORY_PRIORITY_LEVELS.map(...) hívásnak pontosan egyszer kell szerepelnie");
    assert.match(sensoryBlock, /\{level\.emoji\}/, "az emoji-nak is meg kell jelennie a közös skálán");

    // A sliderek maguk kompaktak maradtak — nincs bennük SENSORY_PRIORITY_
    // LEVELS hivatkozás (a skála a WEIGHT_FIELDS.map(...) törzsén KÍVÜL,
    // a blokk tetején él).
    const weightFieldsBodyMatch = sensoryBlock.match(/\{WEIGHT_FIELDS\.map\(\(\{ key, label \}\) => \([\s\S]*?\)\)\}/);
    assert.ok(weightFieldsBodyMatch, "meg kell találni a WEIGHT_FIELDS.map(...) törzsét");
    assert.ok(
      !/SENSORY_PRIORITY_LEVELS/.test(weightFieldsBodyMatch![0]),
      "a sliderek (WEIGHT_FIELDS.map törzse) NEM tartalmazhatnak külön, sliderenkénti 3-label sort"
    );
  });
});
