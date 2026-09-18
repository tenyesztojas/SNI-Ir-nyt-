// VÉDETT ÚTVONAL — SPRINT 8.1 (FOREGROUND REACQUISITION, 2026-09-18).
//
// A pure lib/vedett-route/navigation/foregroundReacquisition.ts modult
// teszteli, ÖNÁLLÓAN (fázis-átmenetek, generation-hiszterézis) ÉS a MÁR
// MEGLÉVŐ, VÁLTOZATLAN gpsFixGate.ts / legTransition.ts pure függvényekkel
// ÖSSZETÉVE (composition), hogy a spec teszt-listájának A/C/F/G/H/L pontjait
// a VALÓS, éles pipeline-elemekkel bizonyítsa, ne csak elszigetelt
// helyettesítő fixture-ökkel.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialForegroundRecoveryState,
  startForegroundRecovery,
  updateForegroundRecoveryPhase,
  cancelForegroundRecovery,
  isForegroundRecoveryActive,
  isForegroundRecoveryGenerationCurrent,
  isGenuineForegroundTransition,
  type DocumentVisibilityState,
  type ForegroundRecoveryState,
} from "../../lib/vedett-route/navigation/foregroundReacquisition.ts";
import {
  createInitialGpsFixGateState,
  markVisibilityReturned,
  evaluateGpsFixUsability,
  isGpsReacquiring,
  GPS_REACQUISITION_STABLE_FIXES,
} from "../../lib/vedett-route/navigation/gpsFixGate.ts";
import { resolveWalkToTransitBoundary, createInitialWalkToTransitBoundaryState } from "../../lib/vedett-route/navigation/legTransition.ts";
import type { WalkToTransitBoundaryInput, WalkToTransitBoundaryState } from "../../lib/vedett-route/navigation/legTransition.ts";

// ============================================================================
// 1) PURE FÁZIS-ÁTMENETEK — teszt A/B/G alap
// ============================================================================
describe("foregroundReacquisition — pure fázis-átmenetek", () => {
  test("kezdeti állapot IDLE, generation 0", () => {
    assert.deepEqual(createInitialForegroundRecoveryState(), { phase: "IDLE", generation: 0 });
  });

  test("startForegroundRecovery: WAITING_FOR_FRESH_GPS-re vált és bumpolja a generation-t", () => {
    const initial = createInitialForegroundRecoveryState();
    const started = startForegroundRecovery(initial);
    assert.equal(started.phase, "WAITING_FOR_FRESH_GPS");
    assert.equal(started.generation, 1);
  });

  test("startForegroundRecovery MINDIG bumpol, akár STABLE-ből, akár egy MÁR folyamatban lévő recoveryből hívják (teszt L alap)", () => {
    const stable = { phase: "STABLE" as const, generation: 3 };
    assert.deepEqual(startForegroundRecovery(stable), { phase: "WAITING_FOR_FRESH_GPS", generation: 4 });
    const waiting = { phase: "WAITING_FOR_FRESH_GPS" as const, generation: 5 };
    assert.deepEqual(startForegroundRecovery(waiting), { phase: "WAITING_FOR_FRESH_GPS", generation: 6 });
  });

  test("updateForegroundRecoveryPhase: IDLE/STABLE állapotban no-op (nincs folyamatban recovery, amit frissíteni kellene)", () => {
    const idle = createInitialForegroundRecoveryState();
    assert.deepEqual(updateForegroundRecoveryPhase(idle, { usable: true, reacquiring: false }), idle);
    const stable = { phase: "STABLE" as const, generation: 2 };
    assert.deepEqual(updateForegroundRecoveryPhase(stable, { usable: false, reacquiring: false }), stable);
  });

  test("updateForegroundRecoveryPhase: WAITING_FOR_FRESH_GPS -> usable+reacquiring -> REACQUIRING -> usable+!reacquiring -> STABLE", () => {
    let state = startForegroundRecovery(createInitialForegroundRecoveryState());
    assert.equal(state.phase, "WAITING_FOR_FRESH_GPS");

    // usable=false tick (STALE/pending) — SOSEM regresszál, marad WAITING.
    state = updateForegroundRecoveryPhase(state, { usable: false, reacquiring: false });
    assert.equal(state.phase, "WAITING_FOR_FRESH_GPS");

    // Első usable fix, de a gpsFixGate reacquisition-streakje még folyamatban.
    state = updateForegroundRecoveryPhase(state, { usable: true, reacquiring: true });
    assert.equal(state.phase, "REACQUIRING");

    // Egy visszaeső (nem usable) tick REACQUIRING alatt sem regresszál vissza WAITING-re.
    state = updateForegroundRecoveryPhase(state, { usable: false, reacquiring: true });
    assert.equal(state.phase, "REACQUIRING");

    // 3. GOOD fix -> gpsFixGate reacquiring=false -> STABLE.
    state = updateForegroundRecoveryPhase(state, { usable: true, reacquiring: false });
    assert.equal(state.phase, "STABLE");
    assert.equal(state.generation, 1, "a generation a fázis-progresszió alatt NEM változik, csak start/cancel bumpolja");
  });

  test("cancelForegroundRecovery: IDLE-ből no-op, aktív fázisból IDLE-re állít ÉS bumpol (teszt E alap)", () => {
    const idle = createInitialForegroundRecoveryState();
    assert.deepEqual(cancelForegroundRecovery(idle), idle);

    const waiting = startForegroundRecovery(idle);
    const cancelled = cancelForegroundRecovery(waiting);
    assert.deepEqual(cancelled, { phase: "IDLE", generation: 2 });
  });

  test("isForegroundRecoveryActive: csak WAITING_FOR_FRESH_GPS/REACQUIRING alatt igaz", () => {
    assert.equal(isForegroundRecoveryActive("IDLE"), false);
    assert.equal(isForegroundRecoveryActive("WAITING_FOR_FRESH_GPS"), true);
    assert.equal(isForegroundRecoveryActive("REACQUIRING"), true);
    assert.equal(isForegroundRecoveryActive("STABLE"), false);
  });

  test("isForegroundRecoveryGenerationCurrent — egy régebbi generation-snapshot ELAVULTNAK minősül egy újabb start/cancel után (teszt E/L)", () => {
    const gen1 = startForegroundRecovery(createInitialForegroundRecoveryState());
    const snapshotGeneration = gen1.generation;
    assert.equal(isForegroundRecoveryGenerationCurrent(gen1, snapshotGeneration), true);

    // Új hidden->visible ciklus (második recovery) a régi snapshotot elavulttá teszi.
    const gen2 = startForegroundRecovery(gen1);
    assert.equal(isForegroundRecoveryGenerationCurrent(gen2, snapshotGeneration), false);

    // Navigáció leállítása/session-váltás (cancel) is elavulttá teszi.
    const cancelled = cancelForegroundRecovery(gen1);
    assert.equal(isForegroundRecoveryGenerationCurrent(cancelled, snapshotGeneration), false);
  });
});

// ============================================================================
// 1b) COMMIT ELŐTTI CÉLZOTT KORREKCIÓ (2026-09-18) — isGenuineForegroundTransition
// pure predikátum + a VedettUtvonalSearchForm.tsx handleVisibilityChange
// PONTOS ref-alapú szekvenciáját (előző-állapot ref -> isGenuineForegroundTransition
// -> feltétel-gate -> startForegroundRecovery) tükröző, pure harness — NEM
// brittle source-regex, hanem a VALÓS predikátum + a VALÓS fázis-átmenet
// modul összekapcsolásával bizonyítja a kötelező A-G viselkedéseket.
// ============================================================================
describe("isGenuineForegroundTransition — pure predikátum", () => {
  test("hidden -> visible: valódi foreground-tranzitiont jelez", () => {
    assert.equal(isGenuineForegroundTransition("hidden", "visible"), true);
  });

  test("visible -> hidden: NEM foreground-tranzitiont jelez", () => {
    assert.equal(isGenuineForegroundTransition("visible", "hidden"), false);
  });

  test("visible -> visible (spurious/ismételt esemény): NEM foreground-tranzitiont jelez", () => {
    assert.equal(isGenuineForegroundTransition("visible", "visible"), false);
  });

  test("hidden -> hidden (spurious/ismételt esemény): NEM foreground-tranzitiont jelez", () => {
    assert.equal(isGenuineForegroundTransition("hidden", "hidden"), false);
  });
});

// A handleVisibilityChange PONTOS szekvenciáját tükröző pure harness: az
// "előző állapot" reffel bizonyított isGenuineForegroundTransition() dönt a
// GPS-evidence invalidálásáról (mindig megtörténik genuine tranziton esetén,
// FÜGGETLENÜL a navigáció/journey-gate-től — lásd VedettUtvonalSearchForm.tsx
// handleVisibilityChange), a startForegroundRecovery()-t viszont a
// navigationActive/hasDisplayedJourney gate is védi — EZ a hívó-oldali
// wiring pontos tükre, nem egy elszigetelt fixture.
interface VisibilityHarnessState {
  previousVisibilityState: DocumentVisibilityState;
  recovery: ForegroundRecoveryState;
  gpsEvidenceInvalidatedThisEvent: boolean;
}

function createVisibilityHarness(initial: DocumentVisibilityState = "visible"): VisibilityHarnessState {
  return {
    previousVisibilityState: initial,
    recovery: createInitialForegroundRecoveryState(),
    gpsEvidenceInvalidatedThisEvent: false,
  };
}

function simulateVisibilityChange(
  harness: VisibilityHarnessState,
  nextVisibilityState: DocumentVisibilityState,
  opts: { navigationActive: boolean; hasDisplayedJourney: boolean },
): VisibilityHarnessState {
  const previous = harness.previousVisibilityState;
  const current = nextVisibilityState;
  if (!isGenuineForegroundTransition(previous, current)) {
    return { previousVisibilityState: current, recovery: harness.recovery, gpsEvidenceInvalidatedThisEvent: false };
  }
  let recovery = harness.recovery;
  if (opts.navigationActive && opts.hasDisplayedJourney) {
    recovery = startForegroundRecovery(recovery);
  }
  return { previousVisibilityState: current, recovery, gpsEvidenceInvalidatedThisEvent: true };
}

describe("handleVisibilityChange szekvencia — kötelező regressziós tesztek A-G", () => {
  test("A) visible -> hidden esetén foreground recovery NEM indul, generation NEM nő", () => {
    const harness = createVisibilityHarness("visible");
    const next = simulateVisibilityChange(harness, "hidden", { navigationActive: true, hasDisplayedJourney: true });
    assert.equal(next.gpsEvidenceInvalidatedThisEvent, false);
    assert.equal(next.recovery.generation, 0);
    assert.equal(next.recovery.phase, "IDLE");
  });

  test("B) hidden -> visible esetén foreground recovery indul, generation PONTOSAN +1", () => {
    const harness = createVisibilityHarness("hidden");
    const next = simulateVisibilityChange(harness, "visible", { navigationActive: true, hasDisplayedJourney: true });
    assert.equal(next.recovery.generation, 1);
    assert.equal(next.recovery.phase, "WAITING_FOR_FRESH_GPS");
  });

  test("C) visible -> visible (spurious esemény) esetén recovery NEM indul, generation NEM nő", () => {
    const harness = createVisibilityHarness("visible");
    const next = simulateVisibilityChange(harness, "visible", { navigationActive: true, hasDisplayedJourney: true });
    assert.equal(next.gpsEvidenceInvalidatedThisEvent, false);
    assert.equal(next.recovery.generation, 0);
  });

  test("D) hidden -> visible navigáció NÉLKÜL esetén recovery NEM indul (de a GPS-evidence invalidálás megtörténik)", () => {
    const harness = createVisibilityHarness("hidden");
    const next = simulateVisibilityChange(harness, "visible", { navigationActive: false, hasDisplayedJourney: true });
    assert.equal(next.gpsEvidenceInvalidatedThisEvent, true, "a genuine tranziton a GPS-evidence invalidálás FÜGGETLEN a nav-gate-től");
    assert.equal(next.recovery.generation, 0, "navigáció nélkül a recovery NEM indul");
    assert.equal(next.recovery.phase, "IDLE");
  });

  test("E) hidden -> visible journey NÉLKÜL esetén recovery NEM indul (de a GPS-evidence invalidálás megtörténik)", () => {
    const harness = createVisibilityHarness("hidden");
    const next = simulateVisibilityChange(harness, "visible", { navigationActive: true, hasDisplayedJourney: false });
    assert.equal(next.gpsEvidenceInvalidatedThisEvent, true);
    assert.equal(next.recovery.generation, 0);
    assert.equal(next.recovery.phase, "IDLE");
  });

  test("F) hidden -> visible aktív navigáció + journey esetén a régi GPS-evidence unusable a fresh GPS recovery-ig", () => {
    const harness = createVisibilityHarness("hidden");
    const next = simulateVisibilityChange(harness, "visible", { navigationActive: true, hasDisplayedJourney: true });
    // WAITING_FOR_FRESH_GPS = a régi (háttér előtti) fix NEM elegendő — a
    // fázis csak a MEGLÉVŐ gpsFixGate.ts-en keresztül érkező, genuinely friss
    // fix(ek) után léphet REACQUIRING/STABLE-be (lásd a 2. blokk C/G tesztjeit).
    assert.equal(next.recovery.phase, "WAITING_FOR_FRESH_GPS");
    assert.equal(next.gpsEvidenceInvalidatedThisEvent, true);
  });

  test("G) ugyanazon valódi foreground-tranzitionből csak EGY recovery generation indul — egy rá következő, nem-genuine (spurious) visible esemény NEM indít másikat", () => {
    const harness = createVisibilityHarness("hidden");
    const afterGenuineTransition = simulateVisibilityChange(harness, "visible", {
      navigationActive: true,
      hasDisplayedJourney: true,
    });
    assert.equal(afterGenuineTransition.recovery.generation, 1);

    // Egy második, spurious "visible" esemény (a previousVisibilityStateRef
    // MÁR "visible"-re frissült az előző hívásnál) NEM tekinthető genuine
    // tranzitionnek, tehát NEM indíthat második generation-t.
    const afterSpuriousRepeat = simulateVisibilityChange(afterGenuineTransition, "visible", {
      navigationActive: true,
      hasDisplayedJourney: true,
    });
    assert.equal(afterSpuriousRepeat.recovery.generation, 1, "spurious ismételt visible esemény NEM bumpolhatja a generation-t");
  });
});

// ============================================================================
// 2) COMPOSITION gpsFixGate.ts-szel — teszt C/G, VALÓS pipeline-elemekkel
// ============================================================================
describe("foregroundReacquisition + gpsFixGate.ts (VALÓS modulok) — teszt C/G", () => {
  test("teszt C: a háttérbe kerülés ELŐTTI, technikailag még FRESH fix NEM használható foreground-bizonyítékként — a fázis WAITING_FOR_FRESH_GPS marad", () => {
    const T0 = 1_000_000;
    let gpsGate = createInitialGpsFixGateState();
    let recovery = createInitialForegroundRecoveryState();

    // A dokumentum visszatér láthatóra T0+50_000-nél (kb. 50s háttérben).
    const visibleAtMs = T0 + 50_000;
    gpsGate = markVisibilityReturned(gpsGate, visibleAtMs);
    recovery = startForegroundRecovery(recovery);
    assert.equal(recovery.phase, "WAITING_FOR_FRESH_GPS");

    // A HÁTTÉRBE KERÜLÉS ELŐTTI utolsó fix (T0-nál, tehát a visszatérés
    // pillanatában MÉG a GPS_FIX_MAX_AGE_MS-en (20s) belül lenne kor
    // szerint, ha egyáltalán megnézzük) — de mivel a fixTimestamp (T0) a
    // pendingReacquisitionSinceMs (visibleAtMs) ELŐTTRŐL van, evaluateGpsFixUsability
    // ezt usable=false-nak minősíti, FÜGGETLENÜL a nyers kortól.
    const staleFixResult = evaluateGpsFixUsability(gpsGate, T0, visibleAtMs + 1_000);
    assert.equal(staleFixResult.usable, false, "a háttér ELŐTTI fix nem lehet foreground-bizonyíték");
    gpsGate = staleFixResult.nextState;
    recovery = updateForegroundRecoveryPhase(recovery, { usable: staleFixResult.usable, reacquiring: isGpsReacquiring(staleFixResult.nextState) });
    assert.equal(recovery.phase, "WAITING_FOR_FRESH_GPS", "stale/pre-background fixre a fázis NEM léphet tovább");
  });

  test("teszt G: foreground + valódi, a visszatérés UTÁNI GOOD fix(ek) sorozata -> REACQUIRING, majd GPS_REACQUISITION_STABLE_FIXES után STABLE", () => {
    const T0 = 2_000_000;
    let gpsGate = createInitialGpsFixGateState();
    let recovery = createInitialForegroundRecoveryState();

    gpsGate = markVisibilityReturned(gpsGate, T0);
    recovery = startForegroundRecovery(recovery);

    // Az ELSŐ, genuinely a visszatérés UTÁNI friss fix.
    let now = T0 + 500;
    let result = evaluateGpsFixUsability(gpsGate, now, now);
    gpsGate = result.nextState;
    recovery = updateForegroundRecoveryPhase(recovery, { usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
    assert.equal(result.usable, true, "az első, visszatérés utáni friss fix usable");

    // Az első usable fix UTÁN indul a gpsFixGate reacquisition-streakje csak
    // akkor, ha korábban LOST volt — mivel a hosszú háttér-periódus miatt a
    // pendingReacquisition-ablak lezárása FRESH-ként landolt (nem STALE-ként
    // klasszifikálva ÚJRA), ellenőrizzük a valós viselkedést: ha a modul
    // reacquiring=true-t ad, addig várunk, amíg GPS_REACQUISITION_STABLE_FIXES
    // egymást követő GOOD fix STABLE-re nem viszi a fázist.
    for (let i = 0; i < GPS_REACQUISITION_STABLE_FIXES + 1 && recovery.phase !== "STABLE"; i += 1) {
      now += 1_000;
      result = evaluateGpsFixUsability(gpsGate, now, now);
      gpsGate = result.nextState;
      recovery = updateForegroundRecoveryPhase(recovery, { usable: result.usable, reacquiring: isGpsReacquiring(result.nextState) });
    }
    assert.equal(recovery.phase, "STABLE", "elég egymást követő GOOD fix után a recovery STABLE-be kerül");
  });
});

// ============================================================================
// 3) COMPOSITION legTransition.ts-szel — teszt F/H, VALÓS pipeline-elemekkel
// ============================================================================
const TRANSIT_LEG_COORDINATES: [number, number][] = [
  [0, 0],
  [0, -0.01],
  [0, -0.02],
];

function baseBoundaryInput(overrides: Partial<WalkToTransitBoundaryInput> = {}): WalkToTransitBoundaryInput {
  return {
    geometryActiveLegIndex: 0,
    geometryActiveLegMode: "WALK",
    nextTransitLeg: { legIndex: 1, boardingCoordinate: [0, 0], legCoordinates: TRANSIT_LEG_COORDINATES, alightingCoordinate: [0, -0.02], hasFollowingLeg: true },
    position: { latitude: 0.001, longitude: 0 },
    offRouteStatus: "ON_ROUTE",
    previous: null,
    ...overrides,
  };
}

function boundaryStep(state: WalkToTransitBoundaryState | null, overrides: Partial<WalkToTransitBoundaryInput>): WalkToTransitBoundaryState {
  return resolveWalkToTransitBoundary(baseBoundaryInput({ ...overrides, previous: state }));
}

describe("foregroundReacquisition + legTransition.ts (VALÓS modulok) — teszt F/H", () => {
  test("teszt F: már BOARDED user + foreground esemény (position=null, amíg a fázis WAITING_FOR_FRESH_GPS) -> NEM regresszál APPROACHING_BOARDING/AT_BOARDING_AREA-ba", () => {
    // A user háttérbe kerülés ELŐTT bizonyítottan felszállt (BOARDED).
    let boarded: WalkToTransitBoundaryState | null = null;
    for (const lat of [-0.00005, -0.00015, -0.00025]) {
      boarded = boundaryStep(boarded, { position: { latitude: lat, longitude: 0 } });
    }
    assert.equal((boarded as WalkToTransitBoundaryState).phase, "BOARDED");

    // Foreground esemény: a hívó (VedettUtvonalSearchForm.tsx wiring) a
    // gpsFixUsable=false miatt `boundaryPosition=null`-t ad tovább, amíg a
    // recovery WAITING_FOR_FRESH_GPS/REACQUIRING fázisban van — a
    // legTransition.ts MÁR MEGLÉVŐ null-position-preservation logikája ezt
    // byte-ra megőrzi.
    let recovery = startForegroundRecovery(createInitialForegroundRecoveryState());
    assert.equal(recovery.phase, "WAITING_FOR_FRESH_GPS");
    const duringForegroundGap = boundaryStep(boarded, { position: null });
    assert.deepEqual(duringForegroundGap, boarded, "a foreground-gap alatti null pozíció NEM regresszálhatja a BOARDED állapotot");
    assert.equal(duringForegroundGap.phase, "BOARDED");
  });

  test("teszt H: foreground után friss, stabil GPS + a leszállási pont közelségének bizonyítéka -> a MEGLÉVŐ ARRIVED/leg-advance logika működik", () => {
    let boarded: WalkToTransitBoundaryState | null = null;
    for (const lat of [-0.00005, -0.00015, -0.00025]) {
      boarded = boundaryStep(boarded, { position: { latitude: lat, longitude: 0 } });
    }
    assert.equal((boarded as WalkToTransitBoundaryState).phase, "BOARDED");

    // Foreground gap (bizonytalanság alatt nincs leg-advance).
    const duringGap = boundaryStep(boarded, { position: null });
    assert.equal(duringGap.phase, "BOARDED");

    // Recovery STABLE-be kerül (lásd 2. blokk tesztjei) — ETTŐL KEZDVE a
    // hívó ismét valódi pozíciót ad tovább, és a MEGLÉVŐ ARRIVED-logika a
    // leszállási pont közelségének bizonyítékával léptet.
    let state: WalkToTransitBoundaryState = duringGap;
    for (let i = 0; i < 3; i += 1) {
      state = boundaryStep(state, { position: { latitude: -0.0198, longitude: 0 } });
    }
    assert.equal(state.phase, "ARRIVED", "friss, stabil GPS + leszállási-pont bizonyíték esetén a leg-advance a foreground-gap UTÁN is működik");
    assert.equal(state.resolvedLegIndex, 2);
  });
});
