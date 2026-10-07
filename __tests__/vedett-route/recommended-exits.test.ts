// VÉDETT ÚTVONAL — "AJÁNLOTT KIJÁRAT" v1 (RECOMMENDED METRO EXITS) (2026-10-07)
//   node --test __tests__/vedett-route/recommended-exits.test.ts
//
// Szintetikus, általános BKK-szerű állomás (NEM valós adat): peronok -> közös
// csomópont -> címkézett kijáratok pathway-jel; egy pathway nélküli kijárat.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodePolyline } from "../../lib/vedett-route/geometry.ts";
import type { JourneyLeg, RankedJourney } from "../../lib/vedett-route/types.ts";
import {
  compileStationInfrastructure,
  type StationCompilerPathwayInput,
  type StationCompilerStopInput,
} from "../../lib/vedett-route/stationInfrastructure/compiler.ts";
import { buildLegStationGuidance, exitWalkingKey, type ExitWalkingRequest, type StationStopResolver } from "../../lib/vedett-route/stationInfrastructure/guidance.ts";
import { enrichRankedJourneysWithStationGuidance } from "../../lib/vedett-route/stationInfrastructure/enrich.ts";
import { hungarianArticle, recommendedExitText, selectStationGuidanceDisplay, stationExitGuidanceText } from "../../lib/vedett-route/stationInfrastructure/display.ts";

const LAT0 = 47.5;
const LON0 = 19.05;
const R = 6_371_000;
const lat = (y: number) => LAT0 + (y / R) * (180 / Math.PI);
const lon = (x: number) => LON0 + (x / (R * Math.cos((LAT0 * Math.PI) / 180))) * (180 / Math.PI);
const line = (pts: [number, number][]) => encodePolyline(pts.map(([x, y]) => [lon(x), lat(y)] as const), 6);

// Állomás: ST (station), PL1/PL2 peronok, HUB közös csomópont, X1..X6 kijáratok
// körben, NOPATH egy pathway nélküli kijárat a cél mellett.
const EXITS: [string, number, number][] = [
  ["A", -80, 60],
  ["B", 0, 90],
  ["C", 80, 60],
  ["D", 80, -60],
  ["E", 0, -90],
  ["F", -80, -60],
];
function stops(): Record<string, StationCompilerStopInput> {
  const out: Record<string, StationCompilerStopInput> = {
    ST: { stopId: "ST", stopName: "Példa tér", latitude: lat(0), longitude: lon(0), locationType: 1 },
    PL1: { stopId: "PL1", stopName: "Példa tér", latitude: lat(0), longitude: lon(0), locationType: 0, parentStation: "ST" },
    PL2: { stopId: "PL2", stopName: "Példa tér", latitude: lat(5), longitude: lon(0), locationType: 0, parentStation: "ST" },
    HUB: { stopId: "HUB", stopName: "Példa tér", latitude: lat(0), longitude: lon(-10), locationType: 2, parentStation: "ST" },
    NOPATH: { stopId: "NOPATH", stopName: "Példa tér [K]", latitude: lat(300), longitude: lon(300), locationType: 2, parentStation: "ST" },
    TRAMSTOP: { stopId: "TRAMSTOP", stopName: "Példa tér villamos", latitude: lat(200), longitude: lon(-200), locationType: 0 },
  };
  for (const [l, x, y] of EXITS) out[`X${l}`] = { stopId: `X${l}`, stopName: `Példa tér [${l}]`, latitude: lat(y), longitude: lon(x), locationType: 2, parentStation: "ST" };
  return out;
}
function pathways(): StationCompilerPathwayInput[] {
  const p: StationCompilerPathwayInput[] = [
    { pathwayId: "P1", fromStopId: "PL1", toStopId: "HUB", pathwayMode: 2, isBidirectional: true, traversalTime: 60 },
    { pathwayId: "P2", fromStopId: "PL2", toStopId: "HUB", pathwayMode: 2, isBidirectional: true, traversalTime: 60 },
  ];
  for (const [l] of EXITS) p.push({ pathwayId: `PX${l}`, fromStopId: "HUB", toStopId: `X${l}`, pathwayMode: 1, isBidirectional: true, traversalTime: 30 });
  return p;
}
const INDEX = compileStationInfrastructure({ provider: "BKK", dataset: "bkkgtfs", sourceGeneration: "g", stopsById: stops(), pathways: pathways() });
const resolve: StationStopResolver = (motisStopId) => {
  if (!motisStopId?.startsWith("bkkgtfs_")) return null;
  const g = motisStopId.slice("bkkgtfs_".length);
  const complex = INDEX.complexes.find((c) => c.id === INDEX.complexIdByStopId[g]);
  return complex ? { complex, gtfsStopId: g } : null;
};

function metro(toStopId = "bkkgtfs_PL1", extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    fromName: "Kezdő",
    toName: "Példa tér",
    fromLat: lat(0),
    fromLon: lon(-900),
    toLat: lat(0),
    toLon: lon(0),
    toStopId,
    geometryEncoded: line([[-900, 0], [-400, 0], [-60, 0], [0, 0]]),
    geometryPrecision: 6,
    durationMinutes: 5,
    realtime: false,
    ...extra,
  } as JourneyLeg;
}
function walk(to: [number, number], extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return { mode: "WALK", fromName: "Példa tér", toName: "Cél", fromLat: lat(0), fromLon: lon(0), toLat: lat(to[1]), toLon: lon(to[0]), geometryEncoded: line([[0, 0], to]), geometryPrecision: 6, durationMinutes: 6, realtime: false, ...extra } as JourneyLeg;
}
function tram(fromStopId: string, x: number, y: number, mode = "TRAM"): JourneyLeg {
  return { mode: "TRANSIT", transitMode: mode, fromName: "V", toName: "W", fromLat: lat(y), fromLon: lon(x), toLat: lat(y + 800), toLon: lon(x), fromStopId, toStopId: "bkkgtfs_FAR", durationMinutes: 4, realtime: false } as JourneyLeg;
}
const firstWalk = walk([-950, 0]);
const opts = { stepFreePreferred: false };

describe("stop -> parent_station -> kijáratok feloldása", () => {
  test("1. peron stop_id (bkkgtfs_PL1) -> komplexum -> kijárat a végső célhoz", () => {
    const g = buildLegStationGuidance([firstWalk, metro(), walk([60, 300])], 1, resolve, opts);
    assert.equal(g?.status, "EXIT_SELECTED");
    assert.equal(g?.exit?.label, "B");
    assert.equal(g?.exit?.targetBasis, "WALK_DESTINATION");
    assert.ok(g?.exit?.reasonCodes.includes("BEST_EXIT_FOR_DESTINATION"));
  });
  test("2. parent/cluster ID (bkkgtfs_ST) közvetlenül kezelve; a peron nem egyértelmű -> MEDIUM", () => {
    const g = buildLegStationGuidance([firstWalk, metro("bkkgtfs_ST"), walk([60, 300])], 1, resolve, opts);
    assert.equal(g?.status, "EXIT_SELECTED");
    assert.equal(g?.exit?.label, "B");
    assert.equal(g?.exit?.confidence, "MEDIUM");
  });
  test("nincs string-konvenciós parent-képzés: a feloldás csak a GTFS parent_station mezőn alapul", () => {
    const src = readFileSync(join(process.cwd(), "lib/vedett-route/stationInfrastructure/guidance.ts"), "utf8");
    assert.doesNotMatch(src, /["'`]CS["'`]\s*\+|`CS\$\{/);
  });
  test("3. pathway nélküli kijárat nem ajánlható, akkor sem, ha a célhoz az a legközelebbi", () => {
    const g = buildLegStationGuidance([firstWalk, metro(), walk([300, 320])], 1, resolve, opts);
    assert.notEqual(g?.exit?.label, "K");
    assert.ok(INDEX.complexes[0].exitNodeIds.includes("NOPATH"), "jelölt, de pathway nélkül nem érhető el");
  });
  test("csak pathway nélküli kijáratok -> nincs ajánlás (és nincs szöveg)", () => {
    const idx = compileStationInfrastructure({ provider: "BKK", dataset: "bkkgtfs", sourceGeneration: "g", stopsById: stops(), pathways: [pathways()[0]] });
    const r: StationStopResolver = (id) => {
      const g = id?.slice(8) ?? "";
      const c = idx.complexes.find((x) => x.id === idx.complexIdByStopId[g]);
      return c ? { complex: c, gtfsStopId: g } : null;
    };
    const g = buildLegStationGuidance([firstWalk, metro(), walk([60, 300])], 1, r, opts);
    assert.equal(recommendedExitText(g), null);
  });
});

describe("rangsor: légvonal előszűrés + valódi gyalogos útvonal", () => {
  test("4. több kijárat közül a cél felé eső; légvonal -> MEDIUM, legfeljebb 3 gyalogos kérés", () => {
    let reqs: ExitWalkingRequest[] = [];
    const g = buildLegStationGuidance([firstWalk, metro(), walk([150, -300])], 1, resolve, { ...opts, onWalkingRequests: (r) => (reqs = r) });
    assert.equal(g?.exit?.label, "D");
    assert.equal(g?.exit?.rankingBasis, "STRAIGHT_LINE");
    assert.equal(g?.exit?.confidence, "MEDIUM");
    assert.equal(reqs.length, 3);
    assert.ok(reqs.every((r) => !JSON.stringify(r).includes("X")), "nincs GTFS ID a kérésben");
  });
  test("a valódi gyalogos útvonal felülírja a légvonalat (pl. akadály miatt), HIGH + idő/táv", () => {
    let reqs: ExitWalkingRequest[] = [];
    const legs = [firstWalk, metro(), walk([150, -300])];
    buildLegStationGuidance(legs, 1, resolve, { ...opts, onWalkingRequests: (r) => (reqs = r) });
    const scores = new Map(reqs.map((r, i) => [r.key, { durationSeconds: i === 1 ? 200 : 900, distanceMeters: i === 1 ? 240 : 1100 }] as const));
    const g = buildLegStationGuidance(legs, 1, resolve, { ...opts, walkingScores: scores });
    const secondByLine = buildLegStationGuidance(legs, 1, resolve, opts);
    assert.notEqual(g?.exit?.label, secondByLine?.exit?.label);
    assert.equal(g?.exit?.rankingBasis, "WALKING_ROUTE");
    assert.equal(g?.exit?.confidence, "HIGH");
    assert.deepEqual(g?.exit?.walkingRoute, { durationSeconds: 200, distanceMeters: 240 });
    assert.ok(g?.exit?.reasonCodes.includes("SHORTER_WALK_AFTER_EXIT"));
    assert.equal(recommendedExitText(g)?.meta, "kb. 3 perc séta · 240 m");
  });
  test("exitWalkingKey determinisztikus és ID-mentes", () => {
    assert.equal(exitWalkingKey({ lat: 47.123456789, lon: 19.1 }, { lat: 47.2, lon: 19.2 }), "47.12346,19.10000>47.20000,19.20000");
  });
});

describe("átszállás: csak ha felszíni kijárat tényleg kell", () => {
  test("gyaloglás + villamos egy állomáson kívüli megállóból -> kijárat a megálló felé", () => {
    const g = buildLegStationGuidance([firstWalk, metro(), walk([-200, 200]), tram("bkkgtfs_TRAMSTOP", -200, 200)], 1, resolve, opts);
    assert.equal(g?.status, "EXIT_SELECTED");
    assert.ok(g?.exit?.reasonCodes.includes("BEST_EXIT_FOR_TRANSFER"));
    assert.equal(recommendedExitText(g)?.detail, "Ezen a kijáraton keresztül kedvezőbb a gyalogos átszállás.");
  });
  test("metró -> metró átszállás (akár más komplexum) -> nincs kijárat (lehet belső átjáró)", () => {
    const g = buildLegStationGuidance([firstWalk, metro(), walk([-200, 200]), tram("bkkgtfs_OTHER", -200, 200, "SUBWAY")], 1, resolve, opts);
    assert.equal(g?.status, "NO_TARGET");
    assert.equal(recommendedExitText(g), null);
  });
  test("közvetlen TRANSIT -> TRANSIT gyalogos láb nélkül -> nincs kijárat", () => {
    const g = buildLegStationGuidance([firstWalk, metro(), tram("bkkgtfs_TRAMSTOP", -200, 200)], 1, resolve, opts);
    assert.equal(g?.status, "NO_TARGET");
  });
});

describe("hatókör és fallback", () => {
  test("5. nincs kijárati adat / ismeretlen stop -> nincs guidance", () => {
    assert.equal(buildLegStationGuidance([firstWalk, metro("bkkgtfs_UNKNOWN"), walk([60, 300])], 1, resolve, opts), null);
  });
  test("7. nem metró (villamos, busz, HÉV) és nem BKK stop -> nincs ajánlás", () => {
    for (const mode of ["TRAM", "BUS", "SUBURBAN", "RAIL"]) {
      assert.equal(buildLegStationGuidance([firstWalk, metro("bkkgtfs_PL1", { transitMode: mode }), walk([60, 300])], 1, resolve, opts), null, mode);
    }
    assert.equal(buildLegStationGuidance([firstWalk, metro("mavgtfs_PL1"), walk([60, 300])], 1, resolve, opts), null);
  });
  const ranked = (): RankedJourney[] => [{ journey: { legs: [firstWalk, metro(), walk([150, -300])] } as never, labels: [], explanation: "" }];
  const provider = { providerId: "T", lookup: async () => ({ providerId: "T", generation: "g", resolve }) };
  test("6. enrichment: gyalogos routing hibája / időtúllépése -> légvonalbeli ajánlás, sosem hiba", async () => {
    const failing = await enrichRankedJourneysWithStationGuidance(ranked(), provider, { stepFreePreferred: false, walkingRouter: async () => { throw new Error("x"); } });
    assert.equal(failing[0].journey.legs[1].stationGuidance?.exit?.rankingBasis, "STRAIGHT_LINE");
    const slow = await enrichRankedJourneysWithStationGuidance(ranked(), provider, { stepFreePreferred: false, walkingRouter: () => new Promise(() => {}), walkingBudgetMs: 20 });
    assert.equal(slow[0].journey.legs[1].stationGuidance?.exit?.rankingBasis, "STRAIGHT_LINE");
    const r = ranked();
    assert.equal(await enrichRankedJourneysWithStationGuidance(r, { providerId: "T", lookup: async () => null }, { stepFreePreferred: false, walkingRouter: null }), r);
  });
  test("enrichment: valódi gyalogos rangsor, deduplikált és korlátozott kérésszámmal", async () => {
    const calls: string[] = [];
    const out = await enrichRankedJourneysWithStationGuidance([...ranked(), ...ranked()], provider, {
      stepFreePreferred: false,
      maxWalkingRequests: 2,
      walkingRouter: async (from) => {
        calls.push(`${from.lat},${from.lon}`);
        return { durationSeconds: calls.length === 1 ? 600 : 120, distanceMeters: calls.length === 1 ? 700 : 150 };
      },
    });
    assert.equal(calls.length, 2, "két azonos journey kérései összevonva, max 2");
    const exit = out[0].journey.legs[1].stationGuidance?.exit;
    assert.equal(exit?.rankingBasis, "WALKING_ROUTE");
    assert.equal(exit?.walkingRoute?.durationSeconds, 120);
    assert.deepEqual(out[0].journey.legs[1].stationGuidance, out[1].journey.legs[1].stationGuidance);
  });
});

describe("10. aktív navigáció: csak meglévő ajánlásnál", () => {
  const legs = [firstWalk, metro(), walk([60, 300])];
  const g = buildLegStationGuidance(legs, 1, resolve, opts) ?? undefined;
  const guided = legs.map((l, i) => (i === 1 ? { ...l, stationGuidance: g } : l));
  test("leszálláshoz közeledve: megálló + kijárat jelzés", () => {
    assert.deepEqual(selectStationGuidanceDisplay({ legs: guided, activeLegIndex: 1, walkToTransitPhase: "BOARDED", alightingReady: true, activeWalkDistanceAlongMeters: null }), { kind: "EXIT", legIndex: 1 });
    const t = stationExitGuidanceText(g, { approachingStopName: "Példa tér" });
    assert.equal(t?.title, "A következő megálló Példa tér. Leszállás után keresd a „B” kijárat jelzését.");
  });
  test("leszállás után: csak a kijárat jelzés", () => {
    assert.equal(stationExitGuidanceText(g)?.title, "Leszállás után keresd a „B” kijárat jelzését.");
  });
  test("ajánlás nélkül semmi (nincs hiba / 'nincs adat' szöveg)", () => {
    assert.equal(stationExitGuidanceText(undefined, { approachingStopName: "Példa tér" }), null);
    assert.equal(recommendedExitText(undefined), null);
  });
  test("magyar névelő a kijárat-betűhöz", () => {
    assert.equal(hungarianArticle("A"), "az");
    assert.equal(hungarianArticle("F"), "az");
    assert.equal(hungarianArticle("G"), "a");
    assert.equal(hungarianArticle("B2"), "a");
  });
  test("szöveg nem állít szenzoros tulajdonságot", () => {
    const all = JSON.stringify([recommendedExitText(g), stationExitGuidanceText(g)]);
    assert.doesNotMatch(all, /nyugodt|csend|zsúfolt|zaj|autizmus|akadálymentes/i);
  });
  test("UI-bekötés: a metró láb alatt a RecommendedExitNote, a navigációban a megálló neve csak a járművön", () => {
    const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
    assert.match(form, /leg\.mode === "TRANSIT" && stationGuidancePreviewEnabled && recommendedExitText\(leg\.stationGuidance\) \? \(\s*<RecommendedExitNote leg=\{leg\} \/>/);
    assert.match(form, /stationGuidanceDisplay\.legIndex === activeLegIndex \? displayedJourney\.legs\[stationGuidanceDisplay\.legIndex\]\?\.toName \?\? null : null/);
  });
});
