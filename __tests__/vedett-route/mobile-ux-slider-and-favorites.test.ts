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
// APPLIKÁCIÓ-RÉTEG nem tartalmaz explicit remount/scroll/focus/router-
// navigáció triggert a csúszka mozgatásakor, ÉS hogy a bizonyított,
// javított layout-shift forrás (a 3 állapot-label nem egyenlő szélességű
// flex-elrendezése) grid-alapú, stabil geometriára váltott. NEM állítják,
// hogy a fizikai Android telepített PWA-ban észlelt scroll-jump ezzel
// teljesen bizonyítottan megszűnt — ehhez fizikai eszközön validálás
// szükséges (lásd a feladat végső jelentését).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

// A szenzoros prioritás blokk (a sliderek + label-ek konténere) kinyerése
// — stabil horgony-szövegekre épül, nem egy törékeny, teljes-blokk regexre.
const weightsBlockStart = formSrc.indexOf("Mennyire fontosak neked ezek a szempontok?");
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

describe("B) Slider layout stabilitás — root-cause javítás (grid, nem flex-justify-between)", () => {
  test("a 3 szenzoros állapot-label CSS GRID-ben van, azonos szélességű oszlopokkal (grid-cols-3) — NEM flex justify-between (ami a bold-szélesség-változás miatt korábban valós geometria-shiftet okozott)", () => {
    assert.match(weightsBlock, /className="mt-1 grid grid-cols-3 items-center gap-1 text-\[11px\]"/);
    // Csak a TÉNYLEGES className attribútumokat vizsgáljuk (nem a magyarázó
    // kommentet, amely dokumentációs célból megemlíti a korábbi, javított
    // `flex justify-between` elrendezést) — ez zárja ki a hamis pozitív
    // találatot, miközben továbbra is bizonyítja, hogy SEMMILYEN className
    // nem hordoz justify-between-et a label-soron.
    assert.ok(!/className="[^"]*justify-between[^"]*"/.test(weightsBlock), "a label-sornak NEM szabad flex justify-between-et használnia — ez volt a bizonyított layout-shift forrása");
  });

  test("a kijelölt állapot vizuálisan hangsúlyosabb marad (font-semibold), de a saját grid-cellájában, ami NEM tolja el a szomszédos cellák pozícióját", () => {
    assert.match(weightsBlock, /font-semibold text-sni-primary/);
  });

  test("a legszűkebb érintett konténeren (kizárólag a szenzoros prioritás blokkon) overflow-anchor:none van beállítva — NEM globálisan/body-n", () => {
    assert.match(weightsBlock, /style=\{\{ overflowAnchor: "none" \}\}/, "a szenzoros blokk konténerének kell hordoznia az overflow-anchor:none inline style-t");
    assert.ok(!/body\s*\{[^}]*overflow-anchor/.test(formSrc), "nem szabad globális body overflow-anchor szabálynak lennie");
    assert.ok(!/overflow-anchor:\s*none/i.test(formSrc.slice(0, weightsBlockOuterStart)), "az overflow-anchor:none szabálynak a szenzoros blokk ELŐTT sehol nem szabad (pl. globálisan) megjelennie");
  });

  test("nincs DOM elem hozzáadás/elvétel a 3 label-állapot között (mindig mind a 3 SENSORY_PRIORITY_LEVELS elem renderelődik, csak a className vált)", () => {
    assert.match(weightsBlock, /\{SENSORY_PRIORITY_LEVELS\.map\(\(level\) => \(/);
    assert.ok(!/\{weights\[key\] === level\.value && </.test(weightsBlock), "a label-eknek MINDIG renderelődniük kell (nem feltételes DOM be/kirendertálás)");
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
