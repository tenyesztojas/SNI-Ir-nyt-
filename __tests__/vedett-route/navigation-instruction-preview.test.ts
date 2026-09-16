// NAVIGATION — NEXT-INSTRUCTION PREVIEW teszt (Sprint 6, 2026-09-16).
//
// A pure lib/vedett-route/navigation/instructionPreview.ts modult teszteli.
// A strukturális (BOARD/RIDE/ALIGHT/TRANSFER/BIKE_*/ARRIVE) eseteknél VALÓS
// buildNavigationInstructions() kimenetet használunk minimális JourneyLeg
// fixture-ökkel (mode/fromName/toName/durationMinutes/realtime a KÖTELEZŐ
// mezők, lásd lib/vedett-route/types.ts JourneyLeg) — ez egyben azt is
// bizonyítja, hogy a preview a MEGLÉVŐ instrukció-modellel valóban
// együttműködik, nem egy kézzel írt, a valóságtól eltérő fixture-rel.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildNavigationInstructions } from "../../lib/vedett-route/navigation/instructions.ts";
import type { NavigationInstruction } from "../../lib/vedett-route/navigation/instructions.ts";
import { resolveInstructionPreview } from "../../lib/vedett-route/navigation/instructionPreview.ts";
import type { JourneyLeg } from "../../lib/vedett-route/types";

function walkLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return { mode: "WALK", fromName: "Kiindulás", toName: "Cél", durationMinutes: 5, realtime: false, ...overrides } as JourneyLeg;
}
function transitLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return { mode: "TRANSIT", fromName: "Megálló A", toName: "Megálló B", routeShortName: "47", durationMinutes: 10, realtime: false, ...overrides } as JourneyLeg;
}
function rentalLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return { mode: "RENTAL", fromName: "Bubi állomás", toName: "Cél közelében", durationMinutes: 8, realtime: false, ...overrides } as JourneyLeg;
}

function byId(instructions: NavigationInstruction[], id: string): NavigationInstruction {
  const found = instructions.find((i) => i.id === id);
  assert.ok(found, `instrukció nem található: ${id}`);
  return found!;
}

describe("WALK — kanyar-preview", () => {
  test("1) TURN_RIGHT current -> TURN_LEFT preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "TURN_LEFT" });
    assert.deepEqual(preview, { phrase: "fordulj balra" });
  });

  test("2) TURN_LEFT current -> TURN_RIGHT preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "TURN_RIGHT" });
    assert.deepEqual(preview, { phrase: "fordulj jobbra" });
  });

  test("3) START soha nem preview (defenzíven: nem TURN kind sem válik kanyarrá)", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "START" });
    assert.notEqual(preview?.phrase, "fordulj balra");
    assert.notEqual(preview?.phrase, "fordulj jobbra");
  });

  test("4) nem-TURN (pl. ARRIVE) walkNextManoeuvre soha nem ad kanyar-szöveget — a PASSED-szűrés a resolveWalkProgress() felelőssége (lásd navigation-walk-progress.test.ts)", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "ARRIVE" });
    assert.notEqual(preview?.phrase, "fordulj balra");
    assert.notEqual(preview?.phrase, "fordulj jobbra");
  });

  test("5) next ARRIVE (WALK manoeuvre) + Journey vége -> arrival preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "ARRIVE" });
    assert.deepEqual(preview, { phrase: "megérkezel" });
  });

  test("6) next ARRIVE (WALK manoeuvre) + következő TRANSIT -> BOARD preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "ARRIVE" });
    assert.equal(preview?.phrase, "szállj fel – 47");
  });

  test("7) next ARRIVE (WALK manoeuvre) + következő RENTAL -> BIKE_PICKUP preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), rentalLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "ARRIVE" });
    assert.equal(preview?.phrase, "vedd ki a kerékpárt – Bubi állomás");
  });

  test("8) nincs következő instrukció (Journey ARRIVE-nál állunk) -> null", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "arrive"), null);
    assert.equal(preview, null);
  });

  test("9) unreliable/nincs WALK progress, de van következő leg -> biztonságos strukturális fallback (nem null, nincs kitalálva)", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg()] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), null);
    assert.equal(preview?.phrase, "szállj fel – 47");
  });
});

describe("TRANSIT — ALIGHT/TRANSFER preview", () => {
  test("10) RIDE -> ALIGHT preview", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ toName: "Astoria" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "ride-0"), null);
    assert.equal(preview?.phrase, "szállj le – Astoria");
  });

  test("11) stop-aware RIDE countdown override mellett is helyes ALIGHT preview (id-alapú keresés, nem referencia)", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ toName: "Astoria" })] });
    const rideWithCountdownOverride: NavigationInstruction = { ...byId(instructions, "ride-0"), title: "Utazz még 3 megállót", detail: undefined };
    const preview = resolveInstructionPreview(instructions, rideWithCountdownOverride, null);
    assert.equal(preview?.phrase, "szállj le – Astoria");
  });

  test("12) TRANSFER -> (RIDE triviális ugrás) -> ALIGHT preview", () => {
    const instructions = buildNavigationInstructions({
      legs: [transitLeg({ toName: "Deák Ferenc tér" }), transitLeg({ toName: "Astoria" })],
    });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "transfer-1"), null);
    assert.equal(preview?.phrase, "szállj le – Astoria");
  });

  test("13) BOARD esetén NEM a triviális RIDE a preview, hanem az utána jövő ALIGHT", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ toName: "Astoria" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "board-0"), null);
    assert.equal(preview?.phrase, "szállj le – Astoria");
    assert.notEqual(preview?.phrase.includes("utazz"), true);
  });

  test("14) Journey végén valódi ARRIVE (utolsó leg ALIGHT-ja után)", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ toName: "Astoria" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "alight-0"), null);
    assert.deepEqual(preview, { phrase: "megérkezel" });
  });
});

describe("MULTIMODAL átmenetek", () => {
  test("15) WALK -> TRANSIT", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg({ routeShortName: "4" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), null);
    assert.equal(preview?.phrase, "szállj fel – 4");
  });

  test("16) TRANSIT -> WALK", () => {
    const instructions = buildNavigationInstructions({ legs: [transitLeg({ toName: "Astoria" }), walkLeg({ toName: "Kávézó" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "alight-0"), null);
    assert.equal(preview?.phrase, "gyalogolj – Kávézó");
  });

  test("17) WALK -> RENTAL", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), rentalLeg({ fromName: "Nyugati Bubi" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "walk-0"), null);
    assert.equal(preview?.phrase, "vedd ki a kerékpárt – Nyugati Bubi");
  });

  test("18) RENTAL -> WALK", () => {
    const instructions = buildNavigationInstructions({ legs: [rentalLeg({ toName: "Belváros" }), walkLeg({ toName: "Cél" })] });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "bike-dropoff-0"), null);
    assert.equal(preview?.phrase, "gyalogolj – Cél");
  });

  test("19) WALK -> TRANSIT -> WALK: a középső TRANSIT ALIGHT-ja után a MÁSODIK WALK jön elő", () => {
    const instructions = buildNavigationInstructions({
      legs: [walkLeg(), transitLeg({ toName: "Astoria" }), walkLeg({ toName: "Végcél" })],
    });
    const preview = resolveInstructionPreview(instructions, byId(instructions, "alight-1"), null);
    assert.equal(preview?.phrase, "gyalogolj – Végcél");
  });
});

describe("SAFETY — REROUTING / rest-stop / hiányos adat", () => {
  test("20) REROUTING alatt a current már null a hívó oldalán -> nincs preview", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg()] });
    const preview = resolveInstructionPreview(instructions, null, { kind: "TURN_LEFT" });
    assert.equal(preview, null);
  });

  test("21) rest-stop legsOverride alatt a current már null a hívó oldalán -> nincs preview", () => {
    const preview = resolveInstructionPreview([], null, null);
    assert.equal(preview, null);
  });

  test("22) null walkNextManoeuvre és üres instructions tömb -> nincs kivétel, null", () => {
    assert.doesNotThrow(() => resolveInstructionPreview([], null, null));
    assert.equal(resolveInstructionPreview([], null, null), null);
  });

  test("23) current NEM szerepel az instructions tömbben (hiányos/inkonzisztens geometria) -> null, nincs kivétel", () => {
    const foreign: NavigationInstruction = { id: "walk-99", kind: "WALK", title: "Gyalogolj", legIndex: 0 };
    assert.doesNotThrow(() => resolveInstructionPreview([], foreign, null));
    assert.equal(resolveInstructionPreview([], foreign, null), null);
  });

  test("24) reroute -> új displayedJourney -> új, determinisztikus, EGYMÁSTÓL FÜGGETLEN preview", () => {
    const instructionsA = buildNavigationInstructions({ legs: [walkLeg(), transitLeg({ routeShortName: "4" })] });
    const instructionsB = buildNavigationInstructions({ legs: [walkLeg(), transitLeg({ routeShortName: "9" })] });
    const previewA = resolveInstructionPreview(instructionsA, byId(instructionsA, "walk-0"), null);
    const previewB = resolveInstructionPreview(instructionsB, byId(instructionsB, "walk-0"), null);
    assert.equal(previewA?.phrase, "szállj fel – 4");
    assert.equal(previewB?.phrase, "szállj fel – 9");
    assert.notEqual(previewA, previewB);
  });

  test("25) a preview soha nem tartalmaz technikai/internal szöveget", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg(), rentalLeg()] });
    const samples = [
      resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "TURN_RIGHT" }),
      resolveInstructionPreview(instructions, byId(instructions, "walk-0"), { kind: "ARRIVE" }),
      resolveInstructionPreview(instructions, byId(instructions, "board-1"), null),
      resolveInstructionPreview(instructions, byId(instructions, "arrive"), null),
    ];
    for (const sample of samples) {
      if (sample === null) continue;
      assert.doesNotMatch(sample.phrase, /undefined|null|NaN|\[object|legIndex|segmentIndex/i);
    }
  });
});

// REGRESSZIÓ: navigation-instructions.test.ts, navigation-walk-manoeuvre.test.ts
// és navigation-walk-progress.test.ts VÁLTOZATLANUL, ugyanazon parancssorral
// futtatva marad zöld (lásd a végső riport 11. pontja) — ez a fájl semmit
// nem módosít bennük, csak OLVASSA a buildNavigationInstructions() kimenetét.
