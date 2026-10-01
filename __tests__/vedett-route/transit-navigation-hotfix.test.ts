// VÉDETT ÚTVONAL – TRANSIT NAVIGATION HOTFIX (2026-09-21).
//
// Célzott, forráskód-szintű teszt (node --test, nincs jsdom/render, a
// projekt konvenciója szerint) a hotfix két, MEGERŐSÍTETT root-cause-ú
// javítására:
//   3) headsign (jármű célállomás-kijelzője) végigvezetése a MOTIS
//      normalizáción (orchestrator.ts) -> JourneyLeg (types.ts) ->
//      navigation instructions (routeLabel()) útvonalon, generikusan
//      minden transit módra (BUS/TRAM/SUBWAY/RAIL/REGIONAL_RAIL).
//   4) az OFF_ROUTE UI banner (VedettUtvonalSearchForm.tsx) UGYANAZT a
//      safety döntést hozza, mint a reroute guard: a BOARDED/BOARDED_
//      UNCERTAIN_GEOMETRY sínhez kötött, gyenge geometriájú legnél a
//      figyelmeztetés szövege sem jelenhet meg (nem csak az automatikus
//      reroute van letiltva).
//
// A megállószám (1. pont) és a Kelenföld-generikus-alighting (6. pont)
// vizsgálata a MEGLÉVŐ, tesztelt kontraktussal (resolveRemainingStops,
// legTransition.ts) konzisztensnek bizonyult — nem talált külön,
// biztonságosan javítható index-hiba, ezért ebben a körben NEM
// módosult kód hozzájuk (lásd a sprint válasz ROOT CAUSES szakaszát).
// A korábbi járat (2. pont) a spec szerint SEPARATE SPRINT.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNavigationInstructions } from "../../lib/vedett-route/navigation/instructions.ts";
import type { JourneyLeg } from "../../lib/vedett-route/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const orchestratorSrc = read("lib/vedett-route/orchestrator.ts");
const typesSrc = read("lib/vedett-route/types.ts");
const searchFormSrc = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");

function transitLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "REGIONAL_RAIL",
    routeShortName: "S40",
    fromName: "Budapest-Déli pu.",
    toName: "Dombóvár",
    durationMinutes: 60,
    realtime: false,
    ...overrides,
  };
}

describe("3) headsign — upstream MOTIS mező végigvezetve a normalizáción", () => {
  test("orchestrator.ts mapLeg() a raw MOTIS leg.headsign mezőt VÁLTOZATLANUL továbbadja", () => {
    assert.match(orchestratorSrc, /headsign: leg\.headsign,/);
  });

  test("JourneyLeg típus tartalmazza az opcionális headsign mezőt", () => {
    assert.match(typesSrc, /headsign\?: string;/);
  });

  test("headsign jelenlétekor a BOARD/RIDE cím 'route [jármű] – headsign felé' formátumot kap", () => {
    // JÁRATSZÁM + JÁRMŰTÍPUS HOTFIX (2026-10-01) — a transitLeg() fixture
    // transitMode-ja REGIONAL_RAIL, ezért a label mostantól a route-szám
    // mellé a "vonat" jármű-szót is tartalmazza (lásd instructions.ts
    // transitVehicleNoun()) — ez a label-bővítés, NEM a headsign-formátum,
    // ami változatlan.
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ headsign: "Dombóvár" })],
    });
    const board = instructions.find((i) => i.kind === "BOARD");
    const ride = instructions.find((i) => i.kind === "RIDE");
    assert.equal(board?.title, "Szállj fel: S40 vonat – Dombóvár felé");
    assert.equal(ride?.title, "Utazz a S40 vonat – Dombóvár felé járattal");
  });

  test("headsign hiányában biztonságos fallback — csak a route name/number + jármű-szó, nincs kitalálva", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: undefined })] });
    const board = instructions.find((i) => i.kind === "BOARD");
    assert.equal(board?.title, "Szállj fel: S40 vonat");
  });

  test("generikus minden transit módra — BUS/TRAM/SUBWAY/RAIL/REGIONAL_RAIL egyaránt kapja a headsignt, nincs mód-specifikus ág", () => {
    // A jármű-szó (lásd instructions.ts transitVehicleNoun()) módonként
    // eltérő, DE a headsign-formátum ("route [jármű] – headsign felé")
    // ugyanúgy generikus mind az öt módra — nincs mód-specifikus elágazás
    // a headsign-összekötésben, csak a jármű-szó választása mód-függő.
    const expectedVehicleNoun: Record<string, string> = {
      BUS: "busz",
      TRAM: "villamos",
      SUBWAY: "metró",
      RAIL: "vonat",
      REGIONAL_RAIL: "vonat",
    };
    for (const transitMode of ["BUS", "TRAM", "SUBWAY", "RAIL", "REGIONAL_RAIL"]) {
      const instructions = buildNavigationInstructions({
        legs: [transitLeg({ transitMode, routeShortName: "X1", headsign: "Célpont" })],
      });
      const board = instructions.find((i) => i.kind === "BOARD");
      assert.equal(board?.title, `Szállj fel: X1 ${expectedVehicleNoun[transitMode]} – Célpont felé`, `transitMode=${transitMode}`);
    }
  });
});

describe("JÁRATSZÁM + JÁRMŰTÍPUS production hiba (2026-10-01) — pontos riport-esetek", () => {
  test("1) '7' + BUS + Albertfalva vasútállomás -> vizuálisan buszként azonosítható", () => {
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ transitMode: "BUS", routeShortName: "7", headsign: "Albertfalva vasútállomás" })],
    });
    const board = instructions.find((i) => i.kind === "BOARD");
    assert.equal(board?.title, "Szállj fel: 7 busz – Albertfalva vasútállomás felé");
    assert.match(board!.title, /\bbusz\b/);
  });

  test("2) '56A' + TRAM + Móricz Zsigmond körtér M -> vizuálisan villamosként azonosítható, a canonical 'M' megállónév-rész VÁLTOZATLAN", () => {
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ transitMode: "TRAM", routeShortName: "56A", headsign: "Móricz Zsigmond körtér M" })],
    });
    const board = instructions.find((i) => i.kind === "BOARD");
    assert.equal(board?.title, "Szállj fel: 56A villamos – Móricz Zsigmond körtér M felé");
    assert.match(board!.title, /\bvillamos\b/);
  });

  test("a jármű-szó KIZÁRÓLAG a transitMode-ból jön, SOHA a routeShortName alakjából (betűs járatszám BUS módon is 'busz' marad)", () => {
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ transitMode: "BUS", routeShortName: "56A", headsign: "Célpont" })],
    });
    const board = instructions.find((i) => i.kind === "BOARD");
    assert.equal(board?.title, "Szállj fel: 56A busz – Célpont felé");
  });
});

describe("4) OFF_ROUTE UI — ugyanaz a safety döntés, mint a reroute guard", () => {
  test("a banner feltétele explicit ellenőrzi az activeLegTransitGeometryUncertain jelzőt (nem csak a reroute guard)", () => {
    assert.match(
      searchFormSrc,
      /\{navigationMode && routeProgress\.offRouteStatus === "OFF_ROUTE" && !transitGpsLossConfirmationVisible && !activeLegTransitGeometryUncertain && \(/,
    );
  });

  test("a reroute guard bemenete (shouldStartAutomaticReroute) is ugyanabból az activeLegTransitGeometryUncertain jelzőből származik — a két döntés egy forrásból ered", () => {
    // BOARDING-WINDOW TRANSIT GEOMETRY SAFETY FIX (2026-09-24) — a reroute
    // guard hívása azóta a bővített transitGeometryUncertainForReroute
    // jelzőt kapja (activeLegTransitGeometryUncertain OR
    // pendingBoardingNextTransitGeometryUncertain), nem a puszta
    // activeLegTransitGeometryUncertain-t. A safety invariáns (a guard NEM
    // veszíthet a korábbi védelemből) így igazolható: a bekötés
    // transitGeometryUncertainForReroute-ra mutat, ÉS annak definíciója
    // OR-ral tartalmazza az activeLegTransitGeometryUncertain ágat is —
    // tehát az OFF_ROUTE banner (fent) és a reroute guard még mindig ugyanazt
    // az aktív-leg jelzőt hordozza, csak a guard emellett a boarding-ablakos
    // esetet is lefedi.
    assert.match(searchFormSrc, /transitGeometryUncertain: transitGeometryUncertainForReroute,/);
    assert.match(
      searchFormSrc,
      /const transitGeometryUncertainForReroute =\s*\n\s*activeLegTransitGeometryUncertain \|\| pendingBoardingNextTransitGeometryUncertain;/,
    );
  });
});

// HEADSIGN DEBUG KÖR (2026-09-22) — a felhasználó jelezte, hogy a
// productionben MÉG MINDIG csak "S40" látszik a 3. pont javítása után.
// Root cause: a fenti 3. pont javítása KIZÁRÓLAG a navigation/
// instructions.ts routeLabel()-t érintette (élő navigáció instrukció-
// kártyák), de a járat-eredménylista/kártya leg-összegző "badge" JSX-e
// (VedettUtvonalSearchForm.tsx) egy TŐLE FÜGGETLEN render-út, amely
// közvetlenül routeShortName/routeLongName-ből építette a feliratot,
// sosem kapta meg a headsignt. Ez volt a valódi, productionben látható
// bug. Az alábbi teszt kifejezetten EZT a badge render-utat fedi le.
describe("3b) headsign — a leg-összegző badge (eredménylista/kártya) is megkapja, nem csak a navigation instrukció", () => {
  test("a badge JSX headsign jelenlétekor 'route – headsign felé' formátumot renderel, generikusan minden transit módra", () => {
    assert.match(
      searchFormSrc,
      /\$\{transitModeLabel\(leg\.transitMode\)\} \$\{\s*leg\.routeShortName \?\? leg\.routeLongName \?\? "Járat"\s*\}\$\{leg\.headsign\?\.trim\(\) \? ` – \$\{leg\.headsign\.trim\(\)\} felé` : ""\}/,
    );
  });

  test("headsign hiányában a badge biztonságos fallback marad — csak route name/number, nincs kitalálva", () => {
    // Az üres/undefined headsign ágán a sablon literál nem told be semmit
    // ("" : felteve, hogy leg.headsign?.trim() falsy) — ugyanaz a mintázat,
    // mint a routeLabel() fallback ága.
    assert.match(searchFormSrc, /leg\.headsign\?\.trim\(\) \? ` – \$\{leg\.headsign\.trim\(\)\} felé` : ""/);
  });
});
