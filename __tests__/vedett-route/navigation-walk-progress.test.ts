// NAVIGATION — WALK TURN-BY-TURN PROGRESS teszt (Sprint 5, 2026-09-16).
//
// A pure lib/vedett-route/navigation/walkManoeuvreProgress.ts modult
// teszteli, kézzel épített WalkManoeuvre-fixture-ökkel (a legtöbb teszthez
// nincs szükség valós geometriára, mert resolveManoeuvrePhase/
// resolveWalkProgress KIZÁRÓLAG számokon — distanceFromStartMeters /
// distanceAlongLegMeters — dolgozik). A route-menti (nem légvonal)
// távolság-számításhoz (cumulativeDistanceToVertex/
// resolveDistanceAlongLegMeters) egy exact spherical "destination point"
// helperrel épített, derékszögű koordináta-fixture-t használunk, hogy a
// diagonális légvonal ÉS a route menti (két oldal összege) távolság
// tesztben megkülönböztethető legyen.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TURN_NOW_DISTANCE_METERS,
  buildWalkInstructionText,
  cumulativeDistanceToVertex,
  resolveDistanceAlongLegMeters,
  resolveLegLocalMatchedSegmentIndex,
  resolveManoeuvrePhase,
  resolveWalkProgress,
  roundNavigationDistanceMeters,
} from "../../lib/vedett-route/navigation/walkManoeuvreProgress.ts";
import { detectWalkManoeuvres } from "../../lib/vedett-route/navigation/walkManoeuvre.ts";
import type { WalkManoeuvre } from "../../lib/vedett-route/navigation/walkManoeuvre.ts";

const EARTH_RADIUS_M = 6_371_008.8;

function destinationPoint([lon, lat]: readonly [number, number], bearingDeg: number, distanceMeters: number): [number, number] {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

const ORIGIN: [number, number] = [19.0, 47.0];

function manoeuvre(overrides: Partial<WalkManoeuvre> & { kind: WalkManoeuvre["kind"]; distanceFromStartMeters: number }): WalkManoeuvre {
  return { segmentIndex: 0, distanceFromPreviousMeters: 0, ...overrides };
}

describe("resolveManoeuvrePhase — APPROACH/NOW/PASSED szabály", () => {
  test("1) 120 m-re egy jobbkanyar -> APPROACH", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 320, turnAngleDegrees: 80 });
    assert.equal(resolveManoeuvrePhase(m, 200), "APPROACH");
  });

  test("2) 120 m-re egy balkanyar -> APPROACH", () => {
    const m = manoeuvre({ kind: "TURN_LEFT", distanceFromStartMeters: 320, turnAngleDegrees: -80 });
    assert.equal(resolveManoeuvrePhase(m, 200), "APPROACH");
  });

  test("3) a küszöbön belül (<=15 m) -> NOW", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 100, turnAngleDegrees: 90 });
    assert.equal(resolveManoeuvrePhase(m, 100 - TURN_NOW_DISTANCE_METERS), "NOW");
    assert.equal(resolveManoeuvrePhase(m, 100 - TURN_NOW_DISTANCE_METERS - 1), "APPROACH");
  });

  test("5) nem lesz PASSED csak kis distance miatt — a ponton állva még NOW", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 100, turnAngleDegrees: 90 });
    assert.equal(resolveManoeuvrePhase(m, 100), "NOW");
    assert.equal(resolveManoeuvrePhase(m, 99.999), "NOW");
  });

  test("4b) tényleges túljutás a manőver pontján -> PASSED", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 100, turnAngleDegrees: 90 });
    assert.equal(resolveManoeuvrePhase(m, 100.01), "PASSED");
  });
});

describe("resolveWalkProgress — kiválasztás, PASSED-átugrás, sorrend", () => {
  const manoeuvres: WalkManoeuvre[] = [
    manoeuvre({ kind: "START", distanceFromStartMeters: 0 }),
    manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 100, turnAngleDegrees: 90 }),
    manoeuvre({ kind: "TURN_LEFT", distanceFromStartMeters: 250, turnAngleDegrees: -90 }),
    manoeuvre({ kind: "ARRIVE", distanceFromStartMeters: 400 }),
  ];

  test("4) manoeuvre ponton való tényleges túljutás -> következő manoeuvre", () => {
    const before = resolveWalkProgress(manoeuvres, 50);
    assert.equal(before.currentManoeuvre?.kind, "TURN_RIGHT");
    const after = resolveWalkProgress(manoeuvres, 150);
    assert.equal(after.currentManoeuvre?.kind, "TURN_LEFT");
    assert.equal(after.nextManoeuvre?.kind, "ARRIVE");
  });

  test("9) START átugrás — a START soha nem current", () => {
    const atStart = resolveWalkProgress(manoeuvres, 0);
    assert.notEqual(atStart.currentManoeuvre?.kind, "START");
    assert.equal(atStart.currentManoeuvre?.kind, "TURN_RIGHT");
  });

  test("10) ha nincs több TURN, a current ARRIVE — 'Haladj tovább' szöveg", () => {
    const progress = resolveWalkProgress(manoeuvres, 380);
    assert.equal(progress.currentManoeuvre?.kind, "ARRIVE");
    assert.equal(progress.distanceToCurrentMeters, 20);
    assert.equal(buildWalkInstructionText(progress.currentManoeuvre!, progress.phase!, progress.distanceToCurrentMeters!), "Haladj tovább 20 métert");
  });

  test("11) WALK leg vége (ARRIVE) NEM állít elő semmi Journey-szintű mezőt — csak a leg saját ARRIVE manővere", () => {
    const progress = resolveWalkProgress(manoeuvres, 500);
    assert.deepEqual(Object.keys(progress.currentManoeuvre!).sort(), ["distanceFromPreviousMeters", "distanceFromStartMeters", "kind", "segmentIndex"]);
    assert.equal(progress.currentManoeuvre?.kind, "ARRIVE");
  });

  test("12) nincs geometry -> üres manoeuvre lista -> null progress (a hívó a régi WALK fallbackra esik)", () => {
    const progress = resolveWalkProgress([], 42);
    assert.deepEqual(progress, { currentManoeuvre: null, nextManoeuvre: null, distanceToCurrentMeters: null, phase: null });
  });

  test("13) 2 pontos geometria -> detectWalkManoeuvres [START,ARRIVE], sosem hamis TURN", () => {
    const twoPoint = detectWalkManoeuvres([[19, 47], [19.001, 47]]);
    assert.deepEqual(twoPoint.map((m) => m.kind), ["START", "ARRIVE"]);
    const progress = resolveWalkProgress(twoPoint, 10);
    assert.equal(progress.currentManoeuvre?.kind, "ARRIVE");
  });

  test("24) determinisztikus — ugyanaz a bemenet ugyanazt az eredményt adja", () => {
    const a = resolveWalkProgress(manoeuvres, 150);
    const b = resolveWalkProgress(manoeuvres, 150);
    assert.deepEqual(a, b);
  });

  test("25) új geometriából mindig ÚJ, független manoeuvre-lista (nincs stale/megosztott state)", () => {
    const legA = [[19, 47], destinationPoint(ORIGIN, 90, 30), destinationPoint(ORIGIN, 90, 60)] as [number, number][];
    const legB = [[19, 47], destinationPoint(ORIGIN, 0, 30), destinationPoint(ORIGIN, 0, 60)] as [number, number][];
    const manoeuvresA = detectWalkManoeuvres(legA);
    const manoeuvresB = detectWalkManoeuvres(legB);
    assert.notEqual(manoeuvresA, manoeuvresB);
    // Egyik lista módosítása nem hat a másikra (nincs megosztott referencia).
    assert.notEqual(manoeuvresA[0], manoeuvresB[0]);
  });
});

describe("global -> leg-lokális matchedSegmentIndex konverzió (index-szemantika)", () => {
  const legRange = { legIndex: 1, startSegmentIndex: 10, endSegmentIndex: 15, legCoordinates: [] };

  test("8a) a tartományon belüli globális index -> helyes lokális él-index", () => {
    assert.equal(resolveLegLocalMatchedSegmentIndex(12, legRange), 2);
  });

  test("8b) a tartomány alsó határa -> 0 (nem null)", () => {
    assert.equal(resolveLegLocalMatchedSegmentIndex(10, legRange), 0);
  });

  test("8c) a tartomány felső határa -> span (nem null)", () => {
    assert.equal(resolveLegLocalMatchedSegmentIndex(15, legRange), 5);
  });

  test("8d) a tartományon KÍVÜLI globális index -> null", () => {
    assert.equal(resolveLegLocalMatchedSegmentIndex(9, legRange), null);
    assert.equal(resolveLegLocalMatchedSegmentIndex(16, legRange), null);
  });

  test("8e) hiányzó legRange vagy invalid matchedSegmentIndex -> null, sosem dob kivételt", () => {
    assert.equal(resolveLegLocalMatchedSegmentIndex(12, null), null);
    assert.equal(resolveLegLocalMatchedSegmentIndex(null, legRange), null);
    assert.equal(resolveLegLocalMatchedSegmentIndex(-1, legRange), null);
  });
});

describe("route-menti (nem légvonal) távolság-számítás", () => {
  // Derékszögű "L" alakú útvonal: 40 m észak, majd 30 m kelet. A légvonal
  // (ORIGIN -> végpont) ~50 m (3-4-5 szabály), a route menti hossz PONTOSAN
  // 70 m — ha a modul légvonalat számolna, ez a teszt elbukna.
  const corner = destinationPoint(ORIGIN, 0, 40);
  const end = destinationPoint(corner, 90, 30);
  const globalCoordinates: [number, number][] = [ORIGIN, corner, end];

  test("6) cumulativeDistanceToVertex a route mentén összegez, nem légvonalat", () => {
    const toCorner = cumulativeDistanceToVertex(globalCoordinates, 1);
    const toEnd = cumulativeDistanceToVertex(globalCoordinates, 2);
    assert.ok(Math.abs(toCorner - 40) < 0.1);
    assert.ok(Math.abs(toEnd - 70) < 0.1);
    // A légvonal ORIGIN->end ~50 m lenne — a route menti hossz ETTŐL ELTÉR.
    assert.ok(Math.abs(toEnd - 50) > 5);
  });

  test("7) resolveDistanceAlongLegMeters egy szegmensen BELÜLI (nem csúcson lévő) progresst is helyesen ad", () => {
    // A globális progressDistanceMeters 55 m -> 40 m (az első oldal) + 15 m
    // bemenet a MÁSODIK szegmens belsejébe (nem a csúcsra) esik.
    const legRange = { legIndex: 0, startSegmentIndex: 0, endSegmentIndex: 1, legCoordinates: globalCoordinates };
    const distanceAlongLeg = resolveDistanceAlongLegMeters(55, globalCoordinates, legRange, 70);
    assert.ok(distanceAlongLeg !== null && Math.abs(distanceAlongLeg - 55) < 0.1);
  });

  test("7b) a leg VÉGE utáni globális progress a leg teljes hosszára van vágva (nem szalad túl)", () => {
    const legRange = { legIndex: 0, startSegmentIndex: 0, endSegmentIndex: 1, legCoordinates: globalCoordinates };
    const distanceAlongLeg = resolveDistanceAlongLegMeters(500, globalCoordinates, legRange, 70);
    assert.equal(distanceAlongLeg, 70);
  });

  test("null bemenetekre biztonságos null, sosem dob kivételt", () => {
    assert.equal(resolveDistanceAlongLegMeters(null, globalCoordinates, { legIndex: 0, startSegmentIndex: 0, endSegmentIndex: 1, legCoordinates: [] }, 70), null);
    assert.equal(resolveDistanceAlongLegMeters(10, globalCoordinates, null, 70), null);
  });
});

describe("WALK instrukció szöveg (sprint specifikáció 6. pontja)", () => {
  test("jobbkanyar, APPROACH", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 300, turnAngleDegrees: 90 });
    assert.equal(buildWalkInstructionText(m, "APPROACH", 120), "120 m múlva fordulj jobbra");
  });

  test("balkanyar, APPROACH", () => {
    const m = manoeuvre({ kind: "TURN_LEFT", distanceFromStartMeters: 300, turnAngleDegrees: -90 });
    assert.equal(buildWalkInstructionText(m, "APPROACH", 30), "30 m múlva fordulj balra");
  });

  test("jobbkanyar, NOW", () => {
    const m = manoeuvre({ kind: "TURN_RIGHT", distanceFromStartMeters: 300, turnAngleDegrees: 90 });
    assert.equal(buildWalkInstructionText(m, "NOW", 5), "Fordulj jobbra");
  });

  test("balkanyar, NOW", () => {
    const m = manoeuvre({ kind: "TURN_LEFT", distanceFromStartMeters: 300, turnAngleDegrees: -90 });
    assert.equal(buildWalkInstructionText(m, "NOW", 5), "Fordulj balra");
  });
});

describe("távolság-kerekítés (sprint specifikáció 7. pontja) — 20,21,22,23", () => {
  test("20) 33 -> 35", () => assert.equal(roundNavigationDistanceMeters(33), 35));
  test("21) 117 -> 120", () => assert.equal(roundNavigationDistanceMeters(117), 120));
  test("22) 184 -> 180", () => assert.equal(roundNavigationDistanceMeters(184), 180));
  test("23) 327 -> 350", () => assert.equal(roundNavigationDistanceMeters(327), 350));

  test("negatív/invalid bemenet nem dob kivételt, 0-ra vágva", () => {
    assert.equal(roundNavigationDistanceMeters(-5), 0);
  });
});

// TESZTLISTA 14/15/16/17/18/19 (REROUTING elnyomás, rest-stop override,
// transit stop countdown, BOARD, ALIGHT, Bubi/RENTAL) — ez a pure modul
// SZÁNDÉKOSAN semmit nem tud a rerouting/rest-stop/transit állapotokról
// (nincs import, nincs függőség rájuk), ezért ezeket nem lehet — és nem is
// kell — ITT tesztelni: a VedettUtvonalSearchForm.tsx-ben a MEGLÉVŐ
// `navigationInstructionForDisplay` elnyomás-feltétel (rest-stop
// legsOverride / automaticRerouteStatus === "REROUTING") VÁLTOZATLANUL, a
// WALK-override ELŐTT/UTÁN egyaránt érvényesül — lásd a végső riport 5. és
// 10. pontját. A transit stop countdown / BOARD / ALIGHT / RENTAL
// viselkedést a MEGLÉVŐ __tests__/vedett-route/navigation-instructions.test.ts
// fedi (59/59 PASS, ebben a sprintben változatlanul futtatva).
