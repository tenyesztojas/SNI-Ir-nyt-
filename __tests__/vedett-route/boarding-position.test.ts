// VÉDETT ÚTVONAL — BOARDING POSITION GUIDANCE ("Melyik részébe szálljak?") (2026-10-07)
//   node --test __tests__/vedett-route/boarding-position.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodePolyline } from "../../lib/vedett-route/geometry.ts";
import type { JourneyLeg } from "../../lib/vedett-route/types.ts";
import {
  boardingGuidanceText,
  isBoardingGuidanceEnabled,
  isComplexStation,
  isDisplayableBoardingRecommendation,
  recommendBoardingPosition,
  selectBoardingGuidanceLegIndex,
  travelDirectionAtAlighting,
} from "../../lib/vedett-route/navigation/boardingPosition.ts";

// Lokális méter -> [lon, lat] Budapest környékén.
const LAT0 = 47.5;
const LON0 = 19.05;
const R = 6_371_000;
const toLat = (y: number) => LAT0 + (y / R) * (180 / Math.PI);
const toLon = (x: number) => LON0 + (x / (R * Math.cos((LAT0 * Math.PI) / 180))) * (180 / Math.PI);
const pt = (x: number, y: number) => [toLon(x), toLat(y)] as const;
const line = (pts: [number, number][]) => encodePolyline(pts.map(([x, y]) => pt(x, y)), 6);

function transit(from: [number, number], to: [number, number], opts: Partial<JourneyLeg> & { via?: [number, number][] } = {}): JourneyLeg {
  const { via, ...rest } = opts;
  const pts: [number, number][] = [from, ...(via ?? []), to];
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    fromName: "Kezdő",
    toName: "Célmegálló",
    fromLat: toLat(from[1]),
    fromLon: toLon(from[0]),
    toLat: toLat(to[1]),
    toLon: toLon(to[0]),
    geometryEncoded: line(pts),
    geometryPrecision: 6,
    ...rest,
  } as JourneyLeg;
}
function walk(pts: [number, number][], opts: Partial<JourneyLeg> = {}): JourneyLeg {
  const last = pts[pts.length - 1];
  return {
    mode: "WALK",
    fromName: "A",
    toName: "B",
    fromLat: toLat(pts[0][1]),
    fromLon: toLon(pts[0][0]),
    toLat: toLat(last[1]),
    toLon: toLon(last[0]),
    geometryEncoded: line(pts),
    geometryPrecision: 6,
    ...opts,
  } as JourneyLeg;
}
const EASTBOUND = (o: Partial<JourneyLeg> & { via?: [number, number][] } = {}) => transit([-600, 0], [0, 0], { via: [[-300, 0], [-100, 0]], ...o });
const WESTBOUND = (o: Partial<JourneyLeg> & { via?: [number, number][] } = {}) => transit([600, 0], [0, 0], { via: [[300, 0], [100, 0]], ...o });
const WALK_EAST = walk([[0, 0], [30, 0], [150, 0]]);
const WALK_WEST = walk([[0, 0], [-30, 0], [-150, 0]]);
const WALK_NORTH = walk([[0, 0], [0, 30], [0, 150]]);
const startWalk = walk([[-700, 0], [-600, 0]]);

describe("pozíció: FRONT / MIDDLE / REAR / UNKNOWN", () => {
  test("FRONT: a cél a haladási irányban van, gyalogos geometriával -> MEDIUM", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_EAST], 1);
    assert.equal(r.position, "FRONT");
    assert.equal(r.confidence, "MEDIUM");
    assert.equal(r.level, 2);
    assert.equal(r.basis, "WALK_PATH_GEOMETRY");
    assert.equal(r.targetType, "DESTINATION");
    assert.deepEqual(r.reasonCodes, ["LESS_WALKING_AFTER_EXIT", "GEOMETRY_BASED"]);
    assert.ok(isDisplayableBoardingRecommendation(r));
  });
  test("REAR: a cél a haladással ellentétes irányban", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_WEST], 1);
    assert.equal(r.position, "REAR");
    assert.equal(r.confidence, "MEDIUM");
  });
  test("MIDDLE: merőleges cél -> MIDDLE, de csak LOW (középső kijárat nem bizonyított) -> nincs UI", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_NORTH], 1);
    assert.equal(r.position, "MIDDLE");
    assert.equal(r.confidence, "LOW");
    assert.equal(isDisplayableBoardingRecommendation(r), false);
    assert.equal(boardingGuidanceText(r), null);
  });
  test("UNKNOWN: kétértelmű geometria (sem eleje, sem közepe)", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), walk([[0, 0], [20, 56.6], [40, 120]])], 1);
    assert.equal(r.position, "UNKNOWN");
    assert.equal(r.unknownReason, "AMBIGUOUS_GEOMETRY");
    assert.equal(r.confidence, "NONE");
  });
});

describe("irány", () => {
  test("irányváltás: ugyanarra a fizikai célra FRONT <-> REAR felcserélődik", () => {
    const east = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_EAST], 1);
    const west = recommendBoardingPosition([startWalk, WESTBOUND(), WALK_EAST], 1);
    assert.equal(east.position, "FRONT");
    assert.equal(west.position, "REAR");
    const east2 = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_WEST], 1);
    const west2 = recommendBoardingPosition([startWalk, WESTBOUND(), WALK_WEST], 1);
    assert.equal(east2.position, "REAR");
    assert.equal(west2.position, "FRONT");
  });
  test("haladási irány a leszállási megállóba érkezés vektora (nem shape-sorrend vagy észak)", () => {
    const d = travelDirectionAtAlighting(EASTBOUND());
    assert.ok(d);
    assert.equal(d.source, "LEG_GEOMETRY");
    assert.ok(d.unit.x > 0.99);
  });
  test("geometria nélkül az utolsó köztes megállóból számol, de egy szinttel gyengébb confidence-szel", () => {
    const leg = EASTBOUND({ geometryEncoded: undefined, intermediateStops: [{ name: "Előző", lat: toLat(0), lon: toLon(-400) }] } as Partial<JourneyLeg>);
    const d = travelDirectionAtAlighting(leg);
    assert.equal(d?.source, "PREVIOUS_STOP");
    const r = recommendBoardingPosition([startWalk, leg, WALK_EAST], 1);
    assert.equal(r.position, "FRONT");
    assert.equal(r.confidence, "LOW");
    assert.equal(isDisplayableBoardingRecommendation(r), false);
  });
});

describe("cél: átszállás > gyalogos folytatás", () => {
  test("átszállási cél: WALK után újabb TRANSIT -> TRANSFER + BETTER_FOR_TRANSFER", () => {
    const next = transit([150, 0], [800, 0]);
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_EAST, next], 1);
    assert.equal(r.targetType, "TRANSFER");
    assert.deepEqual(r.reasonCodes, ["BETTER_FOR_TRANSFER", "GEOMETRY_BASED"]);
    assert.equal(boardingGuidanceText(r)?.detail, "Így egyszerűbb lehet az átszállás.");
  });
  test("végső gyalogos cél -> DESTINATION + LESS_WALKING_AFTER_EXIT", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), WALK_WEST], 1);
    assert.equal(r.targetType, "DESTINATION");
    assert.equal(boardingGuidanceText(r)?.detail, "Így kevesebb gyaloglásra lehet szükség leszállás után.");
  });
  test("többvonalas csomópont, közvetlen TRANSIT->TRANSIT: csak egyenes vonalú becslés -> LOW, nincs UI", () => {
    const next = transit([120, 5], [800, 5], { transitMode: "TRAM" });
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), next], 1);
    assert.equal(r.basis, "STRAIGHT_LINE_TARGET");
    assert.equal(r.targetType, "TRANSFER");
    assert.notEqual(r.confidence, "MEDIUM");
    assert.equal(isDisplayableBoardingRecommendation(r), false);
  });
  test("gyalogos láb geometria nélkül (csak végpont) -> LOW, nincs UI", () => {
    const w = walk([[0, 0], [150, 0]], { geometryEncoded: undefined } as Partial<JourneyLeg>);
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), w], 1);
    assert.equal(r.basis, "STRAIGHT_LINE_TARGET");
    assert.equal(r.confidence, "LOW");
    assert.equal(isDisplayableBoardingRecommendation(r), false);
  });
  test("nagy szögeltérés (>45°) -> LOW", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), walk([[0, 0], [41, 43.8], [80, 90]])], 1);
    assert.equal(r.position, "FRONT");
    assert.equal(r.confidence, "LOW");
  });
  test("túl közeli cél -> UNKNOWN", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND(), walk([[0, 0], [5, 0], [10, 0]])], 1);
    assert.equal(r.unknownReason, "TARGET_TOO_CLOSE");
  });
  test("nincs következő láb -> UNKNOWN (NO_TARGET)", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND()], 1);
    assert.equal(r.unknownReason, "NO_TARGET");
  });
});

describe("hiányos adat -> UNKNOWN, soha nem 'közép'", () => {
  test("hiányzó geometria és köztes megálló -> UNKNOWN (NO_DIRECTION)", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND({ geometryEncoded: undefined } as Partial<JourneyLeg>), WALK_EAST], 1);
    assert.equal(r.position, "UNKNOWN");
    assert.equal(r.unknownReason, "NO_DIRECTION");
    assert.notEqual(r.position, "MIDDLE");
  });
  test("hibás shape nem dob kivételt -> UNKNOWN", () => {
    for (const bad of ["!!!@@@", "a", "\u0000\u0001", "~~~~~~~~~~"]) {
      const r = recommendBoardingPosition([startWalk, EASTBOUND({ geometryEncoded: bad }), WALK_EAST], 1);
      assert.equal(r.position, "UNKNOWN");
    }
  });
  test("hiányzó leszállási koordináta -> UNKNOWN", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND({ toLat: undefined, toLon: undefined } as Partial<JourneyLeg>), WALK_EAST], 1);
    assert.equal(r.position, "UNKNOWN");
  });
  test("UNKNOWN eredmények confidence NONE, nincs reason code, nincs UI", () => {
    const r = recommendBoardingPosition([startWalk, EASTBOUND()], 1);
    assert.equal(r.confidence, "NONE");
    assert.deepEqual(r.reasonCodes, []);
    assert.equal(boardingGuidanceText(r), null);
  });
});

describe("mód és állomás", () => {
  test("támogatott: metró, HÉV (SUBURBAN), villamos", () => {
    for (const m of ["SUBWAY", "METRO", "SUBURBAN", "TRAM"]) {
      const r = recommendBoardingPosition([startWalk, EASTBOUND({ transitMode: m }), WALK_EAST], 1);
      assert.equal(r.position, "FRONT", m);
      assert.equal(r.confidence, "MEDIUM", m);
    }
  });
  test("vasút: legfeljebb LOW (peron/szerelvényhossz ismeretlen) -> nincs UI", () => {
    for (const m of ["RAIL", "REGIONAL_RAIL", "LONG_DISTANCE"]) {
      const r = recommendBoardingPosition([startWalk, EASTBOUND({ transitMode: m }), WALK_EAST], 1);
      assert.equal(r.confidence, "LOW", m);
      assert.equal(isDisplayableBoardingRecommendation(r), false);
    }
  });
  test("busz/troli/ismeretlen mód -> UNSUPPORTED_MODE", () => {
    for (const m of ["BUS", "TROLLEYBUS", "COACH", "FERRY", "", undefined]) {
      const r = recommendBoardingPosition([startWalk, EASTBOUND({ transitMode: m }), WALK_EAST], 1);
      assert.equal(r.unknownReason, "UNSUPPORTED_MODE", String(m));
    }
  });
  test("gyalogos láb -> NOT_TRANSIT", () => {
    assert.equal(recommendBoardingPosition([startWalk, EASTBOUND(), WALK_EAST], 0).unknownReason, "NOT_TRANSIT");
    assert.equal(recommendBoardingPosition([startWalk], 5).unknownReason, "NOT_TRANSIT");
  });
  test("komplex csomópontok -> UNKNOWN (COMPLEX_STATION), ékezettől/kis-nagybetűtől függetlenül", () => {
    for (const name of ["Deák Ferenc tér M", "Kálvin tér", "Keleti pályaudvar M", "Nyugati pályaudvar", "Örs vezér tere M+H", "Széll Kálmán tér M", "DEAK FERENC TER"]) {
      assert.ok(isComplexStation(name), name);
      const r = recommendBoardingPosition([startWalk, EASTBOUND({ toName: name }), WALK_EAST], 1);
      assert.equal(r.unknownReason, "COMPLEX_STATION", name);
    }
    assert.equal(isComplexStation("Astoria"), false);
  });
});

describe("időzítés", () => {
  const legs = [startWalk, EASTBOUND(), WALK_EAST];
  test("csak felszállás előtt (APPROACHING_BOARDING / AT_BOARDING_AREA)", () => {
    assert.equal(selectBoardingGuidanceLegIndex(legs, 0, "APPROACHING_BOARDING"), 1);
    assert.equal(selectBoardingGuidanceLegIndex(legs, 0, "AT_BOARDING_AREA"), 1);
  });
  test("gyalogos szakasz közepén, felszállás után, leszállás után, irreleváns fázisban nincs", () => {
    for (const phase of ["WALKING", "BOARDED", "BOARDED_UNCERTAIN_GEOMETRY", "NOT_APPLICABLE", "ARRIVED", null, undefined]) {
      assert.equal(selectBoardingGuidanceLegIndex(legs, 0, phase), null, String(phase));
    }
  });
  test("nincs több TRANSIT láb -> null", () => {
    assert.equal(selectBoardingGuidanceLegIndex(legs, 2, "APPROACHING_BOARDING"), null);
  });
});

describe("szöveg, akadálymentesség, determinizmus", () => {
  test("óvatos megfogalmazás geometriai becslésnél", () => {
    const front = boardingGuidanceText(recommendBoardingPosition([startWalk, EASTBOUND(), WALK_EAST], 1));
    const rear = boardingGuidanceText(recommendBoardingPosition([startWalk, EASTBOUND(), WALK_WEST], 1));
    assert.equal(front?.title, "Érdemes lehet a szerelvény eleje felé utazni");
    assert.equal(rear?.title, "Érdemes lehet a szerelvény vége felé utazni");
  });
  test("soha nincs kocsiszám, ajtó, kijárat, lift vagy mozgólépcső a szövegben", () => {
    const cases = [WALK_EAST, WALK_WEST, WALK_NORTH].map((w) => boardingGuidanceText(recommendBoardingPosition([startWalk, EASTBOUND(), w], 1)));
    for (const t of cases) {
      if (!t) continue;
      const s = `${t.title} ${t.detail}`;
      assert.doesNotMatch(s, /\d/);
      assert.doesNotMatch(s, /kocsi|ajtó|kijárat|lift|mozgólépcső|akadálymentes/i);
    }
  });
  test("akadálymentességi / kijárat reason code nem keletkezik explicit adat nélkül", () => {
    const all = [WALK_EAST, WALK_WEST, WALK_NORTH].flatMap((w) => recommendBoardingPosition([startWalk, EASTBOUND(), w, transit([150, 0], [800, 0])], 1).reasonCodes);
    assert.ok(!all.some((c) => c === ("ACCESSIBILITY_PATH" as string) || c === ("CLOSER_TO_EXIT" as string)));
  });
  test("HIGH confidence geometriából soha nem keletkezik", () => {
    for (const w of [WALK_EAST, WALK_WEST, walk([[0, 0], [400, 0]])]) {
      assert.notEqual(recommendBoardingPosition([startWalk, EASTBOUND(), w], 1).confidence, "HIGH");
    }
  });
  test("determinisztikus és nem módosítja a bemenetet", () => {
    const legs = [startWalk, EASTBOUND(), WALK_EAST];
    const snapshot = JSON.stringify(legs);
    const a = recommendBoardingPosition(legs, 1);
    const b = recommendBoardingPosition(legs, 1);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(legs), snapshot);
  });
});

describe("feature flag, UI-bekötés, privacy", () => {
  test("flag alapból KI, csak a pontos 'true' kapcsolja be", () => {
    for (const v of [undefined, "", "false", "1", "TRUE", "yes"]) assert.equal(isBoardingGuidanceEnabled(v), false, String(v));
    assert.equal(isBoardingGuidanceEnabled("true"), true);
  });
  const root = process.cwd();
  const form = readFileSync(join(root, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
  const engine = readFileSync(join(root, "lib/vedett-route/navigation/boardingPosition.ts"), "utf8");
  test("a form a flaggel kapuz, az időzítési szelektorral és az instrukciós kártyában renderel", () => {
    assert.match(form, /isBoardingGuidanceEnabled\(process\.env\.NEXT_PUBLIC_VEDETT_ROUTE_BOARDING_GUIDANCE_ENABLED\)/);
    assert.match(form, /boardingGuidanceEnabled\s*\?\s*selectBoardingGuidanceLegIndex\(displayedJourney\.legs, activeLegIndex \?\? null, walkToTransitBoundary\.phase\)/);
    const card = form.indexOf("{navigationMode && navigationInstructionForDisplay && (");
    const ui = form.indexOf("{boardingGuidance && (");
    const preview = form.indexOf("{activeInstructionPreview && (", card);
    assert.ok(card > 0 && ui > card && ui < preview, "a boarding sor az instrukciós kártyán belül van");
  });
  test("privacy: nincs analitika, hálózat vagy tárolás az engine-ben és a boarding UI-ban", () => {
    assert.doesNotMatch(engine, /fetch\(|gtag|trackVedettRouteEvent|localStorage|sessionStorage|overpass/i);
    const uiBlock = form.slice(form.indexOf("{boardingGuidance && ("), form.indexOf("{boardingGuidance && (") + 400);
    assert.doesNotMatch(uiBlock, /track|gtag|lat|lon|stopId|routeId/i);
    const lines = form.split("\n").filter((l) => /trackVedettRouteEvent\(/.test(l));
    assert.ok(lines.every((l) => !/boarding/i.test(l)));
  });
});
