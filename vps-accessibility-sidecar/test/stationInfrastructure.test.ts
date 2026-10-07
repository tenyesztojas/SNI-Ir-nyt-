// VPS ACCESSIBILITY SIDECAR — BKK station infrastructure (2026-10-07):
// fordítás a betöltött indexből, station-scoped slice endpoint, validációs riport.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import type { Server } from "node:http";
import { createAccessibilitySidecarServer } from "../dist/server.js";
import { buildAndActivate } from "../dist/buildIndex.js";
import { resetForTests, pollDatasetOnce, getLoadedDataset } from "../dist/activeIndexStore.js";
import { getCompiledStationInfrastructure, parseStationInfrastructureRequest } from "../dist/stationInfrastructure.js";
import { buildReport, describeStation, gradeComplex } from "../dist/stationInfrastructureReport.js";

const AUTH_TOKEN = "test-secret-token";
let server: Server;
let baseUrl: string;
let dataDir: string;
let generation: string;

const STOPS = [
  "stop_id,stop_name,stop_lat,stop_lon,stop_code,location_type,location_sub_type,parent_station,wheelchair_boarding",
  "CS1,Astoria,47.4935,19.0605,,1,,,0",
  "F1,Astoria,47.4935,19.0605,,0,,CS1,",
  "F2,Astoria,47.4936,19.0605,,0,,CS1,",
  "LM1,Astoria,47.4935,19.0598,,2,,CS1,",
  "LMA,Astoria [A],47.4940,19.0594,,2,,CS1,",
  "LMB,Astoria [B],47.4930,19.0594,,2,,CS1,",
  "LMC,Astoria [C],47.4940,19.0602,,2,,CS1,",
  "LL,Astoria [lift » M2 Örs vezér tere],47.4936,19.0614,,2,,CS1,1",
  "T1,Astoria villamos,47.4960,19.0640,,0,,,0",
].join("\n");
const PATHWAYS = [
  "pathway_id,pathway_mode,is_bidirectional,from_stop_id,to_stop_id,traversal_time",
  "P1,2,1,F1,LM1,60",
  "P2,2,1,F2,LM1,60",
  "P3,2,1,LM1,LMA,30",
  "P4,2,1,LM1,LMB,30",
  "P5,2,1,LM1,LMC,",
  "P6,5,1,F1,LL,90",
  "P7,1,1,F1,MISSING,10",
].join("\n");

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "acc-sidecar-station-"));
  process.env.ACCESSIBILITY_DATA_ROOT = dataDir;
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = AUTH_TOKEN;
  process.env.ACCESSIBILITY_SIDECAR_DATASETS = "bkkgtfs";
  resetForTests();
  const zip = new AdmZip();
  zip.addFile("stops.txt", Buffer.from(STOPS, "utf-8"));
  zip.addFile("trips.txt", Buffer.from("trip_id,wheelchair_accessible\nT1,1\n", "utf-8"));
  zip.addFile("pathways.txt", Buffer.from(PATHWAYS, "utf-8"));
  const zipPath = path.join(dataDir, "gtfs.zip");
  await writeFile(zipPath, zip.toBuffer());
  const manifest = await buildAndActivate("bkkgtfs", zipPath);
  generation = manifest.generation;
  await pollDatasetOnce("bkkgtfs");
  server = createAccessibilitySidecarServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dataDir, { recursive: true, force: true });
  resetForTests();
});

const post = (body: unknown, token: string | null = AUTH_TOKEN) =>
  fetch(`${baseUrl}/station-infrastructure`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

interface SliceBody {
  ok: boolean;
  status: string;
  schemaVersion?: number;
  generation: string | null;
  complexes: { id: string; capability: string; nodes: { id: string; exitLabel: string | null }[]; edges: { id: string; traversalTime: number | null }[]; exitNodeIds: string[] }[];
  unmatchedStopIds: string[];
}

test("fordítás a betöltött indexből: generációhoz kötött, cache-elt, determinisztikus", () => {
  const loaded = getLoadedDataset("bkkgtfs");
  assert.ok(loaded);
  const a = getCompiledStationInfrastructure(loaded!.index, "bkkgtfs", generation);
  const b = getCompiledStationInfrastructure(loaded!.index, "bkkgtfs", generation);
  assert.equal(a, b, "ugyanarra a generációra nem fordít újra");
  assert.equal(a.sourceGeneration, generation);
  const c = a.complexes.find((x) => x.id === "CS1");
  assert.ok(c);
  assert.deepEqual(c!.exitNodeIds, ["LL", "LMA", "LMB", "LMC"]);
  assert.equal(c!.capability, "GRAPH_WITH_LIFT");
  assert.equal(a.diagnostics.pathwaysWithUnknownNodes, 1);
});

test("buildIndex új generációnál diagnosztikai station-infrastructure.json artifactot is ír", async () => {
  const raw = await readFile(path.join(dataDir, "bkkgtfs", "generations", generation, "station-infrastructure.json"), "utf-8");
  const parsed = JSON.parse(raw) as { schemaVersion: number; sourceGeneration: string };
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.sourceGeneration, generation);
});

test("POST /station-infrastructure: auth nélkül 401", async () => {
  assert.equal((await post({ dataset: "bkkgtfs", stopIds: ["F1"] }, null)).status, 401);
  assert.equal((await post({ dataset: "bkkgtfs", stopIds: ["F1"] }, "rossz")).status, 401);
});

test("POST /station-infrastructure: szigorú validáció (üres, túl sok, hibás id, malformed JSON, ismeretlen dataset)", async () => {
  assert.equal((await post({ dataset: "bkkgtfs", stopIds: [] })).status, 400);
  assert.equal((await post({ dataset: "bkkgtfs", stopIds: Array.from({ length: 101 }, (_, i) => `S${i}`) })).status, 400);
  assert.equal((await post({ dataset: "bkkgtfs", stopIds: ["bad id!"] })).status, 400);
  assert.equal((await post("{nope")).status, 400);
  assert.equal((await post({ dataset: "other", stopIds: ["F1"] })).status, 404);
  assert.deepEqual(parseStationInfrastructureRequest(null), { error: "MALFORMED_BODY" });
});

test("POST /station-infrastructure: csak a kért stop komplexuma, verzióval; ismeretlen stop külön", async () => {
  const res = await post({ dataset: "bkkgtfs", stopIds: ["F1", "NOPE", "T1"] });
  assert.equal(res.status, 200);
  const body = await readJson<SliceBody>(res);
  assert.equal(body.status, "ok");
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.generation, generation);
  assert.deepEqual(body.complexes.map((c) => c.id), ["CS1"]);
  assert.deepEqual(body.unmatchedStopIds, ["NOPE", "T1"]);
  const c = body.complexes[0];
  assert.equal(c.nodes.find((n) => n.id === "LMA")?.exitLabel, "A");
  assert.equal(c.edges.find((e) => e.id === "P5")?.traversalTime, null, "hiányzó traversal_time nem kitalált érték");
});

test("validációs riport: számok, capability, ismert állomás", () => {
  const loaded = getLoadedDataset("bkkgtfs")!;
  const compiled = getCompiledStationInfrastructure(loaded.index, "bkkgtfs", generation);
  const report = buildReport(compiled);
  assert.equal(report.edges, 6);
  assert.equal(report.liftEdges, 1);
  assert.equal(report.exitCandidates, 4);
  assert.equal(report.platformNodes >= 2, true);
  assert.equal(report.grades.MEDIUM, 1, "hiányzó traversal_time -> MEDIUM grade");
  assert.equal(gradeComplex(compiled.complexes.find((c) => c.id === "CS1")!), "MEDIUM");
  assert.match(describeStation(compiled, "Astoria")[0], /capability=GRAPH_WITH_LIFT/);
  assert.match(describeStation(compiled, "Nincs ilyen")[0], /NINCS/);
  assert.ok(report.artifactBytes > 0 && report.artifactGzipBytes > 0);
});
