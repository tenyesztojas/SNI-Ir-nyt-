// VÉDETT ÚTVONAL — GLOBÁLIS BKK SERVICE-ALERT BLOKK ELTÁVOLÍTÁSA
// (2026-09-18, UX hibajegy: "Aktuális BKK riasztások" cím alatt a teljes,
// útvonalhoz nem kötött BKK Alerts.pb lista válogatás nélkül, néhol nyers
// HTML markuppal jelent meg a találati oldalon).
//
// SZŰK, cél szerinti regresszió (nem a teljes komponens véletlenszerű
// user-facing tartalmát vizsgálja — lásd beta-removal-regression.test.ts
// figyelmeztetését a túl széles tesztek ellen): KIZÁRÓLAG azt bizonyítja,
// hogy
//   1) a "Aktuális BKK riasztások" cím-szöveg NEM szerepel többé a
//      keresőform user-facing forrásában (kommentektől megtisztítva — a
//      backend-etjelentő, technikai kommentek MEGENGEDETTEK, azok nem
//      jelennek meg felhasználónak),
//   2) a komponens NEM renderel semmilyen `result.serviceAlerts`-alapú
//      listát (a mező NEVE technikai kommentben megengedett, de tényleges
//      `.map`/JSX-felhasználás formájában NEM szerepelhet a megtisztított
//      forrásban).
//
// A backend (`OrchestratedSearchResult.serviceAlerts`, orchestrator.ts BKK
// Alerts.pb lekérés) EBBEN A KÖRBEN SZÁNDÉKOSAN VÁLTOZATLAN — ezt a tesztet
// a projekt konvenciója szerint (lásd beta-removal-regression.test.ts)
// forrás-szintű, jsdom/@testing-library NÉLKÜLI ellenőrzésként írjuk,
// mert ez a komponens ebben a projektben sosem render-alapú tesztelt.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SEARCH_FORM_PATH = "components/vedett-utvonal/VedettUtvonalSearchForm.tsx";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
}

describe("Globális BKK service-alert blokk eltávolítva a Védett Útvonal keresőform user-facing renderéléséből", () => {
  const src = readFileSync(join(ROOT, SEARCH_FORM_PATH), "utf-8");
  const cleaned = stripComments(src);

  test("a 'Aktuális BKK riasztások' cím-szöveg NEM szerepel a megtisztított forrásban", () => {
    assert.doesNotMatch(cleaned, /Aktuális BKK riasztások/, `${SEARCH_FORM_PATH} még tartalmazza a globális riasztás-cím user-facing szövegét`);
  });

  test("a komponens NEM iterál/renderel result.serviceAlerts-en a megtisztított forrásban (nincs .serviceAlerts.map vagy .serviceAlerts.length JSX-ág)", () => {
    assert.doesNotMatch(cleaned, /serviceAlerts/, `${SEARCH_FORM_PATH} még hivatkozik serviceAlerts-re a user-facing (nem-komment) forrásban`);
  });

  test("a nyers forrás (kommentekkel együtt) ÖNTESZT — a stripComments() ténylegesen levágja a fejlécbe írt magyarázó kommentet, tehát a fenti két assert valódi user-facing hiányt bizonyít, nem csak a komment eltávolítását", () => {
    assert.match(src, /serviceAlerts/, "a nyers forrásnak MÉG tartalmaznia kell a szót egy magyarázó kommentben, különben az önteszt nem bizonyít semmit");
    assert.doesNotMatch(cleaned, /serviceAlerts/);
  });

  test("a keresőform user-facing JSX-e VÁLTOZATLANUL renderel journey-kártyákat (result.journeys.map) — a módosítás NEM távolította el a normál eredménylistát", () => {
    assert.match(cleaned, /result\.journeys\.map/, "a normál journey-lista renderelésének megmaradnia kell — ez NEM a service-alert blokk része");
  });
});
