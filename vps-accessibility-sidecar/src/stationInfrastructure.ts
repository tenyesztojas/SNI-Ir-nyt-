// VPS ACCESSIBILITY SIDECAR — BKK STATION INFRASTRUCTURE (2026-10-07)
//
// A MÁR BETÖLTÖTT, generációhoz kötött accessibility indexből (ugyanaz a
// bkk_gtfs.zip, mint a MOTIS-é) fordít kompakt station-infrastruktúra
// indexet (lásd lib/stationInfrastructureCompiler.ts — a fő repo
// lib/vedett-route/stationInfrastructure/compiler.ts byte-azonos másolata).
// A fordítás generációnként EGYSZER fut (WeakMap cache az index objektumon),
// így GTFS-frissítéskor automatikusan újraépül — kézi adatbevitel nincs.
//
// A POST /station-infrastructure CSAK a kért stop_id-khez tartozó
// állomás-komplexumokat adja vissza (station-scoped slice) — sosem a teljes
// indexet, és nincs tetszőleges állomás-felsorolás.

import type { AccessibilityIndex } from "./lib/accessibilityIndex.js";
import {
  STATION_INFRASTRUCTURE_SCHEMA_VERSION,
  compileStationInfrastructure,
  selectComplexesForStops,
  type CompiledStationInfrastructureIndex,
} from "./lib/stationInfrastructureCompiler.js";

const compiledCache = new WeakMap<AccessibilityIndex, CompiledStationInfrastructureIndex>();

export function getCompiledStationInfrastructure(index: AccessibilityIndex, dataset: string, generation: string): CompiledStationInfrastructureIndex {
  const cached = compiledCache.get(index);
  if (cached && cached.sourceGeneration === generation) return cached;
  const compiled = compileStationInfrastructure({
    provider: String(index.provider ?? ""),
    dataset,
    sourceGeneration: generation,
    stopsById: index.stopsById,
    pathways: index.pathways,
  });
  compiledCache.set(index, compiled);
  return compiled;
}

export const MAX_STATION_STOP_IDS = 100;
const STOP_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface ParsedStationInfrastructureRequest {
  dataset: string;
  stopIds: string[];
}

export function parseStationInfrastructureRequest(body: unknown): ParsedStationInfrastructureRequest | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "MALFORMED_BODY" };
  const b = body as { dataset?: unknown; stopIds?: unknown };
  if (typeof b.dataset !== "string" || b.dataset.length === 0 || b.dataset.length > 64) return { error: "MISSING_DATASET" };
  if (!Array.isArray(b.stopIds) || b.stopIds.length === 0 || b.stopIds.length > MAX_STATION_STOP_IDS) return { error: "INVALID_STOP_IDS" };
  if (!b.stopIds.every((s) => typeof s === "string" && STOP_ID_PATTERN.test(s))) return { error: "INVALID_STOP_IDS" };
  return { dataset: b.dataset, stopIds: Array.from(new Set(b.stopIds as string[])) };
}

export function buildStationInfrastructureResponse(compiled: CompiledStationInfrastructureIndex, stopIds: string[]) {
  const { complexes, unmatchedStopIds } = selectComplexesForStops(compiled, stopIds);
  return {
    ok: true as const,
    status: "ok" as const,
    schemaVersion: STATION_INFRASTRUCTURE_SCHEMA_VERSION,
    generation: compiled.sourceGeneration,
    complexes,
    unmatchedStopIds,
  };
}
