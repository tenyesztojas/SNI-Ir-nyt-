// VÉDETT ÚTVONAL — EXPECTED COMMUNITY LOAD API — validáció + publikus kimenet.

import { z } from "zod";
import { EXPECTED_LOAD_API } from "./historicalConfig.ts";
import type { CommunityLoadEvaluation } from "./expectedLoadEngine.ts";

const TRANSIT_ID_PATTERN = /^[A-Za-z0-9_.:\-]{1,200}$/;
const transitId = z.string().regex(TRANSIT_ID_PATTERN, "Érvénytelen azonosító.");

export const expectedLoadContextSchema = z
  .object({
    routeId: transitId,
    tripId: transitId.nullable().optional(),
    fromStopId: transitId.nullable().optional(),
    toStopId: transitId.nullable().optional(),
    /** ISO időpont; hiányában "most". */
    departureTime: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const expectedLoadRequestSchema = z
  .object({
    contexts: z.array(expectedLoadContextSchema).min(1).max(EXPECTED_LOAD_API.maxContexts),
  })
  .strict();

export type ExpectedLoadRequest = z.infer<typeof expectedLoadRequestSchema>;

/** Időpont-ellenőrzés: legfeljebb 2 órával korábbi és maxFutureDays-szel későbbi. */
export function resolveDepartureTime(value: string | null | undefined, now: Date): Date | null {
  if (!value) return now;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  if (t < now.getTime() - 2 * 3600_000 || t > now.getTime() + EXPECTED_LOAD_API.maxFutureDays * 86_400_000) return null;
  return new Date(t);
}

/**
 * Kliensnek kiadható alak: aggregált értékek, nincs nyers report, token,
 * koordináta, belső breakdown, minta-darabszám vagy napszám.
 */
export function toPublicLoadEvaluation(evaluation: CommunityLoadEvaluation) {
  return {
    weekday: evaluation.weekday,
    dayType: evaluation.dayType,
    timeBucket: evaluation.timeBucket,
    realtimeApplicable: evaluation.realtimeApplicable,
    routing: evaluation.routing,
    kinds: evaluation.kinds.map((k) => ({
      kind: k.kind,
      historical: {
        source: k.historical.source,
        status: k.historical.status,
        expectedScore: k.historical.expectedScore,
        confidence: k.historical.confidence,
        sampleStrength: k.historical.sampleStrength,
        fallbackLevel: k.historical.fallbackLevel,
      },
      realtime: k.realtime ? { score: k.realtime.score, confidence: k.realtime.confidence } : null,
      combined: k.combined,
      historicalPenalty: k.historicalPenalty,
      realtimePenalty: k.realtimePenalty,
      combinedPenalty: k.combinedPenalty,
    })),
  };
}
