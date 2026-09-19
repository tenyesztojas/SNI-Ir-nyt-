// VÉDETT ÚTVONAL — GLOBÁLIS BKK SERVICE-ALERT BLOKK ELTÁVOLÍTÁSA
// (2026-09-18, UX hibajegy: "Aktuális BKK riasztások" cím alatt a teljes,
// útvonalhoz nem kötött BKK Alerts.pb lista válogatás nélkül, néhol nyers
// HTML markuppal jelent meg a találati oldalon).
//
// SPRINT 8.5 MÓDOSÍTÁS (2026-09-19) — a 2026-09-18-as fejléc EXPLICIT
// "jövőbeli irány"-ként jelölte meg: "csak a kiválasztott útvonal konkrét
// járatához/szakaszához bizonyíthatóan kapcsolódó riasztás jelenhet meg;
// bizonytalan relevancia esetén nem jelenítünk meg figyelmeztetést." Ez
// MOST implementálva lett (lásd disruptionRelevance.ts + liveAlternative.ts
// buildDisruptionTriggers() bekötése RankedJourneyCardba) — a `serviceAlerts`
// szó emiatt MÁR NEM tiltott a user-facing forrásban. A regresszió, amit ez
// a teszt VÉD, NEM a "serviceAlerts szó léte", hanem a KONKRÉT hiba: egy
// VÁLOGATÁS NÉLKÜLI, teljes alert-lista megjelenítése nyers szöveggel/
// HTML-lel. Ezért a teszt mostantól azt bizonyítja, hogy
//   1) a "Aktuális BKK riasztások" cím-szöveg NEM szerepel többé a
//      keresőform user-facing forrásában,
//   2) a komponens SEHOL nem renderel `alert.header`/`alert.description`
//      (vagy ezekkel ekvivalens nyers alert-szöveget) JSX-ben,
//   3) a `serviceAlerts` egyetlen user-facing felhasználása a PROVEN_RELEVANT-
//      gated Live Alternative trigger (buildDisruptionTriggers hívás), NEM
//      egy `.map`-pel felsorolt, válogatás nélküli lista.
//
// A backend (`OrchestratedSearchResult.serviceAlerts`, orchestrator.ts BKK
// Alerts.pb lekérés) VÁLTOZATLAN — ezt a tesztet a projekt konvenciója
// szerint (lásd beta-removal-regression.test.ts) forrás-szintű, jsdom/
// @testing-library NÉLKÜLI ellenőrzésként írjuk, mert ez a komponens ebben
// a projektben sosem render-alapú tesztelt.

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

  test("a komponens SEHOL nem renderel nyers alert.header/alert.description szöveget (a válogatás nélküli lista NEM éledt újra)", () => {
    assert.doesNotMatch(cleaned, /\balert\.header\b/, `${SEARCH_FORM_PATH} nyers alert.header-t renderel — ez a globális blokk visszatérése lenne`);
    assert.doesNotMatch(cleaned, /\balert\.description\b/, `${SEARCH_FORM_PATH} nyers alert.description-t renderel — ez a globális blokk visszatérése lenne`);
    assert.doesNotMatch(cleaned, /serviceAlerts\.map/, `${SEARCH_FORM_PATH} válogatás nélkül iterál a teljes serviceAlerts listán`);
  });

  test("SPRINT 8.5 — a `serviceAlerts` EGYETLEN user-facing felhasználása a PROVEN_RELEVANT-gated Live Alternative trigger, nem egy megjelenített lista", () => {
    assert.match(
      cleaned,
      /buildDisruptionTriggers\(serviceAlerts, legs, activeLegIndex \?\? null, Date\.now\(\)\)/,
      "a serviceAlerts-nek a MEGLÉVŐ 8.3 relevancia-motoron (buildDisruptionTriggers) kell átfolynia, nem közvetlen renderelésen"
    );
  });

  test("a keresőform user-facing JSX-e VÁLTOZATLANUL renderel journey-kártyákat (result.journeys.map) — a módosítás NEM távolította el a normál eredménylistát", () => {
    assert.match(cleaned, /result\.journeys\.map/, "a normál journey-lista renderelésének megmaradnia kell — ez NEM a service-alert blokk része");
  });
});
