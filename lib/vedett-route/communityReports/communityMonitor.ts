// VÉDETT ÚTVONAL — DYNAMIC SENSORY REROUTING — aktív útvonal közösségi monitor (kliens-biztos, tiszta).
//
// A /api/vedett-route/community-load publikus (aggregált) válaszát alakítja a
// szerveroldali rangsorolással AZONOS értékelő függvények bemenetévé, majd a
// HÁTRALÉVŐ szakaszokra személyes (crowding/noise érzékenységgel súlyozott)
// út-szintű közösségi állapotot ad. Nincs GPS, nincs azonosító-tárolás.

import type { CommunityLoadEvaluation, KindLoadEvaluation } from "./expectedLoadEngine.ts";
import type { CommunitySensitivity } from "./communityRoutingConfig.ts";
import {
  aggregateJourneyCommunity,
  assessLegCommunity,
  summarizeJourneyCommunityState,
  type CommunityLegContext,
  type JourneyCommunityAssessment,
  type JourneyCommunityState,
} from "./communityRouting.ts";
import type { RealtimeStateKind } from "./realtimeConfig.ts";
import type { DataQuality, TimeFallbackLevel } from "./historicalConfig.ts";

/** A toPublicLoadEvaluation() kimenetének alakja (szerver -> kliens). */
export interface PublicLoadEvaluation {
  weekday: number;
  dayType: CommunityLoadEvaluation["dayType"];
  timeBucket: number;
  realtimeApplicable: boolean;
  routing: CommunityLoadEvaluation["routing"];
  kinds: {
    kind: RealtimeStateKind;
    historical: { source: "historical"; status: DataQuality; expectedScore: number | null; confidence: number; sampleStrength: number; fallbackLevel: TimeFallbackLevel | null };
    realtime: { score: number; confidence: number } | null;
    combined: { score: number | null; confidence: number; realtimeApplied: boolean };
    historicalPenalty: number;
    realtimePenalty: number;
    combinedPenalty: number;
  }[];
}

export function adaptPublicLoadEvaluation(pub: PublicLoadEvaluation): CommunityLoadEvaluation {
  const kinds: KindLoadEvaluation[] = (pub.kinds ?? []).map((k) => ({
    kind: k.kind,
    historical: { ...k.historical, kind: k.kind, sampleCount: 0, distinctDays: 0 },
    realtime: k.realtime ? { score: k.realtime.score, confidence: k.realtime.confidence, independentReportCount: 0 } : null,
    combined: k.combined,
    historicalPenalty: k.historicalPenalty,
    realtimePenalty: k.realtimePenalty,
    combinedPenalty: k.combinedPenalty,
  }));
  return { weekday: pub.weekday, dayType: pub.dayType, timeBucket: pub.timeBucket, realtimeApplicable: pub.realtimeApplicable, routing: pub.routing, kinds };
}

/** A hátralévő szakaszok értékelése (bizonyíték nélküli szakasz semleges). */
export function assessRemainingJourneyCommunity(
  contexts: readonly CommunityLegContext[],
  durations: Record<string, number>,
  evaluations: ReadonlyMap<string, CommunityLoadEvaluation>,
  sensitivity: CommunitySensitivity
): { assessment: JourneyCommunityAssessment; state: JourneyCommunityState } {
  const assessment = aggregateJourneyCommunity(
    contexts.map((ctx) => ({ assessment: assessLegCommunity(evaluations.get(ctx.key), sensitivity), durationMinutes: durations[ctx.key] ?? 0 })),
    contexts.length
  );
  return { assessment, state: summarizeJourneyCommunityState(assessment) };
}

/** Kontextus-lista stabil kulcsa (szakaszváltáskor változik -> azonnali frissítés). */
export function contextsKey(contexts: readonly CommunityLegContext[]): string {
  return contexts.map((c) => c.key).join(";");
}

/** Feature flag (kliens): alapból KI; csak "true" kapcsolja be. */
export function isDynamicReroutingEnabled(value: string | undefined): boolean {
  return value === "true";
}
