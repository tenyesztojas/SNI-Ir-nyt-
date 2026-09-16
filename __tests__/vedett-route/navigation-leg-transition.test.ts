// NAVIGATION — SPRINT 7.1, WALK→TRANSIT BOUNDARY teszt.
//
// A pure lib/vedett-route/navigation/legTransition.ts modult teszteli,
// kézzel írt fixture-ökkel (nincs szükség valós MOTIS/Journey adatra —
// a resolver bemenete SZÁNDÉKOSAN minimális, structural-typing mezőhalmaz).
//
// BOARDED SAFETY REVIEW (2026-09-16, utókör) — a teszt-fájl frissítve: a
// BOARDED-hez mostantól tényleges, mért előrehaladás is kell a transit leg
// SAJÁT geometriája mentén (nem csak proximity+geometry-fit), lásd
// legTransition.ts audit-kommentjét. A koordináták úgy vannak megválasztva,
// hogy a "haversineMeters"/"distanceAlongRouteMeters" nagyságrendje
// olvasható maradjon: 0.0001 fok szélesség ≈ 11.1 m.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWalkToTransitBoundary,
  createInitialWalkToTransitBoundaryState,
  BOARDING_PROXIMITY_METERS,
  BOARDING_CONFIRM_FIXES,
  TRANSIT_PROGRESS_THRESHOLD_METERS,
} from "../../lib/vedett-route/navigation/legTransition.ts";
import type { WalkToTransitBoundaryInput, WalkToTransitBoundaryState } from "../../lib/vedett-route/navigation/legTransition.ts";

// Egyszerű, egyenes vonalú "transit" geometria (déli irányba haladó vonal),
// a boarding pont a [0, 0] koordináta.
const TRANSIT_LEG_COORDINATES: [number, number][] = [
  [0, 0],
  [0, -0.01],
  [0, -0.02],
];

function baseInput(overrides: Partial<WalkToTransitBoundaryInput> = {}): WalkToTransitBoundaryInput {
  return {
    geometryActiveLegIndex: 0,
    geometryActiveLegMode: "WALK",
    nextTransitLeg: {
      legIndex: 1,
      boardingCoordinate: [0, 0],
      legCoordinates: TRANSIT_LEG_COORDINATES,
    },
    position: { latitude: 0.001, longitude: 0 }, // ~111 m a boarding ponttól
    offRouteStatus: "ON_ROUTE",
    previous: null,
    ...overrides,
  };
}

function step(
  state: WalkToTransitBoundaryState | null,
  overrides: Partial<WalkToTransitBoundaryInput>
): WalkToTransitBoundaryState {
  return resolveWalkToTransitBoundary(baseInput({ ...overrides, previous: state }));
}

// Egymást követő lat-értékekből (déli irányba, a boarding pont [0,0] felől
// a transit-vonal mentén) végigvezeti a resolvert, és visszaadja az UTOLSÓ
// állapotot.
function run(lats: number[], extra: Partial<WalkToTransitBoundaryInput> = {}): WalkToTransitBoundaryState {
  let state: WalkToTransitBoundaryState | null = null;
  for (const lat of lats) {
    state = step(state, { position: { latitude: lat, longitude: 0 }, ...extra });
  }
  return state as WalkToTransitBoundaryState;
}

describe("WALK→TRANSIT — 1) normál WALK progress", () => {
  test("távol a boarding ponttól -> WALKING, geometriai legIndex marad", () => {
    const result = step(null, { position: { latitude: 0.01, longitude: 0 } }); // ~1.1 km
    assert.equal(result.phase, "WALKING");
    assert.equal(result.resolvedLegIndex, 0);
  });
});

describe("WALK→TRANSIT — 2/3) boarding point közelében, WALK geometry végpont távolabb", () => {
  test("~35 m-en belül -> AT_BOARDING_AREA, resolvedLegIndex MARAD a WALK (nincs erőltetett váltás)", () => {
    const result = step(null, { position: { latitude: 0.0002, longitude: 0 } }); // ~22 m
    assert.equal(result.phase, "AT_BOARDING_AREA");
    assert.equal(result.resolvedLegIndex, 0);
    assert.ok(result.boardingDistanceMeters !== null && result.boardingDistanceMeters < BOARDING_PROXIMITY_METERS);
  });

  test("közepes távolság (proximity és 3x proximity között) -> APPROACHING_BOARDING", () => {
    const result = step(null, { position: { latitude: 0.0008, longitude: 0 } }); // ~89 m
    assert.equal(result.phase, "APPROACHING_BOARDING");
  });
});

describe("BOARDED SAFETY REVIEW — peronon álló user NEM válhat hamisan BOARDED-dé", () => {
  test("1) peronon álló user, SOK konzisztens (proximity+geometry-fit) fix, de NULLA elmozdulás -> NEM BOARDED, marad AT_BOARDING_AREA", () => {
    // 8 egymást követő fix UGYANAZON a ponton (a boarding pont ~11 m-es
    // közelében, a transit-vonalon) — a korábbi (hibás) logika ezt már 2
    // fix után BOARDED-nek jelezte volna.
    const lats = Array.from({ length: 8 }, () => -0.0001);
    const result = run(lats);
    assert.equal(result.phase, "AT_BOARDING_AREA");
    assert.equal(result.resolvedLegIndex, 0, "a leg-index NEM váltott TRANSIT-re");
  });

  test("2) GPS-jitter a transit geometry mellett (kis, oda-vissza ingadozás) -> NEM BOARDED", () => {
    // Jitter kb. +-3 m, sosem halad NETTÓ 15 m-t egy irányba.
    const lats = [-0.0001, -0.00008, -0.00011, -0.00009, -0.00012, -0.0001, -0.00009];
    const result = run(lats);
    assert.notEqual(result.phase, "BOARDED");
  });

  test("3) boarding area + tényleges, mért transit-geometry progress -> BOARDED", () => {
    // Valódi elmozdulás dél felé, a transit-vonal mentén: kb. 0, 5.5, 16.7, 27.8 m.
    const lats = [-0.00005, -0.00015, -0.00025];
    const result = run(lats);
    assert.equal(result.phase, "BOARDED");
    assert.equal(result.resolvedLegIndex, 1);
    assert.ok(
      result.transitProgressMeters !== null && result.transitProgressMeters >= TRANSIT_PROGRESS_THRESHOLD_METERS,
    );
  });

  test("4) progress threshold ALATT (elégtelen elmozdulás, elég fix) -> NEM BOARDED", () => {
    // Kb. 0, 3.3, 5.6 m nettó elmozdulás — 3 fix megvan, de a progress a
    // küszöb (15 m) alatt marad.
    const lats = [-0.00005, -0.00008, -0.0001];
    const result = run(lats);
    assert.notEqual(result.phase, "BOARDED");
    assert.equal(result.phase, "AT_BOARDING_AREA");
  });

  test("5) progress threshold FELETT, elég fixszel -> BOARDED (determinisztikus, megismételve is)", () => {
    const lats = [-0.00005, -0.00015, -0.00025];
    const first = run(lats);
    const second = run(lats);
    assert.equal(first.phase, "BOARDED");
    assert.deepEqual(first, second);
  });

  test("6) rossz GPS accuracy -> konzervatív viselkedés: a boarding-proximity tágabb, de a BOARDED-hez ELÉGTELEN puszta közelség, mozgás nélkül", () => {
    const lats = Array.from({ length: 5 }, () => -0.0001);
    const result = run(lats, { position: { latitude: -0.0001, longitude: 0, accuracyMeters: 70 } });
    assert.notEqual(result.phase, "BOARDED");
    assert.equal(result.phase, "AT_BOARDING_AREA");
  });

  test("7) BOARDED után egy átmeneti, nem-megerősítő fix NEM esik vissza WALK-ra/AT_BOARDING_AREA-ra", () => {
    const boarded = run([-0.00005, -0.00015, -0.00025]);
    assert.equal(boarded.phase, "BOARDED");
    const afterBoarded = step(boarded, { position: { latitude: -0.005, longitude: 0.002 } }); // GPS-jitter a vonaton
    assert.equal(afterBoarded.phase, "BOARDED");
    assert.equal(afterBoarded.resolvedLegIndex, 1);
  });

  test("8) WALK→TRANSIT normál eset — sem boarding-közelség, sem progress, egyértelmű WALKING", () => {
    const result = run([0.01, 0.009, 0.008]);
    assert.equal(result.phase, "WALKING");
  });

  test("9) station/platform parallel geometry case — a peron a transit-vonal MELLETT fekszik, a user csak a peronon sétál, nem a jármű mentén halad előre", () => {
    // A user oldalirányban (lon) mozog a peronon, a transit-vonal MENTI
    // (lat) előrehaladás minimális — a distanceAlongRouteMeters emiatt nem
    // nő 15 m fölé, még ha a perpendikuláris távolság (distanceFromRouteMeters)
    // mindvégig a küszöb alatt marad is.
    let state: WalkToTransitBoundaryState | null = null;
    for (const lon of [0.00005, 0.0001, 0.00015, 0.0001]) {
      state = step(state, { position: { latitude: -0.0001, longitude: lon } });
    }
    assert.notEqual((state as WalkToTransitBoundaryState).phase, "BOARDED");
  });

  test("10) reroute/reset eset — friss (createInitialWalkToTransitBoundaryState) állapotból indulva nincs áthozott streak/progress", () => {
    const fresh = resolveWalkToTransitBoundary(baseInput({ previous: createInitialWalkToTransitBoundaryState() }));
    assert.ok(fresh.consecutiveTransitFitFixes <= 1);
    assert.notEqual(fresh.phase, "BOARDED");
  });
});

describe("WALK→TRANSIT — 7/8) GPS accuracy hatása az AT_BOARDING_AREA besorolásra", () => {
  test("rossz accuracy (70 m) tágítja a boarding-area besorolást", () => {
    const result = step(null, {
      position: { latitude: 0.0005, longitude: 0, accuracyMeters: 70 }, // ~56 m, sima esetben APPROACHING lenne
    });
    assert.equal(result.phase, "AT_BOARDING_AREA");
  });

  test("jó accuracy (5 m) nem változtatja a normál (szűk) proximity-t", () => {
    const result = step(null, {
      position: { latitude: 0.0008, longitude: 0, accuracyMeters: 5 }, // ~89 m
    });
    assert.equal(result.phase, "APPROACHING_BOARDING");
  });
});

describe("WALK→TRANSIT — 9) underground/gyenge GPS safe fallback", () => {
  test("nincs elérhető pozíció -> konzervatív WALKING, nincs kivétel", () => {
    assert.doesNotThrow(() => step(null, { position: null }));
    const result = step(null, { position: null });
    assert.equal(result.phase, "WALKING");
    assert.equal(result.resolvedLegIndex, 0);
  });

  test("nincs boarding-koordináta (hiányzó MOTIS adat) -> safe WALKING, nincs kivétel", () => {
    const result = step(null, {
      nextTransitLeg: { legIndex: 1, boardingCoordinate: null, legCoordinates: TRANSIT_LEG_COORDINATES },
    });
    assert.equal(result.phase, "WALKING");
  });
});

describe("ACTIVE LEG — 13/14) nem ragad WALK-on, nem ugrik vissza korábbi legre", () => {
  test("ha a geometria maga már TRANSIT-et jelez, a resolver nem nyúl bele (NOT_APPLICABLE, passthrough)", () => {
    const result = step(null, { geometryActiveLegMode: "TRANSIT", geometryActiveLegIndex: 1 });
    assert.equal(result.phase, "NOT_APPLICABLE");
    assert.equal(result.resolvedLegIndex, 1);
  });

  test("BOARDED állapotból egy átmeneti, nem-megerősítő fix NEM ugrik vissza WALK-ra", () => {
    const boarded = run([-0.00005, -0.00015, -0.00025]);
    assert.equal(boarded.phase, "BOARDED");
    const afterBoarded = step(boarded, { position: { latitude: -0.005, longitude: 0.002 } });
    assert.equal(afterBoarded.phase, "BOARDED");
    assert.equal(afterBoarded.resolvedLegIndex, 1);
  });
});

describe("ACTIVE LEG — 15/16) boundary oscillation / reroute után új állapot", () => {
  test("a boarding-terület körül ingadozó, de a transit-geometriát sosem elérő GPS nem oszcillál WALKING<->BOARDED között", () => {
    const a = step(null, { position: { latitude: 0.0002, longitude: 0 } }); // AT_BOARDING_AREA
    const b = step(a, { position: { latitude: 0.0009, longitude: 0 } }); // APPROACHING_BOARDING
    const c = step(b, { position: { latitude: 0.0002, longitude: 0 } }); // AT_BOARDING_AREA
    for (const s of [a, b, c]) assert.notEqual(s.phase, "BOARDED");
  });

  test("reroute után (previous=null, mint egy új route/aktív navigáció) friss, cache-mentes állapotból indul", () => {
    const fresh = resolveWalkToTransitBoundary(baseInput({ previous: createInitialWalkToTransitBoundaryState() }));
    assert.equal(fresh.consecutiveTransitFitFixes <= 1, true);
  });
});

describe("ACTIVE LEG — 17) rest-stop legsOverride kompatibilitás", () => {
  test("a hívó (komponens) rest-stop alatt egyszerűen nem hívja meg ezt a resolvert — nincs saját elnyomás-logika itt, ez a hívó felelőssége (dokumentációs teszt)", () => {
    assert.doesNotThrow(() => resolveWalkToTransitBoundary(baseInput({ nextTransitLeg: null })));
  });
});

describe("WALK→RENTAL regresszió (12. pont)", () => {
  test("RENTAL aktív leg esetén is passthrough — nincs boarding-logika Bubi-ra", () => {
    const result = step(null, { geometryActiveLegMode: "RENTAL", geometryActiveLegIndex: 2 });
    assert.equal(result.phase, "NOT_APPLICABLE");
    assert.equal(result.resolvedLegIndex, 2);
  });
});

describe("konstansok konzisztenciája", () => {
  test("BOARDING_CONFIRM_FIXES >= 3 és TRANSIT_PROGRESS_THRESHOLD_METERS > 0 (dokumentált, nem 0/negatív véletlen érték)", () => {
    assert.ok(BOARDING_CONFIRM_FIXES >= 3);
    assert.ok(TRANSIT_PROGRESS_THRESHOLD_METERS > 0);
  });
});
