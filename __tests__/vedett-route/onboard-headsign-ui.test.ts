// VÉDETT ÚTVONAL — Onboard RIDE headsign/irány UI (célzott javítás).
//
// selectActiveInstructionWithStopProgress() korábban a RIDE title-t
// TELJESEN lecserélte "Utazz még N megállót"-ra onboard állapotban, a
// route label/headsign (routeLabel(), lásd instructions.ts) eltűnt. Ez a
// teszt azt bizonyítja, hogy onboard RIDE állapotban EGYSZERRE látszódik a
// route label + a MEGLÉVŐ JourneyLeg.headsign (nincs kitalált/geokódolt
// adat) + a hátralévő megállók száma, ÉS hogy a BOARD fázis, valamint a
// remainingStops NÉLKÜLI eset nem regresszált.
//
//   node --test --experimental-strip-types __tests__/vedett-route/onboard-headsign-ui.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildNavigationInstructions, selectActiveInstructionWithStopProgress } from "../../lib/vedett-route/navigation/instructions.ts";
import type { JourneyLeg } from "../../lib/vedett-route/types.ts";

function transitLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "REGIONAL_RAIL",
    routeShortName: "S40",
    fromName: "Budapest-Déli pu.",
    toName: "Székesfehérvár",
    durationMinutes: 60,
    realtime: false,
    ...overrides,
  };
}

describe("onboard RIDE title — route label + headsign + hátralévő megállók", () => {
  test("1) route label + headsign + remainingStops -> mindkettő látszik a title-ban", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: "Székesfehérvár" })] });
    const result = selectActiveInstructionWithStopProgress(instructions, {
      legIndex: 0, onboard: true,
      remainingStops: { remainingStopCount: 2, atFinalStop: false },
      nextStopName: "Martonvásár",
    });
    assert.equal(result.current?.kind, "RIDE");
    assert.equal(result.current?.title, "S40 · Székesfehérvár felé · Utazz még 2 megállót");
    // A detail (következő megálló) NEM veszik el a route-info bevezetésével.
    assert.equal(result.current?.detail, "Következő megálló: Martonvásár");
  });

  test("2) route label + nincs headsign + remainingStops -> csak a route label szerepel előtagként, nincs 'undefined'/üres separator", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: undefined })] });
    const result = selectActiveInstructionWithStopProgress(instructions, {
      legIndex: 0, onboard: true,
      remainingStops: { remainingStopCount: 2, atFinalStop: false },
    });
    assert.equal(result.current?.title, "S40 · Utazz még 2 megállót");
    assert.doesNotMatch(result.current?.title ?? "", /undefined/);
  });

  test("3) a headsign jelenléte NEM töri el a BOARD fázis meglévő megjelenítését", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: "Székesfehérvár" })] });
    // legPhaseFraction 0 -> a leg első saját instrukciója (BOARD) aktív, még
    // nincs onboard/remainingStops, tehát selectActiveInstructionWithStopProgress
    // korai-return ágán megy át, változatlanul.
    const result = selectActiveInstructionWithStopProgress(instructions, { legIndex: 0, legPhaseFraction: 0 });
    assert.equal(result.current?.kind, "BOARD");
    assert.equal(result.current?.title, "Szállj fel: S40 – Székesfehérvár felé");
  });

  test("4) remainingStops NÉLKÜL nincs regresszió — a RIDE a Sprint 2 (geometry-thirds) kimenetét adja, változatlan title-lal", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ headsign: "Székesfehérvár" })] });
    const result = selectActiveInstructionWithStopProgress(instructions, { legIndex: 0, onboard: true });
    assert.equal(result.current?.kind, "RIDE");
    assert.equal(result.current?.title, "Utazz a S40 – Székesfehérvár felé járattal");
  });

  test("headsign/route label nélküli leg esetén a régi, sima 'Utazz még N megállót' szöveg marad (nincs regresszió, nincs '· ' prefix a semmiből)", () => {
    const instructions = buildNavigationInstructions({
      legs: [{ mode: "TRANSIT", fromName: "Start", toName: "Cél", durationMinutes: 10, realtime: false }],
    });
    const result = selectActiveInstructionWithStopProgress(instructions, {
      legIndex: 0, onboard: true,
      remainingStops: { remainingStopCount: 2, atFinalStop: false },
    });
    assert.equal(result.current?.title, "Utazz még 2 megállót");
  });
});
