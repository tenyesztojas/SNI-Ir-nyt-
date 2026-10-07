// VÉDETT ÚTVONAL — Journey Monitor: tartós realtime késés kétpollos megerősítése
//   node --test __tests__/vedett-route/journey-monitor-persistent-delay.test.ts
//
// A pollok a VALÓDI láncon futnak, pontosan úgy, mint a VedettUtvonalSearchForm
// onUpdates callbackjében: samples(displayed, updates) -> evaluate -> merge ->
// evaluateMissedConnection(merged) -> decideRealtimeMonitorTrigger.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import type { RealtimeLegUpdate } from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";
import {
  buildRealtimeDegradationSamples,
  createInitialLiveAlternativeGuardState,
  evaluateRealtimeDegradation,
  markLiveAlternativeSearchFinished,
  markLiveAlternativeSearchStarted,
  shouldStartLiveAlternativeSearch,
  type LiveAlternativeTrigger,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";
import {
  createInitialRealtimeMonitorDebounceState,
  decideRealtimeMonitorTrigger,
  evaluateMissedConnection,
  type RealtimeMonitorDebounceState,
} from "../../lib/vedett-route/navigation/journeyMonitor.ts";
import { mergeRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates.ts";

const T0 = Date.parse("2026-10-07T10:00:00Z");
const iso = (m: number) => new Date(T0 + m * 60_000).toISOString();
const transit = (id: string, d: number, a: number): JourneyLeg =>
  ({
    mode: "TRANSIT", fromName: "a", toName: "b", tripId: id, routeId: `R${id}`,
    departureTime: iso(d), arrivalTime: iso(a), scheduledDepartureTime: iso(d), scheduledArrivalTime: iso(a),
    durationMinutes: a - d, realtime: false,
  }) as JourneyLeg;
const walk = (m: number) => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: m, realtime: false }) as JourneyLeg;
// T1 (5..20) -> 3' séta -> T2 (26..40)
const base = (): Journey =>
  ({ legs: [transit("T1", 5, 20), walk(3), transit("T2", 26, 40)], departureTime: iso(0), arrivalTime: iso(40), totalDurationMinutes: 40 }) as unknown as Journey;

/** T2 realtime késése a menetrendhez képest. */
const t2 = (delay: number, opts: { withDelayMinutes?: boolean; realtime?: boolean } = {}): RealtimeLegUpdate => ({
  tripId: "T2", routeId: "RT2", realtime: opts.realtime ?? true,
  departureTime: iso(26 + delay), scheduledDepartureTime: iso(26),
  arrivalTime: iso(40 + delay), scheduledArrivalTime: iso(40),
  ...(opts.withDelayMinutes === false ? {} : { delayMinutes: delay }),
});

function monitor() {
  let journey = base();
  let state: RealtimeMonitorDebounceState = createInitialRealtimeMonitorDebounceState();
  return {
    poll(updates: RealtimeLegUpdate[], activeLegIndex: number | null = 0) {
      const degradation = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(journey, updates));
      const merged = mergeRealtimeUpdates(journey, updates);
      const d = decideRealtimeMonitorTrigger({ degradation, missedConnection: evaluateMissedConnection(merged, activeLegIndex) }, state);
      state = d.state;
      journey = merged;
      return { trigger: d.trigger, pending: state.pendingEventId };
    },
  };
}

describe("tartós késés megerősítése", () => {
  test("A) +10 (delayMinutes) majd ugyanaz +10 -> pending, majd SIGNIFICANT_REALTIME_DEGRADATION", () => {
    const m = monitor();
    const p1 = m.poll([t2(10)]);
    assert.equal(p1.trigger, null);
    assert.equal(p1.pending, "degradation:T2");
    const p2 = m.poll([t2(10)]);
    assert.deepEqual(p2.trigger, { type: "SIGNIFICANT_REALTIME_DEGRADATION", eventId: "degradation:T2" });
  });

  test("B) harmadik azonos poll: ugyanaz az eventId, a meglévő guard cooldownja blokkolja (nincs új keresés-sorozat)", () => {
    const m = monitor();
    let guard = createInitialLiveAlternativeGuardState();
    const searches: string[] = [];
    const guardInput = (trigger: LiveAlternativeTrigger, nowMs: number) => ({
      navigationActive: true, offRouteConfirmed: false, gpsReliable: true, foregroundRecoveryActive: false,
      restoreRecoveryActive: false, hasDestination: true, trigger, nowMs,
    });
    for (let i = 0; i < 4; i++) {
      const nowMs = T0 + i * 30_000;
      const { trigger } = m.poll([t2(10)]);
      if (!trigger) continue;
      assert.equal(trigger.eventId, "degradation:T2");
      if (shouldStartLiveAlternativeSearch(guard, guardInput(trigger, nowMs)).shouldSearch) {
        guard = markLiveAlternativeSearchFinished(markLiveAlternativeSearchStarted(guard, trigger, nowMs));
        searches.push(trigger.eventId);
      } else {
        assert.equal(shouldStartLiveAlternativeSearch(guard, guardInput(trigger, nowMs)).reason, "COOLDOWN_ACTIVE");
      }
    }
    assert.deepEqual(searches, ["degradation:T2"]);
  });

  test("C) +10 majd +1 -> nincs megerősítés, a pending törlődik", () => {
    const m = monitor();
    m.poll([t2(10)]);
    const p2 = m.poll([t2(1)]);
    assert.equal(p2.trigger, null);
    assert.equal(p2.pending, null);
  });

  test("D) +10 majd realtime=false frissítés -> nincs megerősítés", () => {
    const m = monitor();
    m.poll([t2(10)]);
    const p2 = m.poll([t2(10, { realtime: false, withDelayMinutes: false })]);
    assert.equal(p2.trigger, null);
    assert.equal(p2.pending, null);
  });

  test("E) delayMinutes nélkül (időpár) két pollon továbbra is működik", () => {
    const m = monitor();
    assert.equal(m.poll([t2(10, { withDelayMinutes: false })]).pending, "degradation:T2");
    assert.equal(m.poll([t2(10, { withDelayMinutes: false })]).trigger?.type, "SIGNIFICANT_REALTIME_DEGRADATION");
  });

  test("F) első realtime +10 frissítés felismerhető (degraded, menetrendhez mérve)", () => {
    const d = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(base(), [t2(10)]));
    assert.equal(d.degraded, true);
    assert.equal(d.worstLegTripId, "T2");
    assert.deepEqual(d.significantDelayTripIds, ["T2"]);
  });

  test("G) CANCELLED továbbra is azonnali (függő késés mellett is)", () => {
    const m = monitor();
    m.poll([t2(10)]);
    const p = m.poll([{ tripId: "T2", routeId: "RT2", realtime: true, cancelled: true }]);
    assert.deepEqual(p.trigger, { type: "CANCELLED", eventId: "cancelled:T2" });
    assert.equal(p.pending, null);
  });

  test("H) egyértelmű MISSED_CONNECTION továbbra is azonnali", () => {
    const m = monitor();
    const p = m.poll([{ tripId: "T1", routeId: "RT1", realtime: true, departureTime: iso(5), scheduledDepartureTime: iso(5), arrivalTime: iso(30), scheduledArrivalTime: iso(20), delayMinutes: 10 }]);
    assert.deepEqual(p.trigger, { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" });
  });

  test("I) AT_RISK csatlakozás: két poll kell, nem regresszál", () => {
    const m = monitor();
    // T1 +2 perc: érkezés 22, +3' séta = 25, T2 indul 26 -> slack 1 (< 2 margin, > -1) -> AT_RISK
    const late = { tripId: "T1", routeId: "RT1", realtime: true, departureTime: iso(5), scheduledDepartureTime: iso(5), arrivalTime: iso(22), scheduledArrivalTime: iso(20), delayMinutes: 2 };
    const p1 = m.poll([late]);
    assert.equal(p1.trigger, null);
    assert.equal(p1.pending, "missed:T1>T2");
    const p2 = m.poll([late]);
    assert.deepEqual(p2.trigger, { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" });
  });

  test("J) < 5 perc késés nem triggerel (két pollon sem)", () => {
    const m = monitor();
    assert.equal(m.poll([t2(4)]).pending, null);
    const p2 = m.poll([t2(4)]);
    assert.equal(p2.trigger, null);
    assert.equal(p2.pending, null);
  });

  test("más trip jelentős késése nem erősít meg egy másik trip függő eseményét", () => {
    const state = { pendingEventId: "degradation:T1" };
    const d = decideRealtimeMonitorTrigger(
      { degradation: { degraded: false, worstLegTripId: null, worsenedByMinutes: 0, newlyCancelled: false, cancelledTripId: null, significantDelayTripIds: ["T2"] }, missedConnection: null },
      state
    );
    assert.equal(d.trigger, null);
    assert.equal(d.state.pendingEventId, null);
  });
});
