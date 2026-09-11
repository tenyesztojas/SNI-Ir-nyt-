// VPS ACCESSIBILITY SIDECAR — minimális HTTP szerver (Task C3, spec
// 8/9/10/14/19/20. pont).
//
// Szándékosan NEM használ semmilyen web keretrendszert (spec: "egyszerű,
// kis footprintű Node vagy Python process, felesleges keretrendszer
// nélkül") — csak a beépített node:http modult.
//
// Két endpoint:
//   GET  /health   — publikus (Caddy mögött, de nem igényel auth-ot; NEM
//                     tartalmaz secretet/GPS-t/koordinátát/felhasználói
//                     adatot, kizárólag a manifest mezőket + "status"-t,
//                     lásd spec 20. pont).
//   POST /lookup    — Bearer-auth kötelező. Body: {dataset, stopIds?,
//                     tripIds?, pathwayQueries?}. Response: {provider,
//                     dataset, generation, builtAt, stops, trips,
//                     pathways} — SOSEM a teljes indexet, csak a kért
//                     id-k/pathway-kérdések által érintett, SZŰKÍTETT
//                     részhalmazt (spec 6/17. pont).
//
// Biztonság (spec 9. pont): a browser SOHA nem éri el ezt közvetlenül —
// ez csak localhost-on figyel (nem 0.0.0.0-n), a Caddy reverse proxy
// (VPS-en, külön konfigurálva, lásd a deployment dokumentumot) exponálja
// KIZÁRÓLAG a /lookup útvonalat a route.vedettsarok.hu mögött, a MEGLÉVŐ
// Bearer-auth modellt újrahasznosítva (ugyanaz a minta, mint a
// lib/vedett-route/config.ts getRouteServiceConfig()-je — külön secret,
// hogy a route-service tokenje és a sidecar tokenje ne legyen ugyanaz,
// lásd README.md).
//
// Fail-safe / hibakezelés (spec 15. pont szerver-oldali tükre): ez a
// szerver SOSEM dob 5xx-et azért, mert egy dataset "csak" még nincs
// betöltve (buildIndex.ts még nem futott le rá ezen a gépen) — ilyenkor
// 200-at ad, status:"unavailable", üres kollekciókkal, generation:null-lal
// — a Next.js kliens ezt egyértelműen meg tudja különböztetni egy valódi
// hibától, de MINDKETTŐ esetben a végeredmény ugyanaz kell legyen a
// klasszifikációban (null index -> UNKNOWN), lásd accessibilityLookupClient.ts.
// 5xx KIZÁRÓLAG váratlan, programozási hibára utaló esetben megy vissza.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { getLoadedDataset, pollDatasetOnce, startPolling } from "./activeIndexStore.js";
import { selectPathwaySubgraph, type PathwayQuery } from "./stationSubgraph.js";
import type { StopAccessibilityIndexEntry, TripAccessibilityIndexEntry } from "./lib/accessibilityIndex.js";

// --- Konfiguráció (env-alapú, spec 9/19. pont) -------------------------

export function configuredDatasets(): string[] {
  const raw = process.env.ACCESSIBILITY_SIDECAR_DATASETS?.trim();
  if (!raw) return ["bkkgtfs"]; // egyetlen ma ismert dataset, de NEM hardkódolt logika — új dataset felvétele csak env-változtatás, kód nem
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function authToken(): string | null {
  return process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN?.trim() || null;
}

export function port(): number {
  const raw = process.env.ACCESSIBILITY_SIDECAR_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8082; // MOTIS a 8080/8081-et használja — 8082 szabad
}

// Kérés-méret korlátok (spec 20/visszaélés-védelem) — egy rosszul
// formázott/túl nagy request se okozzon aránytalan memória-/CPU-terhelést.
const MAX_IDS_PER_FIELD = 500;
const MAX_BODY_BYTES = 256 * 1024; // 256 KiB — bőven elég néhány száz id-hez, de védelem egy elszabadult kliens ellen

function timingSafeTokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = authToken();
  if (!expected) return false; // nincs konfigurált token -> soha nem engedünk be senkit (fail closed, nem fail open)
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length).trim();
  if (!provided) return false;
  return timingSafeTokenEquals(provided, expected);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

interface LookupRequestBody {
  dataset?: unknown;
  stopIds?: unknown;
  tripIds?: unknown;
  pathwayQueries?: unknown;
}

interface ParsedLookupRequest {
  dataset: string;
  stopIds: string[];
  tripIds: string[];
  pathwayQueries: PathwayQuery[];
}

function isStringArrayWithinLimit(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_IDS_PER_FIELD && value.every((v) => typeof v === "string");
}

function parseLookupRequest(raw: string): ParsedLookupRequest | { error: string } {
  let parsed: LookupRequestBody;
  try {
    parsed = JSON.parse(raw) as LookupRequestBody;
  } catch {
    return { error: "MALFORMED_JSON" };
  }
  if (!parsed || typeof parsed !== "object") return { error: "MALFORMED_BODY" };
  if (typeof parsed.dataset !== "string" || parsed.dataset.length === 0) return { error: "MISSING_DATASET" };

  const stopIds = parsed.stopIds === undefined ? [] : parsed.stopIds;
  const tripIds = parsed.tripIds === undefined ? [] : parsed.tripIds;
  const pathwayQueries = parsed.pathwayQueries === undefined ? [] : parsed.pathwayQueries;

  if (!isStringArrayWithinLimit(stopIds)) return { error: "INVALID_STOP_IDS" };
  if (!isStringArrayWithinLimit(tripIds)) return { error: "INVALID_TRIP_IDS" };
  if (
    !Array.isArray(pathwayQueries) ||
    pathwayQueries.length > MAX_IDS_PER_FIELD ||
    !pathwayQueries.every(
      (q): q is PathwayQuery =>
        !!q && typeof q === "object" && typeof (q as PathwayQuery).fromStopId === "string" && typeof (q as PathwayQuery).toStopId === "string"
    )
  ) {
    return { error: "INVALID_PATHWAY_QUERIES" };
  }

  return { dataset: parsed.dataset, stopIds, tripIds, pathwayQueries };
}

function pickStops(stopsById: Record<string, StopAccessibilityIndexEntry>, stopIds: string[]): Record<string, StopAccessibilityIndexEntry> {
  const out: Record<string, StopAccessibilityIndexEntry> = {};
  for (const id of stopIds) {
    const entry = stopsById[id];
    if (entry) out[id] = entry;
  }
  return out;
}

function pickTrips(tripsById: Record<string, TripAccessibilityIndexEntry>, tripIds: string[]): Record<string, TripAccessibilityIndexEntry> {
  const out: Record<string, TripAccessibilityIndexEntry> = {};
  for (const id of tripIds) {
    const entry = tripsById[id];
    if (entry) out[id] = entry;
  }
  return out;
}

async function handleHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const datasets = configuredDatasets().map((dataset) => {
    const loaded = getLoadedDataset(dataset);
    if (!loaded) {
      return { dataset, status: "unavailable" as const };
    }
    return {
      provider: loaded.manifest.provider,
      dataset,
      generation: loaded.manifest.generation,
      builtAt: loaded.manifest.builtAt,
      stopCount: loaded.manifest.stopCount,
      tripCount: loaded.manifest.tripCount,
      pathwayCount: loaded.manifest.pathwayCount,
      status: "ok" as const,
    };
  });
  sendJson(res, 200, { ok: true, datasets });
}

async function handleLookup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "UNAUTHORIZED" });
    return;
  }

  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch (err) {
    if (err instanceof Error && err.message === "BODY_TOO_LARGE") {
      sendJson(res, 413, { ok: false, error: "BODY_TOO_LARGE" });
      return;
    }
    sendJson(res, 400, { ok: false, error: "BODY_READ_FAILED" });
    return;
  }

  const parsedRequest = parseLookupRequest(rawBody);
  if ("error" in parsedRequest) {
    sendJson(res, 400, { ok: false, error: parsedRequest.error });
    return;
  }
  const { dataset, stopIds, tripIds, pathwayQueries } = parsedRequest;

  if (!configuredDatasets().includes(dataset)) {
    // Ismeretlen dataset — spec 19. pont: SOSEM crash, a kliens ezt
    // "unavailable"-ként kell kezelje (-> UNKNOWN), nem hibaként.
    sendJson(res, 404, { ok: false, error: "UNKNOWN_DATASET" });
    return;
  }

  const loaded = getLoadedDataset(dataset);
  if (!loaded) {
    sendJson(res, 200, {
      ok: true,
      status: "unavailable",
      provider: null,
      dataset,
      generation: null,
      builtAt: null,
      stops: {},
      trips: {},
      pathways: [],
    });
    return;
  }

  const stops = pickStops(loaded.index.stopsById, stopIds);
  const trips = pickTrips(loaded.index.tripsById, tripIds);
  const pathways = selectPathwaySubgraph(loaded.index, pathwayQueries);

  sendJson(res, 200, {
    ok: true,
    status: "ok",
    provider: loaded.manifest.provider,
    dataset,
    generation: loaded.manifest.generation,
    builtAt: loaded.manifest.builtAt,
    stops,
    trips,
    pathways,
  });
}

export function createAccessibilitySidecarServer() {
  return createServer((req, res) => {
    void (async () => {
      try {
        const url = req.url ?? "/";
        const path = url.split("?")[0];
        if (req.method === "GET" && path === "/health") {
          await handleHealth(req, res);
          return;
        }
        if (req.method === "POST" && path === "/lookup") {
          await handleLookup(req, res);
          return;
        }
        sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
      } catch (err) {
        // Váratlan, programozási hibára utaló eset — ide SOSEM szabadna
        // eljutni a fenti defenzív kezelés miatt, de ha mégis, 500-at
        // adunk, és a hibaüzenetben SOSEM logolunk/adunk vissza
        // koordinátát/secretet (a request body-t sem echo-zzuk vissza).
        console.error("[accessibility-sidecar] unexpected error", err instanceof Error ? err.message : "unknown");
        sendJson(res, 500, { ok: false, error: "INTERNAL_ERROR" });
      }
    })();
  });
}

const isDirectCliRun = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));
if (isDirectCliRun) {
  if (!authToken()) {
    console.error("[accessibility-sidecar] ACCESSIBILITY_SIDECAR_AUTH_TOKEN nincs beállítva — a /lookup endpoint minden kérést el fog utasítani.");
  }
  const datasets = configuredDatasets();
  startPolling(datasets, 10_000);
  for (const dataset of datasets) {
    pollDatasetOnce(dataset).catch(() => {});
  }
  const listenPort = port();
  createAccessibilitySidecarServer().listen(listenPort, "127.0.0.1", () => {
    console.log(`[accessibility-sidecar] listening on 127.0.0.1:${listenPort} (datasets: ${datasets.join(", ")})`);
  });
}
