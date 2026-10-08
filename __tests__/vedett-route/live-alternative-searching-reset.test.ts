// VÉDETT ÚTVONAL — a Live Alternative SEARCHING állapot nem ragadhat be elutasított keresés után
//   node --test __tests__/vedett-route/live-alternative-searching-reset.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../../lib/vedett-route/types.ts";
import {
  createInitialLiveAlternativeGuardState,
  discardLiveAlternativeSearchIfCurrent,
  markLiveAlternativeSearchFinished,
  markLiveAlternativeSearchStarted,
  presentLiveAlternativeOffer,
  shouldStartLiveAlternativeSearch,
  startLiveAlternativeOfferSearch,
  type LiveAlternativeOffer,
  type LiveAlternativeTrigger,
} from "../../lib/vedett-route/navigation/liveAlternative.ts";

const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const maybeStart = (() => {
  const i = form.indexOf("const maybeStartLiveAlternativeSearch = async");
  return form.slice(i, form.indexOf("const handleLiveAlternativeDecline", i));
})();

const TRIGGER: LiveAlternativeTrigger = { type: "MISSED_CONNECTION", eventId: "missed:T1>T2" };
const J = (fp: string) => ({ legs: [], fingerprint: fp, departureTime: "", arrivalTime: "", totalDurationMinutes: 1 }) as unknown as Journey;
const SUMMARY = { netTimeBenefitMinutes: 0, reason: "DISRUPTION_DRIVEN_STRUCTURAL_IMPROVEMENT" as const, bullets: [] };
/** A form updater-mintája: csak a SAJÁT keresés állapotára ír. */
const presentIfCurrent = (offer: LiveAlternativeOffer, searchOffer: LiveAlternativeOffer, j: Journey) =>
  offer !== searchOffer ? offer : presentLiveAlternativeOffer(offer, j, SUMMARY, 1);

describe("keresés lezárása (tiszta)", () => {
  for (const [n, label] of [[1, "üres eredmény"], [2, "csak azonos útvonal"], [3, "ETA-elutasítás"]] as const) {
    test(`${n}) ${label} után nincs beragadt SEARCHING`, () => {
      const searchOffer = startLiveAlternativeOfferSearch(TRIGGER, 1);
      assert.equal(searchOffer.status, "SEARCHING");
      const after = discardLiveAlternativeSearchIfCurrent(searchOffer, searchOffer);
      assert.equal(after.status, "NONE");
      assert.equal(after.candidateJourney, null);
    });
  }
  test("4) sikeres keresés továbbra is OFFERED", () => {
    const searchOffer = startLiveAlternativeOfferSearch(TRIGGER, 1);
    const after = presentIfCurrent(searchOffer, searchOffer, J("cand"));
    assert.equal(after.status, "OFFERED");
    assert.equal(after.candidateJourney?.fingerprint, "cand");
  });
  test("5) késői válasz nem írja felül az újabb keresés állapotát (sem lezárással, sem ajánlattal)", () => {
    const older = startLiveAlternativeOfferSearch(TRIGGER, 1);
    const newer = startLiveAlternativeOfferSearch({ type: "CANCELLED", eventId: "cancelled:T2" }, 1);
    assert.equal(discardLiveAlternativeSearchIfCurrent(newer, older), newer);
    assert.equal(presentIfCurrent(newer, older, J("late")), newer);
  });
  test("8) meglévő érvényes ajánlatot egy régi keresés lezárása nem töröl", () => {
    const older = startLiveAlternativeOfferSearch(TRIGGER, 1);
    const shown = presentLiveAlternativeOffer(startLiveAlternativeOfferSearch(TRIGGER, 1), J("shown"), SUMMARY, 1);
    assert.equal(discardLiveAlternativeSearchIfCurrent(shown, older), shown);
    // és a saját, már OFFERED-be lépett keresés sem nullázható „lezárással”
    const own = startLiveAlternativeOfferSearch(TRIGGER, 1);
    const offered = presentIfCurrent(own, own, J("x"));
    assert.equal(discardLiveAlternativeSearchIfCurrent(offered, own), offered);
  });
  test("7) sikertelen keresés után egy későbbi jogosult trigger újra indíthat (cooldown betartásával)", () => {
    const t0 = Date.parse("2026-10-08T10:00:00Z");
    const input = (nowMs: number) => ({
      navigationActive: true, offRouteConfirmed: false, gpsReliable: true, foregroundRecoveryActive: false,
      restoreRecoveryActive: false, hasDestination: true, trigger: TRIGGER, nowMs,
    });
    const guard = markLiveAlternativeSearchFinished(markLiveAlternativeSearchStarted(createInitialLiveAlternativeGuardState(), TRIGGER, t0));
    assert.equal(guard.inFlight, false);
    assert.equal(shouldStartLiveAlternativeSearch(guard, input(t0 + 60_000)).reason, "COOLDOWN_ACTIVE");
    assert.equal(shouldStartLiveAlternativeSearch(guard, input(t0 + 6 * 60_000)).shouldSearch, true);
  });
});

describe("bekötés (forrásszint)", () => {
  test("a keresés saját SEARCHING objektuma rögzül", () => {
    assert.match(maybeStart, /const searchOffer = startLiveAlternativeOfferSearch\(trigger, sessionGeneration\);\s*setLiveAlternativeOffer\(searchOffer\);/);
  });
  test("1–3) minden ajánlat nélküli ág lezárja a saját keresést, a diagnosztikai okok megmaradnak", () => {
    const close = "setLiveAlternativeOffer((offer) => discardLiveAlternativeSearchIfCurrent(offer, searchOffer));";
    for (const [diag, guard] of [
      ['reason: "EMPTY_RESULTS"', "if (!data.ok || !Array.isArray(data.journeys) || data.journeys.length === 0) {"],
      ['reason: "NO_DISTINCT_CANDIDATE"', "if (!best) {"],
      ['reason: etaDecision.rejectedReason ?? "ETA_NOT_OFFERED"', "if (!etaDecision.offer) {"],
    ] as const) {
      assert.ok(maybeStart.includes(diag), diag);
      const i = maybeStart.indexOf(guard);
      assert.ok(i > 0, guard);
      const branch = maybeStart.slice(i, maybeStart.indexOf("return;", i));
      assert.ok(branch.includes(close), `${guard} lezárja a keresést`);
    }
    assert.doesNotMatch(maybeStart, /if \(!best\) return;|if \(!etaDecision\.offer\) return;|\.length === 0\) return;/);
  });
  test("6) útvonalcserével érvénytelenített keresés nem hoz létre ajánlatot, és lezárul", () => {
    const i = maybeStart.indexOf("if (!isJourneyRevisionCurrent(journeyRevision, journeyRevisionRef.current)) {");
    const branch = maybeStart.slice(i, maybeStart.indexOf("return;", i));
    assert.match(branch, /reason: "JOURNEY_REPLACED"/);
    assert.match(branch, /discardLiveAlternativeSearchIfCurrent\(offer, searchOffer\)/);
    assert.ok(i < maybeStart.indexOf("presentLiveAlternativeOffer("));
  });
  test("4/5) az ajánlat csak a saját keresés állapotára íródik (mindkét ág)", () => {
    assert.equal((maybeStart.match(/offer !== searchOffer \? offer : presentLiveAlternativeOffer\(/g) ?? []).length, 2);
  });
  test("a hálózati hiba is a saját keresést zárja; nincs általános reset a keresésben", () => {
    const c = maybeStart.slice(maybeStart.indexOf("} catch {"));
    assert.match(c, /discardLiveAlternativeSearchIfCurrent\(offer, searchOffer\)/);
    assert.doesNotMatch(maybeStart, /setLiveAlternativeOffer\(createInitialLiveAlternativeOffer\(\)\)/);
  });
});
