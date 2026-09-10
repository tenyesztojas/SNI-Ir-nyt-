// VÉDETT ÚTVONAL – MOBIL UX sprint (2026-09-10): Android PWA slider
// scroll-jump hardening (spec A. feladat) + Kedvencek CTA UX (spec B.
// feladat) regresszió-tesztjei.
//
// Ugyanazt a forráskód-szintű, strukturális regresszió-teszt mintát
// követi, mint a projekt korábbi tesztjei — nincs jsdom/@testing-library/
// react, ezért a TÉNYLEGES forráskódot olvassa be.
//
//   node --test --experimental-strip-types __tests__/vedett-route/mobile-ux-slider-and-favorites.test.ts
//
// FONTOS a slider tesztekről: ezek a tesztek bizonyítják, hogy az
// APPLIKÁCIÓ-RÉTEG nem tartalmaz explicit remount/scroll/router-navigáció
// triggert a csúszka mozgatásakor, ÉS hogy a korábban azonosított,
// javított layout-shift forrás (a 3 állapot-label nem egyenlő szélességű
// flex-elrendezése helyett grid-alapú, stabil geometria) továbbra is
// hardening-ként jelen van.
//
// FRISSÍTÉS (2026-09-10, fizikai Android PWA teszt eredménye alapján): a
// layout-shift hardening ÖNMAGÁBAN NEM volt elegendő — fizikai, telepített
// Android PWA-n reprodukált bizonyíték szerint a scroll-jump a fókuszban
// maradt "Utca, házszám" (vagy más strukturált cím-) mezőhöz tér mindig
// vissza. A root cause ezért egy böngésző-szintű, fókusz-vezérelt
// scroll-anchoring viselkedés — ezt a "B2) Slider focus-release" blokk
// tesztjei fedik le (releasePreviousTextInputFocus, onPointerDownCapture
// a range inputon). Ez a javítás önmagában sem állítható fizikailag
// bizonyítottan teljes megoldásnak — fizikai Android PWA validáció
// szükséges (lásd a feladat végső jelentését).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const REST_POINT_QUICK_ADD_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "RestPointQuickAdd.tsx");
const restPointQuickAddSrc = readFileSync(REST_POINT_QUICK_ADD_PATH, "utf-8");

// A szenzoros prioritás blokk (a sliderek + label-ek konténere) kinyerése
// — stabil horgony-szövegekre épül, nem egy törékeny, teljes-blokk regexre.
const weightsBlockStart = formSrc.indexOf("Ami nekem fontos");
assert.ok(weightsBlockStart !== -1, "nem található a szenzoros prioritás blokk fejlécszövege");
const weightsBlockOuterStart = formSrc.lastIndexOf("<div", weightsBlockStart);
const weightsBlockEnd = formSrc.indexOf("{formError &&", weightsBlockStart);
assert.ok(weightsBlockEnd !== -1, "nem található a szenzoros prioritás blokk vége (formError előtt)");
const weightsBlock = formSrc.slice(weightsBlockOuterStart, weightsBlockEnd);

describe("A) Android PWA slider scroll-jump — application-layer audit (nincs explicit remount/scroll/GPS trigger)", () => {
  test("a slider onChange KIZÁRÓLAG a weights state-et módosítja (nincs route search, nincs GPS, nincs navigationMode, nincs favorite-reload hívás a handlerben)", () => {
    const onChangeMatch = weightsBlock.match(/onChange=\{\(e\) => setWeights\(\(w\) => \(\{ \.\.\.w, \[key\]: Number\(e\.target\.value\) \}\)\)\}/);
    assert.ok(onChangeMatch, "a slider onChange handlerének KIZÁRÓLAG setWeights-et kell hívnia");
  });

  test("nincs scrollIntoView() hívás a teljes fájlban", () => {
    assert.ok(!/scrollIntoView\(/.test(formSrc), "a fájl sehol nem hívhat scrollIntoView()-t — ez a felhasználó alatt elmozdítaná a nézetet");
  });

  test("nincs window.scrollTo() hívás a teljes fájlban", () => {
    assert.ok(!/window\.scrollTo\(/.test(formSrc), "a fájl sehol nem hívhat window.scrollTo()-t — vak scroll-hackre utalna");
  });

  test("nincs autoFocus prop és nincs .focus() hívás a fájlban", () => {
    assert.ok(!/autoFocus/.test(formSrc), "a fájl nem használhat autoFocus-t — ez böngésző-implicit scrollt válthat ki");
    assert.ok(!/\.focus\(\)/.test(formSrc), "a fájl nem hívhat explicit .focus()-t");
  });

  test("nincs router.push/router.replace és nincs useSearchParams a fájlban (a slider mozgatása sosem navigál)", () => {
    assert.ok(!/router\.(push|replace)\(/.test(formSrc));
    assert.ok(!/useSearchParams\(/.test(formSrc));
  });

  test("a WEIGHT_FIELDS.map(...) React key stabil (a mezőnév kulcsa, key={key}) — nem index-alapú, nem generált minden renderre", () => {
    assert.match(weightsBlock, /\{WEIGHT_FIELDS\.map\(\(\{ key, label \}\) => \(\s*\n\s*<div key=\{key\}>/);
  });
});

// A releasePreviousTextInputFocus modul-szintű függvény a fájl teteje felé
// van definiálva (a sensoryPriorityLabel után, a komponens előtt) — ezért
// a teljes formSrc-en vizsgáljuk, nem a szűkebb weightsBlock-on.
const focusReleaseFnMatch = formSrc.match(/function releasePreviousTextInputFocus\(target: EventTarget \| null\): void \{[\s\S]*?\n\}/);

describe("B2) Slider focus-release — fizikailag bizonyított Android PWA scroll-jump root cause célzott javítása", () => {
  test("A) a sensory range inputnak van pointer-interakciós focus-release kezelése (onPointerDownCapture, nem onChange/useEffect)", () => {
    assert.match(weightsBlock, /onPointerDownCapture=\{\(e\) => releasePreviousTextInputFocus\(e\.currentTarget\)\}/);
  });

  test("B) a handler document.activeElement-et vizsgálja", () => {
    assert.ok(focusReleaseFnMatch, "meg kell találni a releasePreviousTextInputFocus függvényt");
    assert.match(focusReleaseFnMatch![0], /const active = document\.activeElement;/);
  });

  test("C) egy előző szöveges/text-like inputot (input/textarea/select/contenteditable, kizárva range/checkbox/radio/button/submit) blur-ölhet", () => {
    const body = focusReleaseFnMatch![0];
    assert.match(body, /active instanceof HTMLTextAreaElement/);
    assert.match(body, /active instanceof HTMLSelectElement/);
    assert.match(body, /active\.isContentEditable/);
    assert.match(body, /active\.type !== "range"/);
    assert.match(body, /active\.type !== "checkbox"/);
    assert.match(body, /active\.type !== "radio"/);
    assert.match(body, /active\.type !== "button"/);
    assert.match(body, /active\.type !== "submit"/);
    assert.match(body, /active\.blur\(\);/);
  });

  test("D) magát a range inputot (a slider-t, amire a pointerdown irányult) NEM bluröli — early-return, ha active === target", () => {
    const body = focusReleaseFnMatch![0];
    assert.match(body, /if \(active === target\) return;/);
  });

  test("E) a slider onChange handlere NEM hív blur-t minden value update-nél — a blur kizárólag a pointerdown-capture handlerben történik", () => {
    assert.ok(
      !/onChange=\{\(e\) => setWeights\(\(w\) => \(\{ \.\.\.w, \[key\]: Number\(e\.target\.value\) \}\)\)\}[^}]*blur/.test(weightsBlock),
      "az onChange handler nem hívhat blur()-t"
    );
    // Az onChange handler saját maga (a releasePreviousTextInputFocus
    // hívás nélkül) kizárólag a weights state-et módosítja.
    assert.match(weightsBlock, /onChange=\{\(e\) => setWeights\(\(w\) => \(\{ \.\.\.w, \[key\]: Number\(e\.target\.value\) \}\)\)\}/);
  });

  test("F) nincs window.scrollTo() a teljes fájlban (a javítás fókusz-alapú, nem scroll-kompenzáció)", () => {
    assert.ok(!/window\.scrollTo\(/.test(formSrc));
  });

  test("G) nincs scrollIntoView() a teljes fájlban", () => {
    assert.ok(!/scrollIntoView\(/.test(formSrc));
  });

  test("H) nincs document/body scrollTop manipuláció a fájlban", () => {
    assert.ok(!/\.scrollTop\s*=/.test(formSrc), "nem szabad scrollTop-ot közvetlenül állítani");
    assert.ok(!/document\.body\.scroll/.test(formSrc));
  });

  test("I) nincs globális \"blur minden scrollkor\" mechanizmus — nincs scroll eseményfigyelő a fájlban, a blur kizárólag a slider pointerdown-capture-jéhez kötött", () => {
    assert.ok(!/addEventListener\(\s*["']scroll["']/.test(formSrc), "nem szabad globális scroll-eseményfigyelőnek lennie");
    // Csak EGYETLEN releasePreviousTextInputFocus hívás létezik a fájlban
    // (a sensory range input onPointerDownCapture-jén) — nem fut minden
    // rendernél vagy más eseményen.
    const callSites = formSrc.match(/releasePreviousTextInputFocus\(/g) ?? [];
    assert.equal(callSites.length, 2, "1 függvénydefiníció + 1 hívási hely várható (a definíció maga is tartalmazza a nevet)");
  });

  test("J) a grid grid-cols-3 layout hardening megmarad (a korábbi layout-shift javítás nem lett visszavonva — most a közös felső skálán él, lásd 'B) Kompakt slider UX' blokk)", () => {
    assert.match(weightsBlock, /className="mt-3 grid grid-cols-3 items-center gap-1 rounded border border-sni-primary\/20 bg-white\/70 px-2 py-2 text-center text-xs font-medium text-sni-text"/);
  });

  test("K) a lokális overflowAnchor hardening megmarad a szenzoros blokkon (nem globális)", () => {
    assert.match(weightsBlock, /style=\{\{ overflowAnchor: "none" \}\}/);
    assert.ok(!/body\s*\{[^}]*overflow-anchor/.test(formSrc));
  });

  test("L) a range input min=0, max=2, step=1 változatlan", () => {
    assert.match(weightsBlock, /type="range"\s*\n\s*min=\{0\}\s*\n\s*max=\{2\}\s*\n\s*step=\{1\}/);
  });

  test("M) a billentyűzetes accessibility nincs elrontva — nincs tabIndex={-1} vagy disabled a range inputon (a disabled prop kizárólag a form-szintű `disabled` state-hez kötött, nem a fókusz-javításhoz), és a slider aria-valuetext változatlan", () => {
    assert.ok(!/type="range"[\s\S]{0,200}tabIndex=\{-1\}/.test(weightsBlock), "a range input nem kaphat tabIndex={-1}-et");
    assert.match(weightsBlock, /aria-valuetext=\{sensoryPriorityLabel\(weights\[key\]\)\}/);
    // A focus-release függvény maga NEM hivatkozik semmilyen tabIndex-re
    // vagy billentyűzet-eseményre — kizárólag pointerdown-capture-höz kötött.
    assert.ok(!/tabIndex/.test(focusReleaseFnMatch![0]));
    assert.ok(!/KeyboardEvent|onKeyDown|e\.key/.test(focusReleaseFnMatch![0]));
  });

  test("N) a címmezők (strukturált MANUAL city/districtOrPostalCode/street) onChange kezelése változatlan — a javítás nem módosítja a beviteli mezők működését", () => {
    assert.match(formSrc, /onChange=\{\(e\) => updateOriginManualField\("city", e\.target\.value\)\}/);
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.city : ""\}/);
    // A releasePreviousTextInputFocus SEHOL nincs bekötve a cím-mezők
    // onChange/onBlur/onFocus eseményeibe — kizárólag a range input
    // onPointerDownCapture-jéhez kötött.
    assert.ok(
      !/updateOriginManualField[\s\S]{0,120}releasePreviousTextInputFocus/.test(formSrc),
      "a cím-mezők onChange-e nem hívhatja a focus-release függvényt"
    );
  });
});

describe("A) VedettUtvonalWorkspace remount-védelem — favorite preset key-remount SOHA nem függ slider-mozgatástól", () => {
  test("VedettUtvonalWorkspace.tsx `key` állapota kizárólag handleSelectFavorite-ra változik, amit KIZÁRÓLAG a FavoriteRoutesPanel onSelect callback-je hív", () => {
    const workspacePath = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalWorkspace.tsx");
    const workspaceSrc = readFileSync(workspacePath, "utf-8");
    assert.match(workspaceSrc, /function handleSelectFavorite\(preset: FavoriteRoutePreset\) \{\s*\n\s*setSelectedPreset\(\(prev\) => \(\{ key: \(prev\?\.key \?\? 0\) \+ 1, preset \}\)\);\s*\n\s*\}/);
    assert.match(workspaceSrc, /<FavoriteRoutesPanel onSelect=\{handleSelectFavorite\} \/>/);
    // Csak EGYETLEN setSelectedPreset hívás létezhet a fájlban — a slider
    // (a VedettUtvonalSearchForm belsejében él) semmilyen úton nem érheti el.
    const setSelectedPresetCalls = workspaceSrc.match(/setSelectedPreset\(/g) ?? [];
    assert.equal(setSelectedPresetCalls.length, 1, "a Workspace key-remount állapotát KIZÁRÓLAG egyetlen helyről (handleSelectFavorite) szabad módosítani");
  });
});

describe("B) Kompakt slider UX (2026-09-10) — a 3 állapot-skála CSAK EGYSZER jelenik meg, sliderenként kompakt label+range", () => {
  // TESZT-ELAVULÁS FRISSÍTÉSE: a korábbi architektúra a 3 állapot-labelt
  // MINDEN EGYES sliderhez külön renderelte (grid-cols-3 SLIDERENKÉNT,
  // dinamikus font-semibold a kiválasztott állapoton). A kompakt slider UX
  // sprint ezt SZÁNDÉKOSAN egy KÖZÖS, statikus, a blokk tetején egyszer
  // megjelenő skálára cserélte (lásd 15-19. pont) — ez NEM regresszió, a
  // vertikális hely csökkentése volt a cél. A grid-cols-3 layout-shift
  // hardening maga NEM tűnt el, csak áthelyeződött erre a közös skálára.

  test("a 3 állapot-skála (🙅 Nem fontos / 🙂 Fontos / ⭐ Nagyon fontos) forrása (SENSORY_PRIORITY_LEVELS.map + {level.label}) PONTOSAN EGYSZER jelenik meg a szenzoros blokkban, nem sliderenként ismételve", () => {
    // A tényleges "Nem fontos" stb. literál szöveg a SENSORY_PRIORITY_LEVELS
    // modul-szintű tömb deklarációjában él (a komponensen KÍVÜL), a JSX
    // pedig dinamikusan `{level.label}`-t renderel — ezért a JSX-blokkban a
    // `{level.label}` és a SENSORY_PRIORITY_LEVELS.map(...) hívás
    // előfordulásainak számát vizsgáljuk, nem a literál szöveget.
    const labelRefs = weightsBlock.match(/\{level\.label\}/g) ?? [];
    assert.equal(labelRefs.length, 1, "a {level.label} referenciának pontosan egyszer kell megjelennie a blokkban (a közös felső skálán) — nem sliderenként ismételve");
    // A SENSORY_PRIORITY_LEVELS.map(...) hívás a blokkban pontosan EGYSZER
    // fordul elő — ha sliderenként ismétlődne, ez 6-szor szerepelne (6
    // WEIGHT_FIELDS), a közös felső skála esetén viszont csak egyszer.
    const mapCalls = weightsBlock.match(/\{SENSORY_PRIORITY_LEVELS\.map\(\(level\) => \(/g) ?? [];
    assert.equal(mapCalls.length, 1, "a SENSORY_PRIORITY_LEVELS.map(...) hívásnak PONTOSAN EGYSZER kell szerepelnie — nem sliderenként ismételve");
  });

  test("a közös felső skála CSS GRID-ben van, azonos szélességű oszlopokkal (grid-cols-3) — NEM flex justify-between", () => {
    assert.match(weightsBlock, /className="mt-3 grid grid-cols-3 items-center gap-1 rounded border border-sni-primary\/20 bg-white\/70 px-2 py-2 text-center text-xs font-medium text-sni-text"/);
    assert.ok(!/className="[^"]*justify-between[^"]*"/.test(weightsBlock), "a skálának NEM szabad flex justify-between-et használnia");
  });

  test("nincs sliderenként ismételt, külön 3-label sor a WEIGHT_FIELDS.map(...) törzsében — a sliderek kompakt label+range szerkezetűek", () => {
    const weightFieldsBodyMatch = weightsBlock.match(/\{WEIGHT_FIELDS\.map\(\(\{ key, label \}\) => \([\s\S]*?\)\)\}/);
    assert.ok(weightFieldsBodyMatch, "meg kell találni a WEIGHT_FIELDS.map(...) törzsét");
    const weightFieldsBody = weightFieldsBodyMatch![0];
    assert.ok(!/SENSORY_PRIORITY_LEVELS/.test(weightFieldsBody), "a WEIGHT_FIELDS.map(...) törzse NEM hivatkozhat SENSORY_PRIORITY_LEVELS-re — a skála a törzsön KÍVÜL, egyszer jelenik meg");
    assert.match(weightFieldsBody, /<label className="text-xs text-gray-700">\{label\}<\/label>/);
    assert.match(weightFieldsBody, /type="range"/);
  });

  test("a legszűkebb érintett konténeren (kizárólag a szenzoros prioritás blokkon) overflow-anchor:none van beállítva — NEM globálisan/body-n", () => {
    assert.match(weightsBlock, /style=\{\{ overflowAnchor: "none" \}\}/, "a szenzoros blokk konténerének kell hordoznia az overflow-anchor:none inline style-t");
    assert.ok(!/body\s*\{[^}]*overflow-anchor/.test(formSrc), "nem szabad globális body overflow-anchor szabálynak lennie");
    assert.ok(!/overflow-anchor:\s*none/i.test(formSrc.slice(0, weightsBlockOuterStart)), "az overflow-anchor:none szabálynak a szenzoros blokk ELŐTT sehol nem szabad (pl. globálisan) megjelennie");
  });

  test("a közös skála mindhárom eleme MINDIG renderelődik (nincs feltételes DOM be/kirendertálás a SENSORY_PRIORITY_LEVELS.map(...)-ban)", () => {
    assert.match(weightsBlock, /\{SENSORY_PRIORITY_LEVELS\.map\(\(level\) => \(/);
    assert.ok(!/\{weights\[key\] === level\.value && </.test(weightsBlock), "a skála elemeinek MINDIG renderelődniük kell (nem feltételes DOM be/kirendertálás)");
  });
});

describe("C) Slider funkcionális invariánsok — 0/1/2, Sensory Engine, aria-valuetext változatlan", () => {
  test("a range input min=0, max=2, step=1 marad", () => {
    assert.match(weightsBlock, /type="range"\s*\n\s*min=\{0\}\s*\n\s*max=\{2\}\s*\n\s*step=\{1\}/);
  });

  test("aria-valuetext a sensoryPriorityLabel() magyar szövegéből jön, nem a nyers számból", () => {
    assert.match(weightsBlock, /aria-valuetext=\{sensoryPriorityLabel\(weights\[key\]\)\}/);
  });

  test("SENSORY_PRIORITY_LEVELS 0/1/2 értékek és magyar label-ek VÁLTOZATLANOK", () => {
    assert.match(formSrc, /\{ value: 0, emoji: "🙅", label: "Nem fontos" \}/);
    assert.match(formSrc, /\{ value: 1, emoji: "🙂", label: "Fontos" \}/);
    assert.match(formSrc, /\{ value: 2, emoji: "⭐", label: "Nagyon fontos" \}/);
  });

  test("a Sensory Engine hívása (computeSensoryScore) NEM szerepel ebben a fájlban — a form csak a 0/1/2 weights-et állítja, a pontszámítást a szerver végzi, változatlanul", () => {
    assert.ok(!/computeSensoryScore/.test(formSrc), "a kliens oldali form sosem hívhatja/módosíthatja a Sensory Engine számítást");
  });

  test("a strukturált címmezők (Város/Irányítószám/Utca) értékei a slider-blokktól függetlenek — az input value-k az origin/destination state-ből jönnek, nem a weights-ből", () => {
    assert.match(formSrc, /value=\{origin\.type === "MANUAL" \? origin\.city : ""\}/);
    assert.match(formSrc, /value=\{destination\.city\}/);
  });
});

describe("L-Q) Favorite CTA — négy állapot, ikon+szöveg, aria-label, backend változatlan", () => {
  const favoritesBlockStart = formSrc.indexOf('rounded border border-dashed border-gray-300 p-3');
  assert.ok(favoritesBlockStart !== -1, "nem található a Favorite CTA konténer");
  const favoritesBlockEnd = formSrc.indexOf("{disabled && (", favoritesBlockStart);
  const favoritesBlock = formSrc.slice(favoritesBlockStart, favoritesBlockEnd);

  test("L) mentés előtt: '♡ Kedvencekhez adom' jelen van, nagy touch targettel (min-h-[44px]), teljes szélességű mobilon", () => {
    assert.match(favoritesBlock, /<span aria-hidden="true">♡<\/span> Kedvencekhez adom/);
    assert.match(favoritesBlock, /className="flex min-h-\[44px\] w-full items-center justify-center gap-2 rounded-lg border border-sni-primary\/40 bg-white px-4 py-2\.5 text-sm font-semibold text-sni-primary shadow-sm sm:w-auto sm:justify-start"/);
  });

  test("M) mentés folyamatban: '♡ Kedvenc mentése…' szöveg, aria-busy és disabled a mentés gombon", () => {
    assert.match(favoritesBlock, /\{favoriteSaving \? "Kedvenc mentése…" : "Mentés"\}/);
    assert.match(favoritesBlock, /aria-busy=\{favoriteSaving\}/);
    assert.match(favoritesBlock, /disabled=\{favoriteSaving\}\s*\n\s*aria-label=\{favoriteSaving \? "Kedvenc mentése…" : "Kedvenc útvonal mentése"\}/);
  });

  test("N) mentés után: '♥ Kedvenc útvonal' szív ikonnal, szöveggel együtt (a szív önmagában sosem információ)", () => {
    assert.match(favoritesBlock, /favoriteSaveState === "saved" \? \(/);
    assert.match(favoritesBlock, /<span aria-hidden="true">♥<\/span> Kedvenc útvonal/);
  });

  test("O) duplicate állapot: '♥ Már a kedvenceid között', kulturáltan, a MEGLÉVŐ backend duplicate-detekcióra épül (nincs új backend-logika)", () => {
    assert.match(favoritesBlock, /favoriteSaveState === "duplicate" \? \(/);
    assert.match(favoritesBlock, /<span aria-hidden="true">♥<\/span> Már a kedvenceid között/);
    assert.match(formSrc, /\} else if \(data\.duplicate\) \{[\s\S]{0,600}?setFavoriteSaveState\("duplicate"\);/);
  });

  test("P) minden állapotban ikon + szöveg EGYÜTT jelenik meg (soha nem csak a szív/csillag emoji önmagában)", () => {
    for (const iconLine of favoritesBlock.match(/<span aria-hidden="true">[♡♥]<\/span>[^<]*/g) ?? []) {
      assert.ok(iconLine.trim().length > '<span aria-hidden="true">♡</span>'.length, `az ikon után szövegnek is szerepelnie kell: "${iconLine}"`);
    }
  });

  test("Q) aria-label minden interaktív állapotban jelen van (mentés előtti gomb, mentés-gomb, saved/duplicate status)", () => {
    assert.match(favoritesBlock, /aria-label="Kedvenc útvonal mentése"/);
    assert.match(favoritesBlock, /aria-label="Ez az útvonal a kedvenceid között van"/);
    assert.match(favoritesBlock, /aria-label="Ez az útvonal már a kedvenceid között van"/);
  });

  test("R) mobil touch target legalább 44px jellegű minden Favorite CTA gombon/állapoton (min-h-[44px])", () => {
    const minHeightMatches = favoritesBlock.match(/min-h-\[44px\]/g) ?? [];
    assert.ok(minHeightMatches.length >= 3, `legalább 3 helyen (idle CTA, mentés-gomb, saved/duplicate status) kell min-h-[44px]-nek szerepelnie, jelenleg: ${minHeightMatches.length}`);
  });

  test("S) a favorite mentés (handleSaveFavorite) NEM hív scrollIntoView-t vagy window.scrollTo-t, NEM remounteli a kártyát", () => {
    const handlerMatch = formSrc.match(/async function handleSaveFavorite\(\) \{[\s\S]*?\n  \}/);
    assert.ok(handlerMatch, "meg kell találni a handleSaveFavorite függvényt");
    assert.ok(!/scrollIntoView|window\.scrollTo/.test(handlerMatch![0]));
  });

  test("T) a favorite mentés (handleSaveFavorite) NEM kér GPS-t (nincs geo.requestOnce/startWatching hívás a handlerben)", () => {
    const handlerMatch = formSrc.match(/async function handleSaveFavorite\(\) \{[\s\S]*?\n  \}/);
    assert.ok(handlerMatch);
    assert.ok(!/geo\.(requestOnce|startWatching)/.test(handlerMatch![0]));
  });

  test("U) a favorite mentés a MEGLÉVŐ /api/vedett-route/favorites POST endpointot hívja — nincs új backend route/schema", () => {
    assert.match(formSrc, /fetch\("\/api\/vedett-route\/favorites", \{\s*\n\s*method: "POST",/);
  });
});

describe("V-X) 'Pihenőpont hozzáadása' globális copy — a korábbi '+ Pihenőpont' feliratnak sehol nem szabad maradnia (11-12. pont)", () => {
  test("V) nincs user-facing '+ Pihenőpont' a RestPointQuickAdd JSX-ben", () => {
    assert.ok(!/>\s*\+\s*Pihenőpont/.test(restPointQuickAddSrc), "nem maradhat '+ Pihenőpont' feliratú gomb");
  });

  test("W) nincs user-facing '+Pihenőpont' (szóköz nélküli változat) sem", () => {
    assert.ok(!/\+Pihenőpont/.test(restPointQuickAddSrc), "nem maradhat '+Pihenőpont' feliratú gomb");
  });

  test("X) van 'Pihenőpont hozzáadása' felirat, aria-label-lel, nem csak ikon, min. 44px touch targettel", () => {
    // A trigger gomb blokkját (handleOpen-t hívó <button>, a legközelebbi
    // </button>-ig) anchor-alapon nyerjük ki — nem egy törékeny, pontos
    // attribútum-sorrendre/whitespace-re építő teljes-string regexet
    // (a fullscreen pihenőpont sprint, 2026-09-10, min-h-[44px] touch
    // targetet adott a gombhoz, lásd RestPointQuickAdd.tsx).
    const buttonMatch = restPointQuickAddSrc.match(/<button[\s\S]*?onClick=\{handleOpen\}[\s\S]*?<\/button>/);
    assert.ok(buttonMatch, "meg kell találni a 'Pihenőpont hozzáadása' trigger gombot");
    const buttonBlock = buttonMatch![0];
    assert.match(buttonBlock, /aria-label="Pihenőpont hozzáadása"/);
    assert.match(buttonBlock, />\s*Pihenőpont hozzáadása\s*</, "a szövegnek is meg kell jelennie, nem csak az aria-label-ben");
    assert.match(buttonBlock, /min-h-\[44px\]/, "a gombnak legalább 44px touch targettel kell rendelkeznie");
  });

  test("csak a user-facing felirat változott — a komponens neve, props-ai és a mentés-flow (handleSubmit, RestPointCreatedPayload) nem módosult", () => {
    assert.match(restPointQuickAddSrc, /export default function RestPointQuickAdd/);
    assert.match(restPointQuickAddSrc, /function handleOpen/);
    assert.match(restPointQuickAddSrc, /async function handleSubmit/);
  });
});

describe("Y-AB) Easy-language + 'preferencia' kivezetés — user-facing szöveg a szenzoros blokkban (13-14. pont)", () => {
  const weightsBlockStartY = formSrc.indexOf("Ami nekem fontos");
  const weightsBlockEndY = formSrc.indexOf("{formError &&", weightsBlockStartY);
  const sensoryBlockY = formSrc.slice(formSrc.lastIndexOf("<div", weightsBlockStartY), weightsBlockEndY);

  test("Y) nincs user-facing 'preferencia' (vagy toldalékolt alakja) a szenzoros/utazási szempontok blokkban", () => {
    assert.ok(!/preferenci/i.test(sensoryBlockY), "a blokkban sehol nem szerepelhet 'preferencia' szó vagy toldalékolt alakja");
  });

  test("Z) van 'Ami nekem fontos' cím", () => {
    assert.match(sensoryBlockY, /Ami nekem fontos/);
  });

  test("AA) van 'Mi számít neked utazás közben?' alcím", () => {
    assert.match(sensoryBlockY, /Mi számít neked utazás közben\?/);
  });

  test("AB) van a specifikáció szerinti segédszöveg", () => {
    assert.match(sensoryBlockY, /Állítsd be, hogy neked mi fontos\. Így olyan útvonalakat tudunk mutatni, amelyek jobban megfelelnek neked\./);
  });

  test("a BELSŐ kódnevek (preferences/personalization/weights) NEM lettek átnevezve — ez kizárólag user-facing copy-módosítás", () => {
    assert.match(formSrc, /PersonalizationWeights/);
    assert.match(formSrc, /const \[weights, setWeights\] = useState<PersonalizationWeights>/);
  });
});

describe("AC-AE) a 3 állapot-emoji mindegyike PONTOSAN EGYSZER jelenik meg vizuálisan a közös skálán", () => {
  // FONTOS: a tényleges emoji-karakterek (🙅/🙂/⭐) a SENSORY_PRIORITY_LEVELS
  // modul-szintű tömb deklarációjában élnek (a JSX-blokkon KÍVÜL), a
  // render pedig `{level.emoji}`-t referál — ezért a vizuális "pontosan
  // egyszer megjelenik" állítást STRUKTURÁLISAN igazoljuk: (1) a tömb
  // pontosan egy-egy bejegyzést tartalmaz mindhárom emoji-hoz, ÉS (2) a
  // JSX-blokkban a `{level.emoji}` referencia (és maga a
  // SENSORY_PRIORITY_LEVELS.map(...) hívás) pontosan egyszer fordul elő —
  // nyers emoji-karakterek számolása a blokkban FÉLREVEZETŐ lenne, mert
  // egy dokumentációs komment is véletlenül tartalmazhatja ugyanazokat a
  // karaktereket.
  test("AC-AE) a SENSORY_PRIORITY_LEVELS tömb pontosan egy-egy bejegyzést tartalmaz 🙅/🙂/⭐-hoz, és a render (SENSORY_PRIORITY_LEVELS.map + {level.emoji}) pontosan egyszer fordul elő a blokkban", () => {
    assert.match(formSrc, /\{ value: 0, emoji: "🙅", label: "Nem fontos" \}/);
    assert.match(formSrc, /\{ value: 1, emoji: "🙂", label: "Fontos" \}/);
    assert.match(formSrc, /\{ value: 2, emoji: "⭐", label: "Nagyon fontos" \}/);
    const levelsArrayMatch = formSrc.match(/const SENSORY_PRIORITY_LEVELS[\s\S]*?\];/);
    assert.ok(levelsArrayMatch, "meg kell találni a SENSORY_PRIORITY_LEVELS tömb deklarációját");
    assert.equal((levelsArrayMatch![0].match(/🙅/g) ?? []).length, 1, "🙅 pontosan egy bejegyzésben szerepelhet");
    assert.equal((levelsArrayMatch![0].match(/🙂/g) ?? []).length, 1, "🙂 pontosan egy bejegyzésben szerepelhet");
    assert.equal((levelsArrayMatch![0].match(/⭐/g) ?? []).length, 1, "⭐ pontosan egy bejegyzésben szerepelhet");

    const emojiRefs = weightsBlock.match(/\{level\.emoji\}/g) ?? [];
    assert.equal(emojiRefs.length, 1, "a {level.emoji} render-referenciának pontosan egyszer kell megjelennie a blokkban (a közös skálán, nem sliderenként)");
  });
});
