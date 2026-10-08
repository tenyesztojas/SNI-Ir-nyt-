// VÉDETT ÚTVONAL — admin Live Alternative diagnosztika
//   node --test __tests__/vedett-route/live-alternative-diagnostics.test.ts
//
// A guard/origin okok a VALÓDI függvényekből jönnek (shouldStartLiveAlternativeSearch,
// resolveLiveRerouteOrigin); a bekötést forrásszintű tesztek igazolják.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import {
  createInitialLiveAlternativeDiagnosticsState,
  reportLiveAlternativeDiagnostic,
  startLiveAlternativeDiagnosticRun,
  type LiveAlternativeDiagnosticsState,
} from "../../lib/vedett-route/navigation/liveAlternativeDiagnostics.ts";
import {
  createInitialLiveAlternativeGuardState,
  markLiveAlternativeSearchFinished,
  markLiveAlternativeSearchStarted,
  shouldStartLiveAlternativeSearch,
  type LiveAlternativeTrigger,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";
import { resolveLiveRerouteOrigin } from "../../lib/vedett-route/navigation/liveRerouteContext.ts";
import { evaluateEtaLiveAlternative } from "../../lib/vedett-route/navigation/journeyMonitor.ts";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const maybeStart = (() => {
  const start = form.indexOf("const maybeStartLiveAlternativeSearch = async");
  return form.slice(start, form.indexOf("const handleLiveAlternativeDecline", start));
})();

const NOW = Date.parse("2026-10-08T10:00:00Z");
const TRIGGER: LiveAlternativeTrigger = { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" };
const guardInput = (over: Record<string, unknown> = {}) => ({
  navigationActive: true, offRouteConfirmed: false, gpsReliable: true, foregroundRecoveryActive: false,
  restoreRecoveryActive: false, hasDestination: true, trigger: TRIGGER, nowMs: NOW, ...over,
});
/** Egy futás a diagnosztikai reducerrel, ahogy a maybeStartLiveAlternativeSearch jelenti. */
function run(events: Parameters<typeof reportLiveAlternativeDiagnostic>[2][], state: LiveAlternativeDiagnosticsState = createInitialLiveAlternativeDiagnosticsState(), runId = 1) {
  let s = startLiveAlternativeDiagnosticRun(state, { runId, triggerType: TRIGGER.type, eventId: TRIGGER.eventId });
  for (const e of events) s = reportLiveAlternativeDiagnostic(s, runId, e);
  return s;
}

describe("guard / origin okok láthatók", () => {
  test("1) GPS_UNRELIABLE", () => {
    const d = shouldStartLiveAlternativeSearch(createInitialLiveAlternativeGuardState(), guardInput({ gpsReliable: false }));
    const s = run([{ stage: "GUARD_BLOCKED", reason: d.reason! }]);
    assert.equal(s.latest?.stage, "GUARD_BLOCKED");
    assert.equal(s.latest?.reason, "GPS_UNRELIABLE");
    assert.equal(s.latest?.eventId, "missed:T1>T2");
  });
  test("2) COOLDOWN_ACTIVE", () => {
    const guard = markLiveAlternativeSearchFinished(markLiveAlternativeSearchStarted(createInitialLiveAlternativeGuardState(), { type: "CANCELLED", eventId: "cancelled:T1" }, NOW - 60_000));
    const d = shouldStartLiveAlternativeSearch(guard, guardInput());
    assert.equal(run([{ stage: "GUARD_BLOCKED", reason: d.reason! }]).latest?.reason, "COOLDOWN_ACTIVE");
  });
  test("3) OFF_ROUTE_NOT_OUR_JOB", () => {
    const d = shouldStartLiveAlternativeSearch(createInitialLiveAlternativeGuardState(), guardInput({ offRouteConfirmed: true }));
    assert.equal(run([{ stage: "GUARD_BLOCKED", reason: d.reason! }]).latest?.reason, "OFF_ROUTE_NOT_OUR_JOB");
  });
  test("4) origin hiánya külön (ORIGIN_SKIPPED + pontos ok)", () => {
    const leg = { mode: "TRANSIT", fromName: "a", toName: "b", tripId: "T1", durationMinutes: 10, realtime: false } as JourneyLeg;
    const j = { legs: [leg], departureTime: "", arrivalTime: "", totalDurationMinutes: 10 } as unknown as Journey;
    const o = resolveLiveRerouteOrigin({ journey: j, activeLegIndex: 0, boundaryPhase: "BOARDED", currentPosition: { latitude: 47.5, longitude: 19 }, nowMs: NOW });
    assert.equal(o.kind, "SKIP");
    const s = run([{ stage: "ORIGIN_SKIPPED", reason: o.kind === "SKIP" ? o.reason : "" }]);
    assert.equal(s.latest?.stage, "ORIGIN_SKIPPED");
    assert.equal(s.latest?.reason, "NO_ALIGHTING_COORDINATE");
    assert.equal(s.lastSearch, null, "nem indult keresés");
  });
});

describe("keresés állapotai", () => {
  test("5) SEARCH_STARTED (csak origin-típus, koordináta nincs)", () => {
    const s = run([{ stage: "SEARCH_STARTED", originKind: "GPS" }]);
    assert.equal(s.latest?.stage, "SEARCH_STARTED");
    assert.equal(s.latest?.originKind, "GPS");
    assert.equal(s.lastSearch?.stage, "SEARCH_STARTED");
    assert.ok(!JSON.stringify(s).match(/latitude|longitude|lat"|lon"/));
  });
  test("6) API-hiba külön (HTTP status + kategória)", () => {
    const s = run([{ stage: "SEARCH_STARTED", originKind: "GPS" }, { stage: "SEARCH_FAILED", reason: "routing_engine_unavailable", httpStatus: 503 }]);
    assert.equal(s.latest?.stage, "SEARCH_FAILED");
    assert.equal(s.latest?.httpStatus, 503);
    assert.equal(s.latest?.reason, "routing_engine_unavailable");
    assert.equal(s.lastSearch?.stage, "SEARCH_FAILED");
  });
  test("7) üres jelöltlista", () => {
    const s = run([{ stage: "SEARCH_STARTED", originKind: "GPS" }, { stage: "CANDIDATE_REJECTED", reason: "EMPTY_RESULTS", candidateCount: 0 }]);
    assert.equal(s.latest?.reason, "EMPTY_RESULTS");
    assert.equal(s.latest?.candidateCount, 0);
  });
  test("8) nem megfelelő ETA külön (a valódi evaluateEtaLiveAlternative rejectedReason-je)", () => {
    const empty = { legs: [], departureTime: "", arrivalTime: "", totalDurationMinutes: 0 } as unknown as Journey;
    const eta = evaluateEtaLiveAlternative({ current: empty, activeLegIndex: 0, candidate: empty, nowMs: NOW, triggerType: "MANUAL_CHECK" });
    assert.equal(eta.offer, false);
    const s = run([
      { stage: "SEARCH_STARTED", originKind: "GPS" },
      { stage: "SEARCH_RESULTS", candidateCount: 4 },
      { stage: "CANDIDATE_REJECTED", reason: eta.rejectedReason ?? "ETA_NOT_OFFERED" },
    ]);
    assert.equal(s.latest?.reason, "CANDIDATE_ETA_UNAVAILABLE");
    assert.equal(s.latest?.candidateCount, 4, "a jelöltszám megmarad");
  });
  test("9) OFFERED", () => {
    const s = run([{ stage: "SEARCH_STARTED", originKind: "ALIGHTING" }, { stage: "SEARCH_RESULTS", candidateCount: 3 }, { stage: "OFFERED" }]);
    assert.equal(s.latest?.stage, "OFFERED");
    assert.equal(s.lastSearch?.stage, "OFFERED");
  });
  test("egymást követő triggerek nem keverednek: a régi futás késői eseménye nem írja felül az újat", () => {
    let s = run([{ stage: "SEARCH_STARTED", originKind: "GPS" }], createInitialLiveAlternativeDiagnosticsState(), 1);
    s = startLiveAlternativeDiagnosticRun(s, { runId: 2, triggerType: "CANCELLED", eventId: "cancelled:T1" });
    s = reportLiveAlternativeDiagnostic(s, 2, { stage: "GUARD_BLOCKED", reason: "SEARCH_IN_FLIGHT" });
    s = reportLiveAlternativeDiagnostic(s, 1, { stage: "OFFERED" });
    assert.equal(s.latest?.runId, 2);
    assert.equal(s.latest?.reason, "SEARCH_IN_FLIGHT");
    assert.equal(s.lastSearch?.runId, 1);
    assert.equal(s.lastSearch?.stage, "OFFERED");
  });
});

describe("bekötés és határok", () => {
  test("minden korai kilépés előtt van jelentés (forrásszint)", () => {
    for (const re of [
      /reportDiagnostic\(\{ stage: "GUARD_BLOCKED", reason: decision\.reason \?\? "UNKNOWN" \}\)/,
      /reportDiagnostic\(\{ stage: "GUARD_BLOCKED", reason: "NO_GPS_POSITION" \}\)/,
      /reportDiagnostic\(\{ stage: "ORIGIN_SKIPPED", reason: liveOrigin\.reason \}\)/,
      /reportDiagnostic\(\{ stage: "SEARCH_STARTED", originKind: liveOrigin\.kind \}\)/,
      /reportDiagnostic\(\{ stage: "SEARCH_FAILED", reason: "SESSION_CHANGED"/,
      /reportDiagnostic\(\{ stage: "CANDIDATE_REJECTED", reason: "EMPTY_RESULTS", candidateCount: 0 \}\)/,
      /reportDiagnostic\(\{ stage: "SEARCH_RESULTS", candidateCount: data\.journeys\.length \}\)/,
      /reportDiagnostic\(\{ stage: "CANDIDATE_REJECTED", reason: "NO_DISTINCT_CANDIDATE" \}\)/,
      /reportDiagnostic\(\{ stage: "CANDIDATE_REJECTED", reason: etaDecision\.rejectedReason \?\? "ETA_NOT_OFFERED" \}\)/,
      /reportDiagnostic\(\{ stage: "SEARCH_FAILED", reason: "NETWORK_OR_PARSE_ERROR"/,
    ]) {
      assert.match(maybeStart, re);
    }
    assert.equal((maybeStart.match(/reportDiagnostic\(\{ stage: "OFFERED" \}\)/g) ?? []).length, 2, "közösségi és ETA ág");
  });
  test("10) normál navigáció változatlan: a jelentés csak admin propnál aktív, a döntési sorok érintetlenek", () => {
    assert.match(maybeStart, /const diagnosticRunId = journeyMonitorSimulationEnabled \? \+\+liveAlternativeDiagnosticRunRef\.current : null;/);
    assert.match(maybeStart, /if \(diagnosticRunId === null\) return;/);
    assert.match(maybeStart, /if \(!decision\.shouldSearch \|\| !currentPosition \|\| !originalDestination\) return;/);
    assert.match(maybeStart, /if \(!liveSearchPayload \|\| liveOrigin\.kind === "SKIP"\) return;/);
    // SEARCHING LEZÁRÁS (2026-10-08): ezek az ágak visszatérés előtt a saját keresést is lezárják.
    assert.match(maybeStart, /if \(!data\.ok \|\| !Array\.isArray\(data\.journeys\) \|\| data\.journeys\.length === 0\) \{/);
    assert.match(maybeStart, /if \(!best\) \{/);
    assert.match(maybeStart, /if \(!etaDecision\.offer\) \{/);
    assert.doesNotMatch(maybeStart, /setTimeout|setInterval|retry/i, "nincs újrapróbálkozás");
  });
  test("11) publikus útvonalon nincs diagnosztikai panel", () => {
    assert.doesNotMatch(read("app/vedett-utvonal/page.tsx"), /journeyMonitorSimulationEnabled/);
    assert.doesNotMatch(read("components/vedett-utvonal/VedettUtvonalWorkspace.tsx"), /journeyMonitorSimulationEnabled/);
    assert.match(form, /\{journeyMonitorSimulationEnabled && navigationMode && \(\n\s*<JourneyMonitorSimulationPanel/);
    assert.match(form, /liveAlternativeDiagnostics=\{liveAlternativeDiagnostics\}/);
  });
  test("12) nincs analytics, perzisztencia vagy hálózat a diagnosztikában", () => {
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const src of [read("lib/vedett-route/navigation/liveAlternativeDiagnostics.ts"), read("components/vedett-utvonal/JourneyMonitorSimulationPanel.tsx")]) {
      assert.doesNotMatch(code(src), /localStorage|sessionStorage|document\.cookie|fetch\(|trackVedettRouteEvent|supabase|latitude|longitude/i);
    }
    assert.doesNotMatch(maybeStart, /trackVedettRouteEvent/);
  });
});
