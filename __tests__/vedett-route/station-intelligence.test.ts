// VÉDETT ÚTVONAL — BKK STATION INTELLIGENCE ENGINE (2026-10-07)
//   node --test __tests__/vedett-route/station-intelligence.test.ts
//
// Szintetikus, Astoria-szerű fixture (NEM valós adat, csak a valós BKK
// feed szerkezetét követi: peronok -> közös csomópont -> [A]..[C] kijáratok,
// külön lift-bejárat).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodePolyline } from "../../lib/vedett-route/geometry.ts";
import type { JourneyLeg, RankedJourney } from "../../lib/vedett-route/types.ts";
import {
  compileStationInfrastructure,
  computeExitCandidateIds,
  isStepFreePathwayMode,
  parseStationNodeName,
  pathwayModeKind,
  selectComplexesForStops,
  type StationCompilerPathwayInput,
  type StationCompilerStopInput,
} from "../../lib/vedett-route/stationInfrastructure/compiler.ts";
import {
  buildStationGraph,
  classifyStationPathAccessibility,
  effectiveWheelchairBoarding,
  shortestPath,
} from "../../lib/vedett-route/stationInfrastructure/graph.ts";
import { buildLegStationGuidance, sanitizeExitLabel, type StationStopResolver } from "../../lib/vedett-route/stationInfrastructure/guidance.ts";
import { createBkkStationInfrastructureProvider } from "../../lib/vedett-route/stationInfrastructure/provider.ts";
import { enrichRankedJourneysWithStationGuidance } from "../../lib/vedett-route/stationInfrastructure/enrich.ts";
import { selectStationGuidanceDisplay, stationExitGuidanceText, stationPreviewText } from "../../lib/vedett-route/stationInfrastructure/display.ts";
import {
  boardingGuidanceText,
  isDisplayableBoardingRecommendation,
  recommendBoardingPosition,
} from "../../lib/vedett-route/navigation/boardingPosition.ts";
import type { LegStationGuidance } from "../../lib/vedett-route/stationInfrastructure/guidanceTypes.ts";

// --- Geometria segédek ---------------------------------------------------
const LAT0 = 47.5;
const LON0 = 19.05;
const R = 6_371_000;
const toLat = (y: number) => LAT0 + (y / R) * (180 / Math.PI);
const toLon = (x: number) => LON0 + (x / (R * Math.cos((LAT0 * Math.PI) / 180))) * (180 / Math.PI);
const line = (pts: [number, number][]) => encodePolyline(pts.map(([x, y]) => [toLon(x), toLat(y)] as const), 6);

// --- Fixture --------------------------------------------------------------
type StopSpec = [id: string, name: string, x: number | null, y: number | null, locationType: number | undefined, parent?: string, wb?: number];
function stops(specs: StopSpec[]): Record<string, StationCompilerStopInput> {
  const out: Record<string, StationCompilerStopInput> = {};
  for (const [id, name, x, y, locationType, parent, wb] of specs) {
    out[id] = {
      stopId: id,
      stopName: name,
      ...(x !== null && y !== null ? { latitude: toLat(y), longitude: toLon(x) } : {}),
      ...(locationType !== undefined ? { locationType } : {}),
      ...(parent ? { parentStation: parent } : {}),
      ...(wb !== undefined ? { wheelchairBoarding: wb } : {}),
    };
  }
  return out;
}
const pw = (id: string, from: string, to: string, mode: number, t: number | undefined, bidir = true): StationCompilerPathwayInput => ({
  pathwayId: id,
  fromStopId: from,
  toStopId: to,
  pathwayMode: mode,
  isBidirectional: bidir,
  ...(t !== undefined ? { traversalTime: t } : {}),
});

function baseStops(overrides: StopSpec[] = []): Record<string, StationCompilerStopInput> {
  const specs: StopSpec[] = [
    ["S", "Astoria", 0, 0, 1, undefined, 0],
    ["P1", "Astoria", 0, 0, 0, "S"],
    ["P2", "Astoria", 0, 5, 0, "S"],
    ["H", "Astoria", -50, 0, 2, "S"],
    ["EA", "Astoria [A]", -80, 60, 2, "S"],
    ["EB", "Astoria [B]", -80, -60, 2, "S"],
    ["EC", "Astoria [C]", -20, 60, 2, "S"],
    ["LIFT", "Astoria [lift » M2 Örs vezér tere]", 70, 10, 2, "S", 1],
    ["TRAM", "Astoria villamos", 300, 300, 0],
    ...overrides,
  ];
  const map = new Map<string, StopSpec>();
  for (const s of specs) map.set(s[0], s);
  return stops(Array.from(map.values()));
}
function basePathways(overrides: Partial<Record<string, StationCompilerPathwayInput | null>> = {}): StationCompilerPathwayInput[] {
  const base: Record<string, StationCompilerPathwayInput> = {
    PW_P1_H: pw("PW_P1_H", "P1", "H", 2, 60),
    PW_P2_H: pw("PW_P2_H", "P2", "H", 2, 60),
    PW_H_EA: pw("PW_H_EA", "H", "EA", 2, 30),
    PW_H_EB: pw("PW_H_EB", "H", "EB", 2, 30),
    PW_H_EC: pw("PW_H_EC", "H", "EC", 2, 30),
    PW_P1_LIFT: pw("PW_P1_LIFT", "P1", "LIFT", 5, 90),
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete base[k];
    else if (v) base[k] = v;
  }
  return Object.values(base);
}
function compileFixture(opts: { stops?: Record<string, StationCompilerStopInput>; pathways?: StationCompilerPathwayInput[] } = {}) {
  return compileStationInfrastructure({ provider: "BKK", dataset: "bkkgtfs", sourceGeneration: "gen1", stopsById: opts.stops ?? baseStops(), pathways: opts.pathways ?? basePathways() });
}
function resolverFor(index: ReturnType<typeof compileFixture>): StationStopResolver {
  return (motisStopId) => {
    if (!motisStopId?.startsWith("bkkgtfs_")) return null;
    const g = motisStopId.slice("bkkgtfs_".length);
    const complexId = index.complexIdByStopId[g];
    const complex = index.complexes.find((c) => c.id === complexId);
    return complex ? { complex, gtfsStopId: g } : null;
  };
}

// --- Lábak ----------------------------------------------------------------
function metro(from: [number, number], to: [number, number], toStop: string, extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    fromName: "Kezdő",
    toName: "Astoria",
    fromLat: toLat(from[1]),
    fromLon: toLon(from[0]),
    toLat: toLat(to[1]),
    toLon: toLon(to[0]),
    toStopId: `bkkgtfs_${toStop}`,
    geometryEncoded: line([from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], [to[0] - Math.sign(to[0] - from[0]) * 50, to[1]], to]),
    geometryPrecision: 6,
    durationMinutes: 5,
    realtime: false,
    ...extra,
  } as JourneyLeg;
}
const EAST = (stop = "P1", extra: Partial<JourneyLeg> = {}) => metro([-800, 0], [0, 0], stop, extra);
const WEST = (stop = "P1", extra: Partial<JourneyLeg> = {}) => metro([800, 0], [0, 0], stop, extra);
function walk(pts: [number, number][], extra: Partial<JourneyLeg> = {}): JourneyLeg {
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
    durationMinutes: 3,
    realtime: false,
    ...extra,
  } as JourneyLeg;
}
const startWalk = walk([[-900, 0], [-800, 0]]);
const walkTo = (x: number, y: number) => walk([[0, 0], [x * 0.5, y * 0.5], [x, y]]);
function nextTransitFrom(stop: string, x: number, y: number, mode = "TRAM"): JourneyLeg {
  return { mode: "TRANSIT", transitMode: mode, fromName: "X", toName: "Y", fromLat: toLat(y), fromLon: toLon(x), toLat: toLat(y + 500), toLon: toLon(x), fromStopId: `bkkgtfs_${stop}`, toStopId: "bkkgtfs_FAR", durationMinutes: 4, realtime: false } as JourneyLeg;
}
const opts = { stepFreePreferred: false };

// ==========================================================================
describe("compiler: GTFS szemantika, determinizmus, robusztusság", () => {
  test("pathway_mode explicit leképezés (1/2/5 a BKK feedben), ismeretlen -> UNKNOWN", () => {
    assert.equal(pathwayModeKind(1), "WALKWAY");
    assert.equal(pathwayModeKind(2), "STAIRS");
    assert.equal(pathwayModeKind(3), "MOVING_SIDEWALK");
    assert.equal(pathwayModeKind(4), "ESCALATOR");
    assert.equal(pathwayModeKind(5), "ELEVATOR");
    assert.equal(pathwayModeKind(6), "FARE_GATE");
    assert.equal(pathwayModeKind(7), "EXIT_GATE");
    for (const bad of [0, 8, 9, -1, 1.5, NaN, undefined, null]) assert.equal(pathwayModeKind(bad as number), "UNKNOWN");
    assert.equal(isStepFreePathwayMode(2), false);
    assert.equal(isStepFreePathwayMode(4), false, "mozgólépcső nem lépcsőmentes");
    assert.equal(isStepFreePathwayMode(5), true);
    assert.equal(isStepFreePathwayMode(9), false, "ismeretlen mód fail-safe");
  });
  test("névből csak konzervatív címkék: [A] kijárat, [lift » ...] lift + irány, (» ...) irány", () => {
    assert.deepEqual(parseStationNodeName("Astoria [A]"), { tags: ["EXIT_LABEL"], exitLabel: "A", directionHint: null });
    const lift = parseStationNodeName("Újpest-Központ [lift » M3 Kőbánya-Kispest]");
    assert.deepEqual(lift.tags, ["DIRECTION_HINT", "LIFT_LABEL"]);
    assert.equal(lift.exitLabel, null);
    assert.equal(lift.directionHint, "M3 Kőbánya-Kispest");
    assert.deepEqual(parseStationNodeName("Kálvin tér [lift]").tags, ["LIFT_LABEL"]);
    assert.equal(parseStationNodeName("Népliget (» M3 Újpest-Központ)").directionHint, "M3 Újpest-Központ");
    for (const name of ["Astoria [Ab]", "Astoria [AA]", "Astoria", "", "x".repeat(400)]) assert.equal(parseStationNodeName(name).exitLabel, null);
    assert.deepEqual(parseStationNodeName(undefined).tags, []);
  });
  test("komplexum: peronok + közös csomópont + kijáratok egy egységben; a hálózaton kívüli megálló nem kerül be", () => {
    const index = compileFixture();
    const c = index.complexes.find((x) => x.id === "S");
    assert.ok(c);
    assert.deepEqual(c.nodes.map((n) => n.id), ["EA", "EB", "EC", "H", "LIFT", "P1", "P2", "S"]);
    assert.equal(index.complexIdByStopId.TRAM, undefined);
    assert.equal(c.capability, "GRAPH_WITH_LIFT");
    assert.equal(c.liftEdgeCount, 1);
  });
  test("kijárat-jelölt: a címke nélküli elosztó csomópont (H) NEM kijárat; [A]..[C] és a lift-bejárat igen", () => {
    const c = compileFixture().complexes[0];
    assert.deepEqual(c.exitNodeIds, ["EA", "EB", "EC", "LIFT"]);
    assert.deepEqual(computeExitCandidateIds(c.nodes, c.edges), c.exitNodeIds);
  });
  test("hiányzó traversal_time -> null (nem kitalált érték); hibás sorok kimaradnak és számolódnak", () => {
    const index = compileFixture({
      pathways: [
        ...basePathways({ PW_H_EA: pw("PW_H_EA", "H", "EA", 2, undefined) }),
        { pathwayId: "BAD", fromStopId: "P1", toStopId: "NOPE", pathwayMode: 1, isBidirectional: true },
        { pathwayId: "BAD2" } as unknown as StationCompilerPathwayInput,
        pw("SELF", "P1", "P1", 1, 10),
        pw("ODD", "P2", "EB", 9, 10),
      ],
    });
    const c = index.complexes.find((x) => x.id === "S");
    assert.equal(c?.edges.find((e) => e.id === "PW_H_EA")?.traversalTime, null);
    assert.equal(c?.edgesMissingTraversalTime, 1);
    assert.equal(index.diagnostics.pathwaysWithUnknownNodes, 2);
    assert.equal(index.diagnostics.malformedPathways, 1);
    assert.equal(index.diagnostics.unknownPathwayModes, 1);
  });
  test("determinisztikus: bemeneti sorrendtől független, nincs időbélyeg; verzió + forrás-generáció benne", () => {
    const a = compileFixture();
    const b = compileFixture({ pathways: basePathways().reverse() });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.schemaVersion, 1);
    assert.equal(a.sourceGeneration, "gen1");
    assert.doesNotMatch(JSON.stringify(a), /builtAt|generatedAt/);
  });
  test("malformed bemenet nem dob", () => {
    const r = compileStationInfrastructure({ provider: "BKK", dataset: "x", sourceGeneration: "g", stopsById: null as never, pathways: "nope" as never });
    assert.equal(r.complexes.length, 0);
  });
  test("capability: GEOMETRY_ONLY / GRAPH_PARTIAL / GRAPH_USABLE / GRAPH_WITH_LIFT automatikusan", () => {
    const geom = compileFixture({ pathways: [] });
    assert.equal(geom.complexes.find((c) => c.id === "S")?.capability, "GEOMETRY_ONLY");
    const partial = compileFixture({ pathways: [pw("X", "P1", "P2", 1, 20)] });
    assert.equal(partial.complexes.find((c) => c.id === "S")?.capability, "GRAPH_PARTIAL");
    const usable = compileFixture({ pathways: basePathways({ PW_P1_LIFT: null }) });
    assert.equal(usable.complexes.find((c) => c.id === "S")?.capability, "GRAPH_USABLE");
  });
  test("station-scoped slice: csak a kért stopok komplexuma, ismeretlen stop külön listában", () => {
    const index = compileFixture();
    const slice = selectComplexesForStops(index, ["P1", "UNKNOWN_STOP"]);
    assert.deepEqual(slice.complexes.map((c) => c.id), ["S"]);
    assert.deepEqual(slice.unmatchedStopIds, ["UNKNOWN_STOP"]);
  });
  test("a sidecar compiler byte-azonos másolat (nincs elcsúszás)", () => {
    const root = process.cwd();
    const a = readFileSync(join(root, "lib/vedett-route/stationInfrastructure/compiler.ts"), "utf8");
    const b = readFileSync(join(root, "vps-accessibility-sidecar/src/lib/stationInfrastructureCompiler.ts"), "utf8");
    assert.equal(a, b);
  });
});

describe("graph + pathfinding", () => {
  const index = compileFixture();
  const graph = buildStationGraph(index.complexes.find((c) => c.id === "S")!);
  test("Dijkstra: legrövidebb út, explicit traversal_time összeg", () => {
    const p = shortestPath(graph, ["P1"], "EA", { stepFreePreferred: false });
    assert.deepEqual(p?.nodeIds, ["P1", "H", "EA"]);
    assert.equal(p?.totalSeconds, 90);
    assert.equal(p?.hasEstimatedCost, false);
    assert.equal(p?.usesStairs, true);
  });
  test("bidirectional él visszafelé is járható; egyirányú csak a deklarált irányban", () => {
    const oneWay = buildStationGraph(compileFixture({ pathways: basePathways({ PW_P1_LIFT: pw("PW_P1_LIFT", "LIFT", "P1", 5, 90, false) }) }).complexes.find((c) => c.id === "S")!);
    assert.equal(shortestPath(oneWay, ["P1"], "LIFT", { stepFreePreferred: false }), null);
    assert.ok(shortestPath(oneWay, ["LIFT"], "P1", { stepFreePreferred: false }));
    assert.ok(shortestPath(graph, ["LIFT"], "P1", { stepFreePreferred: false }), "bidirectional");
  });
  test("lépcsőmentes preferencia: lépcső él kizárva, lift él használható", () => {
    assert.equal(shortestPath(graph, ["P1"], "EA", { stepFreePreferred: true }), null);
    const lift = shortestPath(graph, ["P1"], "LIFT", { stepFreePreferred: true });
    assert.equal(lift?.usesLift, true);
  });
  test("hiányzó traversal_time: az él használható, de a költség csak becslés", () => {
    const g = buildStationGraph(compileFixture({ pathways: basePathways({ PW_H_EA: pw("PW_H_EA", "H", "EA", 2, undefined) }) }).complexes.find((c) => c.id === "S")!);
    const p = shortestPath(g, ["P1"], "EA", { stepFreePreferred: false });
    assert.ok(p);
    assert.equal(p.hasEstimatedCost, true);
  });
  test("determinisztikus egyenlő költségnél", () => {
    const a = shortestPath(graph, ["P1"], "EB", { stepFreePreferred: false });
    const b = shortestPath(graph, ["P1"], "EB", { stepFreePreferred: false });
    assert.deepEqual(a, b);
  });
});

describe("akadálymentesség", () => {
  test("lift él felismerése; lift + explicit wheelchair_boarding=1 cél -> STEP_FREE_CONFIRMED", () => {
    const index = compileFixture();
    const graph = buildStationGraph(index.complexes.find((c) => c.id === "S")!);
    const p = shortestPath(graph, ["P1"], "LIFT", { stepFreePreferred: true });
    assert.equal(classifyStationPathAccessibility(p, graph), "STEP_FREE_CONFIRMED");
  });
  test("lift, de a cél akadálymentessége nem bizonyított -> HAS_LIFT (nem step-free)", () => {
    const index = compileFixture({ stops: baseStops([["LIFT", "Astoria [lift » M2 Örs vezér tere]", 70, 10, 2, "S", 0]]) });
    const graph = buildStationGraph(index.complexes.find((c) => c.id === "S")!);
    const p = shortestPath(graph, ["P1"], "LIFT", { stepFreePreferred: true });
    assert.equal(classifyStationPathAccessibility(p, graph), "HAS_LIFT");
  });
  test("lift megléte != step-free: lift + lépcső vegyes út -> UNKNOWN", () => {
    const index = compileFixture({
      stops: baseStops([["M", "Astoria", 40, 0, 3, "S"], ["EZ", "Astoria [Z]", 90, 40, 2, "S", 1]]),
      pathways: [...basePathways(), pw("L2", "P1", "M", 5, 60), pw("ST", "M", "EZ", 2, 20)],
    });
    const graph = buildStationGraph(index.complexes.find((c) => c.id === "S")!);
    const p = shortestPath(graph, ["P1"], "EZ", { stepFreePreferred: false });
    assert.equal(p?.usesLift, true);
    assert.equal(classifyStationPathAccessibility(p, graph), "ACCESSIBILITY_UNKNOWN");
  });
  test("hiányos út -> UNKNOWN", () => {
    const graph = buildStationGraph(compileFixture().complexes.find((c) => c.id === "S")!);
    assert.equal(classifyStationPathAccessibility(null, graph), "ACCESSIBILITY_UNKNOWN");
  });
  test("wheelchair_boarding GTFS szemantika: gyerek 0 örököl, explicit 1/2 felülír, szülő nélkül 0 = ismeretlen", () => {
    const index = compileFixture({ stops: baseStops([["S", "Astoria", 0, 0, 1, undefined, 1], ["P2", "Astoria", 0, 5, 0, "S", 2], ["TRAM", "Astoria villamos", 300, 300, 0, undefined, 0]]) });
    const graph = buildStationGraph(index.complexes.find((c) => c.id === "S")!);
    assert.equal(effectiveWheelchairBoarding(graph.nodes.get("P1"), graph), 1, "öröklés");
    assert.equal(effectiveWheelchairBoarding(graph.nodes.get("P2"), graph), 2, "explicit nem");
    assert.equal(effectiveWheelchairBoarding(undefined, graph), null);
    const lone = buildStationGraph({ ...index.complexes[0], nodes: [{ id: "Q", name: null, lat: 1, lon: 1, locationType: 0, parentStationId: null, wheelchairBoarding: 0, tags: [], exitLabel: null, directionHint: null }], edges: [] });
    assert.equal(effectiveWheelchairBoarding(lone.nodes.get("Q"), lone), null);
  });
  test("[lift] a névben explicit lift-él nélkül NEM tesz semmit akadálymentessé; az explicit él erősebb", () => {
    const index = compileFixture({
      stops: baseStops([["LIFT", "Astoria [lift]", 70, 10, 2, "S", 0]]),
      pathways: basePathways({ PW_P1_LIFT: pw("PW_P1_LIFT", "P1", "LIFT", 2, 40) }),
    });
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(140, 20)], 1, resolverFor(index), opts);
    assert.equal(g?.exit?.accessibility, "ACCESSIBILITY_UNKNOWN");
    assert.ok(!g?.exit?.reasonCodes.includes("LIFT_PATH_AVAILABLE"));
    assert.equal(index.complexes.find((c) => c.id === "S")?.capability, "GRAPH_USABLE");
  });
});

describe("exit selection", () => {
  const index = compileFixture();
  const resolve = resolverFor(index);
  test("több kijárat közül a célhoz legjobb (A), indokkódokkal, HIGH bizonyossággal", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(-160, 180)], 1, resolve, opts);
    assert.equal(g?.status, "EXIT_SELECTED");
    assert.equal(g?.exit?.label, "A");
    assert.equal(g?.exit?.confidence, "HIGH");
    assert.equal(g?.exit?.internalTraversalSeconds, 90);
    assert.ok(g?.exit?.reasonCodes.includes("BEST_EXIT_FOR_DESTINATION"));
    assert.ok(g?.exit?.reasonCodes.includes("EXPLICIT_GTFS_PATHWAY"));
    assert.ok(g?.exit?.reasonCodes.includes("SHORTER_WALK_AFTER_EXIT"));
  });
  test("belső traversal_time megváltoztatja a választást; nem mindig a légvonalban legközelebbi nyer", () => {
    const target = walkTo(20, 140);
    const base = buildLegStationGuidance([startWalk, EAST(), target], 1, resolve, opts);
    assert.equal(base?.exit?.label, "C");
    const slow = compileFixture({ pathways: basePathways({ PW_H_EC: pw("PW_H_EC", "H", "EC", 2, 600) }) });
    const g = buildLegStationGuidance([startWalk, EAST(), target], 1, resolverFor(slow), opts);
    assert.notEqual(g?.exit?.label, "C");
    assert.ok(g?.exit?.reasonCodes.includes("SHORTER_STATION_PATH"));
  });
  test("lekapcsolt kijárat (nincs pathway) és koordináta nélküli kijárat nem választható", () => {
    const idx = compileFixture({ stops: baseStops([["ED", "Astoria [D]", 0, 100, 2, "S"], ["EE", "Astoria [E]", null, null, 2, "S"]]), pathways: [...basePathways(), pw("PW_H_EE", "H", "EE", 2, 10)] });
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(0, 200)], 1, resolverFor(idx), opts);
    assert.ok(g?.exit?.label && !["D", "E"].includes(g.exit.label));
  });
  test("egyenlő pontszámnál determinisztikus döntés (címke szerint)", () => {
    const idx = compileFixture({
      stops: baseStops([["EA", "Astoria [A]", -50, 60, 2, "S"], ["EB", "Astoria [B]", -50, -60, 2, "S"]]),
    });
    const g1 = buildLegStationGuidance([startWalk, EAST(), walkTo(-400, 0)], 1, resolverFor(idx), opts);
    const g2 = buildLegStationGuidance([startWalk, EAST(), walkTo(-400, 0)], 1, resolverFor(idx), opts);
    assert.deepEqual(g1, g2);
    assert.equal(g1?.exit?.label, "A");
  });
  test("hiányzó traversal_time: MEDIUM és nincs közölt másodperc", () => {
    const idx = compileFixture({ pathways: basePathways({ PW_H_EA: pw("PW_H_EA", "H", "EA", 2, undefined) }) });
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(-200, 60)], 1, resolverFor(idx), opts);
    assert.equal(g?.exit?.label, "A");
    assert.equal(g?.exit?.confidence, "MEDIUM");
    assert.equal(g?.exit?.internalTraversalSeconds, null);
  });
  test("gyalogos geometria nélküli cél -> MEDIUM (egyenes vonal)", () => {
    const w = walkTo(-160, 180);
    const g = buildLegStationGuidance([startWalk, EAST(), { ...w, geometryEncoded: undefined }], 1, resolve, opts);
    assert.equal(g?.exit?.targetBasis, "STRAIGHT_LINE_TARGET");
    assert.equal(g?.exit?.confidence, "MEDIUM");
  });
  test("nincs cél (az út az állomáson ér véget) -> NO_TARGET", () => {
    assert.equal(buildLegStationGuidance([startWalk, EAST()], 1, resolve, opts)?.status, "NO_TARGET");
  });
  test("ismeretlen állomás / nincs infrastruktúra -> null (LEVEL 2 fallback)", () => {
    assert.equal(buildLegStationGuidance([startWalk, EAST("NOPE"), walkTo(10, 10)], 1, resolve, opts), null);
    const geom = compileFixture({ pathways: [] });
    assert.equal(buildLegStationGuidance([startWalk, EAST(), walkTo(10, 10)], 1, resolverFor(geom), opts)?.status, "NO_STATION_GRAPH");
  });
  test("lépcsőmentes preferencia: a lift-kijárat nyer, és STEP_FREE + LIFT kódot kap", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(-160, 180)], 1, resolve, { stepFreePreferred: true });
    assert.equal(g?.exit?.label, null, "a lift-bejáratnak nincs betűcímkéje — nem találunk ki");
    assert.ok(g?.exit?.reasonCodes.includes("LIFT_PATH_AVAILABLE"));
    assert.ok(g?.exit?.reasonCodes.includes("STEP_FREE_PATH_AVAILABLE"));
  });
  test("a kliensnek átadott guidance nem tartalmaz nyers GTFS azonosítót", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), walkTo(-160, 180), nextTransitFrom("P2", 0, 5)], 1, resolve, opts);
    const json = JSON.stringify(g);
    for (const id of ['"P1"', '"P2"', '"H"', '"EA"', "PW_", "bkkgtfs"]) assert.ok(!json.includes(id), id);
  });
});

describe("transfer guidance", () => {
  const index = compileFixture();
  const resolve = resolverFor(index);
  test("ugyanazon komplexum: belső út, explicit idő, boarding-cél a közös csomópont", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), walk([[0, 0], [0, 5]]), nextTransitFrom("P2", 0, 5, "SUBWAY")], 1, resolve, opts);
    assert.equal(g?.status, "TRANSFER_PATH");
    assert.equal(g?.transfer?.traversalSeconds, 120);
    assert.equal(g?.transfer?.confidence, "HIGH");
    assert.ok(g?.transfer?.reasonCodes.includes("EXPLICIT_GTFS_PATHWAY"));
    assert.equal(g?.transfer?.liftAvailable, false);
    assert.equal(g?.boardingTarget?.targetType, "TRANSFER");
  });
  test("közvetlen TRANSIT->TRANSIT átszállás is működik", () => {
    assert.equal(buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P2", 0, 5, "SUBWAY")], 1, resolve, opts)?.status, "TRANSFER_PATH");
  });
  test("lift-út átszálláshoz", () => {
    const idx = compileFixture({ pathways: [...basePathways(), pw("PW_LIFT_P2", "LIFT", "P2", 5, 30)] });
    const g = buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P2", 0, 5, "SUBWAY")], 1, resolverFor(idx), opts);
    assert.equal(g?.transfer?.liftAvailable, true);
    assert.ok(g?.transfer?.reasonCodes.includes("LIFT_PATH_AVAILABLE"));
  });
  test("eltérő szülőállomás / hálózaton kívüli következő megálló -> kijárat a következő megálló felé", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), walk([[0, 0], [300, 300]]), nextTransitFrom("TRAM", 300, 300)], 1, resolve, opts);
    assert.equal(g?.status, "EXIT_SELECTED");
    assert.ok(g?.exit?.reasonCodes.includes("BEST_EXIT_FOR_TRANSFER"));
    assert.equal(g?.exit?.targetBasis, "NEXT_STOP_COORDINATE");
  });
  test("lekapcsolt gráf a komplexumon belül (nincs út) -> nincs transfer, kijárat-fallback", () => {
    const idx = compileFixture({ stops: baseStops([["P3", "Astoria", 100, 100, 0, "S"]]) });
    const g = buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P3", 100, 100, "SUBWAY")], 1, resolverFor(idx), opts);
    assert.notEqual(g?.status, "TRANSFER_PATH");
  });
  test("több lehetséges út közül a determinisztikusan legrövidebb", () => {
    const idx = compileFixture({ pathways: [...basePathways(), pw("DIRECT", "P1", "P2", 1, 45)] });
    const g = buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P2", 0, 5, "SUBWAY")], 1, resolverFor(idx), opts);
    assert.equal(g?.transfer?.traversalSeconds, 45);
  });
  test("ugyanarról a peronról induló következő járat: nincs kitalált belső út", () => {
    const g = buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P1", 0, 0, "SUBWAY")], 1, resolve, opts);
    assert.equal(g?.status, "NO_TARGET");
    assert.equal(g?.transfer, undefined);
  });
});

describe("boarding-position integráció", () => {
  const index = compileFixture();
  const resolve = resolverFor(index);
  const withGuidance = (legs: JourneyLeg[], i = 1): JourneyLeg[] => legs.map((l, k) => (k === i ? { ...l, stationGuidance: buildLegStationGuidance(legs, i, resolve, opts) ?? undefined } : l));
  test("az állomás-csomópont cél felülírja a gyalogos geometriát (keletre tartó járat, a kijárati út nyugat felé indul -> REAR)", () => {
    const legs = [startWalk, EAST(), walkTo(140, 0)];
    assert.equal(recommendBoardingPosition(legs, 1).position, "FRONT", "geometria szerint előre");
    const r = recommendBoardingPosition(withGuidance([startWalk, EAST(), walkTo(-160, 180)]), 1);
    assert.equal(r.basis, "STATION_PATHWAY_NODE");
    assert.equal(r.position, "REAR");
    assert.equal(r.level, 3);
    assert.equal(r.confidence, "MEDIUM", "explicit infrastruktúra sem ad HIGH-t (a kocsi-pozíció ismeretlen)");
    assert.ok(r.reasonCodes.includes("CLOSER_TO_EXIT"));
  });
  test("irányváltás: ugyanarra a fizikai csomópontra FRONT <-> REAR", () => {
    const east = recommendBoardingPosition(withGuidance([startWalk, EAST(), walkTo(-160, 180)]), 1);
    const westLegs = [walk([[900, 0], [800, 0]]), WEST(), walkTo(-160, 180)];
    const west = recommendBoardingPosition(withGuidance(westLegs), 1);
    assert.equal(east.position, "REAR");
    assert.equal(west.position, "FRONT");
  });
  test("FRONT a lift-bejárat felé (lépcsőmentes preferencia)", () => {
    const legs = [startWalk, EAST(), walkTo(-160, 180)];
    const g = buildLegStationGuidance(legs, 1, resolve, { stepFreePreferred: true }) ?? undefined;
    const r = recommendBoardingPosition([legs[0], { ...legs[1], stationGuidance: g }, legs[2]], 1);
    assert.equal(r.position, "FRONT");
    assert.ok(isDisplayableBoardingRecommendation(r));
  });
  test("MIDDLE csak a tengely közepén, és akkor sem jelenik meg (LOW)", () => {
    const g: LegStationGuidance = { schemaVersion: 1, status: "EXIT_SELECTED", capability: "GRAPH_USABLE", interchangeComplex: false, stationPathConfidence: "HIGH", boardingTarget: { lat: toLat(60), lon: toLon(2), basis: "STATION_PATHWAY_NODE", targetType: "DESTINATION" } };
    const r = recommendBoardingPosition([startWalk, EAST("P1", { stationGuidance: g }), walkTo(140, 0)], 1);
    assert.equal(r.position, "MIDDLE");
    assert.equal(isDisplayableBoardingRecommendation(r), false);
  });
  test("komplex állomás (név) explicit gráffal már értékelhető; gráf nélkül UNKNOWN", () => {
    const legs = [startWalk, EAST("P1", { toName: "Deák Ferenc tér" }), walkTo(-160, 180)];
    assert.equal(recommendBoardingPosition(legs, 1).unknownReason, "COMPLEX_STATION");
    assert.equal(recommendBoardingPosition(withGuidance(legs), 1).position, "REAR");
  });
  test("a szerver szerint többállomásos komplexum, használható célpont nélkül -> UNKNOWN", () => {
    const g: LegStationGuidance = { schemaVersion: 1, status: "NO_CONNECTED_EXIT", capability: "GRAPH_PARTIAL", interchangeComplex: true, stationPathConfidence: "NONE" };
    const r = recommendBoardingPosition([startWalk, EAST("P1", { stationGuidance: g }), walkTo(140, 0)], 1);
    assert.equal(r.unknownReason, "COMPLEX_STATION");
  });
  test("hibás boardingTarget -> figyelmen kívül, geometria-fallback", () => {
    const bad = { schemaVersion: 1, status: "EXIT_SELECTED", capability: "GRAPH_USABLE", interchangeComplex: false, stationPathConfidence: "HIGH", boardingTarget: { lat: NaN, lon: 1, basis: "STATION_PATHWAY_NODE", targetType: "DESTINATION" } } as unknown as LegStationGuidance;
    const r = recommendBoardingPosition([startWalk, EAST("P1", { stationGuidance: bad }), walkTo(140, 0)], 1);
    assert.equal(r.basis, "WALK_PATH_GEOMETRY");
  });
  test("busz / gyalogos láb továbbra sem kap ajánlást; szövegben soha kocsi vagy ajtó", () => {
    const legs = withGuidance([startWalk, EAST("P1", { transitMode: "BUS" }), walkTo(-160, 180)]);
    assert.equal(recommendBoardingPosition(legs, 1).unknownReason, "UNSUPPORTED_MODE");
    assert.equal(recommendBoardingPosition(legs, 0).unknownReason, "NOT_TRANSIT");
    const t = boardingGuidanceText(recommendBoardingPosition(withGuidance([startWalk, EAST(), walkTo(-160, 180)]), 1));
    assert.equal(t?.title, "Érdemes lehet a szerelvény vége felé utazni");
    assert.doesNotMatch(`${t?.title} ${t?.detail}`, /\d|kocsi|ajtó|akadálymentes/i);
  });
});

describe("megjelenítés: fázis, szöveg, címke", () => {
  const index = compileFixture();
  const resolve = resolverFor(index);
  const legs = [startWalk, EAST(), walkTo(-160, 180)];
  const guided = legs.map((l, i) => (i === 1 ? { ...l, stationGuidance: buildLegStationGuidance(legs, 1, resolve, opts) ?? undefined } : l));
  const base = { legs: guided, alightingReady: false, activeWalkDistanceAlongMeters: null };
  test("BOARDING csak a felszállás előtti fázisban", () => {
    assert.deepEqual(selectStationGuidanceDisplay({ ...base, activeLegIndex: 0, walkToTransitPhase: "APPROACHING_BOARDING" }), { kind: "BOARDING", legIndex: 1 });
    assert.equal(selectStationGuidanceDisplay({ ...base, activeLegIndex: 0, walkToTransitPhase: "WALKING" }), null);
  });
  test("EXIT: leszálláshoz közeledve (alightingReady) és leszállás után a gyalogos szakasz elején", () => {
    assert.equal(selectStationGuidanceDisplay({ ...base, activeLegIndex: 1, walkToTransitPhase: "BOARDED" }), null);
    assert.deepEqual(selectStationGuidanceDisplay({ ...base, activeLegIndex: 1, walkToTransitPhase: "BOARDED", alightingReady: true }), { kind: "EXIT", legIndex: 1 });
    assert.deepEqual(selectStationGuidanceDisplay({ ...base, activeLegIndex: 2, walkToTransitPhase: "NOT_APPLICABLE", activeWalkDistanceAlongMeters: 40 }), { kind: "EXIT", legIndex: 1 });
    assert.equal(selectStationGuidanceDisplay({ ...base, activeLegIndex: 2, walkToTransitPhase: "NOT_APPLICABLE", activeWalkDistanceAlongMeters: 400 }), null);
    assert.equal(selectStationGuidanceDisplay({ ...base, activeLegIndex: 0, walkToTransitPhase: "NOT_APPLICABLE" }), null, "első gyalogos láb előtt nincs leszállás");
  });
  test("kijárat-szöveg a bizonyossághoz igazodik; LOW/NONE -> nincs szöveg", () => {
    const t = stationExitGuidanceText(guided[1].stationGuidance);
    assert.equal(t?.title, "Az „A” kijárat lehet a kedvezőbb.");
    assert.equal(t?.detail, "Innen kevesebb gyaloglásra lehet szükség.");
    const low = { ...guided[1].stationGuidance!, exit: { ...guided[1].stationGuidance!.exit!, confidence: "LOW" as const } };
    assert.equal(stationExitGuidanceText(low), null);
    assert.equal(stationExitGuidanceText(undefined), null);
  });
  test("címke-szanitizálás: belső GTFS ID soha nem jelenik meg", () => {
    assert.equal(sanitizeExitLabel("LM2ASA"), null);
    assert.equal(sanitizeExitLabel("F01018"), null);
    assert.equal(sanitizeExitLabel("B"), "B");
    const g = { ...guided[1].stationGuidance!, exit: { ...guided[1].stationGuidance!.exit!, label: "LM2ASA" } };
    assert.equal(stationExitGuidanceText(g), null);
  });
  test("lift: csak 'liftes kapcsolat ismert', soha 'akadálymentes'; átszállás szöveg", () => {
    const sf = buildLegStationGuidance(legs, 1, resolve, { stepFreePreferred: true });
    const t = stationExitGuidanceText(sf);
    assert.equal(t?.liftNote, "Liftes kapcsolat is ismert ehhez a kijárathoz.");
    const tr = stationExitGuidanceText(buildLegStationGuidance([startWalk, EAST(), nextTransitFrom("P2", 0, 5, "SUBWAY")], 1, resolve, opts));
    assert.equal(tr?.title, "Átszállás az állomáson belül");
    assert.equal(tr?.detail, "A belső útvonal a BKK adatai szerint kb. 2 perc.");
    for (const x of [t, tr]) assert.doesNotMatch(JSON.stringify(x), /akadálymentes|kocsi|ajtó/i);
  });
  test("útvonal-előnézet: rövid sor, csak megfelelő bizonyosságnál", () => {
    assert.equal(stationPreviewText(guided[1].stationGuidance), "Ajánlott kijárat: A");
    assert.equal(stationPreviewText(undefined), null);
  });
});

describe("provider + enrichment (fail-open, cache)", () => {
  const index = compileFixture();
  const sliceBody = (generation = "gen1") => ({ ok: true, status: "ok", schemaVersion: 1, generation, ...selectComplexesForStops(index, ["P1"]) });
  const config = { baseUrl: "https://route.example/accessibility", authToken: "t", timeoutMs: 1000 };
  function fakeFetch(bodies: unknown[], calls: { n: number; urls: string[] }) {
    return (async (url: string) => {
      calls.n++;
      calls.urls.push(String(url));
      const body = bodies[Math.min(calls.n - 1, bodies.length - 1)];
      if (body === 500) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;
  }
  test("sikeres lookup + cache: második hívás nem megy hálózatra", async () => {
    const calls = { n: 0, urls: [] as string[] };
    const p = createBkkStationInfrastructureProvider({ config, fetchImpl: fakeFetch([sliceBody()], calls) });
    const a = await p.lookup(["bkkgtfs_P1"]);
    assert.ok(a?.resolve("bkkgtfs_P1"));
    assert.equal(calls.urls[0], "https://route.example/accessibility/station-infrastructure");
    await p.lookup(["bkkgtfs_P1"]);
    assert.equal(calls.n, 1);
  });
  test("generáció-váltás üríti a cache-t", async () => {
    let t = 0;
    const calls = { n: 0, urls: [] as string[] };
    const p = createBkkStationInfrastructureProvider({ config, fetchImpl: fakeFetch([sliceBody("g1"), sliceBody("g2")], calls), now: () => t, ttlMs: 10 });
    assert.equal((await p.lookup(["bkkgtfs_P1"]))?.generation, "g1");
    t = 100;
    assert.equal((await p.lookup(["bkkgtfs_P1"]))?.generation, "g2");
  });
  test("nincs konfiguráció / 500 / hibás body / séma-eltérés / unavailable / ismeretlen provider -> null", async () => {
    const calls = { n: 0, urls: [] as string[] };
    assert.equal(await createBkkStationInfrastructureProvider({ config: null, fetchImpl: fakeFetch([sliceBody()], calls) }).lookup(["bkkgtfs_P1"]), null);
    for (const body of [500, { nope: 1 }, { ...sliceBody(), schemaVersion: 99 }, { ok: true, status: "unavailable", generation: null, complexes: [] }]) {
      assert.equal(await createBkkStationInfrastructureProvider({ config, fetchImpl: fakeFetch([body], { n: 0, urls: [] }) }).lookup(["bkkgtfs_P1"]), null);
    }
    const c2 = { n: 0, urls: [] as string[] };
    assert.equal(await createBkkStationInfrastructureProvider({ config, fetchImpl: fakeFetch([sliceBody()], c2) }).lookup(["mavgtfs_X", "foo"]), null);
    assert.equal(c2.n, 0);
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    assert.equal(await createBkkStationInfrastructureProvider({ config, fetchImpl: throwing }).lookup(["bkkgtfs_P1"]), null);
  });
  const ranked = (): RankedJourney[] => [{ journey: { legs: [startWalk, EAST(), walkTo(-160, 180)] } as never, labels: [], explanation: "" }];
  test("enrichment csatolja a guidance-t, a rangsort nem módosítja", async () => {
    const p = createBkkStationInfrastructureProvider({ config, fetchImpl: fakeFetch([sliceBody()], { n: 0, urls: [] }) });
    const out = await enrichRankedJourneysWithStationGuidance(ranked(), p, { stepFreePreferred: false });
    assert.equal(out[0].journey.legs[1].stationGuidance?.exit?.label, "A");
    assert.equal(out[0].labels.length, 0);
  });
  test("enrichment fail-open: provider null / dob / időtúllépés -> változatlan", async () => {
    const r = ranked();
    assert.equal(await enrichRankedJourneysWithStationGuidance(r, { providerId: "X", lookup: async () => null }, { stepFreePreferred: false }), r);
    assert.equal(await enrichRankedJourneysWithStationGuidance(r, { providerId: "X", lookup: async () => { throw new Error("x"); } }, { stepFreePreferred: false }), r);
    const slow = { providerId: "X", lookup: () => new Promise<null>(() => {}) };
    assert.equal(await enrichRankedJourneysWithStationGuidance(r, slow, { stepFreePreferred: false, timeBudgetMs: 20 }), r);
  });
});

describe("bekötés, flag, privacy (forrás-ellenőrzés)", () => {
  const root = process.cwd();
  const form = readFileSync(join(root, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
  const route = readFileSync(join(root, "app/api/admin/vedett-utvonal/search/route.ts"), "utf8");
  const orchestrator = readFileSync(join(root, "lib/vedett-route/orchestrator.ts"), "utf8");
  const files = ["compiler.ts", "graph.ts", "guidance.ts", "guidanceTypes.ts", "display.ts", "provider.ts", "enrich.ts", "debug.ts"].map((f) =>
    readFileSync(join(root, "lib/vedett-route/stationInfrastructure", f), "utf8")
  );
  test("szerver: a provider csak a flaggel kerül be; az orchestrator provider nélkül változatlan", () => {
    assert.match(route, /isBoardingGuidanceEnabled\(process\.env\.NEXT_PUBLIC_VEDETT_ROUTE_BOARDING_GUIDANCE_ENABLED\)\s*\n?\s*\?\s*\{ stationInfrastructureProvider: getServerStationInfrastructureProvider\(\) \}/);
    assert.match(orchestrator, /const ranked = options\.stationInfrastructureProvider\s*\n?\s*\? await enrichRankedJourneysWithStationGuidance/);
    assert.match(orchestrator, /: rankedBase;/);
  });
  test("kliens: kijárat-blokk csak boarding nélkül, a flag mögött; előnézet a flag mögött", () => {
    assert.match(form, /const stationGuidanceDisplay = boardingGuidanceEnabled\s*\n?\s*\? selectStationGuidanceDisplay\(/);
    assert.match(form, /\{!boardingGuidance && stationExitGuidance && \(/);
    assert.match(form, /stationGuidancePreviewEnabled && stationPreviewText\(leg\.stationGuidance\)/);
    assert.match(form, /const stationGuidancePreviewEnabled = boardingGuidanceEnabled;/);
  });
  test("privacy: nincs analitika / tárolás / Overpass a station intelligence rétegben", () => {
    for (const src of files) assert.doesNotMatch(src, /gtag|trackVedettRouteEvent|localStorage|sessionStorage|overpass|navigator\.geolocation/i);
    const block = form.slice(form.indexOf("{!boardingGuidance && stationExitGuidance && ("), form.indexOf("{!boardingGuidance && stationExitGuidance && (") + 700);
    assert.doesNotMatch(block, /track|gtag|stopId|routeId/);
  });
  test("a kliens bundle-be kerülő display/guidanceTypes nem húzza be a gráfot/compilert", () => {
    const display = files[4];
    assert.doesNotMatch(display, /from "\.\/(compiler|graph|guidance|provider)\.ts"/);
  });
});
