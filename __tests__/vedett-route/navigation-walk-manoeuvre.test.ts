// VÉDETT ÚTVONAL — Navigation Walk Manoeuvre Engine (Sprint 4, 2026-09-16).
//
// Célzott teszt a lib/vedett-route/navigation/walkManoeuvre.ts pure,
// geometriai modulra. A koordinátákat a bearingDegrees()/turnDeltaDegrees()
// EXAKT inverzével (spherical "destination point" formula) építjük fel,
// hogy a tesztelt kanyarszögek pontosan a szándékolt fokértéket adják — ez
// NEM új geometriai algoritmus, csak a modul saját bearing-matematikájának
// forward-iránya, kizárólag a teszt-fixture-ök determinisztikus
// felépítéséhez.
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-walk-manoeuvre.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bearingDegrees,
  detectWalkManoeuvres,
  turnDeltaDegrees,
  MIN_BEARING_ARM_METERS,
  MIN_BOUNDARY_BEARING_ARM_METERS,
  MIN_MANOEUVRE_SPACING_METERS,
  MIN_TURN_ANGLE_DEGREES,
} from "../../lib/vedett-route/navigation/walkManoeuvre.ts";

const EARTH_RADIUS_M = 6_371_008.8;

// A bearingDegrees() EXAKT inverze — egy pontból, adott irányszögben és
// távolságban kiszámítja a következő pontot. Kizárólag test-fixture
// építéshez, NEM a production modul része.
function destinationPoint([lon, lat]: [number, number], bearingDeg: number, distanceMeters: number): [number, number] {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

// Egyenes szakaszt épít `start`-ból, `bearingDeg` irányban, `totalMeters`
// hosszan, `stepMeters` pontsűrűséggel (a végpontot mindig belefoglalja).
function straightPath(start: [number, number], bearingDeg: number, totalMeters: number, stepMeters: number): [number, number][] {
  const points: [number, number][] = [start];
  let travelled = 0;
  let current = start;
  while (travelled < totalMeters) {
    const step = Math.min(stepMeters, totalMeters - travelled);
    current = destinationPoint(current, bearingDeg, step);
    points.push(current);
    travelled += step;
  }
  return points;
}

// Több egyenes szakaszt fűz össze (minden szakasz az előző utolsó pontjából
// indul) — így épülnek fel a kanyar-fixture-ök.
function buildPath(start: [number, number], legs: { bearing: number; distance: number; step?: number }[]): [number, number][] {
  let points: [number, number][] = [start];
  let current = start;
  for (const leg of legs) {
    const segment = straightPath(current, leg.bearing, leg.distance, leg.step ?? leg.distance);
    points = points.concat(segment.slice(1));
    current = segment[segment.length - 1];
  }
  return points;
}

const ORIGIN: [number, number] = [19.0, 47.0];

describe("bearingDegrees / turnDeltaDegrees — pure helperek", () => {
  test("bearingDegrees: észak, kelet, dél, nyugat", () => {
    assert.ok(Math.abs((bearingDegrees(ORIGIN, destinationPoint(ORIGIN, 0, 50)) ?? NaN) - 0) < 0.01);
    assert.ok(Math.abs((bearingDegrees(ORIGIN, destinationPoint(ORIGIN, 90, 50)) ?? NaN) - 90) < 0.01);
    assert.ok(Math.abs((bearingDegrees(ORIGIN, destinationPoint(ORIGIN, 180, 50)) ?? NaN) - 180) < 0.01);
    assert.ok(Math.abs((bearingDegrees(ORIGIN, destinationPoint(ORIGIN, 270, 50)) ?? NaN) - 270) < 0.01);
  });

  test("bearingDegrees: azonos pont vagy invalid koordináta -> null, sosem hamis kanyar", () => {
    assert.equal(bearingDegrees(ORIGIN, ORIGIN), null);
    assert.equal(bearingDegrees(ORIGIN, [NaN, 47.0]), null);
    assert.equal(bearingDegrees([Infinity, 47.0], ORIGIN), null);
  });

  test("6) 0/360 wraparound — 350° -> 10° bearing-váltás +20°, NEM -340°", () => {
    assert.equal(turnDeltaDegrees(350, 10), 20);
    assert.equal(turnDeltaDegrees(10, 350), -20);
  });

  test("turnDeltaDegrees konvenció: pozitív = jobb, negatív = bal", () => {
    assert.equal(turnDeltaDegrees(0, 90), 90);
    assert.equal(turnDeltaDegrees(0, 270), -90);
  });
});

describe("detectWalkManoeuvres — egyenes utak, threshold alatti görbék", () => {
  test("1) egyenes ÉSZAKI út -> nincs TURN", () => {
    const path = straightPath(ORIGIN, 0, 200, 15);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("2) egyenes KELETI út -> nincs TURN", () => {
    const path = straightPath(ORIGIN, 90, 200, 15);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("3) enyhén görbülő út (threshold alatti, ~25°) -> nincs TURN", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: 25, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test(`7) kb. ${MIN_TURN_ANGLE_DEGREES - 1}° -> nincs TURN (éppen a küszöb alatt)`, () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: MIN_TURN_ANGLE_DEGREES - 1, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });
});

describe("detectWalkManoeuvres — tiszta kanyarok", () => {
  test("4) tiszta 90° jobbra -> TURN_RIGHT", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: 90, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
    assert.ok(Math.abs((manoeuvres[1].turnAngleDegrees ?? NaN) - 90) < 1);
  });

  test("5) tiszta 90° balra -> TURN_LEFT", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 90, distance: 80, step: 15 },
      { bearing: 0, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_LEFT", "ARRIVE"]);
    assert.ok(Math.abs((manoeuvres[1].turnAngleDegrees ?? NaN) + 90) < 1);
  });

  test(`8) kb. ${MIN_TURN_ANGLE_DEGREES + 1}° -> TURN (éppen a küszöb felett)`, () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: MIN_TURN_ANGLE_DEGREES + 1, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
  });

  test("6/wraparound egy valódi kanyarban — bearing 350° -> 80° (jobbra, a 0°-on átfordulva) helyesen TURN_RIGHT", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 350, distance: 80, step: 15 },
      { bearing: 80, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
  });
});

describe("detectWalkManoeuvres — konszolidáció (zajszűrés, spacing)", () => {
  test("9) többpontos, lekerekített 90°-os kanyar -> EGYETLEN TURN", () => {
    // 5 db 18°-os alkanyar, egyenként 3 méteren — messze a
    // MIN_MANOEUVRE_SPACING_METERS-en belül egymáshoz.
    const legs = [{ bearing: 0, distance: 80, step: 15 }];
    for (let i = 1; i <= 5; i += 1) legs.push({ bearing: 18 * i, distance: 3 });
    legs.push({ bearing: 90, distance: 80, step: 15 });
    const path = buildPath(ORIGIN, legs);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
  });

  test("10) két közeli candidate -> a legerősebb abs(turnAngle) marad", () => {
    // Egy 45°-os majd (5 méterrel később) egy 65°-os jobb kanyar,
    // MIN_MANOEUVRE_SPACING_METERS-en belül -> a 65°-os candidate marad.
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: 45, distance: 5 },
      { bearing: 90, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    const turns = manoeuvres.filter((m) => m.kind === "TURN_LEFT" || m.kind === "TURN_RIGHT");
    assert.equal(turns.length, 1);
  });

  test("11) két valódi, egymástól távoli kanyar -> KÉT TURN", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 100, step: 15 },
      { bearing: 90, distance: 100, step: 15 },
      { bearing: 0, distance: 100, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "TURN_LEFT", "ARRIVE"]);
  });

  test("12) rövid, <1 méteres szegmens (egyébként egyenes úton) -> nem okoz TURN-t", () => {
    const before = straightPath(ORIGIN, 0, 80, 15);
    const last = before[before.length - 1];
    const noisy = destinationPoint(last, 0, 0.4); // <1m "zaj" pont, ugyanabban az irányban
    const after = straightPath(noisy, 0, 80, 15);
    const path = [...before, noisy, ...after.slice(1)];
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("13) duplikált pontok -> nem okoznak TURN-t", () => {
    const before = straightPath(ORIGIN, 0, 80, 15);
    const duplicate = before[before.length - 1];
    const after = straightPath(duplicate, 0, 80, 15);
    const path = [...before, duplicate, duplicate, ...after.slice(1)];
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });
});

describe("detectWalkManoeuvres — sorrend, távolság, determinizmus", () => {
  const referencePath = buildPath(ORIGIN, [
    { bearing: 0, distance: 100, step: 15 },
    { bearing: 90, distance: 100, step: 15 },
    { bearing: 0, distance: 100, step: 15 },
  ]);

  test("14) START mindig az első elem", () => {
    assert.equal(detectWalkManoeuvres(referencePath)[0].kind, "START");
  });

  test("15) ARRIVE mindig az utolsó elem", () => {
    const manoeuvres = detectWalkManoeuvres(referencePath);
    assert.equal(manoeuvres[manoeuvres.length - 1].kind, "ARRIVE");
  });

  test("16) a manőver-lista route-sorrendben van (segmentIndex szigorúan növekvő)", () => {
    const manoeuvres = detectWalkManoeuvres(referencePath);
    for (let i = 1; i < manoeuvres.length; i += 1) {
      assert.ok(manoeuvres[i].segmentIndex > manoeuvres[i - 1].segmentIndex);
    }
  });

  test("17) distanceFromStartMeters monoton nő", () => {
    const manoeuvres = detectWalkManoeuvres(referencePath);
    for (let i = 1; i < manoeuvres.length; i += 1) {
      assert.ok(manoeuvres[i].distanceFromStartMeters >= manoeuvres[i - 1].distanceFromStartMeters);
    }
  });

  test("18) distanceFromPreviousMeters helyesen rekonstruálja a distanceFromStartMeters-t", () => {
    const manoeuvres = detectWalkManoeuvres(referencePath);
    let reconstructed = 0;
    for (const m of manoeuvres) {
      reconstructed += m.distanceFromPreviousMeters;
      assert.ok(Math.abs(reconstructed - m.distanceFromStartMeters) < 0.001);
    }
  });

  test("19) determinisztikus — ugyanaz a geometria mindig ugyanazt a listát adja", () => {
    const first = detectWalkManoeuvres(referencePath);
    const second = detectWalkManoeuvres([...referencePath]);
    assert.deepEqual(first, second);
  });
});

describe("detectWalkManoeuvres — geometry fallback", () => {
  test("20) pontosan 2 pont -> START + ARRIVE", () => {
    const manoeuvres = detectWalkManoeuvres([ORIGIN, destinationPoint(ORIGIN, 45, 50)]);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("21) invalid/üres geometria -> biztonságos eredmény, sosem dob kivételt", () => {
    assert.deepEqual(detectWalkManoeuvres([]), []);
    assert.deepEqual(detectWalkManoeuvres([ORIGIN]), []);
    assert.deepEqual(detectWalkManoeuvres([[NaN, NaN], [Infinity, 47]]), []);
  });

  test("22) hosszú, enyhén ívelt geometria -> NEM generál TURN-spamet", () => {
    // Összesen ~60° irányváltozás ~300 méteren, sok apró (5°-os) lépésben —
    // a windowed bearing (12 m kar) ezt simítja, egyik ablak sem éri el a
    // 40°-os küszöböt.
    const legs = [{ bearing: 0, distance: 20 }];
    for (let i = 1; i <= 12; i += 1) legs.push({ bearing: 5 * i, distance: 20 });
    const path = buildPath(ORIGIN, legs);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("23) S-alakú, threshold alatti görbület -> nem generál hamis fordulást", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 60, step: 15 },
      { bearing: 25, distance: 30, step: 10 },
      { bearing: 0, distance: 30, step: 10 },
      { bearing: -25, distance: 30, step: 10 },
      { bearing: 0, distance: 60, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });
});

// BUGFIX REGRESSION (2026-09-24) — valós M2 gyalogos megközelítési hiba:
// egy éles kanyar közvetlen a WALK leg VÉGE (érkezés/beszállás) vagy ELEJE
// előtt/után korábban NÉMÁN kiesett, mert a MIN_BEARING_ARM_METERS (12m)
// kar nem fért ki a leg-határig. Lásd walkManoeuvre.ts
// MIN_BOUNDARY_BEARING_ARM_METERS fejléce.
describe("detectWalkManoeuvres — leg-határ közeli kanyar (bugfix)", () => {
  test("24) éles 90°-os kanyar KÖZVETLEN a leg VÉGE előtt (< MIN_BEARING_ARM_METERS, de >= MIN_BOUNDARY_BEARING_ARM_METERS) -> a TURN nem veszik el", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: 90, distance: MIN_BEARING_ARM_METERS - 4, step: 5 }, // 8m — kevesebb, mint a 12m-es kar
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
    assert.ok(Math.abs((manoeuvres[1].turnAngleDegrees ?? NaN) - 90) < 1);
  });

  test("25) éles 90°-os kanyar KÖZVETLEN a leg ELEJE után (< MIN_BEARING_ARM_METERS) -> a TURN nem veszik el", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: MIN_BEARING_ARM_METERS - 4, step: 5 }, // 8m
      { bearing: 90, distance: 80, step: 15 },
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_RIGHT", "ARRIVE"]);
  });

  test("26) kanyar a leg végéhez a MIN_BOUNDARY_BEARING_ARM_METERS alatti távolságra -> továbbra sem talál ki fordulást (nincs elég geometria)", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 80, step: 15 },
      { bearing: 90, distance: MIN_BOUNDARY_BEARING_ARM_METERS - 1, step: 1 }, // 2m — a boundary-minimum alatt
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "ARRIVE"]);
  });

  test("27) WALK->TRANSIT boundary szimuláció: rövid, egyenes utolsó szakasz a kanyar után -> az utolsó valódi kanyar megmarad, nincs hamis extra TURN", () => {
    const path = buildPath(ORIGIN, [
      { bearing: 0, distance: 100, step: 15 },
      { bearing: -70, distance: 10, step: 5 }, // éles bal kanyar közvetlen a beszállás/érkezés előtt
    ]);
    const manoeuvres = detectWalkManoeuvres(path);
    assert.deepEqual(manoeuvres.map((m) => m.kind), ["START", "TURN_LEFT", "ARRIVE"]);
  });
});
