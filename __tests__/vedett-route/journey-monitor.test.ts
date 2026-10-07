// VÉDETT ÚTVONAL — JOURNEY MONITOR v1 (2026-10-07)
//   node --test __tests__/vedett-route/journey-monitor.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateEtaLiveAlternative,
  createInitialRealtimeMonitorDebounceState,
  decideRealtimeMonitorTrigger,
  estimateRemainingEta,
  evaluateMissedConnection,
} from "../../lib/vedett-route/navigation/journeyMonitor.ts";
import { buildRealtimeDegradationSamples, evaluateRealtimeDegradation } from "../../lib/vedett-route/navigation/liveAlternative.ts";
import type { RealtimeLegUpdate } from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";

const T0 = Date.parse("2026-10-07T10:00:00Z");
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();

function transit(tripId: string, dep: number, arr: number, extra: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    fromName: "A",
    toName: "B",
    tripId,
    routeId: `R-${tripId}`,
    departureTime: iso(dep),
    arrivalTime: iso(arr),
    scheduledDepartureTime: iso(dep),
    scheduledArrivalTime: iso(arr),
    durationMinutes: arr - dep,
    realtime: false,
    ...extra,
  } as JourneyLeg;
}
const walk = (min: number): JourneyLeg => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: min, realtime: false }) as JourneyLeg;
const journey = (legs: JourneyLeg[]): Journey => ({ legs, totalDurationMinutes: 999, departureTime: iso(0), arrivalTime: iso(999) }) as unknown as Journey;

// Alap: 5' séta -> T1 (5..20) -> 3' átszállás -> T2 (26..40) -> 6' séta
const base = () => journey([walk(5), transit("T1", 5, 20), walk(3), transit("T2", 26, 40), walk(6)]);
const upd = (u: Partial<RealtimeLegUpdate> & { tripId: string }): RealtimeLegUpdate => ({ realtime: true, ...u });

describe("A–D: realtime romlás / kimaradás felismerése", () => {
  test("A) késés nélküli realtime frissítés -> nincs zavar", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T1", routeId: "R-T1", arrivalTime: iso(20), scheduledArrivalTime: iso(20), delayMinutes: 0 })]));
    assert.equal(d.degraded, false);
    assert.equal(d.newlyCancelled, false);
  });
  test("B) első realtime frissítés, >= 5 perc a menetrendhez képest -> felismerhető", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T1", routeId: "R-T1", arrivalTime: iso(27), scheduledArrivalTime: iso(20) })]));
    assert.equal(d.degraded, true);
    assert.equal(d.worstLegTripId, "T1");
    assert.equal(d.worsenedByMinutes, 7);
  });
  test("B2) érkezési idő hiányában az indulási idő-pár számít", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T2", routeId: "R-T2", departureTime: iso(32), scheduledDepartureTime: iso(26) })]));
    assert.equal(d.degraded, true);
    assert.equal(d.worstLegTripId, "T2");
  });
  test("C) első realtime frissítés kis eltéréssel -> nincs trigger; realtime=false frissítésből nincs fabrikált késés", () => {
    const small = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T1", routeId: "R-T1", arrivalTime: iso(22), scheduledArrivalTime: iso(20) })]));
    assert.equal(small.degraded, false);
    const notRealtime = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [{ tripId: "T1", routeId: "R-T1", realtime: false, arrivalTime: iso(40), scheduledArrivalTime: iso(20) }]));
    assert.equal(notRealtime.degraded, false);
  });
  test("D) kimaradt láb -> felismerhető, és a tripId megmarad (korábban null volt)", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T2", routeId: "R-T2", cancelled: true })]));
    assert.equal(d.degraded, true);
    assert.equal(d.newlyCancelled, true);
    assert.equal(d.cancelledTripId, "T2");
    assert.equal(d.worstLegTripId, "T2");
  });
});

describe("E–F: csatlakozás", () => {
  test("E) realtime érkezés + átszállás után < 2 perc tartalék -> AT_RISK", () => {
    const j = base();
    j.legs[1] = transit("T1", 5, 22, { realtime: true }); // 22 + 3 = 25 -> 1 perc tartalék a 26-os indulásig
    const r = evaluateMissedConnection(j, 1);
    assert.equal(r.status, "AT_RISK");
    assert.equal(r.slackMinutes, 1);
    assert.equal(r.fromTripId, "T1");
    assert.equal(r.toTripId, "T2");
  });
  test("E2) negatív tartalék -> MISSED", () => {
    const j = base();
    j.legs[1] = transit("T1", 5, 27, { realtime: true });
    assert.equal(evaluateMissedConnection(j, 1).status, "MISSED");
  });
  test("F) biztonságos csatlakozás -> OK; már lezajlott átszállás nem számít", () => {
    assert.equal(evaluateMissedConnection(base(), 0).status, "OK");
    const j = base();
    j.legs[1] = transit("T1", 5, 27, { realtime: true });
    assert.equal(evaluateMissedConnection(j, 3).status, "OK", "a T2-n ülve a T1->T2 átszállás már nem releváns");
  });
  test("hiányzó idő / tripId -> fail-open OK", () => {
    const j = base();
    j.legs[3] = { ...j.legs[3], departureTime: undefined };
    assert.equal(evaluateMissedConnection(j, 0).status, "OK");
  });
});

describe("G–H: hátralévő idő (ETA)", () => {
  test("G) a realtime-korrigált utolsó érkezést + a záró sétát használja, nem a durationMinutes-összeget", () => {
    const j = base();
    j.legs[3] = transit("T2", 26, 52, { realtime: true, scheduledArrivalTime: iso(40), durationMinutes: 14 });
    const eta = estimateRemainingEta(j, 1, T0 + 10 * 60_000);
    assert.ok(eta);
    assert.equal(eta.basis, "REALTIME_TRANSIT_ARRIVAL");
    assert.equal(eta.remainingMinutes, 52 + 6 - 10);
    const durationSum = j.legs.slice(1).reduce((s, l) => s + l.durationMinutes, 0);
    assert.notEqual(eta.remainingMinutes, durationSum);
  });
  test("csak séta van hátra -> most + séta", () => {
    const eta = estimateRemainingEta(base(), 4, T0 + 45 * 60_000);
    assert.equal(eta?.basis, "WALK_ONLY");
    assert.equal(eta?.remainingMinutes, 6);
  });
  test("H) nem számítható megbízhatóan -> null", () => {
    const missingTime = base();
    missingTime.legs[3] = { ...missingTime.legs[3], arrivalTime: undefined };
    assert.equal(estimateRemainingEta(missingTime, 1, T0), null);
    const cancelled = base();
    cancelled.legs[3] = { ...cancelled.legs[3], cancelled: true };
    assert.equal(estimateRemainingEta(cancelled, 1, T0), null);
    assert.equal(estimateRemainingEta(base(), 1, T0 + 90 * 60_000), null, "elavult (régen elmúlt) érkezés");
    const badWalk = base();
    badWalk.legs[4] = { ...badWalk.legs[4], durationMinutes: Number.NaN };
    assert.equal(estimateRemainingEta(badWalk, 1, T0), null);
    assert.equal(estimateRemainingEta(journey([]), 0, T0), null);
  });
});

describe("I–K: debounce", () => {
  const delayed = () => evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T1", routeId: "R-T1", arrivalTime: iso(28), scheduledArrivalTime: iso(20) })]));
  const ok = { status: "OK" as const, slackMinutes: null, fromTripId: null, toTripId: null };
  test("I) jelentős késés első pollja -> még nincs trigger", () => {
    const first = decideRealtimeMonitorTrigger({ degradation: delayed(), missedConnection: ok }, createInitialRealtimeMonitorDebounceState());
    assert.equal(first.trigger, null);
    assert.equal(first.state.pendingEventId, "degradation:T1");
  });
  test("J) ugyanaz a késés a második egymást követő pollban -> trigger", () => {
    const first = decideRealtimeMonitorTrigger({ degradation: delayed(), missedConnection: ok }, createInitialRealtimeMonitorDebounceState());
    const second = decideRealtimeMonitorTrigger({ degradation: delayed(), missedConnection: ok }, first.state);
    assert.deepEqual(second.trigger, { type: "SIGNIFICANT_REALTIME_DEGRADATION", eventId: "degradation:T1" });
  });
  test("rövid ingadozás (közben normalizálódik) -> nincs trigger", () => {
    const first = decideRealtimeMonitorTrigger({ degradation: delayed(), missedConnection: ok }, createInitialRealtimeMonitorDebounceState());
    const calm = decideRealtimeMonitorTrigger({ degradation: null, missedConnection: ok }, first.state);
    const again = decideRealtimeMonitorTrigger({ degradation: delayed(), missedConnection: ok }, calm.state);
    assert.equal(calm.trigger, null);
    assert.equal(again.trigger, null);
  });
  test("K) kimaradás -> azonnal, két poll nélkül", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [upd({ tripId: "T2", routeId: "R-T2", cancelled: true })]));
    const r = decideRealtimeMonitorTrigger({ degradation: d, missedConnection: ok }, createInitialRealtimeMonitorDebounceState());
    assert.deepEqual(r.trigger, { type: "CANCELLED", eventId: "cancelled:T2" });
  });
  test("egyértelműen elveszett csatlakozás azonnal; határeset csatlakozás 2 pollal", () => {
    const clear = decideRealtimeMonitorTrigger({ degradation: null, missedConnection: { status: "MISSED", slackMinutes: -3, fromTripId: "T1", toTripId: "T2" } }, createInitialRealtimeMonitorDebounceState());
    assert.deepEqual(clear.trigger, { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" });
    const edge = { status: "AT_RISK" as const, slackMinutes: 1, fromTripId: "T1", toTripId: "T2" };
    const p1 = decideRealtimeMonitorTrigger({ degradation: null, missedConnection: edge }, createInitialRealtimeMonitorDebounceState());
    const p2 = decideRealtimeMonitorTrigger({ degradation: null, missedConnection: edge }, p1.state);
    assert.equal(p1.trigger, null);
    assert.equal(p2.trigger?.type, "MISSED_CONNECTION");
  });
});

// ---------------------------------------------------------------------------
// 2. lépés — ETA-alapú Live Alternative összehasonlítás
// ---------------------------------------------------------------------------
describe("ETA-alapú összehasonlítás (evaluateEtaLiveAlternative)", () => {
  const NOW = T0 + 10 * 60_000;
  // Jelenlegi: a C1 járaton ül (aktív láb 0), realtime érkezés 25', utána 5' séta -> ETA 20 perc.
  const current = (arr = 25, extra: Partial<JourneyLeg> = {}) => journey([transit("C1", 5, arr, { realtime: true, ...extra }), walk(5)]);
  // Jelölt az aktuális helyzetből: 2' séta, N1 (dep..arr), 2' séta.
  const candidate = (dep: number, arr: number, extra: Partial<JourneyLeg> = {}) => journey([walk(2), transit("N1", dep, arr, extra), walk(2)]);
  const decide = (cur: Journey, cand: Journey, triggerType: Parameters<typeof evaluateEtaLiveAlternative>[0]["triggerType"] = "SIGNIFICANT_REALTIME_DEGRADATION", activeLegIndex = 0) =>
    evaluateEtaLiveAlternative({ current: cur, activeLegIndex, candidate: cand, nowMs: NOW, triggerType });

  test("A) jelenlegi ETA 20, jelölt ETA 12 -> switching cost után is >= 5 perc -> ajánlható", () => {
    const d = decide(current(), candidate(13, 20));
    assert.equal(d.currentRemainingMinutes, 20);
    assert.equal(d.candidateRemainingMinutes, 12);
    assert.equal(d.rawTimeDifferenceMinutes, 8);
    assert.ok((d.netTimeBenefitMinutes ?? 0) >= 5, `nettó: ${d.netTimeBenefitMinutes}`);
    assert.equal(d.offer, true);
    assert.equal(d.reason, "SUFFICIENT_TIME_BENEFIT");
  });
  test("B) jelenlegi 20, jelölt 17 -> nem ajánlható", () => {
    const d = decide(current(), candidate(18, 25));
    assert.equal(d.candidateRemainingMinutes, 17);
    assert.equal(d.offer, false);
    assert.equal(d.rejectedReason, "NOT_MEANINGFUL");
  });
  test("C) durationMinutes szerint jónak látszó jelenlegi út, de realtime ETA szerint sokkal rosszabb -> az ETA dönt", () => {
    // durationMinutes 10 (elavult), de a realtime érkezés 45' -> ETA 40 perc.
    const cur = current(45, { durationMinutes: 10 });
    const cand = candidate(13, 30); // ETA 22, durationMinutes-összeg 21 > 15 (jelenlegi összeg)
    const durationSumCurrent = cur.legs.reduce((s, l) => s + l.durationMinutes, 0);
    const durationSumCandidate = cand.legs.reduce((s, l) => s + l.durationMinutes, 0);
    assert.ok(durationSumCandidate > durationSumCurrent, "a régi összeg-logika szerint NEM lenne ajánlat");
    const d = decide(cur, cand);
    assert.equal(d.offer, true);
    assert.equal(d.currentRemainingMinutes, 40);
  });
  test("D) a jelölt durationMinutes-a rövidebb, de valós ETA szerint nem jobb -> nincs ajánlat", () => {
    const cand = candidate(30, 33); // 3 perces járat, de csak 30'-kor indul -> ETA 25 perc
    const durationSumCandidate = cand.legs.reduce((s, l) => s + l.durationMinutes, 0);
    assert.ok(durationSumCandidate < 20);
    const d = decide(current(), cand);
    assert.equal(d.candidateRemainingMinutes, 25);
    assert.equal(d.offer, false);
  });
  test("E) normál esetben a jelenlegi ETA null -> fail-open, nincs ajánlat", () => {
    const cur = current();
    cur.legs[0] = { ...cur.legs[0], arrivalTime: undefined };
    const d = decide(cur, candidate(13, 20));
    assert.equal(d.offer, false);
    assert.equal(d.rejectedReason, "CURRENT_ETA_UNAVAILABLE");
  });
  test("F) a jelölt ETA-ja null -> nincs ajánlat", () => {
    const d = decide(current(), candidate(13, 20, { arrivalTime: undefined }));
    assert.equal(d.offer, false);
    assert.equal(d.rejectedReason, "CANDIDATE_ETA_UNAVAILABLE");
  });
  test("G) kimaradt jelenlegi járat + érvényes jelölt -> felajánlható a strukturális szabály szerint (még ha lassabb is)", () => {
    const cur = current(25, { cancelled: true });
    const viaTrigger = decide(cur, candidate(25, 40), "CANCELLED");
    assert.equal(viaTrigger.offer, true);
    assert.equal(viaTrigger.reason, "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT");
    assert.equal(viaTrigger.currentStructurallyBroken, true);
    assert.equal(viaTrigger.netTimeBenefitMinutes, null);
    const viaLeg = decide(cur, candidate(25, 40), "SIGNIFICANT_REALTIME_DEGRADATION");
    assert.equal(viaLeg.offer, true, "a kimaradt láb önmagában is strukturális hiba");
  });
  test("G2) a jelölt maga is kimaradt lábat tartalmaz -> nincs ajánlat", () => {
    const d = decide(current(25, { cancelled: true }), candidate(13, 20, { cancelled: true }), "CANCELLED");
    assert.equal(d.offer, false);
    assert.ok(d.rejectedReason === "CANDIDATE_ETA_UNAVAILABLE" || d.rejectedReason === "CANDIDATE_NOT_VIABLE");
  });
  test("H) biztosan elveszett csatlakozás + érvényes jelölt -> felajánlható", () => {
    // T1 realtime érkezés 27' + 3' séta = 30' > T2 indulás 26' -> MISSED
    const cur = base();
    cur.legs[1] = transit("T1", 5, 27, { realtime: true });
    const d = evaluateEtaLiveAlternative({ current: cur, activeLegIndex: 1, candidate: candidate(20, 45), nowMs: NOW, triggerType: "MISSED_CONNECTION" });
    assert.equal(d.currentStructurallyBroken, true);
    assert.equal(d.offer, true);
    assert.equal(d.reason, "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT");
  });
  test("H2) csak veszélyeztetett (nem elveszett) csatlakozás -> a normál ETA-összevetés érvényes", () => {
    const cur = base();
    cur.legs[1] = transit("T1", 5, 22, { realtime: true }); // 1 perc tartalék
    const d = evaluateEtaLiveAlternative({ current: cur, activeLegIndex: 1, candidate: candidate(30, 50), nowMs: NOW, triggerType: "MISSED_CONNECTION" });
    assert.equal(d.currentStructurallyBroken, false);
    assert.equal(d.offer, false);
  });
  test("I) se kimaradás, se elveszett csatlakozás, és nincs >= 5 perc nettó ETA-előny -> nincs ajánlat", () => {
    // (PROVEN_RELEVANT_DISRUPTION-nél a MEGLÉVŐ strukturális kapu — nem rosszabb
    // idő + kevesebb gyaloglás/átszállás — szándékosan változatlanul engedhet.)
    for (const trigger of ["SIGNIFICANT_REALTIME_DEGRADATION", "MANUAL_CHECK", "COMMUNITY_DETERIORATION"] as const) {
      const d = decide(current(), candidate(16, 24), trigger);
      assert.equal(d.offer, false, trigger);
    }
  });
  test("J) nincs automatikus útvonalcsere: a döntés csak ajánlást ad, a csere kizárólag az accept handlerben van", () => {
    const d = decide(current(), candidate(13, 20));
    assert.equal("journey" in d, false);
    const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
    const start = form.indexOf("const maybeStartLiveAlternativeSearch = async");
    const body = form.slice(start, form.indexOf("const handleLiveAlternativeDecline = ()", start));
    assert.match(body, /evaluateEtaLiveAlternative\(\{/);
    assert.doesNotMatch(body, /setDisplayedJourney\(/);
    assert.doesNotMatch(body, /remainingDurationMinutes/, "a régi durationMinutes-összeg alapú időkülönbség megszűnt");
    assert.match(body, /presentLiveAlternativeOffer\(/);
  });
});
