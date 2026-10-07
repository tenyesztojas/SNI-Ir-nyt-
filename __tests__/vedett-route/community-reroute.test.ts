// VÉDETT ÚTVONAL — DYNAMIC SENSORY REROUTING + CROWDING/NOISE PREFERENCIÁK (2026-10-06)
//   node --test __tests__/vedett-route/community-reroute.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { DEFAULT_PERSONALIZATION_WEIGHTS, normalizePersonalizationWeights } from "../../lib/vedett-route/personalization.ts";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import { journeySearchSchema } from "../../lib/vedett-route/schemas.ts";
import { NEUTRAL_COMMUNITY_SENSITIVITY, resolveCommunitySensitivity } from "../../lib/vedett-route/communityReports/communityRoutingConfig.ts";
import {
  assessLegCommunity,
  computeScoreBreakdown,
  isMaterialCommunityChange,
  summarizeJourneyCommunityState,
  type JourneyCommunityAssessment,
  type JourneyCommunityState,
} from "../../lib/vedett-route/communityReports/communityRouting.ts";
import {
  COMMUNITY_REROUTE_CONFIG,
  buildRemainingJourney,
  buildRerouteOfferBullets,
  collectRemainingCommunityContexts,
  computeCurrentRemainingBreakdown,
  evaluateCommunityDeterioration,
  evaluateRerouteOpportunity,
} from "../../lib/vedett-route/communityReports/communityReroute.ts";
import { adaptPublicLoadEvaluation, assessRemainingJourneyCommunity, isDynamicReroutingEnabled } from "../../lib/vedett-route/communityReports/communityMonitor.ts";
import { COMMUNITY_REASON_TEXT } from "../../lib/vedett-route/communityReports/reasonText.ts";
import {
  createInitialLiveAlternativeGuardState,
  markLiveAlternativeEventDeclined,
  markLiveAlternativeSearchStarted,
  shouldStartLiveAlternativeSearch,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";
import type { CommunityLoadEvaluation, KindLoadEvaluation } from "../../lib/vedett-route/communityReports/expectedLoadEngine.ts";
import type { RealtimeStateKind } from "../../lib/vedett-route/communityReports/realtimeConfig.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const hook = read("components/vedett-utvonal/useCommunityRealtimeWarning.ts");

function transit(routeId: string, minutes: number, extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return { mode: "TRANSIT", transitMode: "BUS", routeId, tripId: `t-${routeId}`, fromStopId: `${routeId}A`, toStopId: `${routeId}B`, fromName: "A", toName: "B", durationMinutes: minutes, departureTime: "2026-10-07T06:10:00Z", realtime: false, ...extra };
}
const walk = (minutes: number): JourneyLeg => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: minutes, realtime: false });
function journey(legs: JourneyLeg[], over: Partial<Journey> = {}): Journey {
  const j: Journey = {
    totalDurationMinutes: legs.reduce((s, l) => s + l.durationMinutes, 0), departureTime: "2026-10-07T06:00:00Z", arrivalTime: "2026-10-07T06:45:00Z",
    walkingMinutes: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.durationMinutes, 0), waitingMinutes: 2,
    transfers: Math.max(0, legs.filter((l) => l.mode === "TRANSIT").length - 1), legs, alerts: [], realtimeAvailable: false, ...over,
  };
  return { ...j, sensory: computeSensoryScore(j, DEFAULT_PERSONALIZATION_WEIGHTS) };
}
function evaluation(specs: { kind: RealtimeStateKind; score: number; confidence: number; realtime?: boolean }[]): CommunityLoadEvaluation {
  const kinds: KindLoadEvaluation[] = specs.map((s) => ({
    kind: s.kind,
    historical: { kind: s.kind, source: "historical", status: "strong", expectedScore: s.score, confidence: s.confidence, sampleStrength: 5, sampleCount: 10, distinctDays: 5, fallbackLevel: "exact" },
    realtime: s.realtime ? { score: s.score, confidence: s.confidence, independentReportCount: 3 } : null,
    combined: { score: s.score, confidence: s.confidence, realtimeApplied: Boolean(s.realtime) },
    historicalPenalty: 0, realtimePenalty: 0, combinedPenalty: 0,
  }));
  return { weekday: 3, dayType: "workday", timeBucket: 33, realtimeApplicable: true, kinds, routing: { historicalPenalty: 0, realtimePenalty: 0, combinedPenalty: 0, confidence: 0, historicalDataQuality: "strong" } };
}
const state = (over: Partial<JourneyCommunityState>): JourneyCommunityState => ({ personalPenalty: 0, sensory: 0, disruption: 0, confidence: 0.8, evidenceLegCount: 1, signature: "x", ...over });

describe("PREFERENCES — zsúfoltság / zaj", () => {
  test("crowding / noise 0/1/2 a valódi érzékenység; hiány = semleges 1; fény/rázkódás/meleg semleges", () => {
    for (const v of [0, 1, 2]) {
      assert.equal(resolveCommunitySensitivity({ crowding: v }).crowding, v);
      assert.equal(resolveCommunitySensitivity({ noise: v }).noise, v);
    }
    assert.deepEqual(resolveCommunitySensitivity(undefined), NEUTRAL_COMMUNITY_SENSITIVITY);
    assert.equal(resolveCommunitySensitivity({ crowding: 9 }).crowding, 2);
    const s = resolveCommunitySensitivity({ crowding: 2, noise: 0 });
    assert.equal(s.light, 1);
    assert.equal(s.vibration, 1);
    assert.equal(s.temperature, 1);
  });
  test("a preferencia a megfelelő közösségi dimenzióra hat; a zavarra nem", () => {
    const crowd = evaluation([{ kind: "crowding", score: 0.6, confidence: 0.8 }]);
    const noise = evaluation([{ kind: "noisy", score: 0.6, confidence: 0.8 }]);
    const jam = evaluation([{ kind: "traffic_jam", score: 1, confidence: 0.8, realtime: true }]);
    const s0 = resolveCommunitySensitivity({ crowding: 0, noise: 0 });
    const s2 = resolveCommunitySensitivity({ crowding: 2, noise: 2 });
    assert.equal(assessLegCommunity(crowd, s0).sensory, 0);
    assert.ok(assessLegCommunity(crowd, s2).sensory > assessLegCommunity(crowd, NEUTRAL_COMMUNITY_SENSITIVITY).sensory);
    assert.equal(assessLegCommunity(noise, s0).sensory, 0);
    assert.ok(assessLegCommunity(noise, s2).sensory > assessLegCommunity(noise, NEUTRAL_COMMUNITY_SENSITIVITY).sensory);
    assert.equal(assessLegCommunity(jam, s0).disruption, assessLegCommunity(jam, s2).disruption);
  });
  test("kérés-validáció és normalizálás: 0..2, opcionális; a régi 6 kulcsos viselkedés bitre változatlan", () => {
    const base = { from: "A utca 1", to: "B utca 2" };
    assert.equal(journeySearchSchema.safeParse({ ...base, weights: { crowding: 2, noise: 0 } }).success, true);
    assert.equal(journeySearchSchema.safeParse({ ...base, weights: { crowding: 3 } }).success, false);
    assert.deepEqual(normalizePersonalizationWeights(undefined), DEFAULT_PERSONALIZATION_WEIGHTS);
    assert.ok(!("crowding" in normalizePersonalizationWeights({ transfers: 2 })));
    assert.equal(normalizePersonalizationWeights({ crowding: 5, noise: -1 }).crowding, 2);
    assert.equal(normalizePersonalizationWeights({ crowding: 5, noise: -1 }).noise, 0);
    const j = journey([walk(3), transit("r1", 20)]);
    assert.equal(computeSensoryScore(j, { ...DEFAULT_PERSONALIZATION_WEIGHTS, crowding: 2, noise: 2 }).score, j.sensory!.score, "a strukturális score-t nem érinti");
  });
  test("persistence: ugyanaz a mechanizmus (kedvenc weights JSONB), anonim = munkamenet-állapot, nincs új auth", () => {
    const favSchemas = read("lib/vedett-route/favorites/schemas.ts");
    assert.match(favSchemas, /crowding: weightValueSchema\.optional\(\)/);
    assert.match(favSchemas, /noise: weightValueSchema\.optional\(\)/);
    const queries = read("lib/vedett-route/favorites/queries.ts");
    assert.match(queries, /error\.code === "23514"/);
    assert.match(queries, /\(a\.weights\.crowding \?\? 1\) !== \(b\.weights\.crowding \?\? 1\)/);
    const sql = read("supabase/migrations/20261010_vedett_route_favorites_sensory_preferences.sql");
    assert.match(sql, /\(weights - 'crowding' - 'noise'\) = jsonb_build_object/);
    assert.match(sql, /NOT \(weights \? 'crowding'\) OR weights->'crowding' IN/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE /i);
    assert.match(form, /\{ key: "crowding", label: "Zsúfolt jármű zavar" \}/);
    assert.match(form, /\{ key: "noise", label: "Zajos környezet zavar" \}/);
    assert.match(form, /value=\{weights\[key\] \?\? 1\}/);
    const search = read("app/api/admin/vedett-utvonal/search/route.ts");
    assert.match(search, /requireVedettRoutePublicRead\(request, \{ label: "search"/, "a keresés anonim is használható marad");
  });
});

describe("MONITOR — hátralévő szakaszok, material change, cadence", () => {
  const J = journey([walk(3), transit("r1", 10), walk(2), transit("r2", 15), walk(2)]);
  test("csak a hátralévő TRANSIT szakaszok; a megtett láb kimarad", () => {
    assert.deepEqual(collectRemainingCommunityContexts(J, 0).contexts.map((c) => c.routeId), ["r1", "r2"]);
    assert.deepEqual(collectRemainingCommunityContexts(J, 2).contexts.map((c) => c.routeId), ["r2"]);
    assert.deepEqual(collectRemainingCommunityContexts(J, 4).contexts, []);
    const rem = buildRemainingJourney(J, 2);
    assert.equal(rem.legs.length, 3);
    assert.equal(rem.transfers, 0);
    assert.equal(rem.totalDurationMinutes, 19);
  });
  test("publikus API-válasz -> ugyanaz az értékelés, mint a szerveren", () => {
    const { contexts, durations } = collectRemainingCommunityContexts(J, 0);
    const pub = { weekday: 3, dayType: "workday" as const, timeBucket: 33, realtimeApplicable: true, routing: evaluation([]).routing, kinds: [{ kind: "crowding" as const, historical: { source: "historical" as const, status: "strong" as const, expectedScore: 1, confidence: 0.8, sampleStrength: 5, fallbackLevel: "exact" as const }, realtime: null, combined: { score: 1, confidence: 0.8, realtimeApplied: false }, historicalPenalty: 0, realtimePenalty: 0, combinedPenalty: 0 }] };
    const map = new Map([[contexts[1].key, adaptPublicLoadEvaluation(pub)]]);
    const { assessment, state: st } = assessRemainingJourneyCommunity(contexts, durations, map, resolveCommunitySensitivity({ crowding: 2 }));
    assert.equal(assessment.evidenceLegCount, 1);
    assert.ok(st.personalPenalty > 0);
  });
  test("material: érdemi növekedés / új zavar igen; gyenge, insufficient, apró változás nem", () => {
    const base = state({ personalPenalty: 0.1 });
    assert.equal(evaluateCommunityDeterioration(base, state({ personalPenalty: 0.4 })).trigger, "PENALTY_INCREASE");
    assert.equal(evaluateCommunityDeterioration(base, state({ personalPenalty: 0.45, disruption: 0.5 })).trigger, "NEW_DISRUPTION");
    assert.equal(evaluateCommunityDeterioration(base, state({ personalPenalty: 0.6, confidence: 0.3 })).reason, "LOW_CONFIDENCE");
    assert.equal(evaluateCommunityDeterioration(base, state({ personalPenalty: 0.6, evidenceLegCount: 0 })).reason, "NO_EVIDENCE");
    assert.equal(evaluateCommunityDeterioration(base, state({ personalPenalty: 0.2 })).reason, "BELOW_THRESHOLD");
    assert.equal(evaluateCommunityDeterioration(null, state({ personalPenalty: 0.9 })).reason, "NO_BASELINE");
  });
  test("cadence: egyetlen percenkénti timer, a monitor ugyanabban a loopban; szakaszváltás azonnali frissítés", () => {
    assert.equal((hook.match(/setInterval\(/g) ?? []).length, 1, "nincs második, független polling loop");
    assert.match(hook, /setInterval\(load, COMMUNITY_STATE_POLL_INTERVAL_MS\)/);
    assert.match(hook, /void loadMonitor\(\);/);
    assert.match(hook, /monitorEnabled, monitorKey\]\)/, "a hátralévő kontextusok változása (szakaszváltás) új lekérést indít");
    assert.match(hook, /document\.visibilityState === "hidden"\) return;/);
    assert.match(hook, /if \(!monitorEnabled \|\| !current \|\| monitorInFlight\) return;/, "háttérből visszatérve nincs párhuzamos lekérés");
    assert.equal(COMMUNITY_REROUTE_CONFIG.monitorIntervalMs, 60_000);
    assert.equal((form.match(/community-load/g) ?? []).length, 0, "a form nem pollol külön");
    assert.match(form, /useCommunityRealtimeWarning\(\s*\n\s*navigationMode,/, "csak aktív navigációban");
  });
});

describe("REROUTE — guard, döntés, suppression", () => {
  const trigger = { type: "COMMUNITY_DETERIORATION" as const, eventId: "community:p0.5s0.5d0.0" };
  const guardInput = (over = {}) => ({ navigationActive: true, offRouteConfirmed: false, gpsReliable: true, foregroundRecoveryActive: false, restoreRecoveryActive: false, hasDestination: true, trigger, nowMs: 1_000_000, ...over });
  test("GPS nélkül / recovery alatt nincs keresés; cooldown véd az ismétlés ellen", () => {
    const g = createInitialLiveAlternativeGuardState();
    assert.equal(shouldStartLiveAlternativeSearch(g, guardInput({ gpsReliable: false })).reason, "GPS_UNRELIABLE");
    assert.equal(shouldStartLiveAlternativeSearch(g, guardInput({ restoreRecoveryActive: true })).reason, "RECOVERY_ACTIVE");
    assert.equal(shouldStartLiveAlternativeSearch(g, guardInput()).shouldSearch, true);
    const started = markLiveAlternativeSearchStarted(g, trigger, 1_000_000);
    assert.equal(shouldStartLiveAlternativeSearch(started, guardInput()).reason, "SEARCH_IN_FLIGHT");
    const finished = { ...started, inFlight: false };
    const other = { type: "COMMUNITY_DETERIORATION" as const, eventId: "community:p0.8s0.8d0.0" };
    assert.equal(shouldStartLiveAlternativeSearch(finished, guardInput({ trigger: other, nowMs: 1_000_000 + 60_000 })).reason, "COOLDOWN_ACTIVE");
    assert.equal(shouldStartLiveAlternativeSearch(finished, guardInput({ trigger: other, nowMs: 1_000_000 + 6 * 60_000 })).shouldSearch, true);
  });
  test("elutasítás: ugyanaz az állapot elnyomva; érdemi további romlás áttöri", () => {
    const g = markLiveAlternativeEventDeclined(createInitialLiveAlternativeGuardState(), trigger.eventId, 1_000_000);
    assert.equal(shouldStartLiveAlternativeSearch(g, guardInput({ nowMs: 1_000_000 + 60_000 })).reason, "EVENT_DECLINED_SUPPRESSED");
    const declined = state({ personalPenalty: 0.5, signature: "a" });
    assert.equal(isMaterialCommunityChange(declined, state({ personalPenalty: 0.55 })), false);
    assert.equal(isMaterialCommunityChange(declined, state({ personalPenalty: 0.75 })), true);
  });

  // Jelenlegi hátralévő út: 1 járat, erős realtime zsúfoltság (felhasználó: zsúfoltság nagyon zavar).
  const weights = { ...DEFAULT_PERSONALIZATION_WEIGHTS, crowding: 2 };
  const CURRENT = journey([walk(2), transit("rc", 20), walk(2)], { fingerprint: "current" });
  const badAssessment: JourneyCommunityAssessment = { sensory: 1, disruption: 0, confidence: 0.85, evidenceLegCount: 1, transitLegCount: 1, sensoryDriver: "realtime", crowdingDriven: true, disruptionDriver: null, realtimeCalm: false };
  const current = (() => {
    const c = computeCurrentRemainingBreakdown(CURRENT, 0, weights, badAssessment);
    return { remaining: c.remaining, breakdown: c.breakdown, assessment: badAssessment, fingerprint: "current" };
  })();
  const cand = (legs: JourneyLeg[], fp: string, assessment: JourneyCommunityAssessment | null = null) => {
    const j = journey(legs, { fingerprint: fp });
    return { journey: j, scoreBreakdown: computeScoreBreakdown(j, assessment) };
  };

  test("érdemben nyugodtabb alternatíva -> ajánlat, indokkal és rövid különbségekkel", () => {
    const calm = cand([walk(3), transit("ra", 21), walk(2)], "calm");
    const d = evaluateRerouteOpportunity({ current, candidates: [calm] });
    assert.equal(d.shouldOffer, true, JSON.stringify(d.rejectedReason));
    assert.equal(d.best!.journey.fingerprint, "calm");
    assert.ok(d.reasonCodes.includes("CURRENTLY_CALMER"));
    assert.ok(d.improvementPoints >= COMMUNITY_REROUTE_CONFIG.minImprovementPoints + d.switchingCostPoints);
    const bullets = buildRerouteOfferBullets(d, (code) => COMMUNITY_REASON_TEXT[code]?.text ?? null);
    assert.deepEqual(bullets, ["Friss jelzések szerint nyugodtabb", "2 perccel hosszabb"]);
    for (const b of bullets) assert.doesNotMatch(b, /%|pont|score/i);
  });
  test("nincs jobb / triviális javulás / csak a jelenlegi út -> nincs ajánlat", () => {
    const sameBad = cand([walk(3), transit("rb", 21), walk(2)], "samebad", badAssessment);
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [sameBad] }).rejectedReason, "NOT_COMMUNITY_DRIVEN");
    const mild: JourneyCommunityAssessment = { ...badAssessment, sensory: 0.75 };
    const slightly = cand([walk(3), transit("rs", 21), walk(2)], "slight", mild);
    const d = evaluateRerouteOpportunity({ current, candidates: [slightly] });
    assert.equal(d.shouldOffer, false);
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [{ journey: CURRENT }] }).rejectedReason, "ONLY_CURRENT_ROUTE");
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [] }).rejectedReason, "NO_CANDIDATES");
  });
  test("sokkal hosszabb / túl sok átszállás / sok plusz gyaloglás -> elutasítva", () => {
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [cand([walk(2), transit("rl", 40), walk(2)], "long")] }).rejectedReason, "GUARDRAIL_DURATION");
    const manyTransfers = cand([walk(1), transit("x1", 5), walk(1), transit("x2", 5), walk(1), transit("x3", 5), walk(1)], "transfers");
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [manyTransfers] }).rejectedReason, "GUARDRAIL_TRANSFERS");
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [cand([walk(14), transit("rw", 10), walk(1)], "walk")] }).rejectedReason, "GUARDRAIL_WALKING");
  });
  test("switching cost: plusz átszállás drágítja a váltást (korlátos)", () => {
    const direct = evaluateRerouteOpportunity({ current, candidates: [cand([walk(3), transit("ra", 21), walk(2)], "direct")] });
    const withTransfer = evaluateRerouteOpportunity({ current, candidates: [cand([walk(2), transit("y1", 10), walk(1), transit("y2", 10), walk(1)], "transfer")] });
    assert.ok(withTransfer.switchingCostPoints > direct.switchingCostPoints);
    assert.ok(withTransfer.switchingCostPoints <= COMMUNITY_REROUTE_CONFIG.maxSwitchingCostPoints);
  });
  test("determinisztikus legjobb jelölt, stabil tie (bemeneti sorrendtől független)", () => {
    const a = cand([walk(3), transit("ra", 21), walk(2)], "aaa");
    const b = cand([walk(3), transit("rb2", 21), walk(2)], "bbb");
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [a, b] }).best!.journey.fingerprint, "aaa");
    assert.equal(evaluateRerouteOpportunity({ current, candidates: [b, a] }).best!.journey.fingerprint, "aaa");
  });
  test("feature flag: alapból KI, csak 'true' kapcsolja be", () => {
    assert.equal(isDynamicReroutingEnabled(undefined), false);
    assert.equal(isDynamicReroutingEnabled("1"), false);
    assert.equal(isDynamicReroutingEnabled("true"), true);
    assert.match(form, /isDynamicReroutingEnabled\(process\.env\.NEXT_PUBLIC_VEDETT_ROUTE_DYNAMIC_REROUTING_ENABLED\)/);
    assert.match(form, /enabled: dynamicReroutingEnabled,/);
  });
  test("summary-k kvantált aláírása stabil (ugyanaz az állapot -> ugyanaz a kulcs)", () => {
    const s1 = summarizeJourneyCommunityState(badAssessment);
    const s2 = summarizeJourneyCommunityState({ ...badAssessment });
    assert.equal(s1.signature, s2.signature);
  });
});

describe("UX / navigation state (forrás-szint)", () => {
  const body = (start: string) => {
    const i = form.indexOf(start);
    assert.ok(i >= 0, start);
    return form.slice(i, form.indexOf("\n  };\n", i));
  };
  test("közösségi romlás -> a MEGLÉVŐ Live Alternative pipeline, sosem automatikus váltás", () => {
    assert.match(form, /void maybeStartLiveAlternativeSearch\(\{ type: "COMMUNITY_DETERIORATION", eventId: `community:\$\{state\.signature\}` \}\)/);
    const maybe = body("const maybeStartLiveAlternativeSearch = async");
    assert.match(maybe, /fetch\("\/api\/admin\/vedett-utvonal\/search"/, "ugyanaz a routing infrastruktúra");
    // JOURNEY MONITOR v1 / 3. lépés — a body a liveRerouteContext.ts helperéből jön
    // (viselkedési tesztek: live-reroute-context.test.ts).
    assert.match(maybe, /destination: originalDestination,/, "az eredeti cél");
    assert.match(maybe, /currentPosition,\n/, "a jelenlegi helyzetből (gyaloglás/várakozás közben)");
    assert.match(maybe, /context: effectiveLiveRerouteContext,/, "a felhasználó preferenciáival és routing-feltételeivel");
    assert.match(maybe, /body: JSON\.stringify\(liveSearchPayload\)/);
    assert.match(maybe, /evaluateRerouteOpportunity\(\{/);
    assert.doesNotMatch(maybe, /setDisplayedJourney\(/, "keresés/ajánlat nem cserél journey-t");
    assert.match(maybe, /discardLiveAlternativeSearch\(offer, sessionGeneration\)/, "hiba / nincs ajánlat -> a navigáció változatlan");
  });
  test("elutasítás: suppression; elfogadás: aktív journey + új baseline, cél és GPS marad", () => {
    const decline = body("const handleLiveAlternativeDecline = () => {");
    assert.match(decline, /communityDeclinedStateRef\.current = latestCommunityStateRef\.current;/);
    assert.doesNotMatch(decline, /setDisplayedJourney|fetch\(/);
    const accept = body("const handleLiveAlternativeAccept = () => {");
    assert.match(accept, /setDisplayedJourney\(accepted\.acceptedJourney\)/);
    assert.match(accept, /bumpNavigationSession\(\);/);
    assert.match(accept, /communityBaselineRef\.current = null;/);
    assert.doesNotMatch(accept, /setNavigationMode|geo\.stopWatching|originalDestination =|setOriginalDestination/);
  });
  test("ajánlat- és előnézet-szövegek; nem modális", () => {
    assert.match(form, /Megváltozott a helyzet az útvonaladon\./);
    assert.match(form, /Találtunk egy várhatóan nyugodtabb alternatívát\./);
    assert.match(form, /"Alternatíva megtekintése" : "Megnézem"/);
    assert.match(form, /"Átváltok erre" : "Ezt választom"/);
    assert.match(form, /Várható érkezés:/);
  });
});

describe("PRIVACY", () => {
  test("nincs érzékeny analytics, GPS-tárolás, localStorage vagy reporter-összekötés az új kódban", () => {
    const files = [
      "lib/vedett-route/communityReports/communityReroute.ts",
      "lib/vedett-route/communityReports/communityMonitor.ts",
      "lib/vedett-route/communityReports/communityRerouteDebug.ts",
      "components/vedett-utvonal/useCommunityRealtimeWarning.ts",
    ];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /gtag|trackVedettRouteEvent|dataLayer|localStorage|sessionStorage|indexedDB/, f);
      assert.doesNotMatch(src, /latitude|longitude|reporter_scope_token|reporterToken/, f);
    }
    assert.doesNotMatch(read("lib/vedett-route/analytics.ts"), /crowd|noise|sensory|community/i);
    assert.match(read("lib/vedett-route/communityReports/communityRerouteDebug.ts"), /if \(process\.env\.NODE_ENV === "production"\) return;/);
  });
});
