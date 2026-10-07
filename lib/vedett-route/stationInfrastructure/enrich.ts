// VÉDETT ÚTVONAL — STATION GUIDANCE ENRICHMENT (szerver, 2026-10-07)
//
// A rangsorolt journey-k TRANSIT lábaihoz csatolja a leszállási állomás
// guidance-ét. Egyetlen batch lookup, időkerettel; BÁRMILYEN hiba ->
// változatlan journey-k (fail-open). NEM indít újratervezést, NEM
// változtat rangsort — tisztán tájékoztató réteg.
//
// PRODUCTION DIAGNOSZTIKA (2026-10-07 fix): keresésenként EGY összesítő
// log-sor ("station_guidance" event) a kimenettel és darabszámokkal —
// így productionben is látszik, hol akad el a lánc (nincs konfiguráció,
// sidecar-hiba, időtúllépés, nem illeszkedő stop, nincs cél, nincs kijárat).
// SOHA nem kerül bele stop/trip ID, koordináta, user vagy token.

import { vedettRouteLog } from "../logger.ts";
import type { RankedJourney } from "../types.ts";
import { stationGuidanceDebugLog } from "./debug.ts";
import { attachStationGuidanceToLegs, type ExitWalkingRequest, type ExitWalkingScore } from "./guidance.ts";
import { fetchMotisWalkingRoute } from "../motisClient.ts";
import type { LatLon } from "../geometry.ts";
import type { StationInfrastructureProvider } from "./provider.ts";

/** Kijárat -> cél valódi gyalogos útvonal (alapból a MEGLÉVŐ MOTIS foot routing). */
export type ExitWalkingRouter = (from: LatLon, to: LatLon) => Promise<ExitWalkingScore | null>;

export interface StationGuidanceEnrichmentOptions {
  stepFreePreferred: boolean;
  timeBudgetMs?: number;
  /** null = nincs valódi gyalogos rangsor (légvonal); undefined = MOTIS foot routing. */
  walkingRouter?: ExitWalkingRouter | null;
  walkingBudgetMs?: number;
  maxWalkingRequests?: number;
}

const DEFAULT_WALKING_BUDGET_MS = 1_500;
const DEFAULT_MAX_WALKING_REQUESTS = 8;

/** A meglévő motisClient.fetchMotisWalkingRoute() adaptere; hiba -> null (fail-open). */
export const motisExitWalkingRouter: ExitWalkingRouter = async (from, to) => {
  try {
    const r = await fetchMotisWalkingRoute({ lat: from.lat, lng: from.lon, level: 0 }, { lat: to.lat, lng: to.lon, level: 0 });
    if (!r.ok) return null;
    const { duration, distance } = r.data.metadata;
    return Number.isFinite(duration) && Number.isFinite(distance) && duration >= 0 && distance >= 0 ? { durationSeconds: duration, distanceMeters: distance } : null;
  } catch {
    return null;
  }
};

/** Egyedi kérések párhuzamosan, közös időkerettel; ami nem ér be, kimarad. */
async function scoreWalkingRequests(requests: ExitWalkingRequest[], router: ExitWalkingRouter, budgetMs: number): Promise<Map<string, ExitWalkingScore>> {
  const scores = new Map<string, ExitWalkingScore>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  const all = Promise.all(
    requests.map(async (req) => {
      try {
        const score = await router(req.from, req.to);
        if (score) scores.set(req.key, score);
      } catch {
        // fail-open
      }
    })
  );
  await Promise.race([all, deadline]).finally(() => clearTimeout(timer));
  return new Map(scores);
}

export type StationGuidanceEnrichmentOutcome = "OK" | "NO_TRANSIT" | "LOOKUP_UNAVAILABLE" | "ENRICHMENT_TIMEOUT" | "ERROR";

const DEFAULT_TIME_BUDGET_MS = 1_800;
const TIMEOUT = Symbol("timeout");

function logOutcome(outcome: StationGuidanceEnrichmentOutcome, details: Record<string, number | string> = {}): void {
  vedettRouteLog("station_guidance", "info", { outcome, ...details });
  stationGuidanceDebugLog("enrichment_result", { outcome, ...details });
}

export async function enrichRankedJourneysWithStationGuidance(
  ranked: RankedJourney[],
  provider: StationInfrastructureProvider,
  options: StationGuidanceEnrichmentOptions
): Promise<RankedJourney[]> {
  try {
    const stopIds = new Set<string>();
    let transitLegs = 0;
    for (const r of ranked) {
      for (const leg of r.journey.legs) {
        if (leg.mode !== "TRANSIT") continue;
        transitLegs++;
        if (leg.toStopId) stopIds.add(leg.toStopId);
        if (leg.fromStopId) stopIds.add(leg.fromStopId);
      }
    }
    if (stopIds.size === 0) {
      logOutcome("NO_TRANSIT", { transitLegs });
      return ranked;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
    });
    const lookup = await Promise.race([provider.lookup(Array.from(stopIds).sort()), timeout]).finally(() => clearTimeout(timer));
    if (lookup === TIMEOUT) {
      logOutcome("ENRICHMENT_TIMEOUT", { transitLegs });
      return ranked;
    }
    if (!lookup) {
      logOutcome("LOOKUP_UNAVAILABLE", { transitLegs });
      return ranked;
    }
    // Lábankénti státusz-számláló: STOP_ID_UNMATCHED = a leszállási stop
    // nem tartozik ismert állomás-komplexumhoz (pl. felszíni megálló).
    const statusCounts: Record<string, number> = { STOP_ID_UNMATCHED: 0 };
    // 1. menet: légvonalbeli rangsor + a gyalogos routingra javasolt kijárat -> cél párok.
    const requests = new Map<string, ExitWalkingRequest>();
    const firstPass = ranked.map((r) =>
      attachStationGuidanceToLegs(r.journey.legs, lookup.resolve, {
        stepFreePreferred: options.stepFreePreferred,
        onWalkingRequests: (reqs) => {
          for (const req of reqs) {
            const prev = requests.get(req.key);
            if (!prev || (req.rank ?? 0) < (prev.rank ?? 0)) requests.set(req.key, prev ? { ...prev, rank: req.rank } : req);
          }
        },
      })
    );
    // 2. menet (opcionális): valódi gyalogos útvonal a legígéretesebb kijáratokra.
    const router = options.walkingRouter === undefined ? motisExitWalkingRouter : options.walkingRouter;
    let walkingScores: Map<string, ExitWalkingScore> | null = null;
    // HARD cap (alapból 8 egyedi kérés / keresés). Rang szerint priorizál
    // (stabil rendezés): minden láb top jelöltjei előbb, mint bármely láb
    // toleranciából bekerült további jelöltjei.
    const walkingQueue = Array.from(requests.values())
      .map((req, order) => ({ req, order }))
      .sort((a, b) => (a.req.rank ?? 0) - (b.req.rank ?? 0) || a.order - b.order)
      .map((x) => x.req)
      .slice(0, options.maxWalkingRequests ?? DEFAULT_MAX_WALKING_REQUESTS);
    if (router && walkingQueue.length > 0) {
      walkingScores = await scoreWalkingRequests(walkingQueue, router, options.walkingBudgetMs ?? DEFAULT_WALKING_BUDGET_MS);
    }
    const finalLegs =
      walkingScores && walkingScores.size > 0
        ? ranked.map((r) => attachStationGuidanceToLegs(r.journey.legs, lookup.resolve, { stepFreePreferred: options.stepFreePreferred, walkingScores: walkingScores! }))
        : firstPass;

    let guided = 0;
    let displayable = 0;
    const out = ranked.map((r, idx) => {
      const legs = finalLegs[idx];
      for (const leg of legs) {
        if (leg.mode !== "TRANSIT") continue;
        const g = leg.stationGuidance;
        if (!g) {
          statusCounts.STOP_ID_UNMATCHED++;
          continue;
        }
        guided++;
        statusCounts[g.status] = (statusCounts[g.status] ?? 0) + 1;
        const conf = g.exit?.confidence ?? g.transfer?.confidence;
        if (conf === "HIGH" || conf === "MEDIUM") displayable++;
        stationGuidanceDebugLog("leg_guidance", {
          status: g.status,
          capability: g.capability,
          exitConfidence: g.exit?.confidence ?? null,
          transferConfidence: g.transfer?.confidence ?? null,
          liftPath: Boolean(g.exit?.reasonCodes.includes("LIFT_PATH_AVAILABLE") || g.transfer?.liftAvailable),
          boardingTarget: Boolean(g.boardingTarget),
        });
      }
      return { ...r, journey: { ...r.journey, legs } };
    });
    logOutcome("OK", {
      transitLegs,
      guidedLegs: guided,
      displayableLegs: displayable,
      walkingRequests: walkingQueue.length,
      walkingRoutes: walkingScores?.size ?? 0,
      statuses: Object.entries(statusCounts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .sort()
        .join(","),
    });
    return out;
  } catch {
    logOutcome("ERROR");
    return ranked;
  }
}
