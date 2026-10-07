// VÉDETT ÚTVONAL — PERSONALIZED SENSORY ROUTING ENGINE (2026-10-06)
//   node --test __tests__/vedett-route/community-routing.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankJourneys } from "../../lib/vedett-route/ranking.ts";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { DEFAULT_PERSONALIZATION_WEIGHTS } from "../../lib/vedett-route/personalization.ts";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import {
  aggregateJourneyCommunity,
  assessLegCommunity,
  chunkContexts,
  collectCommunityContexts,
  computeScoreBreakdown,
  confidenceTierFactor,
  enrichJourneysWithCommunity,
  isMaterialCommunityChange,
  summarizeJourneyCommunityState,
  type CommunityLegContext,
  type CommunityLoadProvider,
  type JourneyCommunityAssessment,
} from "../../lib/vedett-route/communityReports/communityRouting.ts";
import { COMMUNITY_ROUTING_CONFIG, NEUTRAL_COMMUNITY_SENSITIVITY } from "../../lib/vedett-route/communityReports/communityRoutingConfig.ts";
import type { CommunityLoadEvaluation, KindLoadEvaluation } from "../../lib/vedett-route/communityReports/expectedLoadEngine.ts";
import type { RealtimeStateKind } from "../../lib/vedett-route/communityReports/realtimeConfig.ts";
import { selectCommunityReasonChips } from "../../lib/vedett-route/communityReports/reasonText.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const NOW = new Date("2026-10-06T06:00:00Z");

function transit(routeId: string, minutes: number, extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT", transitMode: "BUS", routeId, tripId: `trip-${routeId}`, fromStopId: `${routeId}-A`, toStopId: `${routeId}-B`,
    fromName: "A", toName: "B", durationMinutes: minutes, departureTime: "2026-10-06T06:05:00Z", realtime: false, ...extra,
  };
}
const walk = (minutes: number): JourneyLeg => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: minutes, realtime: false });
function journey(legs: JourneyLeg[], over: Partial<Journey> = {}): Journey {
  const transfers = Math.max(0, legs.filter((l) => l.mode === "TRANSIT").length - 1);
  const j: Journey = {
    totalDurationMinutes: legs.reduce((s, l) => s + l.durationMinutes, 0), departureTime: "2026-10-06T06:00:00Z", arrivalTime: "2026-10-06T07:00:00Z",
    walkingMinutes: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.durationMinutes, 0), waitingMinutes: 2, transfers,
    legs, alerts: [], realtimeAvailable: false, ...over,
  };
  return { ...j, sensory: computeSensoryScore(j, DEFAULT_PERSONALIZATION_WEIGHTS) };
}

type KindSpec = { kind: RealtimeStateKind; score: number; confidence: number; realtime?: boolean; quiet?: boolean; status?: "insufficient" | "low" | "usable" | "strong"; expected?: number | null };
function evaluation(specs: KindSpec[]): CommunityLoadEvaluation {
  const kinds: KindLoadEvaluation[] = specs.map((s) => ({
    kind: s.kind,
    historical: {
      kind: s.kind, source: "historical", status: s.status ?? "strong", expectedScore: s.expected === undefined ? s.score : s.expected,
      confidence: s.status === "insufficient" ? 0 : s.confidence, sampleStrength: 5, sampleCount: 10, distinctDays: 5, fallbackLevel: "exact",
    },
    realtime: s.realtime ? { score: s.score, confidence: s.confidence, independentReportCount: 3 } : null,
    combined: { score: s.status === "insufficient" && !s.realtime && !s.quiet ? null : s.score, confidence: s.confidence, realtimeApplied: Boolean(s.realtime || s.quiet) },
    historicalPenalty: 0, realtimePenalty: 0, combinedPenalty: 0,
  }));
  return { weekday: 2, dayType: "workday", timeBucket: 32, realtimeApplicable: true, kinds, routing: { historicalPenalty: 0, realtimePenalty: 0, combinedPenalty: 0, confidence: 0, historicalDataQuality: "strong" } };
}
const EMPTY_EVAL = evaluation([]);

/** Teszt-provider: routeId -> értékelés; számolja a hívásokat és darabméreteket. */
function provider(byRoute: Record<string, CommunityLoadEvaluation>, opts: { fail?: boolean; delayMs?: number } = {}) {
  const calls: number[] = [];
  const p: CommunityLoadProvider = {
    async evaluateChunk(contexts: readonly CommunityLegContext[]) {
      calls.push(contexts.length);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw new Error("unavailable");
      return contexts.map((c) => byRoute[c.routeId] ?? EMPTY_EVAL);
    },
  };
  return { p, calls };
}

// Két alternatíva: A = strukturálisan legnyugodtabb (1 járat), B = kicsit megterhelőbb (1 járat, több gyaloglás).
const A = journey([walk(3), transit("rA", 25), walk(2)]);
const B = journey([walk(6), transit("rB", 24), walk(3)]);
const FAST = journey([walk(2), transit("rF", 12, { transitMode: "SUBWAY" }), walk(2), transit("rG", 6), walk(1)]);
const ALL = [A, B, FAST];
const labelsOf = (ranked: ReturnType<typeof rankJourneys>) => ranked.map((r) => [ALL.indexOf(r.journey), [...r.labels]]);

async function rankWith(byRoute: Record<string, CommunityLoadEvaluation>, journeys = ALL, sensitivity = NEUTRAL_COMMUNITY_SENSITIVITY) {
  const { p } = provider(byRoute);
  const e = await enrichJourneysWithCommunity(journeys, p, { now: NOW, sensitivity });
  return { ranked: rankJourneys(journeys, e.assessments ? { assessments: e.assessments } : undefined), e };
}

describe("no-data bootstrap / insufficient", () => {
  test("közösségi adat nélkül a ranking változatlan (provider nélkül és üres adattal is)", async () => {
    const before = labelsOf(rankJourneys(ALL));
    assert.equal(rankJourneys(ALL)[0].journey, A, "A a strukturálisan legnyugodtabb");
    const { ranked } = await rankWith({});
    assert.deepEqual(labelsOf(ranked), before);
    for (const r of ranked) assert.deepEqual(selectCommunityReasonChips(r.reasonCodes), [], "adat nélkül nincs közösségi indok");
    assert.equal(rankJourneys(ALL)[0].reasonCodes, undefined, "provider nélkül a válasz alakja is a régi");
  });
  test("insufficient adat = semleges: nincs bizonyíték, 0 pont (nem jutalom, nem büntetés)", () => {
    const leg = assessLegCommunity(evaluation([{ kind: "crowding", score: 0.9, confidence: 0, status: "insufficient" }]));
    assert.equal(leg.hasEvidence, false);
    assert.equal(leg.sensory, 0);
    const agg = aggregateJourneyCommunity([{ assessment: leg, durationMinutes: 20 }], 1);
    assert.equal(agg.evidenceLegCount, 0);
    assert.equal(summarizeJourneyCommunityState(agg).signature, "none");
  });
  test("confidence-sávok: alacsony 0, használható mérsékelt, erős teljes", () => {
    assert.equal(confidenceTierFactor(0.3), 0);
    assert.equal(confidenceTierFactor(0.5), COMMUNITY_ROUTING_CONFIG.partialFactor);
    assert.equal(confidenceTierFactor(0.7), 1);
    assert.equal(confidenceTierFactor(Number.NaN), 0);
    const low = assessLegCommunity(evaluation([{ kind: "crowding", score: 1, confidence: 0.3 }]));
    const mid = assessLegCommunity(evaluation([{ kind: "crowding", score: 1, confidence: 0.5 }]));
    const high = assessLegCommunity(evaluation([{ kind: "crowding", score: 1, confidence: 0.7 }]));
    assert.equal(low.sensory, 0);
    assert.ok(mid.sensory > 0 && mid.sensory < high.sensory);
  });
});

describe("közösségi dimenziók", () => {
  test("erős historikus zsúfoltság a legnyugodtabb úton -> B lesz a 'Legnyugodtabb', indokokkal", async () => {
    const { ranked } = await rankWith({ rA: evaluation([{ kind: "crowding", score: 1, confidence: 0.8 }]) });
    const top = ranked[0];
    assert.equal(top.journey, B);
    assert.ok(top.labels.includes("CALMEST"));
    assert.ok(top.reasonCodes!.includes("LOWER_EXPECTED_CROWDING"));
    const demoted = ranked.find((r) => r.journey === A)!;
    assert.ok(demoted, "a korábbi legnyugodtabb nem tűnik el");
    assert.ok(demoted.reasonCodes!.includes("USUALLY_MORE_CROWDED"));
    assert.deepEqual(selectCommunityReasonChips(top.reasonCodes).map((c) => c.text), ["Ilyenkor általában kevésbé zsúfolt"]);
  });
  test("erős realtime zsúfoltság -> 'Friss jelzések szerint nyugodtabb' / 'terheltebb'", async () => {
    const { ranked } = await rankWith({ rA: evaluation([{ kind: "crowding", score: 1, confidence: 0.8, realtime: true }]) });
    assert.ok(ranked[0].reasonCodes!.includes("CURRENTLY_CALMER"));
    assert.ok(ranked.find((r) => r.journey === A)!.reasonCodes!.includes("CURRENTLY_BUSIER"));
  });
  test("friss 'Nyugodt' ellen-jelzés: alacsonyabb terhelés, realtimeCalm", () => {
    const leg = assessLegCommunity(evaluation([{ kind: "crowding", score: 0.2, confidence: 0.7, quiet: true, expected: 0.9 }]));
    assert.equal(leg.realtimeCalm, true);
    assert.ok(leg.sensory < assessLegCommunity(evaluation([{ kind: "crowding", score: 0.9, confidence: 0.7 }])).sensory);
  });
  test("zaj: szenzoros (érzékenységgel), NEM zavar", () => {
    const leg = assessLegCommunity(evaluation([{ kind: "noisy", score: 1, confidence: 0.8 }]));
    assert.ok(leg.sensory > 0);
    assert.equal(leg.disruption, 0);
    assert.equal(assessLegCommunity(evaluation([{ kind: "noisy", score: 1, confidence: 0.8 }]), { ...NEUTRAL_COMMUNITY_SENSITIVITY, noise: 0 }).sensory, 0);
  });
  test("dugó / megállt jármű / közlekedési probléma: objektív zavar, érzékenységtől független", () => {
    const zero = { crowding: 0, noise: 0, light: 0, vibration: 0, temperature: 0 };
    for (const kind of ["traffic_jam", "vehicle_stopped", "service_problem"] as const) {
      const leg = assessLegCommunity(evaluation([{ kind, score: 1, confidence: 0.8, realtime: true }]), zero);
      assert.ok(leg.disruption > 0, kind);
      assert.equal(leg.sensory, 0, kind);
      assert.equal(leg.disruptionDriver, "realtime");
    }
  });
  test("realtime dugó a legnyugodtabb úton -> elkerülés + 'Fennakadást jeleztek rajta'", async () => {
    const { ranked } = await rankWith({ rA: evaluation([{ kind: "traffic_jam", score: 1, confidence: 0.85, realtime: true }]) });
    assert.equal(ranked[0].journey, B);
    assert.ok(ranked[0].reasonCodes!.includes("AVOIDS_REPORTED_DISRUPTION"));
    assert.ok(ranked.find((r) => r.journey === A)!.reasonCodes!.includes("TRAFFIC_DISRUPTION_REPORTED"));
  });
  test("személyes érzékenység: alacsony -> kisebb, magas -> nagyobb szenzoros penalty (korlátos)", () => {
    const e = evaluation([{ kind: "crowding", score: 0.6, confidence: 0.8 }]);
    const low = assessLegCommunity(e, { ...NEUTRAL_COMMUNITY_SENSITIVITY, crowding: 0.3 }).sensory;
    const mid = assessLegCommunity(e).sensory;
    const high = assessLegCommunity(e, { ...NEUTRAL_COMMUNITY_SENSITIVITY, crowding: 2 }).sensory;
    const absurd = assessLegCommunity(e, { ...NEUTRAL_COMMUNITY_SENSITIVITY, crowding: 50 }).sensory;
    assert.ok(low < mid && mid < high);
    assert.equal(absurd, high, "érzékenység 2-re korlátozva");
    assert.ok(high <= 1);
  });
});

describe("szakasz-aggregáció", () => {
  const bad = assessLegCommunity(evaluation([{ kind: "crowding", score: 1, confidence: 0.8 }]));
  const calm = assessLegCommunity(evaluation([{ kind: "crowding", score: 0, confidence: 0.8 }]));
  test("egyetlen nagyon rossz rövid szakasz nem tűnik el egy hosszú út átlagában", () => {
    const agg = aggregateJourneyCommunity([{ assessment: calm, durationMinutes: 50 }, { assessment: bad, durationMinutes: 5 }], 2);
    assert.ok(agg.sensory >= COMMUNITY_ROUTING_CONFIG.sensoryPeakWeight * bad.sensory, String(agg.sensory));
  });
  test("bizonyíték nélküli szakasz semleges (nem hígítja az átlagot)", () => {
    const none = assessLegCommunity(null);
    const withUnknown = aggregateJourneyCommunity([{ assessment: bad, durationMinutes: 10 }, { assessment: none, durationMinutes: 40 }], 2);
    const alone = aggregateJourneyCommunity([{ assessment: bad, durationMinutes: 10 }], 1);
    assert.equal(withUnknown.sensory, alone.sensory);
    assert.equal(withUnknown.evidenceLegCount, 1);
  });
  test("több szakasz: időarányos átlag + csúcs", () => {
    const half = assessLegCommunity(evaluation([{ kind: "crowding", score: 0.5, confidence: 0.8 }]));
    const agg = aggregateJourneyCommunity([{ assessment: half, durationMinutes: 10 }, { assessment: bad, durationMinutes: 10 }], 2);
    assert.ok(agg.sensory > half.sensory && agg.sensory <= bad.sensory);
  });
});

describe("batch, darabolás, failure mode", () => {
  test("közös szakaszok deduplikálva; gyalogos-only és vegyes út helyesen", () => {
    const walkOnly = journey([walk(15)]);
    const mixedTwin = journey([walk(4), transit("rA", 25), walk(2)]);
    const { contexts, legRefs } = collectCommunityContexts([A, mixedTwin, walkOnly]);
    assert.equal(contexts.length, 1, "A és a vegyes ikerút ugyanazt a szakaszt használja");
    assert.deepEqual(legRefs[2], []);
    assert.equal(legRefs[1][0].legIndex, 1, "csak a TRANSIT láb");
  });
  test(">12 kontextus: biztonságos darabolás, egyetlen szakasz sem vész el", async () => {
    const many = Array.from({ length: 25 }, (_, i) => journey([transit(`r${i}`, 10)]));
    const byRoute = Object.fromEntries(many.map((_, i) => [`r${i}`, evaluation([{ kind: "crowding", score: 1, confidence: 0.8 }])]));
    const { p, calls } = provider(byRoute);
    const e = await enrichJourneysWithCommunity(many, p, { now: NOW });
    assert.deepEqual(calls, [12, 12, 1]);
    assert.equal(e.status, "ok");
    assert.ok(e.assessments!.every((a) => a.evidenceLegCount === 1));
    assert.equal(chunkContexts([1, 2, 3], 12).length, 1);
  });
  test("túl sok kontextus: nem csendes részleges eredmény, hanem fail-open", async () => {
    const huge = Array.from({ length: COMMUNITY_ROUTING_CONFIG.maxContextsPerSearch + 1 }, (_, i) => journey([transit(`x${i}`, 10)]));
    assert.equal((await enrichJourneysWithCommunity(huge, provider({}).p, { now: NOW })).status, "too_many_contexts");
  });
  test("API hiba / időtúllépés -> null (régi ranking), gyalogos-only -> no_transit", async () => {
    const failed = await enrichJourneysWithCommunity(ALL, provider({}, { fail: true }).p, { now: NOW });
    assert.equal(failed.status, "failed");
    assert.equal(failed.assessments, null);
    const slow = await enrichJourneysWithCommunity(ALL, provider({}, { delayMs: 50 }).p, { now: NOW, timeoutMs: 5 });
    assert.equal(slow.status, "timeout");
    assert.deepEqual(labelsOf(rankJourneys(ALL, undefined)), labelsOf(rankJourneys(ALL)));
    assert.equal((await enrichJourneysWithCommunity([journey([walk(10)])], provider({}).p, { now: NOW })).status, "no_transit");
  });
});

describe("pontszám, stabilitás, korlátok", () => {
  const strong: JourneyCommunityAssessment = { sensory: 1, disruption: 1, confidence: 0.9, evidenceLegCount: 1, transitLegCount: 1, sensoryDriver: "realtime", crowdingDriven: true, disruptionDriver: "realtime", realtimeCalm: false };
  test("korlátos és kvantált végső pontszám", () => {
    const b = computeScoreBreakdown(A, strong);
    assert.equal(b.communitySensoryPenalty, COMMUNITY_ROUTING_CONFIG.maxCommunitySensoryPoints);
    assert.equal(b.communityDisruptionPenalty, COMMUNITY_ROUTING_CONFIG.maxCommunityDisruptionPoints);
    assert.equal(b.finalScore % COMMUNITY_ROUTING_CONFIG.finalScoreStep, 0);
    assert.ok(b.finalScore <= A.sensory!.score + 30 + 0.5);
    const none = computeScoreBreakdown(A, null);
    assert.equal(none.communitySensoryPenalty + none.communityDisruptionPenalty, 0);
  });
  test("determinisztikus sorrend ismételt futásra", async () => {
    const byRoute = { rA: evaluation([{ kind: "crowding", score: 1, confidence: 0.8 }]) };
    const first = labelsOf((await rankWith(byRoute)).ranked);
    for (let i = 0; i < 3; i++) assert.deepEqual(labelsOf((await rankWith(byRoute)).ranked), first);
  });
  test("tie stabilitás: kis közösségi különbség (margó alatt) nem rendez át", async () => {
    const tiny = { rA: evaluation([{ kind: "noisy", score: 0.4, confidence: 0.5 }]) };
    const { ranked } = await rankWith(tiny);
    assert.equal(ranked[0].journey, A);
    assert.deepEqual(labelsOf(ranked), labelsOf(rankJourneys(ALL)));
  });
  test("közösségi adat nem írja felül a jelentős menetidő-különbséget", async () => {
    const LONG = journey([walk(2), transit("rL", 60), walk(2)], { waitingMinutes: 0 });
    const SHORT = journey([walk(2), transit("rS", 20), walk(2)]);
    const set = [SHORT, LONG];
    const { ranked } = await rankWith({ rS: evaluation([{ kind: "traffic_jam", score: 1, confidence: 0.9, realtime: true }]) }, set);
    const calmest = ranked.find((r) => r.labels.includes("CALMEST"))!;
    assert.equal(calmest.journey, SHORT, "40 perccel hosszabb út nem lesz ajánlott közösségi adat miatt");
  });
});

describe("reroute-előkészítés, UI, privacy, regresszió", () => {
  test("summarize + érdemi változás küszöbbel; gyenge adat nem érdemi", () => {
    const base = summarizeJourneyCommunityState(null);
    const strongState = summarizeJourneyCommunityState({ sensory: 0.6, disruption: 0.5, confidence: 0.8, evidenceLegCount: 1, transitLegCount: 1, sensoryDriver: "realtime", crowdingDriven: true, disruptionDriver: "realtime", realtimeCalm: false });
    assert.ok(strongState.personalPenalty > 0 && strongState.personalPenalty <= 1);
    assert.equal(isMaterialCommunityChange(base, strongState), true);
    const weak = { ...strongState, confidence: 0.2 };
    assert.equal(isMaterialCommunityChange({ ...base, confidence: 0.1 }, weak), false);
    assert.equal(isMaterialCommunityChange(strongState, { ...strongState, personalPenalty: strongState.personalPenalty + 0.05 }), false);
  });
  test("UI: max 2 közösségi chip, strukturális kódok nem duplikálódnak, szám/százalék nincs", () => {
    const chips = selectCommunityReasonChips(["FEWER_TRANSFERS", "LESS_WALKING", "CURRENTLY_CALMER", "AVOIDS_REPORTED_DISRUPTION", "LOWER_EXPECTED_CROWDING"]);
    assert.equal(chips.length, 2);
    assert.deepEqual(chips.map((c) => c.code), ["AVOIDS_REPORTED_DISRUPTION", "CURRENTLY_CALMER"]);
    for (const c of chips) assert.doesNotMatch(c.text, /\d|%/);
    assert.deepEqual(selectCommunityReasonChips(undefined), []);
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(form, /selectCommunityReasonChips\(ranked\.reasonCodes\)/);
  });
  test("historikus indok csak usable/strong adatból (low -> nincs 'Ilyenkor általában…')", async () => {
    const { ranked } = await rankWith({ rA: evaluation([{ kind: "crowding", score: 1, confidence: 0.8, status: "low" }]) });
    for (const r of ranked) {
      assert.ok(!r.reasonCodes?.includes("USUALLY_MORE_CROWDED"));
      assert.ok(!r.reasonCodes?.includes("LOWER_EXPECTED_CROWDING"));
    }
  });
  test("nincs érzékeny analytics: az új modulok nem hívnak GA4-et; az eseménylista változatlan", () => {
    for (const f of ["communityRouting.ts", "communityRoutingConfig.ts", "communityLoadBatch.ts", "reasonText.ts"]) {
      assert.doesNotMatch(read(`lib/vedett-route/communityReports/${f}`), /gtag|trackVedettRouteEvent|dataLayer/);
    }
    assert.doesNotMatch(read("lib/vedett-route/analytics.ts"), /community|sensory|crowd/i);
  });
  test("meglévő preferenciák változatlanok (6 csúszka, ugyanaz a sensory score)", () => {
    const keys = Object.keys(DEFAULT_PERSONALIZATION_WEIGHTS).sort();
    assert.deepEqual(keys, ["duration", "modeSwitches", "transfers", "underground", "waiting", "walking"]);
    const heavy = computeSensoryScore(A, { ...DEFAULT_PERSONALIZATION_WEIGHTS, walking: 2 });
    assert.notEqual(heavy.score, A.sensory!.score);
    assert.ok(A.sensory!.missingFactors.includes("crowding"), "a strukturális engine viselkedése nem változott");
  });
  test("bekötés: orchestrator provider opcionális, keresés kill-switch-csel, fail-open", () => {
    const orch = read("lib/vedett-route/orchestrator.ts");
    // BKK STATION INTELLIGENCE (2026-10-07): az options típus többsoros lett
    // (új, opcionális stationInfrastructureProvider) — a szerződés változatlan.
    assert.match(orch, /options: \{\s*communityLoadProvider\?: CommunityLoadProvider;\s*now\?: Date;[\s\S]*?\} = \{\}/);
    assert.match(orch, /rankJourneys\(withSensory, communityAssessments \? \{ assessments: communityAssessments \} : undefined\)/);
    const search = read("app/api/admin/vedett-utvonal/search/route.ts");
    assert.match(search, /VEDETT_ROUTE_COMMUNITY_RANKING_ENABLED === "false" \? \{\} : \{ communityLoadProvider: createServerCommunityLoadProvider\(\) \}/);
  });
});
