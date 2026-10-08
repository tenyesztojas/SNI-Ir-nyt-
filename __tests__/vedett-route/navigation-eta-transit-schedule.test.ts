// VÉDETT ÚTVONAL — navigációs ETA: menetrendi / realtime korlát közösségi közlekedésnél
//   node --test __tests__/vedett-route/navigation-eta-transit-schedule.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import { computeNavigationEta } from "../../lib/vedett-route/navigation/navigationEta.ts";
import { updateRouteProgress } from "../../lib/vedett-route/navigation/routeProgress.ts";
import { mergeRealtimeUpdates } from "../../lib/vedett-route/realtimeRefresh/mergeRealtimeUpdates.ts";

// 12:35 helyi idő helyett egy fix UTC alap: T(min) = alap + min perc.
const BASE = Date.parse("2026-10-08T10:35:00Z"); // "12:35"
const T = (m: number) => BASE + m * 60_000;
const iso = (m: number) => new Date(T(m)).toISOString();
const walk = (m: number): JourneyLeg => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: m, realtime: false }) as JourneyLeg;
const transit = (id: string, d: number, a: number, extra: Partial<JourneyLeg> = {}): JourneyLeg =>
  ({ mode: "TRANSIT", fromName: "a", toName: "b", tripId: id, routeId: `R${id}`, departureTime: iso(d), arrivalTime: iso(a),
     scheduledDepartureTime: iso(d), scheduledArrivalTime: iso(a), durationMinutes: a - d, realtime: false, ...extra }) as JourneyLeg;
const journey = (legs: JourneyLeg[], dep: number, arr: number): Journey =>
  ({ legs, departureTime: iso(dep), arrivalTime: iso(arr), totalDurationMinutes: arr - dep, transfers: 0, walkingMinutes: 0 }) as unknown as Journey;

// Az éles eset: útiterv 12:53 → 13:46 (53 perc): 7' séta, M2 13:00–13:40, 6' séta.
const planned = () => journey([walk(7), transit("M2", 25, 65), walk(6)], 18, 71);
/** A régi (GPS-alapú) becslés: fix időpont + 53 perc × (1 − hányad). */
const gpsOnly = (nowMs: number, fraction = 0) => nowMs + 53 * 60_000 * (1 - fraction);

describe("menetrendi korlát", () => {
  test("1) jövőbeli járatindulás: 12:35-kor nem 13:28, hanem a menetrend szerinti érkezés", () => {
    const j = planned();
    const eta = computeNavigationEta({ journey: j, activeLegIndex: 0, gpsEstimatedArrivalMs: gpsOnly(T(0)), gpsRemainingDurationSeconds: 53 * 60, nowMs: T(0) });
    assert.equal(eta.basis, "TRANSIT_SCHEDULE");
    assert.equal(eta.arrivalMs, T(71)); // M2 érkezés (65) + 6' séta = "13:46"
    assert.ok(eta.arrivalMs! > gpsOnly(T(0)), "nem a teljesíthetetlen 13:28");
  });
  test("2) realtime késés: a merge-elt (késő) járatérkezést veszi figyelembe", () => {
    const delayed = mergeRealtimeUpdates(planned(), [
      { tripId: "M2", routeId: "RM2", realtime: true, departureTime: iso(32), scheduledDepartureTime: iso(25), arrivalTime: iso(72), scheduledArrivalTime: iso(65), delayMinutes: 7 },
    ]);
    const eta = computeNavigationEta({ journey: delayed, activeLegIndex: 1, gpsEstimatedArrivalMs: T(40), gpsRemainingDurationSeconds: 1800, nowMs: T(20) });
    assert.equal(eta.arrivalMs, T(78)); // 72 + 6
  });
  test("3) már teljesített szakaszok nem növelik: két járatból a második van hátra", () => {
    const j = journey([walk(3), transit("T1", 3, 20), walk(4), transit("T2", 26, 40), walk(5)], 0, 45);
    const atStart = computeNavigationEta({ journey: j, activeLegIndex: 0, gpsEstimatedArrivalMs: T(10), gpsRemainingDurationSeconds: 600, nowMs: T(0) });
    const onSecond = computeNavigationEta({ journey: j, activeLegIndex: 3, gpsEstimatedArrivalMs: T(32), gpsRemainingDurationSeconds: 300, nowMs: T(30) });
    assert.equal(atStart.arrivalMs, T(45));
    assert.equal(onSecond.arrivalMs, T(45), "az utolsó járat érkezése + a végső séta; a korábbi lábak nem adódnak hozzá");
    assert.equal(onSecond.remainingMinutes, 15);
  });
  test("ha a GPS-becslés későbbi (pl. lemaradás a gyalogos végszakaszon), az marad", () => {
    const eta = computeNavigationEta({ journey: planned(), activeLegIndex: 1, gpsEstimatedArrivalMs: T(80), gpsRemainingDurationSeconds: 3000, nowMs: T(30) });
    assert.equal(eta.basis, "GPS_PROGRESS");
    assert.equal(eta.arrivalMs, T(80));
  });
});

describe("változatlan viselkedés és fallback", () => {
  test("4) tisztán gyalogos (hátralévő) út: a GPS-alapú ETA változatlan", () => {
    const walkOnly = journey([walk(20)], 0, 20);
    const route = [[19.0, 47.5], [19.01, 47.5]] as [number, number][];
    const progress = updateRouteProgress(route, { latitude: 47.5, longitude: 19.005, timestampMs: T(0) } as never, null, { routeDurationSeconds: 1200 });
    const eta = computeNavigationEta({
      journey: walkOnly, activeLegIndex: 0, gpsEstimatedArrivalMs: progress.estimatedArrivalTimeMs,
      gpsRemainingDurationSeconds: progress.remainingDurationSeconds, nowMs: T(0),
    });
    assert.equal(eta.basis, "GPS_PROGRESS");
    assert.equal(eta.arrivalMs, progress.estimatedArrivalTimeMs);
    // utolsó járat után, gyalogos végszakaszon is
    const afterTransit = computeNavigationEta({ journey: planned(), activeLegIndex: 2, gpsEstimatedArrivalMs: T(70), gpsRemainingDurationSeconds: 300, nowMs: T(66) });
    assert.equal(afterTransit.basis, "GPS_PROGRESS");
  });
  test("5) hiányzó / érvénytelen menetrendi adat vagy kimaradt járat: biztonságos fallback", () => {
    const noTimes = journey([walk(5), transit("M2", 25, 65, { arrivalTime: undefined, departureTime: undefined }), walk(6)], 18, 71);
    const cancelled = journey([walk(5), transit("M2", 25, 65, { cancelled: true }), walk(6)], 18, 71);
    for (const j of [noTimes, cancelled]) {
      const eta = computeNavigationEta({ journey: j, activeLegIndex: 0, gpsEstimatedArrivalMs: T(53), gpsRemainingDurationSeconds: 3180, nowMs: T(0) });
      assert.equal(eta.basis, "GPS_PROGRESS");
      assert.equal(eta.arrivalMs, T(53));
    }
    // GPS sincs: a korábbi fallback, az útiterv érkezése
    const none = computeNavigationEta({ journey: noTimes, activeLegIndex: 0, gpsEstimatedArrivalMs: null, gpsRemainingDurationSeconds: null, nowMs: T(0) });
    assert.equal(none.basis, "JOURNEY_ARRIVAL");
    assert.equal(none.arrivalMs, T(71));
    const nothing = computeNavigationEta({ journey: { ...noTimes, arrivalTime: "rossz" } as Journey, activeLegIndex: 0, gpsEstimatedArrivalMs: null, gpsRemainingDurationSeconds: null, nowMs: T(0) });
    assert.equal(nothing.arrivalMs, null);
  });
  test("6) a hátralévő perc összhangban van az érkezéssel", () => {
    for (const nowMin of [0, 10, 30.5]) {
      const eta = computeNavigationEta({ journey: planned(), activeLegIndex: 1, gpsEstimatedArrivalMs: T(nowMin + 1), gpsRemainingDurationSeconds: 60, nowMs: T(nowMin) });
      assert.equal(eta.remainingMinutes, Math.ceil((eta.arrivalMs! - T(nowMin)) / 60_000));
    }
  });
  test("7) Live Alternative elfogadása után az ETA az elfogadott (aktív) útvonal adataiból számol", () => {
    const accepted = journey([walk(4), transit("C1", 10, 50), walk(3)], 0, 53);
    const eta = computeNavigationEta({ journey: accepted, activeLegIndex: 0, gpsEstimatedArrivalMs: T(20), gpsRemainingDurationSeconds: 1200, nowMs: T(0) });
    assert.equal(eta.arrivalMs, T(53));
    const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
    assert.match(form, /computeNavigationEta\(\{\s*journey: displayedJourney,\s*activeLegIndex: activeLegIndex \?\? null,/);
  });
  test("8) háttérből visszatérve (később) az ETA a friss időponttal újraszámolódik", () => {
    const before = computeNavigationEta({ journey: planned(), activeLegIndex: 0, gpsEstimatedArrivalMs: gpsOnly(T(0)), gpsRemainingDurationSeconds: 3180, nowMs: T(0) });
    // 15 perc háttér után, ugyanazon a lábon: az abszolút érkezés változatlan, a hátralévő perc csökken
    const after = computeNavigationEta({ journey: planned(), activeLegIndex: 0, gpsEstimatedArrivalMs: gpsOnly(T(15)), gpsRemainingDurationSeconds: 3180, nowMs: T(15) });
    assert.equal(after.arrivalMs, before.arrivalMs);
    assert.equal(before.remainingMinutes! - after.remainingMinutes!, 15);
    // ha a menetrendi érkezés már túl régen elmúlt (elavult adat), nincs hamis korlát
    const stale = computeNavigationEta({ journey: planned(), activeLegIndex: 1, gpsEstimatedArrivalMs: T(95), gpsRemainingDurationSeconds: 300, nowMs: T(90) });
    assert.equal(stale.basis, "GPS_PROGRESS");
  });
  test("a kártya a közös számításból kapja az ETA-t és a percet (forrásszint)", () => {
    const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
    assert.match(form, /const navigationRemainingMinutes = navigationEtaResult\.remainingMinutes;/);
    assert.match(form, /formatClockTime\(new Date\(navigationEtaResult\.arrivalMs\)\.toISOString\(\)\)/);
    assert.doesNotMatch(form, /routeProgress\.estimatedArrivalTimeMs !== null\s*\?\s*formatClockTime/);
  });
});
