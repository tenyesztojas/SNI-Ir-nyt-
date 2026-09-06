// Routing Engine kliens — valós MOTIS (https://motis-project.de/) integráció.
//
// STÁTUSZ (Sprint 2): a MOTIS ténylegesen üzembe lett állítva (Docker, lásd
// docs/vedett-route/MOTIS_GO_LIVE_REPORT.md), valós magyarországi OSM adattal
// és valós BKK GTFS menetrenddel importálva. A /api/v6/plan hivatalos,
// dokumentált végpontját hívjuk — lásd
// https://github.com/motis-project/motis/blob/master/openapi.yaml
//
// Ez a kliens KIZÁRÓLAG a hivatalos, ellenőrzött MOTIS API paramétereket
// használja (lásd MotisPlanParams a motisTypes.ts-ben) — soha nem
// találgatott/nem dokumentált paramétert.
//
// Amíg MOTIS_BASE_URL nincs beállítva, szabályos "routing_engine_unavailable"
// választ ad — sosem dob nyers exception-t, sosem generál kitalált útvonalat.
//
// BIZTONSÁG: a MOTIS_BASE_URL mindig egy privát hálózaton / localhoston futó
// instance-ra mutat (lásd docs/vedett-route/PRODUCTION_DEPLOYMENT.md — a MOTIS
// portja SOHA nem publikus, csak a Next.js szerver oldali kódja éri el).

import { getMotisBaseUrl } from "./config.ts";
import { vedettRouteLog } from "./logger.ts";
import type { MotisPlanParams, MotisPlanResult } from "./motisTypes.ts";

const DEFAULT_TIMEOUT_MS = 10_000;

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

export async function fetchMotisPlan(params: MotisPlanParams): Promise<MotisPlanResult> {
  const baseUrl = getMotisBaseUrl();

  if (!baseUrl) {
    vedettRouteLog("routing_engine_unavailable", "warn", { reason: "motis_not_configured" });
    return {
      ok: false,
      reason: "routing_engine_unavailable",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }

  const timeoutMs = (params.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;

  try {
    const res = await fetch(`${baseUrl}/api/v6/plan?${buildQuery(params).toString()}`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 30_000)),
      cache: "no-store",
    });

    if (!res.ok) {
      vedettRouteLog("routing_error", "error", { status: res.status });
      return {
        ok: false,
        reason: "routing_error",
        status: res.status,
        message: "A routing motor hibát adott vissza.",
      };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    vedettRouteLog(isTimeout ? "timeout" : "routing_error", "error", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      reason: isTimeout ? "timeout" : "routing_engine_unavailable",
      message: "Az útvonaltervezés átmenetileg nem érhető el.",
    };
  }
}
