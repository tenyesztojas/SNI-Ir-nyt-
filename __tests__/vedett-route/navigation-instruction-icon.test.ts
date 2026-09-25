// NAVIGATION — INSTRUCTION ICON MODEL teszt (2026-09-25).
//
// Célzott teszt a lib/vedett-route/navigation/instructionIcon.ts pure
// modulra. CSAK azokat a kategóriákat teszteli, amiket a MEGLÉVŐ adatmodell
// ténylegesen, megbízhatóan megkülönböztet (lásd a modul fejléce) — nincs
// U-turn/trolibusz/HÉV teszt, mert ezekhez NINCS megbízható, létező mező.
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-instruction-icon.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveInstructionIcon,
  resolveTransitIconType,
  resolveWalkIconType,
} from "../../lib/vedett-route/navigation/instructionIcon.ts";

describe("resolveInstructionIcon — WALK", () => {
  test("TURN_RIGHT manoeuvre -> walk-right", () => {
    assert.equal(resolveInstructionIcon({ kind: "WALK", walkManoeuvreKind: "TURN_RIGHT" }), "walk-right");
  });

  test("TURN_LEFT manoeuvre -> walk-left", () => {
    assert.equal(resolveInstructionIcon({ kind: "WALK", walkManoeuvreKind: "TURN_LEFT" }), "walk-left");
  });

  test("CONTINUE/no-turn manoeuvre -> walk-straight", () => {
    assert.equal(resolveInstructionIcon({ kind: "WALK", walkManoeuvreKind: "CONTINUE" }), "walk-straight");
  });

  test("ARRIVE manoeuvre (leg-local, no more turns) -> walk-straight", () => {
    assert.equal(resolveInstructionIcon({ kind: "WALK", walkManoeuvreKind: "ARRIVE" }), "walk-straight");
  });

  test("missing manoeuvre data -> safe walk-generic fallback (no U-turn support)", () => {
    assert.equal(resolveInstructionIcon({ kind: "WALK", walkManoeuvreKind: null }), "walk-generic");
    assert.equal(resolveWalkIconType(undefined), "walk-generic");
  });
});

describe("resolveInstructionIcon — TRANSIT (RIDE)", () => {
  test("BUS -> transit-bus", () => {
    assert.equal(resolveInstructionIcon({ kind: "RIDE", transitMode: "BUS" }), "transit-bus");
  });

  test("TRAM -> transit-tram", () => {
    assert.equal(resolveInstructionIcon({ kind: "RIDE", transitMode: "TRAM" }), "transit-tram");
  });

  test("SUBWAY -> transit-subway", () => {
    assert.equal(resolveInstructionIcon({ kind: "RIDE", transitMode: "SUBWAY" }), "transit-subway");
  });

  test("RAIL -> transit-rail", () => {
    assert.equal(resolveInstructionIcon({ kind: "RIDE", transitMode: "RAIL" }), "transit-rail");
  });

  test("REGIONAL_RAIL (spec-requested alias, not currently emitted by MOTIS) -> transit-rail", () => {
    assert.equal(resolveTransitIconType("REGIONAL_RAIL"), "transit-rail");
  });

  test("unsupported/ambiguous modes (COACH/FERRY/AIRPLANE/trolley/unknown/missing) -> safe transit-generic fallback", () => {
    assert.equal(resolveTransitIconType("COACH"), "transit-generic");
    assert.equal(resolveTransitIconType("FERRY"), "transit-generic");
    assert.equal(resolveTransitIconType("TROLLEYBUS"), "transit-generic");
    assert.equal(resolveTransitIconType(null), "transit-generic");
    assert.equal(resolveTransitIconType(undefined), "transit-generic");
  });
});

describe("resolveInstructionIcon — ACTION", () => {
  test("BOARD -> action-boarding", () => {
    assert.equal(resolveInstructionIcon({ kind: "BOARD" }), "action-boarding");
  });

  test("ALIGHT -> action-alighting", () => {
    assert.equal(resolveInstructionIcon({ kind: "ALIGHT" }), "action-alighting");
  });

  test("TRANSFER -> action-transfer", () => {
    assert.equal(resolveInstructionIcon({ kind: "TRANSFER" }), "action-transfer");
  });

  test("ARRIVE (journey end) -> action-arrival", () => {
    assert.equal(resolveInstructionIcon({ kind: "ARRIVE" }), "action-arrival");
  });
});

describe("resolveInstructionIcon — BIKE / START / fallback", () => {
  test("BIKE_PICKUP/BIKE_RIDE/BIKE_DROPOFF -> bike (already-distinct instruction kind)", () => {
    assert.equal(resolveInstructionIcon({ kind: "BIKE_PICKUP" }), "bike");
    assert.equal(resolveInstructionIcon({ kind: "BIKE_RIDE" }), "bike");
    assert.equal(resolveInstructionIcon({ kind: "BIKE_DROPOFF" }), "bike");
  });

  test("START -> neutral generic fallback", () => {
    assert.equal(resolveInstructionIcon({ kind: "START" }), "generic");
  });
});

describe("resolveInstructionIcon — never touches instruction text", () => {
  test("the icon resolver's input type carries no title/detail field to mutate", () => {
    // A canonical NavigationInstruction title/detail mezőit a hívó
    // (VedettUtvonalSearchForm.tsx) VÁLTOZATLANUL adja tovább a kártyának —
    // ez a modul KIZÁRÓLAG kind/transitMode/manoeuvre-kind mezőket olvas,
    // sosem ad vissza vagy módosít semmilyen megjelenítendő szöveget.
    const icon = resolveInstructionIcon({ kind: "RIDE", transitMode: "BUS" });
    assert.equal(typeof icon, "string");
    assert.equal((icon as unknown as { title?: string }).title, undefined);
  });
});
