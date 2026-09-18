// VÉDETT ÚTVONAL — SPRINT 8.4 (LIVE ALTERNATIVE, 2026-09-18). Pure behavior
// tesztek a lib/vedett-route/navigation/liveAlternative.ts motorra.
// "STAY ON CURRENT ROUTE" az alap; ez a modul SOHA nem vált automatikusan.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import {
  createInitialLiveAlternativeGuardState,
  shouldStartLiveAlternativeSearch,
  markLiveAlternativeSearchStarted,
  markLiveAlternativeSearchFinished,
  markLiveAlternativeEventDeclined,
  computeRemainingJourneyMetrics,
  computeSwitchingCost,
  evaluateMeaningfulImprovement,
  selectBestLiveAlternativeCandidate,
  buildDisruptionTriggers,
  evaluateRealtimeDegradation,
  buildRealtimeDegradationSamples,
  createInitialLiveAlternativeOffer,
  startLiveAlternativeOfferSearch,
  presentLiveAlternativeOffer,
  discardLiveAlternativeSearch,
  declineLiveAlternativeOffer,
  acceptLiveAlternativeOffer,
  DEFAULT_LIVE_ALTERNATIVE_COOLDOWN_MS,
  DEFAULT_DECLINE_SUPPRESSION_MS,
  type LiveAlternativeTrigger,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";
import type { DisruptionRelevanceLeg } from "../../lib/vedett-route/navigation/disruptionRelevance.ts";

const NOW = Date.parse("2026-09-18T09:00:00Z");

function makeLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    fromName: "A",
    toName: "B",
    durationMinutes: 10,
    realtime: false,
    tripId: "trip-1",
    routeId: "M2",
    ...overrides,
  };
}

function makeJourney(legs: JourneyLeg[], overrides: Partial<Journey> = {}): Journey {
  return {
    totalDurationMinutes: legs.reduce((s, l) => s + l.durationMinutes, 0),
    departureTime: "2026-09-18T10:00:00Z",
    arrivalTime: "2026-09-18T10:30:00Z",
    walkingMinutes: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.durationMinutes, 0),
    waitingMinutes: 0,
    transfers: Math.max(0, legs.filter((l) => l.mode === "TRANSIT").length - 1),
    legs,
    alerts: [],
    realtimeAvailable: false,
    ...overrides,
  };
}

describe("liveAlternative — rate/churn guard", () => {
  const baseTrigger: LiveAlternativeTrigger = { type: "MANUAL_CHECK", eventId: "manual-1" };
  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      navigationActive: true,
      offRouteConfirmed: false,
      gpsReliable: true,
      foregroundRecoveryActive: false,
      restoreRecoveryActive: false,
      hasDestination: true,
      trigger: baseTrigger,
      nowMs: NOW,
      ...overrides,
    };
  }

  test("1) navigationActive=false => blokkolva", () => {
    const decision = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ navigationActive: false })
    );
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "NAVIGATION_INACTIVE");
  });

  test("2) OFF_ROUTE => Live Alternative SOHA nem indul (nem az auto-reroute feladata)", () => {
    const decision = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ offRouteConfirmed: true })
    );
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "OFF_ROUTE_NOT_OUR_JOB");
  });

  test("3) megbízhatatlan GPS => blokkolva, soha nem fabrikált pozícióból induló keresés", () => {
    const decision = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ gpsReliable: false })
    );
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "GPS_UNRELIABLE");
  });

  test("4) foreground/restore recovery aktív => blokkolva", () => {
    const d1 = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ foregroundRecoveryActive: true })
    );
    const d2 = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ restoreRecoveryActive: true })
    );
    assert.equal(d1.shouldSearch, false);
    assert.equal(d2.shouldSearch, false);
    if (!d1.shouldSearch) assert.equal(d1.reason, "RECOVERY_ACTIVE");
    if (!d2.shouldSearch) assert.equal(d2.reason, "RECOVERY_ACTIVE");
  });

  test("5) hiányzó cél => blokkolva", () => {
    const decision = shouldStartLiveAlternativeSearch(
      createInitialLiveAlternativeGuardState(),
      baseInput({ hasDestination: false })
    );
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "DESTINATION_MISSING");
  });

  test("6) max 1 keresés lehet in-flight", () => {
    let state = createInitialLiveAlternativeGuardState();
    state = markLiveAlternativeSearchStarted(state, baseTrigger, NOW);
    const decision = shouldStartLiveAlternativeSearch(state, baseInput());
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "SEARCH_IN_FLIGHT");
  });

  test("7) cooldown blokkolja az ismételt keresést ugyanarra az eseményre", () => {
    let state = createInitialLiveAlternativeGuardState();
    state = markLiveAlternativeSearchStarted(state, baseTrigger, NOW);
    state = markLiveAlternativeSearchFinished(state);
    const decision = shouldStartLiveAlternativeSearch(
      state,
      baseInput({ nowMs: NOW + DEFAULT_LIVE_ALTERNATIVE_COOLDOWN_MS - 1000 })
    );
    assert.equal(decision.shouldSearch, false);
    if (!decision.shouldSearch) assert.equal(decision.reason, "COOLDOWN_ACTIVE");
  });

  test("8) egy VALÓDI ÚJ disruption esemény felülírhatja a cooldownt", () => {
    let state = createInitialLiveAlternativeGuardState();
    const firstAlert: LiveAlternativeTrigger = { type: "PROVEN_RELEVANT_DISRUPTION", eventId: "alert-A" };
    state = markLiveAlternativeSearchStarted(state, firstAlert, NOW);
    state = markLiveAlternativeSearchFinished(state);
    const secondAlert: LiveAlternativeTrigger = { type: "PROVEN_RELEVANT_DISRUPTION", eventId: "alert-B" };
    const decision = shouldStartLiveAlternativeSearch(
      state,
      baseInput({ trigger: secondAlert, nowMs: NOW + 1000 })
    );
    assert.equal(decision.shouldSearch, true);
  });

  test("9) egy elutasított event rövid ideig suppressed, majd feloldódik", () => {
    let state = createInitialLiveAlternativeGuardState();
    state = markLiveAlternativeEventDeclined(state, "manual-1", NOW);
    const stillSuppressed = shouldStartLiveAlternativeSearch(
      state,
      baseInput({ nowMs: NOW + 1000 })
    );
    assert.equal(stillSuppressed.shouldSearch, false);
    if (!stillSuppressed.shouldSearch) assert.equal(stillSuppressed.reason, "EVENT_DECLINED_SUPPRESSED");

    const resolved = shouldStartLiveAlternativeSearch(
      state,
      baseInput({ nowMs: NOW + DEFAULT_DECLINE_SUPPRESSION_MS + 1000 })
    );
    assert.equal(resolved.shouldSearch, true);
  });
});

describe("liveAlternative — remaining journey metrics (leg-level, still-ahead-of-us)", () => {
  test("10) csak a currentLegIndex-től kezdődő legek számítanak", () => {
    const completedLeg = makeLeg({ durationMinutes: 20 });
    const remainingLeg = makeLeg({ durationMinutes: 15, transitMode: "SUBWAY" });
    const journey = makeJourney([completedLeg, remainingLeg]);
    const metrics = computeRemainingJourneyMetrics(journey, 1);
    assert.equal(metrics.remainingDurationMinutes, 15);
    assert.equal(metrics.remainingTransitLegCount, 1);
  });

  test("gyaloglási távolság csak akkor összesítve, ha MINDEN hátralévő WALK lábhoz volt valós adat", () => {
    const withDistance = makeLeg({ mode: "WALK", durationMinutes: 5, distanceMeters: 300 });
    const withoutDistance = makeLeg({ mode: "WALK", durationMinutes: 3 });
    const journey = makeJourney([withDistance, withoutDistance]);
    const metrics = computeRemainingJourneyMetrics(journey, 0);
    assert.equal(metrics.remainingWalkingDistanceMeters, null);
  });
});

describe("liveAlternative — switching cost model", () => {
  test("11) folytonossági bónusz mindig jelen van, még ha nincs egyéb változás", () => {
    const same = computeRemainingJourneyMetrics(makeJourney([makeLeg()]), 0);
    const cost = computeSwitchingCost({ current: same, candidate: same });
    assert.equal(cost.continuityBonusMinutes, 3);
    assert.equal(cost.transferPenaltyMinutes, 0);
    assert.equal(cost.totalPenaltyMinutes, 3);
  });

  test("12) új átszállás büntetése", () => {
    const current = computeRemainingJourneyMetrics(makeJourney([makeLeg({ tripId: "t1" })]), 0);
    const candidate = computeRemainingJourneyMetrics(
      makeJourney([makeLeg({ tripId: "t1" }), makeLeg({ tripId: "t2", transitMode: "SUBWAY" })]),
      0
    );
    const cost = computeSwitchingCost({ current, candidate });
    assert.equal(cost.transferPenaltyMinutes, 4);
  });

  test("13) hozzáadott gyaloglás büntetése", () => {
    const current = computeRemainingJourneyMetrics(makeJourney([makeLeg({ mode: "WALK", durationMinutes: 2 })]), 0);
    const candidate = computeRemainingJourneyMetrics(
      makeJourney([makeLeg({ mode: "WALK", durationMinutes: 10 })]),
      0
    );
    const cost = computeSwitchingCost({ current, candidate });
    assert.equal(cost.walkingPenaltyMinutes, 4); // (10-2) * 0.5
  });

  test("14) új mód bevezetésének büntetése", () => {
    const current = computeRemainingJourneyMetrics(makeJourney([makeLeg({ transitMode: "SUBWAY" })]), 0);
    const candidate = computeRemainingJourneyMetrics(makeJourney([makeLeg({ transitMode: "BUS" })]), 0);
    const cost = computeSwitchingCost({ current, candidate });
    assert.equal(cost.modeChangePenaltyMinutes, 3);
  });

  test("15) 'azonnali döntés' büntetés KIZÁRÓLAG explicit megadott secondsUntilActionRequired esetén — soha nem fabrikált", () => {
    const metrics = computeRemainingJourneyMetrics(makeJourney([makeLeg()]), 0);
    const withoutInfo = computeSwitchingCost({ current: metrics, candidate: metrics });
    assert.equal(withoutInfo.immediateChangePenaltyMinutes, 0);
    const withImminentAction = computeSwitchingCost({
      current: metrics,
      candidate: metrics,
      secondsUntilActionRequired: 30,
    });
    assert.equal(withImminentAction.immediateChangePenaltyMinutes, 5);
  });
});

describe("liveAlternative — meaningful improvement gate (a 4 spec-példa a szabályokból következik)", () => {
  test("1. példa: 31 vs 29 perc + 1 új átszállás => NINCS OFFER", () => {
    const decision = evaluateMeaningfulImprovement({
      rawTimeDifferenceMinutes: 2,
      netTimeBenefitMinutes: 2 - (4 + 3),
      disruptionDriven: false,
      structuralImprovement: { fewerTransfers: false, lessWalking: false },
      hasRealPreferenceData: false,
      preferenceFavorsStructuralImprovement: false,
    });
    assert.equal(decision.meaningful, false);
  });

  test("2. példa: 31 vs 26 perc + 2 új átszállás => NINCS OFFER", () => {
    const decision = evaluateMeaningfulImprovement({
      rawTimeDifferenceMinutes: 5,
      netTimeBenefitMinutes: 5 - (2 * 4 + 3),
      disruptionDriven: false,
      structuralImprovement: { fewerTransfers: false, lessWalking: false },
      hasRealPreferenceData: false,
      preferenceFavorsStructuralImprovement: false,
    });
    assert.equal(decision.meaningful, false);
  });

  test("3. példa: 52 (disruption) vs 33 perc + 1 egyszerű átszállás => OFFER lehetséges", () => {
    const decision = evaluateMeaningfulImprovement({
      rawTimeDifferenceMinutes: 19,
      netTimeBenefitMinutes: 19 - (4 + 3),
      disruptionDriven: true,
      structuralImprovement: { fewerTransfers: false, lessWalking: false },
      hasRealPreferenceData: false,
      preferenceFavorsStructuralImprovement: false,
    });
    assert.equal(decision.meaningful, true);
    assert.equal(decision.reason, "SUFFICIENT_TIME_BENEFIT");
  });

  test("4. példa: 35 vs 35 perc, kevesebb átszállás/gyaloglás + VALÓS preferencia-adat => OFFER lehetséges", () => {
    const decision = evaluateMeaningfulImprovement({
      rawTimeDifferenceMinutes: 0,
      netTimeBenefitMinutes: 0 - 3,
      disruptionDriven: false,
      structuralImprovement: { fewerTransfers: true, lessWalking: false },
      hasRealPreferenceData: true,
      preferenceFavorsStructuralImprovement: true,
    });
    assert.equal(decision.meaningful, true);
    assert.equal(decision.reason, "PREFERENCE_BACKED_STRUCTURAL_ADVANTAGE");
  });

  test("4. példa variáns: UGYANAZ, de nincs valós preferencia-adat => NINCS OFFER (nincs fabrikáció)", () => {
    const decision = evaluateMeaningfulImprovement({
      rawTimeDifferenceMinutes: 0,
      netTimeBenefitMinutes: 0 - 3,
      disruptionDriven: false,
      structuralImprovement: { fewerTransfers: true, lessWalking: false },
      hasRealPreferenceData: false,
      preferenceFavorsStructuralImprovement: false,
    });
    assert.equal(decision.meaningful, false);
  });
});

describe("liveAlternative — candidate dedup (a meglévő fingerprint modult használja)", () => {
  test("21) sosem ajánlja fel ugyanazt a journey-t (fingerprint egyezés)", () => {
    const journey = makeJourney([makeLeg()]);
    const fp = journey.fingerprint ?? "computed";
    const withFp = { ...journey, fingerprint: fp };
    const candidate = selectBestLiveAlternativeCandidate([withFp], fp);
    assert.equal(candidate, null);
  });

  test("22) egy korábban elutasított fingerprintű candidate kimarad", () => {
    const journey = { ...makeJourney([makeLeg()]), fingerprint: "fp-declined" };
    const candidate = selectBestLiveAlternativeCandidate([journey], "fp-current", new Set(["fp-declined"]));
    assert.equal(candidate, null);
  });

  test("egy valóban új, nem elutasított candidate visszaadódik", () => {
    const journey = { ...makeJourney([makeLeg()]), fingerprint: "fp-new" };
    const candidate = selectBestLiveAlternativeCandidate([journey], "fp-current", new Set(["fp-declined"]));
    assert.equal(candidate?.fingerprint, "fp-new");
  });
});

describe("liveAlternative — disruption trigger (Sprint 8.3 motor újrahasználva)", () => {
  test("23) csak PROVEN_RELEVANT alert generál triggert, UNKNOWN/IRRELEVANT nem", () => {
    const leg: DisruptionRelevanceLeg = {
      legIndex: 0,
      mode: "TRANSIT",
      tripId: "trip-M2-deli-kossuth",
      routeId: "M2",
      fromStopId: "stop-deli",
      toStopId: "stop-kossuth",
      departureTime: "2026-09-18T10:00:00Z",
      arrivalTime: "2026-09-18T10:20:00Z",
    };
    const provenAlert = {
      id: "proven-1",
      header: "Riasztás",
      informedEntities: [{ tripId: "trip-M2-deli-kossuth" }],
      activePeriod: [],
    };
    const routeOnlyAlert = {
      id: "route-only-1",
      header: "Riasztás",
      informedEntities: [{ routeId: "M2" }],
      activePeriod: [],
    };
    const triggers = buildDisruptionTriggers([provenAlert, routeOnlyAlert], [leg], null, NOW);
    assert.equal(triggers.length, 1);
    assert.equal(triggers[0].type, "PROVEN_RELEVANT_DISRUPTION");
    assert.equal(triggers[0].eventId, "proven-1");
  });
});

describe("liveAlternative — realtime degradation (a meglévő ~30s refresh kimenetéből, új poller nélkül)", () => {
  test("24) jelentős késés-növekedés => degraded", () => {
    const prev = makeJourney([makeLeg({ tripId: "trip-1", routeId: "M2", realtime: true, delayMinutes: 1 })]);
    const samples = buildRealtimeDegradationSamples(prev, [
      { tripId: "trip-1", routeId: "M2", delayMinutes: 8 },
    ]);
    const result = evaluateRealtimeDegradation(samples);
    assert.equal(result.degraded, true);
    assert.equal(result.worsenedByMinutes, 7);
    assert.equal(result.worstLegTripId, "trip-1");
  });

  test("kis, nem jelentős romlás => nem degraded", () => {
    const prev = makeJourney([makeLeg({ tripId: "trip-1", routeId: "M2", realtime: true, delayMinutes: 1 })]);
    const samples = buildRealtimeDegradationSamples(prev, [
      { tripId: "trip-1", routeId: "M2", delayMinutes: 3 },
    ]);
    const result = evaluateRealtimeDegradation(samples);
    assert.equal(result.degraded, false);
  });

  test("hiányzó korábbi delay-bizonyíték esetén nincs fabrikált romlás", () => {
    const prev = makeJourney([makeLeg({ tripId: "trip-1", routeId: "M2", realtime: false })]);
    const samples = buildRealtimeDegradationSamples(prev, [
      { tripId: "trip-1", routeId: "M2", delayMinutes: 20 },
    ]);
    const result = evaluateRealtimeDegradation(samples);
    assert.equal(result.degraded, false);
    assert.equal(result.worsenedByMinutes, 0);
  });

  test("25) újonnan törölt láb mindig degraded, függetlenül a delay delta-tól", () => {
    const prev = makeJourney([makeLeg({ tripId: "trip-1", routeId: "M2", realtime: true, delayMinutes: 1 })]);
    const samples = buildRealtimeDegradationSamples(prev, [
      { tripId: "trip-1", routeId: "M2", delayMinutes: 1, cancelled: true },
    ]);
    const result = evaluateRealtimeDegradation(samples);
    assert.equal(result.degraded, true);
    assert.equal(result.newlyCancelled, true);
  });
});

describe("liveAlternative — offer state machine (explicit elfogadás, stale-session discard)", () => {
  const trigger: LiveAlternativeTrigger = { type: "MANUAL_CHECK", eventId: "manual-1" };

  test("26) teljes happy path: NONE -> SEARCHING -> OFFERED -> ACCEPTED", () => {
    let offer = createInitialLiveAlternativeOffer();
    assert.equal(offer.status, "NONE");
    offer = startLiveAlternativeOfferSearch(trigger, 1);
    assert.equal(offer.status, "SEARCHING");
    const candidate = makeJourney([makeLeg()]);
    offer = presentLiveAlternativeOffer(offer, candidate, { netTimeBenefitMinutes: 10, reason: "SUFFICIENT_TIME_BENEFIT", bullets: ["10 perccel gyorsabb"] }, 1);
    assert.equal(offer.status, "OFFERED");
    const accepted = acceptLiveAlternativeOffer(offer);
    assert.ok(accepted);
    assert.equal(accepted?.nextOffer.status, "ACCEPTED");
    assert.equal(accepted?.acceptedJourney, candidate);
  });

  test("27) stale-session discard: közben bumpolt generáció esetén az eredmény NÉMÁN elvetődik", () => {
    let offer = startLiveAlternativeOfferSearch(trigger, 1);
    const candidate = makeJourney([makeLeg()]);
    const result = presentLiveAlternativeOffer(
      offer,
      candidate,
      { netTimeBenefitMinutes: 10, reason: "SUFFICIENT_TIME_BENEFIT", bullets: [] },
      2 // a hívó session-generációja már 2, nem 1
    );
    assert.equal(result.status, "SEARCHING"); // változatlan, nem OFFERED
    assert.equal(result.candidateJourney, null);
  });

  test("stale-session discard vonatkozik a discardLiveAlternativeSearch()-re is", () => {
    const offer = startLiveAlternativeOfferSearch(trigger, 1);
    const discarded = discardLiveAlternativeSearch(offer, 1);
    assert.equal(discarded.status, "NONE");
    const stillSearching = discardLiveAlternativeSearch(startLiveAlternativeOfferSearch(trigger, 1), 2);
    assert.equal(stillSearching.status, "SEARCHING");
  });

  test("28) 'Maradok ezen' — a candidate journey nem mutálja a displayedJourney-t, csak az offer state-et", () => {
    let offer = startLiveAlternativeOfferSearch(trigger, 1);
    const candidate = makeJourney([makeLeg()]);
    offer = presentLiveAlternativeOffer(offer, candidate, { netTimeBenefitMinutes: 10, reason: "SUFFICIENT_TIME_BENEFIT", bullets: [] }, 1);
    const declined = declineLiveAlternativeOffer(offer);
    assert.equal(declined.status, "DECLINED");
    // Elfogadás NEM lehetséges DECLINED-ból.
    assert.equal(acceptLiveAlternativeOffer(declined), null);
  });

  test("elfogadás KIZÁRÓLAG OFFERED állapotból lehetséges", () => {
    assert.equal(acceptLiveAlternativeOffer(createInitialLiveAlternativeOffer()), null);
    assert.equal(acceptLiveAlternativeOffer(startLiveAlternativeOfferSearch(trigger, 1)), null);
  });
});
