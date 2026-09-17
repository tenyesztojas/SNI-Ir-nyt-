// SAFETY SPRINT (2026-09-17) — "unreliable transit geometry must never
// cause a false navigation decision" regressziós tesztek. A VPS-proven S40
// eset (Déli pu. -> Kelenföld, 17:20, MOTIS tripId
// 20260917_17:20_mavgtfs_32616577_2872, mode=REGIONAL_RAIL,
// legGeometry.length=2) alapján. A tíz kötelező regressziós esetet fedi le
// (lásd a sprint specifikáció 7. TESZTEK szakaszát).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyTransitGeometryConfidence,
  isRailGuidedTransitMode,
} from "../../lib/vedett-route/navigation/transitGeometryConfidence.ts";
import {
  resolveWalkToTransitBoundary,
  createInitialWalkToTransitBoundaryState,
  BOARDING_CONFIRM_FIXES,
} from "../../lib/vedett-route/navigation/legTransition.ts";
import type { WalkToTransitBoundaryInput, WalkToTransitBoundaryState } from "../../lib/vedett-route/navigation/legTransition.ts";
import {
  createInitialRerouteGuardState,
  shouldStartAutomaticReroute,
} from "../../lib/vedett-route/navigation/rerouteGuard.ts";

// 1) S40-SZERŰ GYENGE GEOMETRIA OSZTÁLYOZÁS -------------------------------
describe("1) transitGeometryConfidence — S40-szerű (2-pontos) geometria WEAK, normál polyline USABLE", () => {
  test("2 pont (a valós S40 MOTIS legGeometry.length=2 esete) -> WEAK", () => {
    assert.equal(classifyTransitGeometryConfidence([[0, 0], [0, -0.02]]), "WEAK");
  });

  test("hiányzó/üres geometria -> WEAK (safe default)", () => {
    assert.equal(classifyTransitGeometryConfidence(null), "WEAK");
    assert.equal(classifyTransitGeometryConfidence([]), "WEAK");
  });

  test("3+ pontos, dekódolt polyline -> USABLE", () => {
    assert.equal(classifyTransitGeometryConfidence([[0, 0], [0, -0.01], [0, -0.02]]), "USABLE");
  });
});

// 7) SUBWAY/TRAM SAFETY GATE + 8) BUS VÁLTOZATLAN -------------------------
describe("7/8) isRailGuidedTransitMode — sínhez kötött módok igen, BUS/WALK/RENTAL nem", () => {
  test("RAIL/REGIONAL_RAIL/SUBWAY/TRAM -> true", () => {
    for (const mode of ["RAIL", "REGIONAL_RAIL", "SUBWAY", "TRAM"]) {
      assert.equal(isRailGuidedTransitMode(mode), true, mode);
    }
  });

  test("BUS/WALK/RENTAL/undefined -> false (a BUS-viselkedés nem változhat)", () => {
    assert.equal(isRailGuidedTransitMode("BUS"), false);
    assert.equal(isRailGuidedTransitMode("WALK"), false);
    assert.equal(isRailGuidedTransitMode("RENTAL"), false);
    assert.equal(isRailGuidedTransitMode(undefined), false);
    assert.equal(isRailGuidedTransitMode(null), false);
  });
});

// Közös segédek a legTransition-teszthez (ugyanaz a fixture-stílus, mint a
// navigation-leg-transition.test.ts-ben).
function baseInput(overrides: Partial<WalkToTransitBoundaryInput> = {}): WalkToTransitBoundaryInput {
  return {
    geometryActiveLegIndex: 0,
    geometryActiveLegMode: "WALK",
    nextTransitLeg: {
      legIndex: 1,
      boardingCoordinate: [0, 0],
      legCoordinates: [
        [0, 0],
        [0, -0.02],
      ], // S40-szerű, 2-pontos ("weak") geometria
      transitMode: "REGIONAL_RAIL",
    },
    position: { latitude: 0.0002, longitude: 0 },
    offRouteStatus: "ON_ROUTE",
    previous: null,
    ...overrides,
  };
}

function step(state: WalkToTransitBoundaryState | null, overrides: Partial<WalkToTransitBoundaryInput>): WalkToTransitBoundaryState {
  return resolveWalkToTransitBoundary(baseInput({ ...overrides, previous: state }));
}

// 5) GYENGE SÍNES GEOMETRIA NEM RAGADHAT ÖRÖKRE "SZÁLLJ FEL"-EN ----------
describe("5) BOARDED_UNCERTAIN_GEOMETRY — a valós S40 eset: közeledik, majd egyértelműen távolodik a boarding ponttól", () => {
  test("boarding terület -> több egymást követő, egyértelműen távolodó fix -> BOARDED_UNCERTAIN_GEOMETRY (nem ragad Szállj fel-en)", () => {
    // 1) ~22 m a boarding ponttól -> AT_BOARDING_AREA.
    let state: WalkToTransitBoundaryState | null = step(null, { position: { latitude: 0.0002, longitude: 0 } });
    assert.equal(state.phase, "AT_BOARDING_AREA");

    // 2..4) egyre TÁVOLABB a boarding ponttól (S40 elindult, a user a
    // vonaton halad) — a 2-pontos "weak" geometria miatt a szigorú
    // proximity+fit+progress BOARDED sosem teljesülhet.
    const lats = [0.0006, 0.0012, 0.002];
    for (const lat of lats) {
      state = step(state, { position: { latitude: lat, longitude: 0 } });
    }
    assert.equal(state.phase, "BOARDED_UNCERTAIN_GEOMETRY");
    assert.equal(state.resolvedLegIndex, 1, "a leg-index a TRANSIT legre vált — a 'Szállj fel' eltűnik");
    assert.ok(state.departureEvidenceFixes >= BOARDING_CONFIRM_FIXES);
  });

  test("BOARDED_UNCERTAIN_GEOMETRY-ből nem esik vissza WALK-ra/AT_BOARDING_AREA-ra egyetlen további fixen", () => {
    let state: WalkToTransitBoundaryState | null = step(null, { position: { latitude: 0.0002, longitude: 0 } });
    for (const lat of [0.0006, 0.0012, 0.002]) {
      state = step(state, { position: { latitude: lat, longitude: 0 } });
    }
    assert.equal(state.phase, "BOARDED_UNCERTAIN_GEOMETRY");
    const afterMore = step(state, { position: { latitude: 0.0001, longitude: 0 } }); // GPS-jitter, visszafelé
    assert.equal(afterMore.phase, "BOARDED_UNCERTAIN_GEOMETRY");
    assert.equal(afterMore.resolvedLegIndex, 1);
  });

  test("friss (reroute utáni) állapotból indulva nincs áthozott departureEvidenceFixes", () => {
    const fresh = resolveWalkToTransitBoundary(baseInput({ previous: createInitialWalkToTransitBoundaryState() }));
    assert.equal(fresh.departureEvidenceFixes, 0);
  });
});

// 4) MEGBÍZHATÓ GEOMETRIÁJÚ BOARDING/PROGRESS NEM REGREDÁL ----------------
describe("4) megbízható (USABLE) geometriájú sínes leg — a szigorú BOARDED logika VÁLTOZATLAN", () => {
  test("3-pontos, USABLE geometriájú REGIONAL_RAIL legnél a valódi progress -> BOARDED (nem BOARDED_UNCERTAIN_GEOMETRY)", () => {
    const reliableLeg = {
      legIndex: 1,
      boardingCoordinate: [0, 0] as const,
      legCoordinates: [
        [0, 0],
        [0, -0.01],
        [0, -0.02],
      ] as const,
      transitMode: "REGIONAL_RAIL",
    };
    let state: WalkToTransitBoundaryState | null = null;
    for (const lat of [-0.00005, -0.00015, -0.00025]) {
      state = step(state, { nextTransitLeg: reliableLeg, position: { latitude: lat, longitude: 0 } });
    }
    assert.equal((state as WalkToTransitBoundaryState).phase, "BOARDED");
  });
});

// 6) UNCERTAIN ÁLLAPOT NEM ÁLLÍT HAMIS PONTOS JÁRMŰ-AZONOSSÁGOT -----------
describe("6) BOARDED_UNCERTAIN_GEOMETRY nem vezet be jármű-azonosító/idő-alapú mezőt", () => {
  test("az állapot kizárólag a meglévő, geometriai/fix-alapú mezőket tartalmazza", () => {
    let state: WalkToTransitBoundaryState | null = step(null, { position: { latitude: 0.0002, longitude: 0 } });
    for (const lat of [0.0006, 0.0012, 0.002]) {
      state = step(state, { position: { latitude: lat, longitude: 0 } });
    }
    assert.equal(state.phase, "BOARDED_UNCERTAIN_GEOMETRY");
    assert.deepEqual(new Set(Object.keys(state)), new Set([
      "phase",
      "resolvedLegIndex",
      "boardingDistanceMeters",
      "consecutiveTransitFitFixes",
      "transitFitStreakStartProgressMeters",
      "transitProgressMeters",
      "departureEvidenceFixes",
    ]));
  });
});

// 8) BUS LEGNÉL A GYENGE GEOMETRIA NEM VÁLT KI UNCERTAIN FALLBACKOT -------
describe("8) BUS mód — a gyenge geometria fallback nem terjed ki BUS-ra (transitMode nem sínhez kötött)", () => {
  test("ugyanaz a távolodó mintázat BUS transitMode-dal SOSEM ér el BOARDED_UNCERTAIN_GEOMETRY-t", () => {
    const busLeg = {
      legIndex: 1,
      boardingCoordinate: [0, 0] as const,
      legCoordinates: [
        [0, 0],
        [0, -0.02],
      ] as const,
      transitMode: "BUS",
    };
    let state: WalkToTransitBoundaryState | null = step(null, { nextTransitLeg: busLeg, position: { latitude: 0.0002, longitude: 0 } });
    for (const lat of [0.0006, 0.0012, 0.002]) {
      state = step(state, { nextTransitLeg: busLeg, position: { latitude: lat, longitude: 0 } });
    }
    assert.notEqual(state.phase, "BOARDED_UNCERTAIN_GEOMETRY");
    assert.equal(state.departureEvidenceFixes, 0);
  });
});

// 2/3) REROUTE GUARD — WEAK TRANSIT GEOMETRIA BLOKKOLJA, WALK VÁLTOZATLAN -
const READY_OFF_ROUTE = {
  navigationActive: true,
  offRouteStatus: "OFF_ROUTE" as const,
  hasCurrentPosition: true,
  hasDestination: true,
  nowMs: 100_000,
};

describe("2) gyenge transit geometria esetén az automatikus reroute NEM indulhat el (geometria-eltérés önmagában nem elég)", () => {
  test("transitGeometryUncertain=true -> shouldReroute=false, reason=TRANSIT_GEOMETRY_UNCERTAIN, MÉG megerősített OFF_ROUTE esetén is", () => {
    const state = createInitialRerouteGuardState();
    const decision = shouldStartAutomaticReroute(state, { ...READY_OFF_ROUTE, transitGeometryUncertain: true });
    assert.deepEqual(decision, { shouldReroute: false, reason: "TRANSIT_GEOMETRY_UNCERTAIN" });
  });
});

describe("3) WALK (transitGeometryUncertain hiányzik/false) esetén a meglévő OFF_ROUTE reroute VÁLTOZATLANUL működik", () => {
  test("transitGeometryUncertain nélkül (WALK OFF_ROUTE) a guard továbbra is engedélyezi az újratervezést", () => {
    const state = createInitialRerouteGuardState();
    assert.deepEqual(shouldStartAutomaticReroute(state, READY_OFF_ROUTE), { shouldReroute: true, reason: null });
  });

  test("transitGeometryUncertain=false explicit módon sem blokkol", () => {
    const state = createInitialRerouteGuardState();
    assert.deepEqual(shouldStartAutomaticReroute(state, { ...READY_OFF_ROUTE, transitGeometryUncertain: false }), {
      shouldReroute: true,
      reason: null,
    });
  });
});

// 9) NINCS REGRESSZIÓ A MEGLÉVŐ GUARD-SORREND/STALE-SESSION LOGIKÁBAN -----
describe("9) a guard meglévő elsőbbségi sorrendje (navigáció/OFF_ROUTE) MEGELŐZI az új transitGeometryUncertain ágat", () => {
  test("inaktív navigáció esetén NAVIGATION_INACTIVE marad az ok, akkor is, ha transitGeometryUncertain=true", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(
      shouldStartAutomaticReroute(state, { ...READY_OFF_ROUTE, navigationActive: false, transitGeometryUncertain: true }).reason,
      "NAVIGATION_INACTIVE",
    );
  });

  test("nem megerősített OFF_ROUTE esetén NOT_CONFIRMED_OFF_ROUTE marad az ok, akkor is, ha transitGeometryUncertain=true", () => {
    const state = createInitialRerouteGuardState();
    assert.equal(
      shouldStartAutomaticReroute(state, { ...READY_OFF_ROUTE, offRouteStatus: "ON_ROUTE", transitGeometryUncertain: true }).reason,
      "NOT_CONFIRMED_OFF_ROUTE",
    );
  });
});

// 10) REST-STOP / EGYETLEN REROUTE-PROTOKOLL NEM SÉRÜL --------------------
describe("10) a komponens változatlanul EGYETLEN reroute-protokollt és a rest-stop /resume végpontot használja", () => {
  test("a transitGeometryUncertain bekötése nem hoz létre második reroute-hívást vagy client-oldali route service hívást", () => {
    const source = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");
    assert.match(source, /transitGeometryUncertain:\s*activeLegTransitGeometryUncertain/);
    const resumeCalls = source.match(/fetch\("\/api\/vedett-route\/rest-stops\/resume"/g) ?? [];
    assert.equal(resumeCalls.length, 1);
    const reroutePolls = source.match(/shouldStartAutomaticReroute\(rerouteGuardRef\.current/g) ?? [];
    assert.equal(reroutePolls.length, 1);
  });
});
