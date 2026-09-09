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
    assert.match(formSrc, /destination\.type === "KNOWN_PLACE"\s*\n\s*\? \{/);
    assert.match(formSrc, /toCoordinates: \{ latitude: destination\.latitude, longitude: destination\.longitude \},/);
    assert.match(formSrc, /toName: destination\.name,/);
  });

  test("H) KNOWN_PLACE esetén NEM hívódik buildStructuredAddress — nincs felesleges újra-geokódolás egy már ismert koordinátájú Védett Helyre", () => {
    const knownPlaceBranch = formSrc.match(/destination\.type === "KNOWN_PLACE"\s*\n\s*\? \{[\s\S]*?\}\s*\n\s*: \{ to: buildStructuredAddress\(destination\) \};/);
    assert.ok(knownPlaceBranch, "meg kell találni a destinationFields KNOWN_PLACE/MANUAL elágazását");
    assert.ok(
      !/buildStructuredAddress/.test(knownPlaceBranch![0].split(": {")[0]),
      "a KNOWN_PLACE ág nem hívhatja a buildStructuredAddress()-t"
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
  test("J) isManualAddressComplete hiányos strukturált cím esetén false-t ad (üres város/irányítószám-vagy-kerület/utca)", () => {
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), false);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Kossuth Lajos utca 12." }), false);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "" }), false);
    assert.equal(isManualAddressComplete({ city: "  ", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), false);
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "1136", street: "Kossuth Lajos utca 12." }), true);
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

  test("a Város / Irányítószám vagy kerület / Utca, házszám mezők mindegyik strukturált blokkban (origin ÉS destination MANUAL) megjelennek, a specifikáció szerinti placeholderekkel", () => {
    const cityLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Város<\/label>/g) ?? []).length;
    const districtLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Irányítószám vagy kerület<\/label>/g) ?? []).length;
    const streetLabelCount = (formSrc.match(/<label className="block text-xs text-gray-500">Utca, házszám<\/label>/g) ?? []).length;
    assert.equal(cityLabelCount, 2, "két strukturált cím-blokk van (origin + MANUAL destination), mindkettőnek Város mezője van");
    assert.equal(districtLabelCount, 2);
    assert.equal(streetLabelCount, 2);
    assert.match(formSrc, /placeholder="pl\. 1136 vagy XIII\. kerület"/);
    assert.match(formSrc, /placeholder="pl\. Kossuth Lajos utca 12\."/);
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
    const blockStart = formSrc.indexOf("Mennyire fontosak neked ezek a szempontok?");
    assert.ok(blockStart !== -1, "meg kell találni a szenzoros prioritás blokk kezdetét");
    const blockEnd = formSrc.indexOf("{formError &&", blockStart);
    assert.ok(blockEnd !== -1, "meg kell találni a szenzoros blokk utáni stabil {formError && ...} markert");
    const sensoryBlock = formSrc.slice(blockStart, blockEnd);

    assert.ok(!/alapértelmezett/.test(sensoryBlock), "'alapértelmezett' sehol nem szerepelhet a felhasználó felé a szenzoros prioritás UI-ban");
    assert.ok(!/kétszeresen fontos/.test(sensoryBlock), "'kétszeresen fontos' sehol nem szerepelhet a felhasználó felé");
    assert.ok(!/\bweight\b/i.test(sensoryBlock), "a 'weight' szó nem szerepelhet felhasználó-néző szövegben");
    assert.ok(!/\bscore\b/i.test(sensoryBlock), "a 'score' szó nem szerepelhet ebben a blokkban felhasználó-néző szövegként");
    assert.ok(!/\bmultiplier\b/i.test(sensoryBlock), "a 'multiplier' szó nem szerepelhet felhasználó-néző szövegben");
  });

  test("a magyarázó szöveg a specifikáció szerinti \"Mennyire fontosak neked ezek a szempontok?\" / segédszöveg párra frissült", () => {
    assert.match(formSrc, /Mennyire fontosak neked ezek a szempontok\?/);
    assert.match(formSrc, /Állítsd be külön-külön, melyik szempont mennyire számít neked az útvonal kiválasztásánál\./);
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
    // request body-ban) nem módosult — lásd a body konstrukciót.
    assert.match(formSrc, /const body = \{\s*\n\s*\.\.\.originFields,\s*\n\s*\.\.\.destinationFields,\s*\n\s*departAt:[\s\S]{0,80}?\n\s*weights,\s*\n\s*\};/);
  });

  test("a slider-jelölés emoji + szöveg együtt jelenik meg (nem csak szín alapján), és az aktuálisan kiválasztott állapot vizuálisan hangsúlyosabb (font-semibold)", () => {
    assert.match(
      formSrc,
      /weights\[key\] === level\.value\s*\n\s*\? "flex items-center gap-1 font-semibold text-sni-primary"\s*\n\s*: "flex items-center gap-1 text-gray-400"/
    );
  });
});
