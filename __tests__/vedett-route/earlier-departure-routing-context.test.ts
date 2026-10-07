// VÉDETT ÚTVONAL — earlier departure: routing-kontextus megőrzése
//   node --test __tests__/vedett-route/earlier-departure-routing-context.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, PersonalizationWeights } from "../../lib/vedett-route/types.ts";
import {
  buildLiveRerouteSearchContext,
  buildRerouteRoutingContext,
  resolveEffectiveLiveRerouteContext,
  type LiveRerouteSearchContext,
} from "../../lib/vedett-route/navigation/liveRerouteContext.ts";
import { validateEarlierDepartureCandidate } from "../../lib/vedett-route/navigation/earlierDeparture.ts";
import { buildConstrainedRerouteSearchRequest } from "../../lib/vedett-route/restStopFlow/rerouteRequest.ts";
import { restStopResumeSchema } from "../../lib/vedett-route/restStopFlow/schemas.ts";

const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const block = (() => {
  const start = form.indexOf("const plannedDepartureIso = earlierDeparturePlannedDepartureIso;");
  assert.ok(start > 0);
  return form.slice(start, form.indexOf("resolveEarlierDepartureCandidate(", start));
})();

const NOW = Date.parse("2026-10-07T10:00:00Z");
const iso = (min: number) => new Date(NOW + min * 60_000).toISOString();
const DEFAULT_W: PersonalizationWeights = { transfers: 1, modeSwitches: 1, underground: 1, walking: 1, duration: 1, waiting: 1 };
const W: PersonalizationWeights = { transfers: 2, modeSwitches: 0, underground: 0.5, walking: 2, duration: 1, waiting: 1.5, crowding: 2, noise: 1 };
const journey = (extra: Partial<Journey> = {}): Journey =>
  ({ legs: [{ mode: "WALK", fromName: "a", toName: "b", durationMinutes: 5, realtime: false }], totalDurationMinutes: 5, departureTime: iso(0), arrivalTime: iso(60), ...extra }) as unknown as Journey;
const ctx = (over: Partial<Parameters<typeof buildLiveRerouteSearchContext>[0]> = {}) =>
  buildLiveRerouteSearchContext({ weights: W, stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "ANY", timeMode: "DEPART_AT", ...over });
const rc = (o: { snapshot?: LiveRerouteSearchContext | null; restored?: LiveRerouteSearchContext | null; journey?: Journey } = {}) =>
  buildRerouteRoutingContext(
    resolveEffectiveLiveRerouteContext({ restored: o.restored ?? null, snapshot: o.snapshot ?? null, journey: o.journey ?? journey(), fallbackWeights: DEFAULT_W })
  );
const wire = (routingContext: ReturnType<typeof rc>) => {
  const p = restStopResumeSchema.parse({ currentPosition: { lat: 47.49, lon: 19.04 }, originalDestination: { name: "Cél", lat: 47.51, lon: 19.06 }, routingContext });
  return buildConstrainedRerouteSearchRequest(p.currentPosition, p.originalDestination, p.routingContext!, p.departAt, NOW);
};
// Érvényes időbeli jelölt: 5 perccel a tervezett előtt indul, 10 perccel korábban ér oda.
const timing = { candidateDepartureIso: iso(5), candidateArrivalIso: iso(50), plannedDepartureIso: iso(10), originalArrivalIso: iso(60), nowMs: NOW };

describe("earlier departure — routing context", () => {
  test("wiring: a /resume kérés ugyanazt a routingContext-et kapja, és a validálás is ehhez igazodik", () => {
    assert.match(block, /const attemptRoutingContext = buildRerouteRoutingContext\(effectiveLiveRerouteContext\);/);
    assert.match(block, /fetch\("\/api\/vedett-route\/rest-stops\/resume"/);
    assert.match(block, /routingContext: attemptRoutingContext,/);
    assert.match(block, /stepFreeRequired: attemptRoutingContext\.stepFreeRequired,/);
    assert.match(block, /candidateAccessibilityStatus: candidateJourney\.accessibilityStatus,/);
  });
  test("1) stepFree=true -> a kérés kontextusa true", () => {
    assert.equal(wire(rc({ snapshot: ctx({ stepFreeRequired: true }) })).request.stepFreeRequired, true);
  });
  test("2) stepFree=false -> nem válik indokolatlanul true-ra", () => {
    assert.equal(wire(rc({ snapshot: ctx() })).request.stepFreeRequired, false);
  });
  test("3) Bubi + propulsion megmarad", () => {
    const r = wire(rc({ snapshot: ctx({ molBubiEnabled: true, bikePropulsion: "HUMAN" }) })).request;
    assert.equal(r.molBubiEnabled, true);
    assert.equal(r.bikePropulsion, "HUMAN");
  });
  test("4) weights megmaradnak", () => {
    assert.deepEqual(wire(rc({ snapshot: ctx() })).weights, W);
  });
  test("5) stepFree=true -> nem lépcsőmentes / minősítés nélküli jelölt NEM fogadható el", () => {
    assert.deepEqual(validateEarlierDepartureCandidate({ ...timing, stepFreeRequired: true }), { valid: false, reason: "STEP_FREE_NOT_PROVEN" });
    assert.deepEqual(validateEarlierDepartureCandidate({ ...timing, stepFreeRequired: true, candidateAccessibilityStatus: "KNOWN_NOT_ACCESSIBLE" }), {
      valid: false,
      reason: "STEP_FREE_NOT_PROVEN",
    });
    assert.deepEqual(validateEarlierDepartureCandidate({ ...timing, stepFreeRequired: true, candidateAccessibilityStatus: "KNOWN_ACCESSIBLE" }), { valid: true });
    assert.deepEqual(validateEarlierDepartureCandidate({ ...timing, stepFreeRequired: true, candidateAccessibilityStatus: "PARTIALLY_UNKNOWN" }), { valid: true });
    // stepFree nélkül a minősítés hiánya nem akadály (régi viselkedés)
    assert.deepEqual(validateEarlierDepartureCandidate({ ...timing, stepFreeRequired: false }), { valid: true });
    assert.deepEqual(validateEarlierDepartureCandidate(timing), { valid: true });
  });
  test("6) régi session / kontextus nélkül backward compatible; journey accessibilityStatus megtartja a stepFree-t", () => {
    const legacy = rc();
    assert.deepEqual(legacy, { stepFreeRequired: false, molBubiEnabled: false, bikePropulsion: "ANY", weights: DEFAULT_W });
    assert.equal(wire(legacy).request.stepFreeRequired, false);
    const fromJourney = rc({ journey: journey({ accessibilityStatus: "KNOWN_ACCESSIBLE" } as unknown as Partial<Journey>) });
    assert.equal(fromJourney.stepFreeRequired, true);
    assert.equal(wire(fromJourney).request.stepFreeRequired, true);
  });
});
