// L. pont: "az aktív útvonal a pihenőpont mentése után sem tűnhet el, és
// nincs automatikus újratervezés". Ez STATIKUS, forráskód-szintű
// regressziós ellenőrzés (nincs DOM/render-környezet ehhez a projekthez
// ebben a tesztkörnyezetben) — azt garantálja, hogy a RestPointQuickAdd
// onCreated callback-je a VedettUtvonalSearchForm-ban (Part B óta a
// RankedJourneyCard-on belül) KIZÁRÓLAG a sessionRestPoints state-et
// bővíti, és SOSEM hívja az openIndex/displayedJourney state-et
// megváltoztató, térképet bezáró vagy útvonalat cserélő függvényeket.
//
// Part B (2026-09-08) frissítés: a régi globális "activeJourney" /
// "setActiveJourney" mintát az inline, kártyánkénti térkép-blokk váltotta
// fel (lásd VedettUtvonalSearchForm.tsx openIndex/onToggleMap, valamint
// RankedJourneyCard displayedJourney/isOpen). Ez a teszt ennek megfelelően
// lett frissítve — a régi minta ("setActiveJourney(null)") már nem
// létezik a kódban, ezért az elavult forráskód-egyezés helyett az ÚJ
// state-modell invariánsait ellenőrzi.
//
//   node --test __tests__/vedett-route/rest-point-route-stability.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSearchForm(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx"),
    "utf-8"
  );
}

function readQuickAdd(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components", "vedett-utvonal", "RestPointQuickAdd.tsx"),
    "utf-8"
  );
}

test("RestPointQuickAdd onCreated prop-ja opcionális callback, nincs beépített route/journey/openIndex state-je", () => {
  const src = readQuickAdd();
  assert.doesNotMatch(src, /setActiveJourney/);
  assert.doesNotMatch(src, /activeJourney/);
  assert.doesNotMatch(src, /setOpenIndex/);
  assert.doesNotMatch(src, /setDisplayedJourney/);
});

test("a VedettUtvonalSearchForm-ban (RankedJourneyCard-on belül) a <RestPointQuickAdd onCreated=...> hívás KIZÁRÓLAG sessionRestPoints-ot bővít", () => {
  const src = readSearchForm();
  const match = src.match(/<RestPointQuickAdd\s+onCreated=\{([^}]*)\}\s*\/>/s);
  assert.ok(match, "nem található <RestPointQuickAdd onCreated={...} /> JSX hívás");
  const handlerBody = match![1];
  assert.match(handlerBody, /setSessionRestPoints/);
  assert.doesNotMatch(handlerBody, /setActiveJourney/);
  // Part B: a pihenőpont mentése sosem zárhatja be a térképet (openIndex)
  // és sosem cserélheti le a megjelenített útvonalat (displayedJourney) —
  // ez KIZÁRÓLAG az explicit "Térkép megnyitása/bezárása" gombhoz (onToggleMap)
  // ill. a Sprint E "Pihenőre van szükségem" resume-folyamathoz
  // (onRouteResumed) van kötve, sosem a gyors pihenőpont-mentéshez.
  assert.doesNotMatch(handlerBody, /setOpenIndex/);
  assert.doesNotMatch(handlerBody, /setDisplayedJourney/);
});

test("a térkép nyitása/zárása (openIndex) EGYETLEN helyen, az explicit 'Térkép megnyitása/bezárása' váltógombhoz (onToggleMap) van kötve", () => {
  const src = readSearchForm();
  // A RankedJourneyCard-nak van egy onToggleMap prop-ja, amit a toggle gomb
  // onClick-je hív — ez az EGYETLEN felhasználói interakció, ami az
  // openIndex-et (kártya nyitva/zárva állapotát) módosíthatja.
  assert.match(src, /onClick=\{onToggleMap\}/, "a térkép-váltógomb nem onToggleMap-et hívja");
  // A szülőben pontosan egy helyen (a kártyák map()-jában) van
  // setOpenIndex hívás az onToggleMap átadásakor, plusz egy a
  // handleSubmit-ban (új keresésnél mindig bezáródik minden kártya).
  const setOpenIndexCalls = (src.match(/setOpenIndex\(/g) || []).length;
  assert.ok(
    setOpenIndexCalls >= 2,
    `várt legalább 2 setOpenIndex hívás (submit-reset + toggle), talált: ${setOpenIndexCalls}`
  );
});

test("nincs automatikus újratervezést jelző hívás (fetchMotisPlan / reroute) a pihenőpont mentés útvonalán", () => {
  const src = readQuickAdd();
  assert.doesNotMatch(src, /fetchMotisPlan/);
  assert.doesNotMatch(src, /reroute/i);
});

test("a globális 'Aktív útvonal a térképen' blokk-minta véglegesen eltávolítva (Part B)", () => {
  const src = readSearchForm();
  // A blokk fejléce (JSX szövegként) többé nem jelenhet meg — csak a
  // magyarázó kommentekben utalhatunk rá történeti kontextusként, ezért
  // itt kifejezetten a JSX szövegkörnyezetet nézzük (>Aktív útvonal...<).
  assert.doesNotMatch(src, />\s*Aktív útvonal a térképen\s*</);
  // A régi state-setter és a régi prop név ténylegesen sehol nem
  // fordulhat elő kódként (a kommentek csak leíró jelleggel, idézőjel
  // nélkül, más szóalakban utalnak a régi mintára).
  assert.doesNotMatch(src, /setActiveJourney/);
  assert.doesNotMatch(src, /\bonOpenMap\b/);
});
