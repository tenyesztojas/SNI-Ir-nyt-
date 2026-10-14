// VÉDETT NAPOM — gyermekbarát utazási kártya
//   node --test __tests__/family/travel-card.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTravelCard, TRAVEL_CARD_ROWS } from "../../lib/family/travelCard.ts";
import { nextScheduleItemId, todayScheduleItems } from "../../lib/family/todaySchedule.ts";
import { applyTravelAction, availableTravelActions, TRAVEL_ACTION_LABEL, type TravelState } from "../../lib/family/travelStatus.ts";

const item = (o: Record<string, unknown>) =>
  ({
    id: "x", title: "Úszás", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "15:20:00", arrivalTimeLocal: "16:00:00", daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    originLabel: "Iskola u. 1.", originLat: 47.49, originLon: 19.04,
    destinationLabel: "Uszoda tér 2.", destinationLat: 47.5, destinationLon: 19.05, isActive: true, ...o,
  }) as never;

describe("utazási kártya adatai", () => {
  test("teljes napirendi adat", () => {
    const c = buildTravelCard(item({}));
    assert.deepEqual(
      { ...c, routeHref: undefined },
      { program: "Úszás", from: "Iskola u. 1.", to: "Uszoda tér 2.", departTime: "15:20", arriveTime: "16:00", routeHref: undefined }
    );
    assert.deepEqual(TRAVEL_CARD_ROWS.map((r) => r.label), [
      "Milyen programra megyek?", "Honnan indulok?", "Hová megyek?", "Mikor indulok?", "Mikorra kell megérkeznem?",
    ]);
  });
  test("hiányzó indulási hely: null, nincs kitalált érték; a cél-link megmarad origin nélkül", () => {
    const c = buildTravelCard(item({ originLabel: null, originLat: null, originLon: null }));
    assert.equal(c.from, null);
    assert.equal(c.routeHref, "/vedett-utvonal?name=Uszoda+t%C3%A9r+2.&lat=47.5&lon=19.05");
  });
  test("hiányzó célállomás: nincs cím és nincs útvonal-link (nincs kártya)", () => {
    const c = buildTravelCard(item({ destinationLabel: "  ", destinationLat: null, destinationLon: null }));
    assert.equal(c.to, null);
    assert.equal(c.routeHref, null);
  });
  test("hiányzó / érvénytelen időpont: null", () => {
    const c = buildTravelCard(item({ arrivalTimeLocal: null, timeLocal: "xx" }));
    assert.equal(c.arriveTime, null);
    assert.equal(c.departTime, null);
  });
  test("meglévő Védett Útvonal mélylink: cél name/lat/lon + külön origin paraméterek", () => {
    const q = new URLSearchParams(buildTravelCard(item({})).routeHref!.split("?")[1]);
    assert.equal(q.get("name"), "Uszoda tér 2.");
    assert.equal(q.get("lat"), "47.5");
    assert.equal(q.get("originName"), "Iskola u. 1.");
    assert.equal(q.get("originLon"), "19.04");
  });
});

describe("kiemelés és állapot", () => {
  test("a legközelebbi (még véget nem ért) program a következő", () => {
    const day = { date: "2026-10-14", weekday: 3 };
    const list = todayScheduleItems([item({ id: "a", timeLocal: "08:00", arrivalTimeLocal: "08:20" }), item({ id: "b" })], day);
    assert.equal(nextScheduleItemId(list, 8 * 60 + 30), "b");
  });
  test("lezárt utazásnál nincs gomb; műveletcímkék a feladat szerint", () => {
    const d = applyTravelAction(null, "depart", "T1") as { ok: true; state: TravelState };
    const a = applyTravelAction(d.state, "arrive", "T2") as { ok: true; state: TravelState };
    assert.deepEqual(availableTravelActions(a.state), []);
    assert.deepEqual(applyTravelAction(a.state, "depart", "T3"), { ok: false, error: "travel_closed" });
    assert.deepEqual(Object.values(TRAVEL_ACTION_LABEL), ["Elindultam", "Megérkeztem", "Segítséget kérek"]);
  });
  test("felület: kártya + meglévő gombkomponens + meglévő link, nincs szenzoros-profil állítás", () => {
    const v = readFileSync("components/family/ChildTodayLive.tsx", "utf8");
    assert.match(v, /\{card\.routeHref \? \(/);
    assert.match(v, /\{value \?\? TRAVEL_CARD_MISSING\}/);
    assert.match(v, /<TravelStatusControls/);
    assert.match(v, /href=\{routeHref\}/);
    assert.doesNotMatch(v, /szenzoros profil|szenzoros beállítás/i);
  });
});
