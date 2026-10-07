// VÉDETT ÚTVONAL — STATION INTELLIGENCE PRODUCTION INTEGRATION (2026-10-07 fix)
//   node --test __tests__/vedett-route/station-intelligence-e2e.test.ts
//
// Teljes szerveroldali lánc, mockolt hálózattal: MOTIS válasz (bkkgtfs_
// prefixes stopId) -> searchVedettRoutes -> BKK provider -> POST
// <ACCESSIBILITY_SIDECAR_URL>/station-infrastructure (Bearer) -> zod ->
// guidance -> JourneyLeg.stationGuidance -> JSON -> előnézet szöveg.
// A sidecar-választ a VALÓDI compiler állítja elő egy Astoria-szerű
// (CSF01018 / F01018 / F01019 / LM2AS1 / [A]..[J]) fixture-ből.
// Koordináták közelítők, NEM valós infrastruktúra-adat.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import { encodePolyline } from "../../lib/vedett-route/geometry.ts";
import {
  STATION_INFRASTRUCTURE_SCHEMA_VERSION,
  compileStationInfrastructure,
  selectComplexesForStops,
  type StationCompilerPathwayInput,
  type StationCompilerStopInput,
} from "../../lib/vedett-route/stationInfrastructure/compiler.ts";
import { createBkkStationInfrastructureProvider } from "../../lib/vedett-route/stationInfrastructure/provider.ts";
import { recommendedExitText, stationExitGuidanceText, stationPreviewText } from "../../lib/vedett-route/stationInfrastructure/display.ts";
import { recommendBoardingPosition } from "../../lib/vedett-route/navigation/boardingPosition.ts";
import type { JourneyLeg, OrchestratedSearchResult } from "../../lib/vedett-route/types.ts";

const SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
const TOKEN = "sidecar-secret";
const originalFetch = globalThis.fetch;
const ENV_KEYS = ["MOTIS_BASE_URL", "ROUTE_SERVICE_URL", "ROUTE_SERVICE_AUTH_TOKEN", "ACCESSIBILITY_SIDECAR_URL", "ACCESSIBILITY_SIDECAR_AUTH_TOKEN"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  process.env.MOTIS_BASE_URL = "http://localhost:8080";
  process.env.ACCESSIBILITY_SIDECAR_URL = SIDECAR_URL;
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = TOKEN;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// --- Astoria-szerű állomás ------------------------------------------------
const PLATFORM_W = { lat: 47.49352, lon: 19.0605 };
const MUSEUM = { lat: 47.4909, lon: 19.0618 };
const EXIT_RING: [string, number, number][] = [
  ["A", 47.4942, 19.0597],
  ["B", 47.4943, 19.0607],
  ["C", 47.4941, 19.0616],
  ["D", 47.4936, 19.0621],
  ["E", 47.4930, 19.0619],
  ["F", 47.4928, 19.0611],
  ["G", 47.4928, 19.0601],
  ["H", 47.4930, 19.0592],
  ["I", 47.4935, 19.0588],
  ["J", 47.4939, 19.0590],
];

function astoriaStops(): Record<string, StationCompilerStopInput> {
  const out: Record<string, StationCompilerStopInput> = {
    CSF01018: { stopId: "CSF01018", stopName: "Astoria", latitude: 47.49354, longitude: 19.06055, locationType: 1 },
    F01018: { stopId: "F01018", stopName: "Astoria", latitude: PLATFORM_W.lat, longitude: PLATFORM_W.lon, locationType: 0, parentStation: "CSF01018" },
    F01019: { stopId: "F01019", stopName: "Astoria", latitude: 47.49357, longitude: 19.0606, locationType: 0, parentStation: "CSF01018" },
    LM2AS1: { stopId: "LM2AS1", stopName: "Astoria", latitude: 47.49345, longitude: 19.0603, locationType: 2, parentStation: "CSF01018" },
  };
  for (const [label, lat, lon] of EXIT_RING) {
    out[`LM2AS${label}`] = { stopId: `LM2AS${label}`, stopName: `Astoria [${label}]`, latitude: lat, longitude: lon, locationType: 2, parentStation: "CSF01018" };
  }
  return out;
}
function astoriaPathways(): StationCompilerPathwayInput[] {
  const p: StationCompilerPathwayInput[] = [
    { pathwayId: "PWF01018", fromStopId: "LM2AS1", toStopId: "F01018", pathwayMode: 2, isBidirectional: true, traversalTime: 60 },
    { pathwayId: "PWF01019", fromStopId: "LM2AS1", toStopId: "F01019", pathwayMode: 2, isBidirectional: true, traversalTime: 60 },
  ];
  for (const [label] of EXIT_RING) p.push({ pathwayId: `PW${label}`, fromStopId: "LM2AS1", toStopId: `LM2AS${label}`, pathwayMode: 1, isBidirectional: true, traversalTime: 30 });
  return p;
}
const COMPILED = compileStationInfrastructure({ provider: "BKK", dataset: "bkkgtfs", sourceGeneration: "444134f982708fbd", stopsById: astoriaStops(), pathways: astoriaPathways() });

function sidecarBody(stopIds: string[]) {
  return { ok: true, status: "ok", schemaVersion: STATION_INFRASTRUCTURE_SCHEMA_VERSION, generation: COMPILED.sourceGeneration, ...selectComplexesForStops(COMPILED, stopIds) };
}

// --- MOTIS-alakú válasz -------------------------------------------------
const line = (pts: { lat: number; lon: number }[]) => encodePolyline(pts.map((p) => [p.lon, p.lat] as const), 6);
const ORS = { lat: 47.5025, lon: 19.137 };
function m2ToAstoria() {
  const pts = [ORS, { lat: 47.5, lon: 19.1 }, { lat: 47.4965, lon: 19.07 }, { lat: 47.4938, lon: 19.0625 }, PLATFORM_W];
  return {
    mode: "SUBWAY",
    routeShortName: "M2",
    headsign: "Déli pályaudvar",
    tripId: "20261007_10:00_bkkgtfs_T1",
    routeId: "bkkgtfs_5200",
    from: { name: "Örs vezér tere", lat: ORS.lat, lon: ORS.lon, stopId: "bkkgtfs_F02336" },
    to: { name: "Astoria", lat: PLATFORM_W.lat, lon: PLATFORM_W.lon, stopId: "bkkgtfs_F01018" },
    duration: 720,
    startTime: "2026-10-07T10:00:00+02:00",
    endTime: "2026-10-07T10:12:00+02:00",
    legGeometry: { points: line(pts), precision: 6 },
  };
}
function walkToMuseum() {
  const pts = [PLATFORM_W, { lat: 47.4927, lon: 19.0611 }, MUSEUM];
  return {
    mode: "WALK",
    from: { name: "Astoria", lat: PLATFORM_W.lat, lon: PLATFORM_W.lon, stopId: "bkkgtfs_F01018" },
    to: { name: "Magyar Nemzeti Múzeum", lat: MUSEUM.lat, lon: MUSEUM.lon },
    duration: 540,
    distance: 646,
    startTime: "2026-10-07T10:12:00+02:00",
    endTime: "2026-10-07T10:21:00+02:00",
    legGeometry: { points: line(pts), precision: 6 },
  };
}
const startWalk = {
  mode: "WALK",
  from: { name: "Kiindulás", lat: 47.503, lon: 19.138 },
  to: { name: "Örs vezér tere", lat: ORS.lat, lon: ORS.lon, stopId: "bkkgtfs_F02336" },
  duration: 120,
  startTime: "2026-10-07T09:58:00+02:00",
  endTime: "2026-10-07T10:00:00+02:00",
};
const itinerary = (legs: unknown[]) => ({ duration: 1380, startTime: "2026-10-07T09:58:00+02:00", endTime: "2026-10-07T10:21:00+02:00", transfers: 0, legs });
const request = {
  from: { name: "Örs vezér tere", lat: 47.503, lon: 19.138 },
  to: { name: "Magyar Nemzeti Múzeum", lat: MUSEUM.lat, lon: MUSEUM.lon },
  departAt: "2026-10-07T09:58:00+02:00",
};

interface SidecarCall {
  url: string;
  auth: string | null;
  body: { dataset: string; stopIds: string[] };
}
function makeFetch(itineraries: unknown[], calls: SidecarCall[], sidecar: (stopIds: string[]) => { status: number; body: unknown } = (ids) => ({ status: 200, body: sidecarBody(ids) })): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/station-infrastructure")) {
      const body = JSON.parse(String(init?.body)) as SidecarCall["body"];
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get("authorization"), body });
      const r = sidecar(body.stopIds);
      return { ok: r.status === 200, status: r.status, json: async () => r.body } as unknown as Response;
    }
    if (url.includes("/accessibility/")) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ itineraries }) } as unknown as Response;
  }) as typeof fetch;
}

function astoriaLeg(result: OrchestratedSearchResult): JourneyLeg | undefined {
  for (const r of result.journeys) {
    const leg = r.journey.legs.find((l) => l.mode === "TRANSIT" && l.toStopId === "bkkgtfs_F01018");
    if (leg) return leg;
  }
  return undefined;
}

function expectedExitLabel(): string {
  // Független ellenőrzés: minden kijárat belső ideje azonos (60+30 s), így
  // légvonalbeli rangsornál a célhoz legközelebbi kijárat nyer.
  const R = 6_371_000;
  const d = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const lat0 = (((a.lat + b.lat) / 2) * Math.PI) / 180;
    return Math.hypot((((b.lon - a.lon) * Math.PI) / 180) * R * Math.cos(lat0), (((b.lat - a.lat) * Math.PI) / 180) * R);
  };
  // RECOMMENDED METRO EXITS v1: a cél a gyalogos folytatás / végső cél koordinátája.
  const target = MUSEUM;
  return EXIT_RING.map(([label, lat, lon]) => ({ label, dist: d({ lat, lon }, target) })).sort((a, b) => a.dist - b.dist)[0].label;
}

describe("Örs vezér tere -> M2 -> Astoria -> gyalog Magyar Nemzeti Múzeum", () => {
  test("a teljes szerver-lánc csatolja a stationGuidance-t, és az előnézet kijáratot mutat", async () => {
    const calls: SidecarCall[] = [];
    globalThis.fetch = makeFetch([itinerary([startWalk, m2ToAstoria(), walkToMuseum()])], calls);
    const result = await searchVedettRoutes(request, undefined, { stationInfrastructureProvider: createBkkStationInfrastructureProvider() });
    assert.equal(result.ok, true);
    const ok = result as OrchestratedSearchResult;

    // Sidecar-hívás: helyes URL, Bearer, nyers GTFS id-k (prefix nélkül).
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${SIDECAR_URL}/station-infrastructure`);
    assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
    assert.equal(calls[0].body.dataset, "bkkgtfs");
    assert.ok(calls[0].body.stopIds.includes("F01018"));
    assert.ok(!calls[0].body.stopIds.some((id) => id.startsWith("bkkgtfs_")));

    // JSON szerializáció után is megmarad (route handler NextResponse.json).
    const leg = astoriaLeg(JSON.parse(JSON.stringify(ok)) as OrchestratedSearchResult);
    assert.ok(leg, "az M2 láb leszállási stopja bkkgtfs_F01018");
    const g = leg!.stationGuidance;
    assert.ok(g, "stationGuidance csatolva");
    assert.equal(g!.status, "EXIT_SELECTED");
    assert.equal(g!.capability, "GRAPH_USABLE");
    assert.equal(g!.exit?.confidence, "MEDIUM", "gyalogos routing nélkül (a mock /api/route nem ad útvonalat) légvonalbeli rangsor");
    assert.equal(g!.exit?.rankingBasis, "STRAIGHT_LINE");
    assert.equal(g!.exit?.targetBasis, "WALK_DESTINATION");
    assert.equal(g!.exit?.internalTraversalSeconds, 90);
    assert.equal(g!.exit?.label, expectedExitLabel());
    assert.equal(stationPreviewText(g), `Ajánlott kijárat: ${expectedExitLabel()}`);
    assert.match(stationExitGuidanceText(g)?.title ?? "", new RegExp(`^Leszállás után keresd az? „${expectedExitLabel()}” kijárat jelzését\\.$`));
    assert.ok(g!.boardingTarget, "a közös csomópont (LM2AS1) a boarding cél");
    const legs = astoriaJourneyLegs(ok);
    const r = recommendBoardingPosition(legs, legs.findIndex((l) => l.toStopId === "bkkgtfs_F01018"));
    assert.equal(r.basis, "STATION_PATHWAY_NODE");
  });

  test("fail-open: sidecar 404 (pl. nem proxyzott útvonal) -> nincs guidance, a routing változatlan", async () => {
    const calls: SidecarCall[] = [];
    globalThis.fetch = makeFetch([itinerary([startWalk, m2ToAstoria(), walkToMuseum()])], calls, () => ({ status: 404, body: { error: "not found" } }));
    const result = (await searchVedettRoutes(request, undefined, { stationInfrastructureProvider: createBkkStationInfrastructureProvider() })) as OrchestratedSearchResult;
    assert.equal(result.ok, true);
    assert.equal(astoriaLeg(result)?.stationGuidance, undefined);
    assert.equal(calls.length, 1);
  });

  test("provider nélkül (flag KI) nincs sidecar-hívás és nincs guidance", async () => {
    const calls: SidecarCall[] = [];
    globalThis.fetch = makeFetch([itinerary([startWalk, m2ToAstoria(), walkToMuseum()])], calls);
    const result = (await searchVedettRoutes(request)) as OrchestratedSearchResult;
    assert.equal(calls.length, 0);
    assert.equal(astoriaLeg(result)?.stationGuidance, undefined);
  });
});

function astoriaJourneyLegs(result: OrchestratedSearchResult): JourneyLeg[] {
  return result.journeys.find((r) => r.journey.legs.some((l) => l.toStopId === "bkkgtfs_F01018"))!.journey.legs;
}

describe("valódi gyalogos rangsor a MEGLÉVŐ MOTIS /api/route-on keresztül", () => {
  test("a légvonalban második kijárat nyer, ha gyalog rövidebb; HIGH + idő/táv az előnézetben", async () => {
    const straight = expectedExitLabel();
    const durations = new Map(EXIT_RING.map(([label, lat, lon]) => [`${lat.toFixed(4)},${lon.toFixed(4)}`, label === straight ? 700 : 300 + EXIT_RING.findIndex((e) => e[0] === label) * 10]));
    const calls: SidecarCall[] = [];
    const base = makeFetch([itinerary([startWalk, m2ToAstoria(), walkToMuseum()])], calls);
    let walkingCalls = 0;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/route")) {
        walkingCalls++;
        const body = JSON.parse(String(init?.body)) as { start: { lat: number; lng: number }; profile: string };
        assert.equal(body.profile, "foot");
        const duration = durations.get(`${body.start.lat.toFixed(4)},${body.start.lng.toFixed(4)}`) ?? 999;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: "FeatureCollection",
            metadata: { duration, distance: duration * 1.2, uses_elevator: false },
            features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[body.start.lng, body.start.lat], [MUSEUM.lon, MUSEUM.lat]] }, properties: { level: 0 } }],
          }),
        } as unknown as Response;
      }
      return base(input, init);
    }) as typeof fetch;
    const result = (await searchVedettRoutes(request, undefined, { stationInfrastructureProvider: createBkkStationInfrastructureProvider() })) as OrchestratedSearchResult;
    const g = astoriaLeg(result)?.stationGuidance;
    assert.ok(walkingCalls > 0 && walkingCalls <= 3, "csak a legígéretesebb néhány kijáratra");
    assert.equal(g?.exit?.rankingBasis, "WALKING_ROUTE");
    assert.notEqual(g?.exit?.label, straight);
    assert.equal(g?.exit?.confidence, "HIGH");
    assert.ok(recommendedExitText(g)?.meta?.startsWith("kb. "));
  });
});

describe("átszállás explicit gráffal (szintetikus M3/M4 csomópont)", () => {
  test("M3 -> belső út (lift) -> M4: TRANSFER_PATH, idő, lift, előnézet", async () => {
    const stops: Record<string, StationCompilerStopInput> = {
      CSX: { stopId: "CSX", stopName: "Kálvin tér", latitude: 47.4893, longitude: 19.0617, locationType: 1 },
      PM3: { stopId: "PM3", stopName: "Kálvin tér", latitude: 47.4895, longitude: 19.0612, locationType: 0, parentStation: "CSX" },
      PM4: { stopId: "PM4", stopName: "Kálvin tér", latitude: 47.4890, longitude: 19.0622, locationType: 0, parentStation: "CSX" },
      NODE: { stopId: "NODE", stopName: "Kálvin tér", latitude: 47.4893, longitude: 19.0617, locationType: 3, parentStation: "CSX" },
      LIFTX: { stopId: "LIFTX", stopName: "Kálvin tér [lift]", latitude: 47.4892, longitude: 19.0619, locationType: 2, parentStation: "CSX", wheelchairBoarding: 1 },
    };
    const pathways: StationCompilerPathwayInput[] = [
      { pathwayId: "a", fromStopId: "PM3", toStopId: "NODE", pathwayMode: 5, isBidirectional: true, traversalTime: 60 },
      { pathwayId: "b", fromStopId: "NODE", toStopId: "PM4", pathwayMode: 5, isBidirectional: true, traversalTime: 90 },
      { pathwayId: "c", fromStopId: "NODE", toStopId: "LIFTX", pathwayMode: 5, isBidirectional: true, traversalTime: 90 },
    ];
    const compiled = compileStationInfrastructure({ provider: "BKK", dataset: "bkkgtfs", sourceGeneration: "g", stopsById: stops, pathways });
    const calls: SidecarCall[] = [];
    const m3 = {
      mode: "SUBWAY",
      routeShortName: "M3",
      from: { name: "Ferenciek tere", lat: 47.4935, lon: 19.0560, stopId: "bkkgtfs_PFT" },
      to: { name: "Kálvin tér", lat: 47.4895, lon: 19.0612, stopId: "bkkgtfs_PM3" },
      duration: 120,
      startTime: "2026-10-07T10:00:00+02:00",
      endTime: "2026-10-07T10:02:00+02:00",
      legGeometry: { points: line([{ lat: 47.4935, lon: 19.056 }, { lat: 47.4915, lon: 19.0586 }, { lat: 47.4899, lon: 19.0606 }, { lat: 47.4895, lon: 19.0612 }]), precision: 6 },
    };
    const transferWalk = {
      mode: "WALK",
      from: { name: "Kálvin tér", lat: 47.4895, lon: 19.0612, stopId: "bkkgtfs_PM3" },
      to: { name: "Kálvin tér", lat: 47.489, lon: 19.0622, stopId: "bkkgtfs_PM4" },
      duration: 180,
      startTime: "2026-10-07T10:02:00+02:00",
      endTime: "2026-10-07T10:05:00+02:00",
    };
    const m4 = {
      mode: "SUBWAY",
      routeShortName: "M4",
      from: { name: "Kálvin tér", lat: 47.489, lon: 19.0622, stopId: "bkkgtfs_PM4" },
      to: { name: "Fővám tér", lat: 47.4865, lon: 19.0585, stopId: "bkkgtfs_PFV" },
      duration: 120,
      startTime: "2026-10-07T10:05:00+02:00",
      endTime: "2026-10-07T10:07:00+02:00",
    };
    globalThis.fetch = makeFetch([itinerary([m3, transferWalk, m4])], calls, (ids) => ({
      status: 200,
      body: { ok: true, status: "ok", schemaVersion: 1, generation: "g", ...selectComplexesForStops(compiled, ids) },
    }));
    const result = (await searchVedettRoutes(
      { ...request, from: { name: "Ferenciek tere", lat: 47.4935, lon: 19.056 }, to: { name: "Fővám tér", lat: 47.4865, lon: 19.0585 } },
      undefined,
      { stationInfrastructureProvider: createBkkStationInfrastructureProvider() }
    )) as OrchestratedSearchResult;
    const leg = result.journeys.flatMap((r) => r.journey.legs).find((l) => l.toStopId === "bkkgtfs_PM3");
    const g = leg?.stationGuidance;
    assert.equal(g?.status, "TRANSFER_PATH");
    assert.equal(g?.transfer?.traversalSeconds, 150);
    assert.equal(g?.transfer?.liftAvailable, true);
    assert.equal(g?.interchangeComplex, false);
    assert.equal(stationPreviewText(g), "Belső átszállás kb. 3 perc · Liftes kapcsolat ismert");
  });
});
