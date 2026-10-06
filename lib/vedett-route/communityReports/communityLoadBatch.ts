// VÉDETT ÚTVONAL — COMMUNITY LOAD BATCH (KIZÁRÓLAG szerver).
//
// Több route+szakasz+időpont kontextus közös értékelése N+1 nélkül: EGY
// profil-lekérdezés + legfeljebb KÉT realtime lekérdezés. A community-load API
// és a keresési orchestrator (személyre szabott rangsorolás) is ezt használja.

import { ADJACENT_BUCKET_RADIUS, dayTypeOfWeekday } from "./historicalConfig.ts";
import { computeCommunityReportTimeKeys } from "./context.ts";
import { evaluateCommunityLoad, isRealtimeApplicable, type CommunityLoadEvaluation, type ExpectedLoadContext } from "./expectedLoadEngine.ts";
import { fetchLoadProfilesForLookup } from "./historicalRepository.ts";
import { fetchRealtimeCandidateReportsBatch } from "./repository.ts";
import { buildSegmentKey } from "./context.ts";
import type { CommunityLegContext, CommunityLoadProvider } from "./communityRouting.ts";

export async function evaluateCommunityLoadContexts(contexts: readonly ExpectedLoadContext[], now: Date): Promise<CommunityLoadEvaluation[]> {
  const routeIds = new Set<string>();
  const weekdays = new Set<number>();
  const buckets = new Set<number>();
  for (const ctx of contexts) {
    const keys = computeCommunityReportTimeKeys(ctx.at);
    routeIds.add(ctx.routeId);
    for (let d = 1; d <= 7; d++) if (dayTypeOfWeekday(d) === dayTypeOfWeekday(keys.weekday)) weekdays.add(d);
    for (let b = keys.timeBucket - ADJACENT_BUCKET_RADIUS; b <= keys.timeBucket + ADJACENT_BUCKET_RADIUS; b++) if (b >= 0 && b <= 95) buckets.add(b);
  }
  const profiles = (await fetchLoadProfilesForLookup([...routeIds], [...weekdays], [...buckets])) ?? [];

  const realtimeContexts = contexts.filter((ctx) => isRealtimeApplicable(ctx.at, now));
  const realtimeRecords =
    realtimeContexts.length > 0
      ? (await fetchRealtimeCandidateReportsBatch(
          realtimeContexts.map((c) => c.tripId).filter((t): t is string => Boolean(t)),
          realtimeContexts.map((c) => c.routeId),
          now
        )) ?? []
      : [];

  return contexts.map((context) => evaluateCommunityLoad({ context, profiles, realtimeRecords, now }).evaluation);
}

/** Orchestrator-provider: szakasz-kontextus -> ExpectedLoadContext (indulási idő, különben "most"). */
export function createServerCommunityLoadProvider(): CommunityLoadProvider {
  return {
    async evaluateChunk(contexts: readonly CommunityLegContext[], now: Date) {
      return evaluateCommunityLoadContexts(
        contexts.map((c) => {
          const t = c.departureTime ? Date.parse(c.departureTime) : Number.NaN;
          return {
            routeId: c.routeId,
            tripId: c.tripId,
            segmentKey: buildSegmentKey(c.fromStopId, c.toStopId),
            at: Number.isFinite(t) ? new Date(t) : now,
          };
        }),
        now
      );
    },
  };
}
