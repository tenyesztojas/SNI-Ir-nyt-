// VÉDETT ÚTVONAL — SPRINT 8.3 (ROUTE-SPECIFIC DISRUPTION RELEVANCE ENGINE,
// 2026-09-18). Pure behavior tesztek a lib/vedett-route/navigation/
// disruptionRelevance.ts motorra. FAIL CLOSED: a route/line match önmagában
// SOHA nem elég PROVEN_RELEVANT-hoz (M2 Déli->Kossuth / Örs->Deák eset).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDisruptionRelevance,
  filterProvenRelevantDisruptions,
  type DisruptionRelevanceLeg,
} from "../../lib/vedett-route/navigation/disruptionRelevance.ts";
import type { ServiceAlert } from "../../lib/vedett-route/types.ts";

const NOW = Date.parse("2026-09-18T09:00:00Z");

function makeAlert(overrides: Partial<ServiceAlert> = {}): ServiceAlert {
  return {
    id: "alert-1",
    header: "Riasztás",
    informedEntities: [],
    activePeriod: [],
    ...overrides,
  };
}

function makeLeg(overrides: Partial<DisruptionRelevanceLeg> = {}): DisruptionRelevanceLeg {
  return {
    legIndex: 0,
    mode: "TRANSIT",
    tripId: "trip-M2-deli-kossuth",
    routeId: "M2",
    fromStopId: "stop-deli",
    toStopId: "stop-kossuth",
    departureTime: "2026-09-18T10:00:00Z",
    arrivalTime: "2026-09-18T10:20:00Z",
    ...overrides,
  };
}

describe("disruptionRelevance — kötelező viselkedési tesztek", () => {
  test("1) exact tripId + aktív alert (nincs activePeriod-korlátozás) => PROVEN_RELEVANT", () => {
    const alert = makeAlert({ informedEntities: [{ tripId: "trip-M2-deli-kossuth" }] });
    const leg = makeLeg();
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.equal(result.status, "PROVEN_RELEVANT");
    if (result.status === "PROVEN_RELEVANT") {
      assert.equal(result.legIndex, 0);
      assert.equal(result.evidence.matchedTripId, "trip-M2-deli-kossuth");
    }
  });

  test("2) exact route + journey-ben szereplő affected stop (fromStopId) => PROVEN_RELEVANT", () => {
    const alert = makeAlert({ informedEntities: [{ routeId: "M2", stopId: "stop-deli" }] });
    const leg = makeLeg({ tripId: undefined });
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.equal(result.status, "PROVEN_RELEVANT");
  });

  test("3) route-only match (nincs trip/stop bizonyíték) => NEM PROVEN_RELEVANT", () => {
    const alert = makeAlert({ informedEntities: [{ routeId: "M2" }] });
    const leg = makeLeg({ tripId: undefined });
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.notEqual(result.status, "PROVEN_RELEVANT");
    assert.equal(result.status, "UNKNOWN");
  });

  test("4) M2 regresszió: journey Déli->Kossuth, alert ugyanarra az M2 route-ra, de Örs/Deák stopokra => NEM PROVEN_RELEVANT", () => {
    const alert = makeAlert({ informedEntities: [{ routeId: "M2", stopId: "stop-ors-vezer-tere" }] });
    const leg = makeLeg({ tripId: undefined }); // stop-deli / stop-kossuth szegmens
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.notEqual(result.status, "PROVEN_RELEVANT");
    assert.equal(result.status, "IRRELEVANT");
    assert.equal(result.reason, "STOP_OUTSIDE_JOURNEY_SEGMENT");
  });

  test("5) alert stop a journey JÖVŐBELI részén => PROVEN_RELEVANT", () => {
    const currentLeg = makeLeg({ legIndex: 0 });
    const futureLeg = makeLeg({
      legIndex: 1,
      tripId: "trip-M4-kelenfold-szell",
      routeId: "M4",
      fromStopId: "stop-kelenfold",
      toStopId: "stop-szell-kalman",
    });
    const alert = makeAlert({ informedEntities: [{ routeId: "M4", stopId: "stop-szell-kalman" }] });
    const result = evaluateDisruptionRelevance({
      alert,
      legs: [currentLeg, futureLeg],
      currentLegIndex: 0,
      nowMs: NOW,
    });
    assert.equal(result.status, "PROVEN_RELEVANT");
    if (result.status === "PROVEN_RELEVANT") assert.equal(result.legIndex, 1);
  });

  test("6) alert stop bizonyíthatóan már teljesített legben => NEM aktív disruption", () => {
    const completedLeg = makeLeg({ legIndex: 0 }); // trip-M2-deli-kossuth, MÁR teljesítve
    const alert = makeAlert({ informedEntities: [{ tripId: "trip-M2-deli-kossuth" }] });
    // currentLegIndex: 1 -> a 0. index (completedLeg) MÁR mögöttünk van.
    const result = evaluateDisruptionRelevance({ alert, legs: [completedLeg], currentLegIndex: 1, nowMs: NOW });
    assert.notEqual(result.status, "PROVEN_RELEVANT");
  });

  test("7) unrelated route/trip/stop => IRRELEVANT", () => {
    const alert = makeAlert({ informedEntities: [{ routeId: "BUS-100", tripId: "trip-unrelated", stopId: "stop-somewhere-else" }] });
    const leg = makeLeg();
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.equal(result.status, "IRRELEVANT");
    assert.equal(result.reason, "NO_MATCHING_ENTITY");
  });

  test("8) lejárt alert => IRRELEVANT, FÜGGETLENÜL a trip/route matchtől", () => {
    const alert = makeAlert({
      informedEntities: [{ tripId: "trip-M2-deli-kossuth" }],
      activePeriod: [{ startSeconds: 0, endSeconds: 100 }], // messze a NOW előtt lejárt
    });
    const leg = makeLeg();
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.equal(result.status, "IRRELEVANT");
    assert.equal(result.reason, "ALERT_EXPIRED");
  });

  test("9) jövőbeli activePeriod, amely NEM fedi át a leg idejét => NEM PROVEN_RELEVANT", () => {
    const leg = makeLeg(); // departureTime/arrivalTime: 2026-09-18 10:00-10:20
    const farFutureStart = Math.floor(Date.parse("2026-09-25T00:00:00Z") / 1000);
    const farFutureEnd = Math.floor(Date.parse("2026-09-25T01:00:00Z") / 1000);
    const alert = makeAlert({
      informedEntities: [{ tripId: "trip-M2-deli-kossuth" }],
      activePeriod: [{ startSeconds: farFutureStart, endSeconds: farFutureEnd }],
    });
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.notEqual(result.status, "PROVEN_RELEVANT");
  });

  test("10) malformed/incomplete alert => fail closed, nem crashel", () => {
    const malformedAlert = { id: "broken" } as ServiceAlert; // informedEntities/activePeriod hiányzik
    const leg = makeLeg();
    assert.doesNotThrow(() => {
      const result = evaluateDisruptionRelevance({ alert: malformedAlert, legs: [leg], currentLegIndex: null, nowMs: NOW });
      assert.notEqual(result.status, "PROVEN_RELEVANT");
    });
  });

  test("11) több alert: CSAK a bizonyítottan releváns kerül a relevant resultok közé", () => {
    const leg = makeLeg();
    const provenAlert = makeAlert({ id: "proven", informedEntities: [{ tripId: "trip-M2-deli-kossuth" }] });
    const routeOnlyAlert = makeAlert({ id: "route-only", informedEntities: [{ routeId: "M2" }] });
    const unrelatedAlert = makeAlert({ id: "unrelated", informedEntities: [{ routeId: "BUS-1" }] });
    const results = filterProvenRelevantDisruptions([provenAlert, routeOnlyAlert, unrelatedAlert], [leg], null, NOW);
    assert.equal(results.length, 1);
    assert.equal(results[0].alertId, "proven");
  });

  test("12) exact trip match + explicit stop restriction OUTSIDE journey segment => NEM PROVEN_RELEVANT", () => {
    // A trip identity egyezik, DE az alert explicit egy MÁSIK stopra korlátozza magát —
    // az exact trip identity SEM írhatja felül ezt a bizonyítékot.
    const alert = makeAlert({ informedEntities: [{ tripId: "trip-M2-deli-kossuth", stopId: "stop-far-away" }] });
    const leg = makeLeg();
    const result = evaluateDisruptionRelevance({ alert, legs: [leg], currentLegIndex: null, nowMs: NOW });
    assert.notEqual(result.status, "PROVEN_RELEVANT");
    assert.equal(result.status, "IRRELEVANT");
    assert.equal(result.reason, "STOP_OUTSIDE_JOURNEY_SEGMENT");
  });
});
