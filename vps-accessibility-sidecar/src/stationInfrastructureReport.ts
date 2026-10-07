// VPS ACCESSIBILITY SIDECAR — STATION INFRASTRUCTURE VALIDATION / REPORT CLI (2026-10-07)
//
// Build/debug eszköz (nem user UI). Használat:
//   node dist/stationInfrastructureReport.js <dataset> [--zip <gtfs.zip>] [--write] [--station "<névrészlet>"]...
//
// Alapból az AKTÍV generáció accessibility-index.json-jából fordít (nem
// épít újra semmit, nem aktivál semmit). --zip esetén a megadott zipből
// memóriában fordít. --write: a kompakt indexet a generáció könyvtárába
// írja (station-infrastructure.json, atomikusan) — csak diagnosztikai
// artifact, a sidecar futásidőben mindig a betöltött indexből fordít.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { buildAccessibilityIndexFromGtfsZip, type AccessibilityIndex } from "./lib/accessibilityIndex.js";
import {
  compileStationInfrastructure,
  locationKind,
  pathwayModeKind,
  type CompiledStationComplex,
  type CompiledStationInfrastructureIndex,
} from "./lib/stationInfrastructureCompiler.js";
import { activeGenerationPointerPath, generationDir, indexPath } from "./storageLayout.js";
import type { TransitProviderId } from "./lib/types.js";

export const KNOWN_STATION_QUERIES = [
  "astoria",
  "deak ferenc ter",
  "kalvin ter",
  "keleti palyaudvar",
  "nyugati palyaudvar",
  "ors vezer tere",
  "kelenfold vasutallomas",
  "moricz zsigmond korter",
];

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type InfrastructureGrade = "HIGH" | "MEDIUM" | "LOW";
export function gradeComplex(c: CompiledStationComplex): InfrastructureGrade {
  if (c.capability === "GRAPH_USABLE" || c.capability === "GRAPH_WITH_LIFT") return c.edgesMissingTraversalTime === 0 ? "HIGH" : "MEDIUM";
  return "LOW";
}

export interface StationInfrastructureReport {
  schemaVersion: number;
  dataset: string;
  sourceGeneration: string;
  complexes: number;
  nodes: number;
  edges: number;
  exitCandidates: number;
  liftEdges: number;
  pathwayModes: Record<string, number>;
  platformNodes: number;
  platformNodesConnected: number;
  disconnectedNodes: number;
  malformed: CompiledStationInfrastructureIndex["diagnostics"];
  capabilities: Record<string, number>;
  grades: Record<InfrastructureGrade, number>;
  artifactBytes: number;
  artifactGzipBytes: number;
}

export function buildReport(compiled: CompiledStationInfrastructureIndex): StationInfrastructureReport {
  const json = JSON.stringify(compiled);
  const capabilities: Record<string, number> = {};
  const grades: Record<InfrastructureGrade, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const pathwayModes: Record<string, number> = {};
  let nodes = 0;
  let edges = 0;
  let exits = 0;
  let lifts = 0;
  let platforms = 0;
  let platformsConnected = 0;
  let disconnected = 0;
  for (const c of compiled.complexes) {
    capabilities[c.capability] = (capabilities[c.capability] ?? 0) + 1;
    grades[gradeComplex(c)]++;
    nodes += c.nodes.length;
    edges += c.edges.length;
    exits += c.exitNodeIds.length;
    lifts += c.liftEdgeCount;
    const touched = new Set<string>();
    for (const e of c.edges) {
      touched.add(e.from);
      touched.add(e.to);
      const kind = pathwayModeKind(e.mode);
      pathwayModes[kind] = (pathwayModes[kind] ?? 0) + 1;
    }
    for (const n of c.nodes) {
      const kind = locationKind(n.locationType);
      if (kind === "PLATFORM") {
        platforms++;
        if (touched.has(n.id)) platformsConnected++;
      }
      if (kind !== "STATION" && kind !== "PLATFORM" && !touched.has(n.id)) disconnected++;
    }
  }
  return {
    schemaVersion: compiled.schemaVersion,
    dataset: compiled.dataset,
    sourceGeneration: compiled.sourceGeneration,
    complexes: compiled.complexes.length,
    nodes,
    edges,
    exitCandidates: exits,
    liftEdges: lifts,
    pathwayModes,
    platformNodes: platforms,
    platformNodesConnected: platformsConnected,
    disconnectedNodes: disconnected,
    malformed: compiled.diagnostics,
    capabilities,
    grades,
    artifactBytes: Buffer.byteLength(json),
    artifactGzipBytes: gzipSync(json).byteLength,
  };
}

export function describeStation(compiled: CompiledStationInfrastructureIndex, query: string): string[] {
  const q = normalizeName(query);
  const matches = compiled.complexes.filter((c) => c.nodes.some((n) => normalizeName(n.name).includes(q)));
  if (matches.length === 0) return [`  ${query}: NINCS station-infrastruktúra komplexum (LEVEL 2 / UNKNOWN fallback)`];
  return matches.slice(0, 5).map((c) => {
    const labels = c.exitNodeIds
      .map((id) => c.nodes.find((n) => n.id === id))
      .map((n) => n?.exitLabel ?? (n?.tags.includes("LIFT_LABEL") ? "lift" : "–"))
      .join(",");
    const platforms = c.nodes.filter((n) => locationKind(n.locationType) === "PLATFORM").length;
    return `  ${query}: ${c.id} capability=${c.capability} grade=${gradeComplex(c)} nodes=${c.nodes.length} platforms=${platforms} edges=${c.edges.length} exits=${c.exitNodeIds.length} [${labels}] liftEdges=${c.liftEdgeCount} missingTraversalTime=${c.edgesMissingTraversalTime} parents=${c.parentStationIds.length}`;
  });
}

async function loadIndex(dataset: string, zipPath: string | null): Promise<{ index: AccessibilityIndex; generation: string }> {
  if (zipPath) {
    const buffer = await readFile(zipPath);
    const generation = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    return { index: buildAccessibilityIndexFromGtfsZip(buffer, (dataset === "bkkgtfs" ? "BKK" : dataset) as TransitProviderId, generation), generation };
  }
  const generation = (await readFile(activeGenerationPointerPath(dataset), "utf-8")).trim();
  const index = JSON.parse(await readFile(indexPath(dataset, generation), "utf-8")) as AccessibilityIndex;
  return { index, generation };
}

async function main(argv: string[]): Promise<number> {
  const [dataset, ...rest] = argv;
  if (!dataset) {
    console.error('Használat: node dist/stationInfrastructureReport.js <dataset> [--zip <gtfs.zip>] [--write] [--station "<név>"]...');
    return 1;
  }
  let zipPath: string | null = null;
  let write = false;
  const extraStations: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--zip") zipPath = rest[++i] ?? null;
    else if (rest[i] === "--write") write = true;
    else if (rest[i] === "--station") extraStations.push(rest[++i] ?? "");
  }
  const loadStart = Date.now();
  const { index, generation } = await loadIndex(dataset, zipPath);
  const compileStart = Date.now();
  const compiled = compileStationInfrastructure({ provider: String(index.provider ?? ""), dataset, sourceGeneration: generation, stopsById: index.stopsById, pathways: index.pathways });
  const compileMs = Date.now() - compileStart;
  const report = buildReport(compiled);
  const coordCoverage = Object.values(index.stopsById).filter((s) => typeof s.latitude === "number").length;
  console.log(`# BKK station infrastructure report (schema v${report.schemaVersion}, dataset=${dataset}, generation=${generation})`);
  console.log(`load ${compileStart - loadStart} ms, compile ${compileMs} ms; stops in index: ${Object.keys(index.stopsById).length} (with coordinates: ${coordCoverage}), pathways: ${index.pathways.length}`);
  console.log(`stations/complexes: ${report.complexes}`);
  console.log(`nodes: ${report.nodes}, edges: ${report.edges}, exit candidates: ${report.exitCandidates}, lift edges: ${report.liftEdges}`);
  console.log(`pathway modes: ${JSON.stringify(report.pathwayModes)}`);
  console.log(`platform nodes: ${report.platformNodes}, connected to pathways: ${report.platformNodesConnected}`);
  console.log(`disconnected non-platform nodes: ${report.disconnectedNodes}`);
  console.log(`malformed references: ${JSON.stringify(report.malformed)}`);
  console.log(`capability classes: ${JSON.stringify(report.capabilities)}`);
  console.log(`infrastructure grade: HIGH=${report.grades.HIGH} MEDIUM=${report.grades.MEDIUM} LOW=${report.grades.LOW}`);
  console.log(`artifact size: ${report.artifactBytes} bytes (gzip ${report.artifactGzipBytes} bytes)`);
  console.log("known stations:");
  for (const q of [...KNOWN_STATION_QUERIES, ...extraStations.filter(Boolean)]) for (const line of describeStation(compiled, q)) console.log(line);
  if (write) {
    const target = path.join(generationDir(dataset, generation), "station-infrastructure.json");
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = path.join(path.dirname(target), `.station-infrastructure.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(compiled));
    await rename(tmp, target);
    console.log(`written: ${target}`);
  }
  return 0;
}

const isDirectCliRun = process.argv[1] && process.argv[1].endsWith("stationInfrastructureReport.js");
if (isDirectCliRun) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`station infrastructure report failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
