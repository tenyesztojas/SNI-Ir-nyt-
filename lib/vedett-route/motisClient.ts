// Routing Engine kliens — valós MOTIS (https://motis-project.de/) integráció,
// a VPS-en futó, HTTPS-en publikált "route service"-en KERESZTÜL.
//
// ARCHITEKTÚRA (VPS → Staging Integration Gate, 2026-09-07, lásd
// docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md):
//
//   böngésző → VédettSarok Next.js szerver/API → HTTPS route service
//            → localhost:8081 MOTIS (a VPS-en, NEM publikus port)
//
// Ez a kliens SOHA nem hívja közvetlenül a 127.0.0.1:8080/8081 portokat
// production-ben — azok szándékosan nem publikusak. Helyette a
// ROUTE_SERVICE_URL + ROUTE_SERVICE_AUTH_TOKEN env változópár alapján egy
// authentikált HTTPS hívást indít a route service felé (lásd config.ts
// getRouteServiceConfig()). Fejlesztői gépen, amikor a route service még
// nincs elérhető, a getLegacyDirectMotisBaseUrl() (MOTIS_BASE_URL env
// változó, NODE_ENV=production alatt letiltva) ad egy közvetlen,
// KIZÁRÓLAG fejlesztői fallback-et.
//
// Amíg egyik sincs beállítva, szabályos "routing_engine_unavailable" választ
// ad — sosem dob nyers exception-t, sosem generál kitalált útvonalat
// (FAIL CLOSED, lásd architektúra szabály #8 a staging gate dokumentumban).
//
// Ez a kliens KIZÁRÓLAG a hivatalos, ellenőrzött MOTIS API paramétereket
// használja (lásd MotisPlanParams a motisTypes.ts-ben) — soha nem
// találgatott/nem dokumentált paramétert.

import { getRouteServiceConfig, getLegacyDirectMotisBaseUrl } from "./config.ts";
import { vedettRouteLog } from "./logger.ts";
import type { MotisPlanParams, MotisPlanResponse, MotisPlanResult } from "./motisTypes.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

type RouteTarget =
  | { mode: "route_service"; baseUrl: string; authToken: string; timeoutMs: number }
  | { mode: "legacy_direct"; baseUrl: string }
  | null;

// Melyik útvonalat használjuk: a route service (production/staging) mindig
// elsőbbséget élvez a legacy közvetlen MOTIS eléréssel szemben, ha mindkettő
// konfigurálva van (pl. egy fejlesztői gépen, ahol a .env.local mindkettőt
// tartalmazza tesztelés céljából).
function resolveRouteTarget(): RouteTarget {
  const routeService = getRouteServiceConfig();
  if (routeService) {
    return { mode: "route_service", baseUrl: routeService.baseUrl, authToken: routeService.authToken, timeoutMs: routeService.timeoutMs };
  }
  const legacyBaseUrl = getLegacyDirectMotisBaseUrl();
  if (legacyBaseUrl) {
    return { mode: "legacy_direct", baseUrl: legacyBaseUrl };
  }
  return null;
}

function buildQuery(params: MotisPlanParams): URLSearchParams {
  const q = new URLSearchParams();
  q.set("fromPlace", params.fromPlace);
  q.set("toPlace", params.toPlace);
  if (params.time) q.set("time", params.time);
  if (params.arriveBy !== undefined) q.set("arriveBy", String(params.arriveBy));
  if (params.numItineraries !== undefined) q.set("numItineraries", String(params.numItineraries));
  if (params.maxItineraries !== undefined) q.set("maxItineraries", String(params.maxItineraries));
  if (params.maxTransfers !== undefined) q.set("maxTransfers", String(params.maxTransfers));
  if (params.transitModes && params.transitModes.length > 0) {
    for (const m of params.transitModes) q.append("transitModes", m);
  }
  if (params.searchWindow !== undefined) q.set("searchWindow", String(params.searchWindow));
  if (params.algorithm) q.set("algorithm", params.algorithm);
  if (params.timeout !== undefined) q.set("timeout", String(params.timeout));
  return q;
}

// SOHA ne kerüljön a route service auth token vagy a teljes Authorization
// fejléc a logba — lásd logger.ts redact()-je is véd erre, de itt sem adjuk
// át magát a headert, csak azt, hogy volt-e egyáltalán auth hiba.
function buildHeaders(target: Extract<RouteTarget, { mode: "route_service" }>): HeadersInit {
  return {
    Authorization: `Bearer ${target.authToken}`,
    Accept: "application/json",
  };
}

interface FetchOutcome {
  ok: boolean;
  status?: number;
  json?: unknown;
  parseError?: boolean;
  networkError?: boolean;
  timeoutError?: boolean;
}

async function performFetch(url: string, headers: HeadersInit | undefined, timeoutMs: number): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(Math.min(timeoutMs, MAX_TIMEOUT_MS)),
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    try {
      const json = await res.json();
      return { ok: true, status: res.status, json };
    } catch {
      // Malformed upstream response — HTTP 200, de nem valid JSON.
      return { ok: false, status: res.status, parseError: true };
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    if (isTimeout) return { ok: false, timeoutError: true };
    return { ok: false, networkError: true };
  }
}

// Retry/fallback stratégia (B) pont, staging gate spec): EGYETLEN retry,
// KIZÁRÓLAG hálózati szintű hibán (kapcsolat elutasítva, DNS hiba, stb.) —
// SOHA nem retry-olunk időtúllépésen (az csak duplázná a válaszidőt a
// felhasználó felé) és SOHA nem retry-olunk HTTP hibaválaszon (4xx/5xx —
// azt a route service/MOTIS szándékosan adta vissza, egy azonnali
// ismétlés nem valószínű, hogy mást eredményezne). A retry előtt rövid,
// fix 250 ms várakozás — nem exponenciális backoff, mert csak egy próbáról
// van szó egy már amúgy is szűk (max 25 mp-es Vercel function) időkereten
// belül.
async function fetchWithSingleRetryOnNetworkError(
  url: string,
  headers: HeadersInit | undefined,
  timeoutMs: number
): Promise<FetchOutcome> {
  const first = await performFetch(url, headers, timeoutMs);
  if (!first.networkError) return first;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return performFetch(url, headers, timeoutMs);
}

export async function fetchMotisPlan(params: MotisPlanParams): Promise<MotisPlanResult> {
  const target = resolveRouteTarget();

  if (!target) {
    vedettRouteLog("routing_engine_unavailable", "warn", { reason: "route_service_not_configured" });
    return {
      ok: false,
      reason: "routing_engine_unavailable",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }

  const query = buildQuery(params).toString();
  const url = `${target.baseUrl}/api/v6/plan?${query}`;
  const timeoutMs = params.timeout !== undefined ? params.timeout * 1000 : DEFAULT_TIMEOUT_MS;
  const headers = target.mode === "route_service" ? buildHeaders(target) : undefined;

  const outcome =
    target.mode === "route_service"
      ? await fetchWithSingleRetryOnNetworkError(url, headers, timeoutMs)
      : await performFetch(url, headers, timeoutMs);

  if (outcome.timeoutError) {
    vedettRouteLog("timeout", "error", { mode: target.mode });
    return {
      ok: false,
      reason: "timeout",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }

  if (outcome.networkError) {
    vedettRouteLog("routing_engine_unavailable", "error", { mode: target.mode, reason: "network_error" });
    return {
      ok: false,
      reason: "routing_engine_unavailable",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }

  if (outcome.parseError) {
    vedettRouteLog("malformed_response", "error", { mode: target.mode, status: outcome.status });
    return {
      ok: false,
      reason: "routing_error",
      status: outcome.status,
      message: "A routing motor hibás választ adott.",
    };
  }

  if (!outcome.ok) {
    // Auth hiba (401/403) KÜLÖN logolva, hogy a route service auth
    // token esetleges lejárata/rossz konfigurációja azonnal látszódjon a
    // szerver logban — de a felhasználó felé ugyanaz az általános üzenet
    // megy, hogy semmilyen infrastrukturális részlet ne szivárogjon ki.
    if (outcome.status === 401 || outcome.status === 403) {
      vedettRouteLog("routing_error", "error", { mode: target.mode, status: outcome.status, reason: "route_service_auth_failed" });
    } else {
      vedettRouteLog("routing_error", "error", { mode: target.mode, status: outcome.status });
    }
    return {
      ok: false,
      reason: "routing_error",
      status: outcome.status,
      message: "A routing motor hibát adott vissza.",
    };
  }

  return { ok: true, data: outcome.json as MotisPlanResponse };
}
