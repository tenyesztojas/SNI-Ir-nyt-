// VÉDETT ÚTVONAL — STATION INFRASTRUCTURE PROVIDER (2026-10-07)
//
// Provider-semleges seam: a guidance-motor csak `StationInfrastructureProvider`
// interfészt lát. Első implementáció: BKK GTFS a MEGLÉVŐ VPS accessibility
// sidecaron keresztül (POST /station-infrastructure) — ugyanaz a canonical
// bkk_gtfs.zip generáció, mint a MOTIS-é. MÁV/Volán később új provider-
// implementációként adható hozzá; a UI és a motor nem változik.
//
// FAIL-OPEN: nincs konfiguráció / timeout / hibás válasz / ismeretlen
// provider -> null; a routing és a navigáció változatlanul működik.
// CACHE: folyamat-memória, a GTFS generációhoz kötve (generáció-váltáskor
// teljes ürítés), TTL-lel és mérethatárral. Független a community cache-től.

import { z } from "zod";
import { getAccessibilitySidecarConfig, type AccessibilitySidecarConfig } from "../config.ts";
import { normalizeMotisStopId } from "../motisIdNormalization.ts";
import { vedettRouteLog } from "../logger.ts";
import type { CompiledStationComplex } from "./compiler.ts";
import type { ResolvedStationStop, StationStopResolver } from "./guidance.ts";

export interface StationInfrastructureLookup {
  providerId: string;
  generation: string;
  resolve: StationStopResolver;
}

export interface StationInfrastructureProvider {
  readonly providerId: string;
  /** MOTIS stopId-k (pl. "bkkgtfs_F01018"). Sosem dob; hiba esetén null. */
  lookup(motisStopIds: readonly string[]): Promise<StationInfrastructureLookup | null>;
}

// --- Wire-séma (szerver-szerver, szigorú, korlátos) ---------------------
const ID = z.string().min(1).max(64);
const nodeSchema = z.object({
  id: ID,
  name: z.string().max(200).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  locationType: z.number().int().nullable(),
  parentStationId: ID.nullable(),
  wheelchairBoarding: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable(),
  tags: z.array(z.enum(["EXIT_LABEL", "LIFT_LABEL", "DIRECTION_HINT"])).max(3),
  exitLabel: z.string().max(4).nullable(),
  directionHint: z.string().max(80).nullable(),
});
const edgeSchema = z.object({
  id: ID,
  from: ID,
  to: ID,
  mode: z.number().int(),
  bidirectional: z.boolean(),
  traversalTime: z.number().int().positive().max(3600).nullable(),
});
const complexSchema = z.object({
  id: ID,
  capability: z.enum(["NONE", "GEOMETRY_ONLY", "GRAPH_PARTIAL", "GRAPH_USABLE", "GRAPH_WITH_LIFT"]),
  parentStationIds: z.array(ID).max(50),
  nodes: z.array(nodeSchema).max(1500),
  edges: z.array(edgeSchema).max(3000),
  exitNodeIds: z.array(ID).max(500),
  liftEdgeCount: z.number().int().min(0),
  edgesMissingTraversalTime: z.number().int().min(0),
});
export const stationInfrastructureResponseSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["ok", "unavailable"]),
  generation: z.string().max(64).nullable(),
  schemaVersion: z.number().int().optional(),
  complexes: z.array(complexSchema).max(60).default([]),
  unmatchedStopIds: z.array(z.string().max(64)).max(500).default([]),
});

const SUPPORTED_SCHEMA_VERSION = 1;
const MAX_STOP_IDS_PER_REQUEST = 100;
const MAX_TIMEOUT_MS = 1_500;

interface CacheEntry {
  complexId: string | null;
  expiresAt: number;
}

export interface BkkStationInfrastructureProviderOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  config?: AccessibilitySidecarConfig | null;
  ttlMs?: number;
  maxStopEntries?: number;
}

const PROVIDER_DATASETS: Record<string, string> = { BKK: "bkkgtfs" };

export function createBkkStationInfrastructureProvider(options: BkkStationInfrastructureProviderOptions = {}): StationInfrastructureProvider & { clearCache(): void } {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? 30 * 60_000;
  const maxStopEntries = options.maxStopEntries ?? 4_000;
  let generation: string | null = null;
  const stopCache = new Map<string, CacheEntry>();
  const complexCache = new Map<string, CompiledStationComplex>();

  const clearCache = () => {
    stopCache.clear();
    complexCache.clear();
  };

  async function fetchSlice(gtfsStopIds: string[]): Promise<z.infer<typeof stationInfrastructureResponseSchema> | null> {
    const config = options.config === undefined ? getAccessibilitySidecarConfig() : options.config;
    if (!config) return null;
    const fetchImpl = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, MAX_TIMEOUT_MS));
    try {
      const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/station-infrastructure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.authToken}` },
        body: JSON.stringify({ dataset: PROVIDER_DATASETS.BKK, stopIds: gtfsStopIds }),
        signal: controller.signal,
      });
      if (!response.ok) {
        vedettRouteLog("routing_error", "info", { reason: "station_infrastructure_http_error", status: response.status });
        return null;
      }
      const parsed = stationInfrastructureResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        vedettRouteLog("routing_error", "warn", { reason: "station_infrastructure_malformed_body" });
        return null;
      }
      if (parsed.data.schemaVersion !== undefined && parsed.data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        vedettRouteLog("routing_error", "warn", { reason: "station_infrastructure_schema_mismatch" });
        return null;
      }
      return parsed.data;
    } catch {
      vedettRouteLog("routing_error", "info", { reason: "station_infrastructure_lookup_failed" });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    providerId: "BKK",
    clearCache,
    async lookup(motisStopIds) {
      try {
        const gtfsByMotis = new Map<string, string>();
        for (const id of motisStopIds) {
          const norm = normalizeMotisStopId(id);
          if (norm.provider === "BKK" && /^[A-Za-z0-9_.:-]{1,64}$/.test(norm.gtfsId)) gtfsByMotis.set(id, norm.gtfsId);
        }
        if (gtfsByMotis.size === 0) return null;
        const t = now();
        const missing = Array.from(new Set(gtfsByMotis.values()))
          .filter((g) => {
            const e = stopCache.get(g);
            return !e || e.expiresAt <= t || (e.complexId !== null && !complexCache.has(e.complexId));
          })
          .sort()
          .slice(0, MAX_STOP_IDS_PER_REQUEST);
        if (missing.length > 0) {
          const body = await fetchSlice(missing);
          if (!body) return null;
          if (body.status === "unavailable" || !body.generation) return null;
          if (generation !== null && generation !== body.generation) clearCache();
          generation = body.generation;
          if (stopCache.size + missing.length > maxStopEntries) clearCache();
          const expiresAt = t + ttlMs;
          for (const complex of body.complexes as CompiledStationComplex[]) {
            complexCache.set(complex.id, complex);
          }
          const nodeToComplex = new Map<string, string>();
          for (const complex of body.complexes) for (const n of complex.nodes) nodeToComplex.set(n.id, complex.id);
          for (const g of missing) stopCache.set(g, { complexId: nodeToComplex.get(g) ?? null, expiresAt });
        }
        if (!generation) return null;
        const resolve: StationStopResolver = (motisStopId) => {
          if (!motisStopId) return null;
          const g = gtfsByMotis.get(motisStopId);
          if (!g) return null;
          const entry = stopCache.get(g);
          const complex = entry?.complexId ? complexCache.get(entry.complexId) : undefined;
          return complex ? ({ complex, gtfsStopId: g } satisfies ResolvedStationStop) : null;
        };
        return { providerId: "BKK", generation, resolve };
      } catch {
        return null;
      }
    },
  };
}

let serverProvider: (StationInfrastructureProvider & { clearCache(): void }) | null = null;
/** Folyamat-szintű singleton (a cache a szerver-példány élettartamáig él). */
export function getServerStationInfrastructureProvider(): StationInfrastructureProvider {
  if (!serverProvider) serverProvider = createBkkStationInfrastructureProvider();
  return serverProvider;
}
