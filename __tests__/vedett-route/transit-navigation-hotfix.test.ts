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

  test("headsign jelenlétekor a BOARD/RIDE cím 'route – headsign felé' formátumot kap", () => {
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ headsign: "Dombóvár" })],
    });
    const board = instructions.find((i) => i.kind === "BOARD");
    const ride = instructions.find((i) => i.kind === "RIDE");
    assert.equal(board?.title, "Szállj fel: S40 – Dombóvár felé");
    assert.equal(ride?.title, "Utazz a S40 – Dombóvár felé járattal");
  });

  test("headsign hiányában biztonságos fallback — csak a route name/number, nincs kitalálva", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: undefined })] });
    const board = instructions.find((i) => i.kind === "BOARD");
    assert.equal(board?.title, "Szállj fel: S40");
  });

  test("generikus minden transit módra — BUS/TRAM/SUBWAY/RAIL/REGIONAL_RAIL egyaránt kapja a headsignt, nincs mód-specifikus ág", () => {
    for (const transitMode of ["BUS", "TRAM", "SUBWAY", "RAIL", "REGIONAL_RAIL"]) {
      const instructions = buildNavigationInstructions({
        legs: [transitLeg({ transitMode, routeShortName: "X1", headsign: "Célpont" })],
      });
      const board = instructions.find((i) => i.kind === "BOARD");
      assert.equal(board?.title, "Szállj fel: X1 – Célpont felé", `transitMode=${transitMode}`);
    }
  });
});

describe("4) OFF_ROUTE UI — ugyanaz a safety döntés, mint a reroute guard", () => {
  test("a banner feltétele explicit ellenőrzi az activeLegTransitGeometryUncertain jelzőt (nem csak a reroute guard)", () => {
    assert.match(
      searchFormSrc,
      /\{navigationMode && routeProgress\.offRouteStatus === "OFF_ROUTE" && !transitGpsLossConfirmationVisible && !activeLegTransitGeometryUncertain && \(/,
    );
  });

  test("a reroute guard bemenete (shouldStartAutomaticReroute) is ugyanazt a jelzőt olvassa — a két döntés egy forrásból származik", () => {
    assert.match(searchFormSrc, /transitGeometryUncertain: activeLegTransitGeometryUncertain,/);
  });
});
