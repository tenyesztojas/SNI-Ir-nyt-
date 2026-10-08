// VÉDETT ÚTVONAL — elavult Live Alternative érvénytelenítése automatikus OFF_ROUTE újratervezés után
//   node --test __tests__/vedett-route/stale-alternative-invalidation.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../../lib/vedett-route/types.ts";
import {
  INITIAL_JOURNEY_REVISION,
  isJourneyRevisionCurrent,
  nextJourneyRevision,
  resetAlternativeStateAfterJourneyReplacement,
} from "../../lib/vedett-route/navigation/journeyRevision.ts";
import {
  acceptLiveAlternativeOffer,
  presentLiveAlternativeOffer,
  startLiveAlternativeOfferSearch,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";
import { buildJourneyMonitorSimulation, applySimulationOverlay } from "../../lib/vedett-route/navigation/journeyMonitorSimulation.ts";

const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const between = (start: string, end: string) => {
  const i = form.indexOf(start);
  assert.ok(i >= 0, start);
  return form.slice(i, form.indexOf(end, i));
};
const rerouteBlock = between('const response = await fetch("/api/vedett-route/rest-stops/resume", {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({\n            currentPosition: attemptPosition,\n            originalDestination: attemptDestination,\n            departAt: new Date().toISOString(),\n            routingContext: attemptRoutingContext,\n          }),', "rerouteGuardRef.current = markRerouteFinished(");
const successBranch = rerouteBlock.slice(rerouteBlock.indexOf("if (data.ok) {"), rerouteBlock.indexOf('setAutomaticRerouteStatus("FAILED");'));
const failureBranch = rerouteBlock.slice(rerouteBlock.indexOf('setAutomaticRerouteStatus("FAILED");'));
const acceptBody = between("const handleLiveAlternativeAccept = () => {", "\n  };\n");
const maybeStart = between("const maybeStartLiveAlternativeSearch = async", "const handleLiveAlternativeDecline");

const J = (id: string) => ({ legs: [], fingerprint: id, departureTime: "", arrivalTime: "", totalDurationMinutes: 1 }) as unknown as Journey;
const offered = (generation = 1) =>
  presentLiveAlternativeOffer(
    startLiveAlternativeOfferSearch({ type: "CANCELLED", eventId: "cancelled:T1" }, generation),
    J("candidate"),
    { netTimeBenefitMinutes: 0, reason: "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT", bullets: [] },
    generation
  );

describe("útvonal-revízió (tiszta)", () => {
  test("a revízió csak a lecserélés után lép, a korábbi revízió érvénytelen", () => {
    const r0 = INITIAL_JOURNEY_REVISION;
    const r1 = nextJourneyRevision(r0);
    assert.equal(isJourneyRevisionCurrent(r0, r0), true);
    assert.equal(isJourneyRevisionCurrent(r0, r1), false);
    assert.equal(isJourneyRevisionCurrent(null, r0), false, "ismeretlen revízió sosem érvényes");
  });
  test("1/4/5) a reset alapállapotú ajánlatot, zárt előnézetet, üres debounce-ot és szimulációt ad — útvonal nélkül", () => {
    const r = resetAlternativeStateAfterJourneyReplacement();
    assert.equal(r.offer.status, "NONE");
    assert.equal(r.offer.candidateJourney, null);
    assert.equal(r.previewOpen, false);
    assert.equal(r.debounce.pendingEventId, null);
    assert.equal(r.simulation, null);
    assert.equal("journey" in r, false, "az új útvonalat nem érinti");
  });
  test("4) a törölt szimuláció overlay-e nem módosít további frissítést", () => {
    const sim = buildJourneyMonitorSimulation({
      journey: { legs: [{ mode: "TRANSIT", fromName: "a", toName: "b", tripId: "T1", durationMinutes: 5, realtime: false, departureTime: "2026-10-08T10:00:00Z", arrivalTime: "2026-10-08T10:05:00Z" }] } as unknown as Journey,
      activeLegIndex: 0, kind: "CANCELLED", sessionGeneration: 1,
    });
    assert.ok(sim);
    const real = [{ tripId: "T1", realtime: true }];
    assert.equal(applySimulationOverlay(real, resetAlternativeStateAfterJourneyReplacement().simulation, 1), real);
  });
  test("2) az ajánlat-állapotgép önmagában elfogadná — ezért kell a revízió-ellenőrzés", () => {
    assert.ok(acceptLiveAlternativeOffer(offered()), "a session-generáció nem változik OFF_ROUTE újratervezéskor");
  });
});

describe("bekötés (forrásszint)", () => {
  test("1/4/5) sikeres OFF_ROUTE útvonalcsere: revízió lép, ajánlat/előnézet/szimuláció/debounce törlődik", () => {
    assert.match(successBranch, /setDisplayedJourney\(data\.journey\);/);
    assert.match(successBranch, /journeyRevisionRef\.current = nextJourneyRevision\(journeyRevisionRef\.current\);/);
    assert.match(successBranch, /setLiveAlternativeOffer\(reset\.offer\);/);
    assert.match(successBranch, /setLiveAlternativePreviewOpen\(reset\.previewOpen\);/);
    assert.match(successBranch, /realtimeMonitorDebounceRef\.current = reset\.debounce;/);
    assert.match(successBranch, /journeyMonitorSimulationRef\.current = reset\.simulation;/);
    assert.match(successBranch, /journeyMonitorSimulationSnapshotRef\.current = null;/);
    assert.match(successBranch, /liveAlternativeOfferRevisionRef\.current = null;/);
  });
  test("8) a navigációs session generációja NEM lép (foreground/restore/GPS-vesztés változatlan)", () => {
    assert.doesNotMatch(successBranch, /bumpNavigationSession\(\)/);
    assert.doesNotMatch(successBranch, /rerouteSessionRef\.current \+=/);
  });
  test("6) sikertelen újratervezés nem érvénytelenít", () => {
    assert.doesNotMatch(failureBranch, /journeyRevisionRef|setLiveAlternativeOffer|realtimeMonitorDebounceRef|journeyMonitorSimulationRef/);
  });
  test("7) az új útvonal navigációja folytatódik: a reset nem ír útvonalat és nem állítja le a navigációt", () => {
    assert.equal((successBranch.match(/setDisplayedJourney\(/g) ?? []).length, 1);
    assert.doesNotMatch(successBranch, /setNavigationMode|geo\.stopWatching|clearNavigationSession/);
  });
  test("2) a régi ajánlat elfogadása nem cserél útvonalat (revízió-ellenőrzés a setDisplayedJourney ELŐTT)", () => {
    const check = acceptBody.indexOf("isJourneyRevisionCurrent(liveAlternativeOfferRevisionRef.current, journeyRevisionRef.current)");
    const replace = acceptBody.indexOf("setDisplayedJourney(accepted.acceptedJourney)");
    assert.ok(check > 0 && replace > check);
    assert.match(acceptBody.slice(check, replace), /setLiveAlternativeOffer\(createInitialLiveAlternativeOffer\(\)\);\s*return;/);
  });
  test("3) a régi, folyamatban lévő keresés eredménye nem lesz ajánlat (revízió-ellenőrzés a válasz után, minden ajánlat előtt)", () => {
    assert.match(maybeStart, /const journeyRevision = journeyRevisionRef\.current;/);
    const check = maybeStart.indexOf("if (!isJourneyRevisionCurrent(journeyRevision, journeyRevisionRef.current)) {");
    const firstPresent = maybeStart.indexOf("presentLiveAlternativeOffer(");
    const fetchAt = maybeStart.indexOf('await fetch("/api/admin/vedett-utvonal/search"');
    assert.ok(fetchAt > 0 && check > fetchAt && firstPresent > check);
    assert.match(maybeStart, /reason: "JOURNEY_REPLACED"/);
    assert.equal((maybeStart.match(/await /g) ?? []).length, 2, "a revízió-ellenőrzés után nincs több await (fetch + json)");
  });
  test("9) Live Alternative továbbra is kizárólag felhasználói elfogadással cserél útvonalat", () => {
    assert.equal((form.match(/setDisplayedJourney\(accepted\.acceptedJourney\)/g) ?? []).length, 1);
    assert.doesNotMatch(form, /setDisplayedJourney\([^)]*candidateJourney/);
    assert.doesNotMatch(maybeStart, /setDisplayedJourney\(/);
  });
});
