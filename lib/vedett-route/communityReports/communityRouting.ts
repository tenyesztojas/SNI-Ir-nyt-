// VÉDETT ÚTVONAL — PERSONALIZED SENSORY ROUTING ENGINE (2026-10-06).
//
// MOTIS alternatívák + meglévő strukturális sensory score + historikus és
// realtime közösségi terhelés + személyes érzékenység -> magyarázható,
// korlátos, determinisztikus kiegészítés a meglévő rangsoroláshoz.
//
// Fő elvek:
//  - Közösségi adat nélkül a ranking BITRE változatlan (no-data bootstrap).
//  - "insufficient" / nincs adat = NINCS bizonyíték: 0 közösségi pont, sem
//    büntetés, sem jutalom (a bizonyítottan nyugodt sem kap negatív pontot).
//  - Szenzoros terhelés (személyes érzékenységgel) és közlekedési zavar
//    (érzékenységtől független, objektív) KÜLÖN pontösszetevő.
//  - Minden kimenet korlátos; a közösségi adat csak hiszterézissel és
//    menetidő/átszállás-korláttal változtathat a "Legnyugodtabb" választáson.
//  - Fail-open: hiba/időtúllépés esetén null -> régi ranking.

import type { Journey } from "../types.ts";
import {
  COMMUNITY_ROUTING_CONFIG,
  COMMUNITY_SENSORY_DIMENSIONS,
  KIND_TO_ROUTING_DIMENSION,
  NEUTRAL_COMMUNITY_SENSITIVITY,
  type CommunitySensitivity,
} from "./communityRoutingConfig.ts";
import { REALTIME_ROUTING_PENALTY_CONFIG } from "./realtimeConfig.ts";
import type { CommunityLoadEvaluation, KindLoadEvaluation } from "./expectedLoadEngine.ts";

// ── Kontextusgyűjtés, deduplikáció, darabolás ───────────────────────────────

export interface CommunityLegContext {
  key: string;
  routeId: string;
  tripId: string | null;
  fromStopId: string | null;
  toStopId: string | null;
  /** ISO; a leg tervezett indulása (jövőbeli útnál csak historikus baseline). */
  departureTime: string | null;
}

export interface JourneyLegRef {
  legIndex: number;
  contextKey: string;
  durationMinutes: number;
}

export function legContextKey(c: Omit<CommunityLegContext, "key">): string {
  return [c.routeId, c.tripId ?? "", c.fromStopId ?? "", c.toStopId ?? "", (c.departureTime ?? "").slice(0, 16)].join("|");
}

/** Az összes alternatíva TRANSIT szakaszai, kulcs szerint deduplikálva (stabil sorrend). */
export function collectCommunityContexts(journeys: readonly Journey[]): { contexts: CommunityLegContext[]; legRefs: JourneyLegRef[][] } {
  const unique = new Map<string, CommunityLegContext>();
  const legRefs = journeys.map((journey) =>
    journey.legs.flatMap((leg, legIndex) => {
      if (leg.mode !== "TRANSIT" || !leg.routeId) return [];
      const base = {
        routeId: leg.routeId,
        tripId: leg.tripId ?? null,
        fromStopId: leg.fromStopId ?? null,
        toStopId: leg.toStopId ?? null,
        departureTime: leg.departureTime ?? null,
      };
      const key = legContextKey(base);
      if (!unique.has(key)) unique.set(key, { key, ...base });
      return [{ legIndex, contextKey: key, durationMinutes: Math.max(0, leg.durationMinutes || 0) }];
    })
  );
  return { contexts: [...unique.values()], legRefs };
}

export function chunkContexts<T>(items: readonly T[], size: number = COMMUNITY_ROUTING_CONFIG.maxContextsPerChunk): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Szerveroldali batch-értékelő (≤ 12 kontextus / hívás, a community-load API korlátja). */
export interface CommunityLoadProvider {
  evaluateChunk(contexts: readonly CommunityLegContext[], now: Date): Promise<CommunityLoadEvaluation[]>;
}

// ── Szakasz- és út-értékelés ─────────────────────────────────────────────────

export type CommunityDriver = "historical" | "realtime";

export interface LegCommunityAssessment {
  /** 0..1, személyes érzékenységgel súlyozott szenzoros terhelés. */
  sensory: number;
  /** 0..1, objektív közlekedési zavar. */
  disruption: number;
  confidence: number;
  hasEvidence: boolean;
  sensoryDriver: CommunityDriver | null;
  crowdingDriven: boolean;
  disruptionDriver: CommunityDriver | null;
  /** Friss "Nyugodt" ellen-jelzés csökkentette a terhelést. */
  realtimeCalm: boolean;
}

export interface JourneyCommunityAssessment {
  sensory: number;
  disruption: number;
  confidence: number;
  evidenceLegCount: number;
  transitLegCount: number;
  sensoryDriver: CommunityDriver | null;
  crowdingDriven: boolean;
  disruptionDriver: CommunityDriver | null;
  realtimeCalm: boolean;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function confidenceTierFactor(confidence: number): number {
  const c = COMMUNITY_ROUTING_CONFIG;
  if (!(confidence >= c.minConfidence)) return 0;
  return confidence >= c.fullConfidence ? 1 : c.partialFactor;
}

function driverOf(k: KindLoadEvaluation): CommunityDriver | null {
  if (k.combined.realtimeApplied) return "realtime";
  return k.historical.status === "usable" || k.historical.status === "strong" ? "historical" : null;
}

/** Valószínűségi VAGY: több egyidejű probléma halmozódik, de 1 fölé nem mehet. */
function orCombine(values: readonly number[]): number {
  return clamp01(1 - values.reduce((p, v) => p * (1 - clamp01(v)), 1));
}

export function assessLegCommunity(evaluation: CommunityLoadEvaluation | null | undefined, sensitivity: CommunitySensitivity = NEUTRAL_COMMUNITY_SENSITIVITY): LegCommunityAssessment {
  const empty: LegCommunityAssessment = {
    sensory: 0, disruption: 0, confidence: 0, hasEvidence: false, sensoryDriver: null, crowdingDriven: false, disruptionDriver: null, realtimeCalm: false,
  };
  if (!evaluation) return empty;
  const sensoryParts: { value: number; driver: CommunityDriver | null; crowding: boolean }[] = [];
  const disruptionParts: { value: number; driver: CommunityDriver | null }[] = [];
  let confidence = 0;
  let realtimeCalm = false;
  for (const k of evaluation.kinds) {
    if (k.combined.score === null) continue;
    const tier = confidenceTierFactor(k.combined.confidence);
    if (tier === 0) continue;
    const driver = driverOf(k);
    if (!driver) continue;
    confidence = Math.max(confidence, k.combined.confidence);
    const base = k.combined.score * REALTIME_ROUTING_PENALTY_CONFIG.kindWeight[k.kind] * tier;
    const mapping = KIND_TO_ROUTING_DIMENSION[k.kind];
    if (mapping.group === "sensory") {
      const s = Math.min(2, Math.max(0, sensitivity[mapping.dimension] ?? 1));
      sensoryParts.push({ value: clamp01(base * s), driver, crowding: k.kind === "crowding" });
      if (k.combined.realtimeApplied && !k.realtime && k.historical.expectedScore !== null && k.combined.score < k.historical.expectedScore) realtimeCalm = true;
    } else {
      disruptionParts.push({ value: clamp01(base), driver });
    }
  }
  const strongestSensory = [...sensoryParts].sort((a, b) => b.value - a.value)[0];
  const strongestDisruption = [...disruptionParts].sort((a, b) => b.value - a.value)[0];
  return {
    sensory: r3(orCombine(sensoryParts.map((p) => p.value))),
    disruption: r3(orCombine(disruptionParts.map((p) => p.value))),
    confidence: r3(confidence),
    hasEvidence: sensoryParts.length + disruptionParts.length > 0,
    sensoryDriver: strongestSensory && strongestSensory.value > 0 ? strongestSensory.driver : null,
    crowdingDriven: Boolean(strongestSensory && strongestSensory.value > 0 && strongestSensory.crowding),
    disruptionDriver: strongestDisruption && strongestDisruption.value > 0 ? strongestDisruption.driver : null,
    realtimeCalm,
  };
}

/**
 * Út-szintű aggregáció, csak bizonyítékkal rendelkező szakaszokon:
 *   J = peakWeight * max(szakasz) + (1 - peakWeight) * időarányos átlag(szakasz)
 * Bizonyíték nélküli szakasz semleges (nem csökkenti és nem növeli az átlagot).
 */
export function aggregateJourneyCommunity(legs: readonly { assessment: LegCommunityAssessment; durationMinutes: number }[], transitLegCount: number): JourneyCommunityAssessment {
  const c = COMMUNITY_ROUTING_CONFIG;
  const evidence = legs.filter((l) => l.assessment.hasEvidence);
  const combine = (pick: (a: LegCommunityAssessment) => number, peakWeight: number) => {
    if (evidence.length === 0) return 0;
    const peak = Math.max(...evidence.map((l) => pick(l.assessment)));
    const totalMinutes = evidence.reduce((s, l) => s + l.durationMinutes, 0);
    const mean =
      totalMinutes > 0
        ? evidence.reduce((s, l) => s + pick(l.assessment) * l.durationMinutes, 0) / totalMinutes
        : evidence.reduce((s, l) => s + pick(l.assessment), 0) / evidence.length;
    return r3(clamp01(peakWeight * peak + (1 - peakWeight) * mean));
  };
  const sensoryLeader = [...evidence].sort((a, b) => b.assessment.sensory - a.assessment.sensory)[0];
  const disruptionLeader = [...evidence].sort((a, b) => b.assessment.disruption - a.assessment.disruption)[0];
  return {
    sensory: combine((a) => a.sensory, c.sensoryPeakWeight),
    disruption: combine((a) => a.disruption, c.disruptionPeakWeight),
    confidence: r3(evidence.reduce((m, l) => Math.max(m, l.assessment.confidence), 0)),
    evidenceLegCount: evidence.length,
    transitLegCount,
    sensoryDriver: sensoryLeader?.assessment.sensory ? sensoryLeader.assessment.sensoryDriver : null,
    crowdingDriven: Boolean(sensoryLeader?.assessment.sensory && sensoryLeader.assessment.crowdingDriven),
    disruptionDriver: disruptionLeader?.assessment.disruption ? disruptionLeader.assessment.disruptionDriver : null,
    realtimeCalm: evidence.some((l) => l.assessment.realtimeCalm),
  };
}

/**
 * Teljes gazdagítás: kontextusgyűjtés -> dedup -> ≤12-es darabok párhuzamosan
 * -> szakasz/út értékelés. Időtúllépés vagy BÁRMILYEN hiba -> null (fail-open).
 * Ha a kontextusok száma meghaladja a védőkorlátot, szintén null (a ranking a
 * régi marad) — NEM dobunk el csendben szakaszokat részleges eredménnyel.
 */
export async function enrichJourneysWithCommunity(
  journeys: readonly Journey[],
  provider: CommunityLoadProvider,
  options: { now: Date; sensitivity?: CommunitySensitivity; timeoutMs?: number }
): Promise<{ assessments: JourneyCommunityAssessment[]; status: "ok" } | { assessments: null; status: "no_transit" | "too_many_contexts" | "failed" | "timeout" }> {
  const { contexts, legRefs } = collectCommunityContexts(journeys);
  if (contexts.length === 0) return { assessments: null, status: "no_transit" };
  if (contexts.length > COMMUNITY_ROUTING_CONFIG.maxContextsPerSearch) return { assessments: null, status: "too_many_contexts" };
  const timeoutMs = options.timeoutMs ?? COMMUNITY_ROUTING_CONFIG.enrichmentTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = Promise.all(chunkContexts(contexts).map((chunk) => provider.evaluateChunk(chunk, options.now)));
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([work, timeout]);
    if (result === "timeout") return { assessments: null, status: "timeout" };
    const chunks = chunkContexts(contexts);
    const byKey = new Map<string, CommunityLoadEvaluation>();
    result.forEach((evaluations, chunkIndex) => {
      if (!Array.isArray(evaluations) || evaluations.length !== chunks[chunkIndex].length) throw new Error("chunk_mismatch");
      evaluations.forEach((evaluation, i) => byKey.set(chunks[chunkIndex][i].key, evaluation));
    });
    const sensitivity = options.sensitivity ?? NEUTRAL_COMMUNITY_SENSITIVITY;
    const assessments = legRefs.map((refs) =>
      aggregateJourneyCommunity(
        refs.map((ref) => ({ assessment: assessLegCommunity(byKey.get(ref.contextKey), sensitivity), durationMinutes: ref.durationMinutes })),
        refs.length
      )
    );
    return { assessments, status: "ok" };
  } catch {
    return { assessments: null, status: "failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Pontszám, döntés, magyarázat ─────────────────────────────────────────────

export interface CommunityScoreBreakdown {
  /** Tájékoztató hagyományos utazási költség (perc); tie-break. */
  baseTravelMinutes: number;
  /** A meglévő Sensory Engine pontszáma (0..100) — benne a menetidő/átszállás/gyaloglás/várakozás/metró tényezők. */
  structuralSensoryPenalty: number;
  communitySensoryPenalty: number;
  communityDisruptionPenalty: number;
  finalScore: number;
}

export function quantizeScore(value: number, step: number = COMMUNITY_ROUTING_CONFIG.finalScoreStep): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

export function computeScoreBreakdown(journey: Journey, assessment: JourneyCommunityAssessment | null | undefined): CommunityScoreBreakdown {
  const c = COMMUNITY_ROUTING_CONFIG;
  const structural = journey.sensory?.score ?? 0;
  const sensoryPoints = r3(clamp01(assessment?.sensory ?? 0) * c.maxCommunitySensoryPoints);
  const disruptionPoints = r3(clamp01(assessment?.disruption ?? 0) * c.maxCommunityDisruptionPoints);
  return {
    baseTravelMinutes: journey.totalDurationMinutes,
    structuralSensoryPenalty: structural,
    communitySensoryPenalty: sensoryPoints,
    communityDisruptionPenalty: disruptionPoints,
    finalScore: quantizeScore(structural + sensoryPoints + disruptionPoints),
  };
}

export type RankingReasonCode =
  | "FEWER_TRANSFERS"
  | "LESS_WALKING"
  | "LESS_UNDERGROUND"
  | "LOWER_EXPECTED_CROWDING"
  | "LOWER_EXPECTED_SENSORY_LOAD"
  | "CURRENTLY_CALMER"
  | "AVOIDS_REPORTED_DISRUPTION"
  | "USUALLY_MORE_CROWDED"
  | "CURRENTLY_BUSIER"
  | "TRAFFIC_DISRUPTION_REPORTED";

/**
 * "Legnyugodtabb" választás közösségi adattal. A kiinduló (baseline) a meglévő
 * pickCalmest eredménye; a közösségi adat csak akkor vált, ha egy másik út
 * végső pontszáma legalább switchMarginPoints-szal jobb ÉS nem hosszabb
 * maxExtraDurationMinutes-nál / nem több átszállásos maxExtraTransfers-nél.
 * Közösségi adat nélkül a baseline marad (bitre a régi viselkedés).
 */
export function decideCommunityCalmest(
  journeys: readonly Journey[],
  baselineIndex: number,
  breakdowns: readonly CommunityScoreBreakdown[]
): { index: number; switched: boolean } {
  const c = COMMUNITY_ROUTING_CONFIG;
  const baseline = journeys[baselineIndex];
  const order = journeys
    .map((j, i) => ({ i, j, b: breakdowns[i] }))
    .filter(({ j }) => j.totalDurationMinutes <= baseline.totalDurationMinutes + c.maxExtraDurationMinutes && j.transfers <= baseline.transfers + c.maxExtraTransfers)
    .sort(
      (x, y) =>
        x.b.finalScore - y.b.finalScore ||
        x.b.structuralSensoryPenalty - y.b.structuralSensoryPenalty ||
        x.j.totalDurationMinutes - y.j.totalDurationMinutes ||
        x.i - y.i
    );
  const best = order[0];
  if (!best || best.i === baselineIndex) return { index: baselineIndex, switched: false };
  if (breakdowns[baselineIndex].finalScore - best.b.finalScore >= c.switchMarginPoints) return { index: best.i, switched: true };
  return { index: baselineIndex, switched: false };
}

function undergroundLegs(j: Journey): number {
  return j.legs.filter((l) => l.mode === "TRANSIT" && l.transitMode === "SUBWAY").length;
}

/** Strukturált indokok — csak ami ténylegesen befolyásolta a rangsort. Szabad szöveg nincs. */
export function buildReasonCodes(input: {
  journey: Journey;
  labels: readonly string[];
  all: readonly Journey[];
  assessment: JourneyCommunityAssessment | null;
  isCommunityCalmest: boolean;
  isDemotedBaseline: boolean;
  baselineAssessment: JourneyCommunityAssessment | null;
}): RankingReasonCode[] {
  const { journey, labels, all, assessment } = input;
  const codes: RankingReasonCode[] = [];
  if (labels.includes("FEWEST_TRANSFERS") && all.some((o) => o.transfers > journey.transfers)) codes.push("FEWER_TRANSFERS");
  if (labels.includes("LEAST_WALKING") && all.some((o) => o.walkingMinutes > journey.walkingMinutes)) codes.push("LESS_WALKING");
  if (labels.includes("CALMEST") && all.some((o) => undergroundLegs(o) > undergroundLegs(journey))) codes.push("LESS_UNDERGROUND");
  if (input.isCommunityCalmest && input.baselineAssessment) {
    const base = input.baselineAssessment;
    const own = assessment ?? { sensory: 0, disruption: 0 };
    if (base.disruption > own.disruption && base.disruptionDriver) codes.push("AVOIDS_REPORTED_DISRUPTION");
    if (base.sensory > own.sensory && base.sensoryDriver === "realtime") codes.push("CURRENTLY_CALMER");
    else if (base.sensory > own.sensory && base.sensoryDriver === "historical") codes.push(base.crowdingDriven ? "LOWER_EXPECTED_CROWDING" : "LOWER_EXPECTED_SENSORY_LOAD");
  }
  if (input.isDemotedBaseline && assessment) {
    if (assessment.disruption > 0 && assessment.disruptionDriver === "realtime") codes.push("TRAFFIC_DISRUPTION_REPORTED");
    if (assessment.sensory > 0 && assessment.sensoryDriver === "realtime") codes.push("CURRENTLY_BUSIER");
    else if (assessment.sensory > 0 && assessment.sensoryDriver === "historical" && assessment.crowdingDriven) codes.push("USUALLY_MORE_CROWDED");
  }
  return codes;
}

// ── Dinamikus újratervezés előkészítése (még NINCS bekötve) ─────────────────

export interface JourneyCommunityState {
  /** 0..1 személyes közösségi penalty (szenzoros + zavar, VAGY-kombinálva). */
  personalPenalty: number;
  sensory: number;
  disruption: number;
  confidence: number;
  evidenceLegCount: number;
  /** Kvantált kulcs — azonos állapot -> azonos kulcs (stabil összevetéshez). */
  signature: string;
}

export function summarizeJourneyCommunityState(assessment: JourneyCommunityAssessment | null): JourneyCommunityState {
  if (!assessment || assessment.evidenceLegCount === 0) {
    return { personalPenalty: 0, sensory: 0, disruption: 0, confidence: 0, evidenceLegCount: 0, signature: "none" };
  }
  const personalPenalty = r3(orCombine([assessment.sensory, assessment.disruption]));
  const q = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  return {
    personalPenalty,
    sensory: assessment.sensory,
    disruption: assessment.disruption,
    confidence: assessment.confidence,
    evidenceLegCount: assessment.evidenceLegCount,
    signature: `p${q(personalPenalty)}s${q(assessment.sensory)}d${q(assessment.disruption)}`,
  };
}

/** Érdemi változás-e (a következő blokk reroute-döntésének bemenete). Gyenge adat nem érdemi. */
export function isMaterialCommunityChange(previous: JourneyCommunityState, next: JourneyCommunityState): boolean {
  if (next.confidence < COMMUNITY_ROUTING_CONFIG.minConfidence && previous.confidence < COMMUNITY_ROUTING_CONFIG.minConfidence) return false;
  return Math.abs(next.personalPenalty - previous.personalPenalty) >= COMMUNITY_ROUTING_CONFIG.materialChangeThreshold;
}

export { COMMUNITY_SENSORY_DIMENSIONS };
