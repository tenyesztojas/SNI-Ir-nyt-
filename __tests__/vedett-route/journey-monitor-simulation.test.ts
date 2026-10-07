// VÉDETT ÚTVONAL — Journey Monitor admin szimulátor
//   node --test __tests__/vedett-route/journey-monitor-simulation.test.ts
//
// A szimulált frissítések a VALÓDI láncon futnak (ugyanaz a sorrend, mint a
// VedettUtvonalSearchForm handleRealtimeUpdates-ben): samples -> evaluate ->
// merge -> evaluateMissedConnection(merged) -> decideRealtimeMonitorTrigger.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import type { RealtimeLegUpdate } from "../../lib/vedett-route/realtimeRefresh/extractUpdates.ts";
import { buildRealtimeDegradationSamples, evaluateRealtimeDegradation } from "../../lib/vedett-route/navigation/liveAlternative.ts";
import {
  createInitialRealtimeMonitorDebounceState,
  decideRealtimeMonitorTrigger,
  evaluateMissedConnection,
  type RealtimeMonitorDebounceState,
} from "../../lib/vedett-route/navigation/journeyMonitor.ts";
import { mergeRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates.ts";
import {
  applySimulationOverlay,
  buildJourneyMonitorSimulation,
  findSimulatableConnection,
  SIMULATED_DELAY_MINUTES,
  type JourneyMonitorSimulationKind,
} from "../../lib/vedett-route/navigation/journeyMonitorSimulation.ts";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const T0 = Date.parse("2026-10-07T10:00:00Z");
const iso = (m: number) => new Date(T0 + m * 60_000).toISOString();
const transit = (id: string, d: number, a: number): JourneyLeg =>
  ({
    mode: "TRANSIT", fromName: "a", toName: "b", tripId: id, routeId: `R${id}`,
    departureTime: iso(d), arrivalTime: iso(a), scheduledDepartureTime: iso(d), scheduledArrivalTime: iso(a),
    durationMinutes: a - d, realtime: false,
  }) as JourneyLeg;
const walk = (m: number) => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: m, realtime: false }) as JourneyLeg;
const journey = (legs: JourneyLeg[]): Journey => ({ legs, departureTime: iso(0), arrivalTime: iso(60), totalDurationMinutes: 60 }) as unknown as Journey;
// 4' séta -> T1 (5..20) -> 3' séta -> T2 (26..40) -> 5' séta
const twoTransit = () => journey([walk(4), transit("T1", 5, 20), walk(3), transit("T2", 26, 40), walk(5)]);
const oneTransit = () => journey([walk(4), transit("T1", 5, 20), walk(5)]);

/** A valódi feldolgozási lánc (mint handleRealtimeUpdates). */
function pipeline(initial: Journey, activeLegIndex: number | null = 0) {
  let current = initial;
  let state: RealtimeMonitorDebounceState = createInitialRealtimeMonitorDebounceState();
  return {
    get journey() { return current; },
    poll(updates: RealtimeLegUpdate[]) {
      const degradation = evaluateRealtimeDegradation(buildRealtimeDegradationSamples(current, updates));
      const merged = mergeRealtimeUpdates(current, updates);
      const d = decideRealtimeMonitorTrigger({ degradation, missedConnection: evaluateMissedConnection(merged, activeLegIndex) }, state);
      state = d.state;
      current = merged;
      return { trigger: d.trigger, pending: state.pendingEventId };
    },
  };
}
const sim = (kind: JourneyMonitorSimulationKind, j: Journey = twoTransit(), activeLegIndex: number | null = 0, sessionGeneration = 1) =>
  buildJourneyMonitorSimulation({ journey: j, activeLegIndex, kind, sessionGeneration });

describe("szimulációs helper", () => {
  test("1) +10 perc: az első hátralévő TRANSIT trip, valódi update-alak", () => {
    const s = sim("DELAY")!;
    assert.equal(s.tripId, "T1");
    assert.deepEqual(s.updates, [{
      tripId: "T1", routeId: "RT1", realtime: true,
      scheduledDepartureTime: iso(5), departureTime: iso(15),
      scheduledArrivalTime: iso(20), arrivalTime: iso(30),
      delayMinutes: SIMULATED_DELAY_MINUTES,
    }]);
    // az aktív láb után kezd: T1-et elhagyva (activeLegIndex=2) T2-t célozza
    assert.equal(sim("DELAY", twoTransit(), 2)!.tripId, "T2");
  });

  test("2–3) első +10 poll pending, a második azonos szimulált poll SIGNIFICANT_REALTIME_DEGRADATION", () => {
    // csak T2 késik (nincs csatlakozás utána) -> tiszta delay-eset
    const j = twoTransit();
    const s = sim("DELAY", j, 2)!;
    const p = pipeline(j, 2);
    const first = p.poll(s.updates);
    assert.equal(first.trigger, null);
    assert.equal(first.pending, "degradation:T2");
    assert.deepEqual(p.poll(s.updates).trigger, { type: "SIGNIFICANT_REALTIME_DEGRADATION", eventId: "degradation:T2" });
  });

  test("4) CANCELLED: a valódi Journey Monitor adja a CANCELLED triggert", () => {
    const s = sim("CANCELLED")!;
    assert.deepEqual(s.updates, [{ tripId: "T1", routeId: "RT1", realtime: true, cancelled: true }]);
    assert.deepEqual(pipeline(twoTransit()).poll(s.updates).trigger, { type: "CANCELLED", eventId: "cancelled:T1" });
  });

  test("5) MISSED: időmódosítás, a valódi evaluateMissedConnection ad MISSED-et (nincs trigger-injektálás)", () => {
    const s = sim("MISSED_CONNECTION")!;
    assert.equal(s.tripId, "T1");
    assert.equal(s.connectionToTripId, "T2");
    // a frissítés csak idő/késés mezőket tartalmaz — nincs trigger/típus mező
    assert.deepEqual(Object.keys(s.updates[0]).sort(), [
      "arrivalTime", "delayMinutes", "departureTime", "realtime", "routeId", "scheduledArrivalTime", "scheduledDepartureTime", "tripId",
    ]);
    // eredeti tartalék: 26 - (20 + 3) = 3 perc -> késés 5 perc -> tartalék -2
    assert.equal(findSimulatableConnection(twoTransit(), 0)!.requiredDelayMinutes, 5);
    const merged = mergeRealtimeUpdates(twoTransit(), s.updates);
    const missed = evaluateMissedConnection(merged, 0);
    assert.equal(missed.status, "MISSED");
    assert.ok(missed.slackMinutes !== null && missed.slackMinutes <= -1);
    assert.deepEqual(pipeline(twoTransit()).poll(s.updates).trigger, { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" });
  });

  test("6) nincs megfelelő átszállás -> MISSED nem építhető (a panel gombja disabled)", () => {
    assert.equal(findSimulatableConnection(oneTransit(), 0), null);
    assert.equal(sim("MISSED_CONNECTION", oneTransit()), null);
    // az utolsó TRANSIT-on már túl: nincs pár
    assert.equal(findSimulatableConnection(twoTransit(), 2), null);
  });
});

describe("overlay", () => {
  const realT1 = (cancelled?: boolean): RealtimeLegUpdate => ({
    tripId: "T1", routeId: "RT1", realtime: true, departureTime: iso(5), scheduledDepartureTime: iso(5),
    arrivalTime: iso(20), scheduledArrivalTime: iso(20), delayMinutes: 0, ...(cancelled === undefined ? {} : { cancelled }),
  });
  const realT2: RealtimeLegUpdate = { tripId: "T2", routeId: "RT2", realtime: true, departureTime: iso(26), scheduledDepartureTime: iso(26), arrivalTime: iso(40), scheduledArrivalTime: iso(40), delayMinutes: 0 };

  test("7) a szimulált CANCELLED megmarad a valódi poll mellett", () => {
    const s = sim("CANCELLED")!;
    const p = pipeline(twoTransit());
    p.poll(s.updates);
    const overlaid = applySimulationOverlay([realT1(), realT2], s, 1);
    assert.deepEqual(overlaid, [realT2, ...s.updates]);
    p.poll(overlaid);
    assert.equal(p.journey.legs[1].cancelled, true, "a valódi poll nem állította vissza");
    // overlay nélkül a valódi poll visszaállítaná
    assert.notEqual(mergeRealtimeUpdates(p.journey, [realT1()]).legs[1].cancelled, true);
  });

  test("8) a +10 késés megmarad a valódi poll mellett (és a valódi poll is megerősít)", () => {
    const j = twoTransit();
    const s = sim("DELAY", j, 2)!;
    const p = pipeline(j, 2);
    assert.equal(p.poll(s.updates).pending, "degradation:T2");
    const second = p.poll(applySimulationOverlay([realT2], s, 1));
    assert.equal(second.trigger?.type, "SIGNIFICANT_REALTIME_DEGRADATION");
    assert.equal(p.journey.legs[3].arrivalTime, iso(50));
    assert.equal(p.journey.legs[3].delayMinutes, 10);
  });

  test("9) törlés (null) / másik session után az overlay nem módosít", () => {
    const s = sim("CANCELLED")!;
    const real = [realT1(), realT2];
    assert.equal(applySimulationOverlay(real, null, 1), real);
    assert.equal(applySimulationOverlay(real, s, 2), real, "session-váltás után inaktív");
  });

  test("10) letiltott szimulációnál a realtime feldolgozás változatlan (ugyanaz a tömb, ugyanaz a lánc)", () => {
    const real = [realT1(), realT2];
    assert.equal(applySimulationOverlay(real, null, 7), real);
    const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
    assert.match(
      form,
      /onUpdates: \(updates\) => \{\n\s*handleRealtimeUpdates\(\n\s*journeyMonitorSimulationEnabled\n\s*\? applySimulationOverlay\(updates, journeyMonitorSimulationRef\.current, rerouteSessionRef\.current\)\n\s*: updates\n\s*\);/
    );
    assert.match(form, /const handleRealtimeUpdates = \(updates: RealtimeLegUpdate\[\]\) => \{/);
    assert.match(form, /journeyMonitorSimulationEnabled = false,/);
    assert.match(form, /\{journeyMonitorSimulationEnabled && navigationMode && \(\n\s*<JourneyMonitorSimulationPanel/);
  });
});

describe("biztonsági határ", () => {
  test("11) a publikus /vedett-utvonal nem kapcsolja be a szimulátort", () => {
    assert.doesNotMatch(read("app/vedett-utvonal/page.tsx"), /journeyMonitorSimulationEnabled/);
    assert.doesNotMatch(read("components/vedett-utvonal/VedettUtvonalWorkspace.tsx"), /journeyMonitorSimulationEnabled/);
  });
  test("12) az admin route (szerveroldali admin-layout mögött) bekapcsolja", () => {
    assert.match(read("app/admin/vedett-utvonal/page.tsx"), /<VedettUtvonalSearchForm disabled=\{!enabled\} journeyMonitorSimulationEnabled \/>/);
    const layout = read("app/admin/layout.tsx");
    assert.match(layout, /getCurrentUserAndProfile\(\)/);
    assert.match(layout, /if \(!user \|\| profile\?\.role !== "admin"\) \{\s*redirect\("\/"\);/);
  });
  test("a szimulátor nem perzisztál, nem küld analyticset, nem hív hálózatot", () => {
    const mod = read("lib/vedett-route/navigation/journeyMonitorSimulation.ts");
    const panel = read("components/vedett-utvonal/JourneyMonitorSimulationPanel.tsx");
    // kommentek nélkül (a fejléc-kommentek szándékosan említik a tiltott tárolókat)
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const src of [code(mod), code(panel)]) {
      assert.doesNotMatch(src, /localStorage|sessionStorage|document\.cookie|fetch\(|trackVedettRouteEvent|supabase/i);
    }
  });
});
