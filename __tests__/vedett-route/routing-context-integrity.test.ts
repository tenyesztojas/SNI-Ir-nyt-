// VÉDETT ÚTVONAL — ROUTING CONTEXT INTEGRITY (off-route reroute + rest-stop resume)
//   node --test __tests__/vedett-route/routing-context-integrity.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg, PersonalizationWeights } from "../../lib/vedett-route/types.ts";
import {
  buildLiveRerouteSearchContext,
  buildRerouteRoutingContext,
  resolveEffectiveLiveRerouteContext,
  type LiveRerouteSearchContext,
} from "../../lib/vedett-route/navigation/liveRerouteContext.ts";
import { buildConstrainedRerouteSearchRequest } from "../../lib/vedett-route/restStopFlow/rerouteRequest.ts";
import { restStopResumeSchema } from "../../lib/vedett-route/restStopFlow/schemas.ts";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const form = read("components/vedett-utvonal/VedettUtvonalSearchForm.tsx");
const panel = read("components/vedett-utvonal/RestStopFlowPanel.tsx");
const resumeRoute = read("app/api/vedett-route/rest-stops/resume/route.ts");

const NOW = Date.parse("2026-10-07T10:00:00Z");
const DEFAULT_W: PersonalizationWeights = { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 };
const W: PersonalizationWeights = { transfers: 2, modeSwitches: 0, underground: 0.5, walking: 2, duration: 1, waiting: 1.5, crowding: 2, noise: 1 };
const walk = (min: number): JourneyLeg => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: min, realtime: false }) as JourneyLeg;
const journey = (extra: Partial<Journey> = {}, legs: JourneyLeg[] = [walk(10)]): Journey =>
  ({ legs, totalDurationMinutes: 10, departureTime: "2026-10-07T10:00:00Z", arrivalTime: "2026-10-07T10:10:00Z", ...extra }) as unknown as Journey;
const ctx = (over: Partial<Parameters<typeof buildLiveRerouteSearchContext>[0]> = {}) =>
  buildLiveRerouteSearchContext({ weights: W, stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "ANY", timeMode: "DEPART_AT", ...over });
const effective = (o: { restored?: LiveRerouteSearchContext | null; snapshot?: LiveRerouteSearchContext | null; journey?: Journey } = {}) =>
  resolveEffectiveLiveRerouteContext({ restored: o.restored ?? null, snapshot: o.snapshot ?? null, journey: o.journey ?? journey(), fallbackWeights: DEFAULT_W });
const FROM = { lat: 47.49, lon: 19.04 };
const DEST = { name: "Cél", lat: 47.51, lon: 19.06 };

/** A kliens által ténylegesen küldött /resume body -> szerveroldali validáció -> orchestrator request. */
function wire(routingContext: ReturnType<typeof buildRerouteRoutingContext>, departAt?: string) {
  const parsed = restStopResumeSchema.parse({ currentPosition: FROM, originalDestination: DEST, departAt, routingContext });
  assert.ok(parsed.routingContext);
  return buildConstrainedRerouteSearchRequest(parsed.currentPosition, parsed.originalDestination, parsed.routingContext!, parsed.departAt, NOW);
}
const offRouteBlock = (() => {
  const start = form.indexOf("const attemptRoutingContext = buildRerouteRoutingContext(effectiveLiveRerouteContext);");
  assert.ok(start > 0);
  return form.slice(start, form.indexOf("if (rerouteSessionRef.current !== sessionId) return;", start));
})();

describe("A–C: stepFree", () => {
  test("A) stepFree=true -> az off-route reroute payload true (wiring + szerveroldali request)", () => {
    assert.match(offRouteBlock, /fetch\("\/api\/vedett-route\/rest-stops\/resume"/);
    assert.match(offRouteBlock, /routingContext: attemptRoutingContext,/);
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx({ stepFreeRequired: true }) }));
    assert.equal(rc.stepFreeRequired, true);
    assert.equal(wire(rc).request.stepFreeRequired, true);
  });
  test("B) stepFree=true -> rest-stop resume true (panel továbbadja, a végpont az orchestratoron tervez)", () => {
    assert.match(form, /routingContext=\{buildRerouteRoutingContext\(effectiveLiveRerouteContext\)\}/);
    assert.match(panel, /\.\.\.\(routingContextRef\.current \? \{ routingContext: routingContextRef\.current \} : \{\}\)/);
    assert.match(resumeRoute, /if \(parsed\.data\.routingContext\) \{/);
    assert.match(resumeRoute, /await searchVedettRoutes\(searchRequest, weights\)/);
    const rc = buildRerouteRoutingContext(effective({ restored: ctx({ stepFreeRequired: true }), snapshot: ctx() }));
    assert.equal(wire(rc).request.stepFreeRequired, true);
  });
  test("C) stepFree=false más bizonyíték nélkül false marad", () => {
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx() }));
    assert.equal(rc.stepFreeRequired, false);
    assert.equal(wire(rc).request.stepFreeRequired, false);
  });
});

describe("D–G: Bubi / propulsion / weights", () => {
  test("D) Bubi enabled -> off-route reroute megőrzi", () => {
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx({ molBubiEnabled: true }) }));
    assert.equal(wire(rc).request.molBubiEnabled, true);
  });
  test("E) Bubi enabled -> rest resume megőrzi (restore-olt kontextusból is)", () => {
    const rc = buildRerouteRoutingContext(effective({ restored: ctx({ molBubiEnabled: true }) }));
    assert.equal(wire(rc).request.molBubiEnabled, true);
  });
  test("F) bikePropulsion megmarad, ha Bubi aktív; Bubi nélkül nem szivárog", () => {
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx({ molBubiEnabled: true, bikePropulsion: "ELECTRIC_ASSIST" }) }));
    assert.equal(rc.bikePropulsion, "ELECTRIC_ASSIST");
    assert.equal(wire(rc).request.bikePropulsion, "ELECTRIC_ASSIST");
    const off = buildConstrainedRerouteSearchRequest(FROM, DEST, { stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "HUMAN" }, undefined, NOW);
    assert.equal(off.request.bikePropulsion, "ANY");
  });
  test("G) sensory weights mindkét ágban megmaradnak (korábban a /resume egyáltalán nem kapta meg)", () => {
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx() }));
    assert.deepEqual(wire(rc).weights, W);
  });
});

describe("H–I: visszafelé kompatibilitás", () => {
  test("H) régi session kontextus nélkül -> érvényes, validálható payload a fallback súlyokkal", () => {
    const rc = buildRerouteRoutingContext(effective());
    assert.deepEqual(rc, { stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "ANY", weights: DEFAULT_W });
    assert.equal(wire(rc).request.stepFreeRequired, false);
    // routingContext NÉLKÜLI (régi kliens) kérés továbbra is érvényes -> régi út
    const legacy = restStopResumeSchema.parse({ currentPosition: FROM, originalDestination: DEST });
    assert.equal(legacy.routingContext, undefined);
    assert.match(resumeRoute, /const planParams = buildRerouteToOriginalDestinationRequest\(/);
  });
  test("I) régi session + journey accessibilityStatus -> stepFree nem vész el", () => {
    const j = journey({ accessibilityStatus: "KNOWN_ACCESSIBLE" } as unknown as Partial<Journey>);
    const rc = buildRerouteRoutingContext(effective({ journey: j }));
    assert.equal(rc.stepFreeRequired, true);
    assert.equal(wire(rc).request.stepFreeRequired, true);
  });
  test("szerveroldali validáció: ismeretlen mező / érvénytelen érték elutasítva", () => {
    const base = { currentPosition: FROM, originalDestination: DEST };
    const ok = { stepFreeRequired: true, molBubiEnabled: false };
    assert.equal(restStopResumeSchema.safeParse({ ...base, routingContext: { ...ok, timeMode: "ARRIVE_BY" } }).success, false);
    assert.equal(restStopResumeSchema.safeParse({ ...base, routingContext: { ...ok, weights: { walking: 5 } } }).success, false);
    assert.equal(restStopResumeSchema.safeParse({ ...base, routingContext: { ...ok, bikePropulsion: "TURBO" } }).success, false);
    assert.equal(restStopResumeSchema.safeParse({ ...base, routingContext: { stepFreeRequired: "true", molBubiEnabled: false } }).success, false);
    assert.equal(restStopResumeSchema.safeParse({ ...base, routingContext: ok }).success, true);
  });
});

describe("J–K: timeMode", () => {
  test("J) off-route reroute: DEPART_AT a küldött 'most'-tól; múltbeli idő -> most", () => {
    assert.match(offRouteBlock, /departAt: new Date\(\)\.toISOString\(\),/);
    const rc = buildRerouteRoutingContext(effective({ snapshot: ctx({ timeMode: "ARRIVE_BY" }) }));
    const r = wire(rc, "2026-10-07T10:00:30Z").request;
    assert.equal(r.timeMode, "DEPART_AT");
    assert.equal(r.departAt, "2026-10-07T10:00:30.000Z");
    assert.equal(wire(rc, "2026-10-07T08:00:00Z").request.departAt, new Date(NOW).toISOString());
  });
  test("K) rest resume (departAt nélkül): DEPART_AT, departAt = most — sosem a régi ARRIVE_BY határidő", () => {
    const rc = buildRerouteRoutingContext(effective({ restored: ctx({ timeMode: "ARRIVE_BY" }) }));
    assert.equal("timeMode" in rc, false);
    const r = wire(rc).request;
    assert.equal(r.timeMode, "DEPART_AT");
    assert.equal(r.departAt, new Date(NOW).toISOString());
  });
});
