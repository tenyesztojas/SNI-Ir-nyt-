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
import { attachStationGuidanceToLegs } from "./guidance.ts";
import type { StationInfrastructureProvider } from "./provider.ts";

export interface StationGuidanceEnrichmentOptions {
  stepFreePreferred: boolean;
  timeBudgetMs?: number;
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
    let guided = 0;
    let displayable = 0;
    const out = ranked.map((r) => {
      const legs = attachStationGuidanceToLegs(r.journey.legs, lookup.resolve, { stepFreePreferred: options.stepFreePreferred });
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
