// VÉDETT ÚTVONAL — STATION GUIDANCE ENRICHMENT (szerver, 2026-10-07)
//
// A rangsorolt journey-k TRANSIT lábaihoz csatolja a leszállási állomás
// guidance-ét. Egyetlen batch lookup, időkerettel; BÁRMILYEN hiba ->
// változatlan journey-k (fail-open). NEM indít újratervezést, NEM
// változtat rangsort — tisztán tájékoztató réteg.

import type { RankedJourney } from "../types.ts";
import { stationGuidanceDebugLog } from "./debug.ts";
import { attachStationGuidanceToLegs } from "./guidance.ts";
import type { StationInfrastructureProvider } from "./provider.ts";

export interface StationGuidanceEnrichmentOptions {
  stepFreePreferred: boolean;
  timeBudgetMs?: number;
}

const DEFAULT_TIME_BUDGET_MS = 1_800;

export async function enrichRankedJourneysWithStationGuidance(
  ranked: RankedJourney[],
  provider: StationInfrastructureProvider,
  options: StationGuidanceEnrichmentOptions
): Promise<RankedJourney[]> {
  try {
    const stopIds = new Set<string>();
    for (const r of ranked) {
      for (const leg of r.journey.legs) {
        if (leg.mode !== "TRANSIT") continue;
        if (leg.toStopId) stopIds.add(leg.toStopId);
        if (leg.fromStopId) stopIds.add(leg.fromStopId);
      }
    }
    if (stopIds.size === 0) {
      stationGuidanceDebugLog("enrichment_skipped", { reason: "no_transit" });
      return ranked;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
    });
    const lookup = await Promise.race([provider.lookup(Array.from(stopIds).sort()), timeout]).finally(() => clearTimeout(timer));
    if (!lookup) {
      stationGuidanceDebugLog("enrichment_skipped", { reason: "no_station_infrastructure" });
      return ranked;
    }
    let guided = 0;
    const out = ranked.map((r) => {
      const legs = attachStationGuidanceToLegs(r.journey.legs, lookup.resolve, { stepFreePreferred: options.stepFreePreferred });
      for (const leg of legs) {
        if (leg.stationGuidance) {
          guided++;
          stationGuidanceDebugLog("leg_guidance", {
            status: leg.stationGuidance.status,
            capability: leg.stationGuidance.capability,
            exitConfidence: leg.stationGuidance.exit?.confidence ?? null,
            transferConfidence: leg.stationGuidance.transfer?.confidence ?? null,
            liftPath: Boolean(leg.stationGuidance.exit?.reasonCodes.includes("LIFT_PATH_AVAILABLE") || leg.stationGuidance.transfer?.liftAvailable),
            boardingTarget: Boolean(leg.stationGuidance.boardingTarget),
          });
        }
      }
      return { ...r, journey: { ...r.journey, legs } };
    });
    stationGuidanceDebugLog("enrichment_result", { guidedLegs: guided });
    return out;
  } catch {
    stationGuidanceDebugLog("enrichment_skipped", { reason: "error" });
    return ranked;
  }
}
