// VÉDETT NAPOM — napi szűrés, időrend, jogosultság szerinti megjelenítés
//   node --test __tests__/family/child-today-view.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  budapestLocalDay,
  isScheduledOn,
  nextScheduleItemId,
  todayScheduleItems,
} from "../../lib/family/todaySchedule.ts";

const read = (p: string) => readFileSync(p, "utf8");
const item = (o: Record<string, unknown>) =>
  ({
    id: "x", title: "T", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "08:00:00", arrivalTimeLocal: null, daysOfWeek: [1, 2, 3, 4, 5], originLabel: null,
    destinationLabel: null, originLat: null, originLon: null, destinationLat: null, destinationLon: null,
    isActive: true, ...o,
  }) as never;

// 2026-10-14 szerda (weekday 3)
const wed = { date: "2026-10-14", weekday: 3 };

describe("magyarországi helyi idő", () => {
  test("UTC 22:30 nyári időben már a következő budapesti nap", () => {
    assert.deepEqual(budapestLocalDay(new Date("2026-07-05T22:30:00Z")), { date: "2026-07-06", weekday: 1, minutes: 30 });
  });
  test("téli időben UTC+1", () => {
    assert.deepEqual(budapestLocalDay(new Date("2026-12-31T23:15:00Z")), { date: "2027-01-01", weekday: 5, minutes: 15 });
  });
});

describe("napi eseményszűrés", () => {
  test("ismétlődő: hét napja, kezdő- és záródátum, isActive", () => {
    assert.equal(isScheduledOn(item({}), wed), true);
    assert.equal(isScheduledOn(item({ daysOfWeek: [6, 7] }), wed), false);
    assert.equal(isScheduledOn(item({ startDate: "2026-10-15" }), wed), false);
    assert.equal(isScheduledOn(item({ endDate: "2026-10-13" }), wed), false);
    assert.equal(isScheduledOn(item({ startDate: "2026-10-14", endDate: "2026-10-14" }), wed), true);
    assert.equal(isScheduledOn(item({ isActive: false }), wed), false);
    assert.equal(isScheduledOn(item({ daysOfWeek: null }), wed), false);
  });
  test("egyszeri: csak a kezdő napon, inaktívként soha", () => {
    assert.equal(isScheduledOn(item({ scheduleType: "one_time", startDate: "2026-10-14", daysOfWeek: null }), wed), true);
    assert.equal(isScheduledOn(item({ scheduleType: "one_time", startDate: "2026-10-15" }), wed), false);
    assert.equal(isScheduledOn(item({ scheduleType: "one_time", startDate: "2026-10-14", isActive: false }), wed), false);
  });
});

describe("időrend és következő program", () => {
  const list = [
    item({ id: "c", title: "Edzés", timeLocal: "16:30:00" }),
    item({ id: "a", title: "Iskola", timeLocal: "07:45:00", arrivalTimeLocal: "08:00:00" }),
    item({ id: "b", title: "Ebéd", timeLocal: "12:00" }),
    item({ id: "z", title: "Hétvége", timeLocal: "06:00", daysOfWeek: [6] }),
  ];
  test("csak a mai elemek, kezdési idő szerint", () => {
    assert.deepEqual(todayScheduleItems(list, wed).map((i: { id: string }) => i.id), ["a", "b", "c"]);
  });
  test("a következő az első még véget nem ért program", () => {
    const sorted = todayScheduleItems(list, wed);
    assert.equal(nextScheduleItemId(sorted, 7 * 60 + 50), "a"); // úton, érkezés 8:00
    assert.equal(nextScheduleItemId(sorted, 8 * 60 + 1), "b");
    assert.equal(nextScheduleItemId(sorted, 17 * 60), null);
  });
});

describe("jogosultság szerinti megjelenítés", () => {
  const page = read("app/csalad/page.tsx");
  const shell = read("components/family/ChildTodayView.tsx");
  const view = read("components/family/ChildTodayLive.tsx");
  test("gyermekfiók: szerveroldali getLinkedChildSelfView után a Védett Napom, az owner/guardian JSX előtt", () => {
    const child = page.indexOf("return <ChildTodayView child={childSelf}");
    assert.ok(page.indexOf("getLinkedChildSelfView(user.id)") < child && child > 0);
    assert.ok(child < page.indexOf("<FamilyCard"));
  });
  test("gyermeknézet: nincs szerkesztés/törlés/családkezelés, nincs kliens-komponens", () => {
    assert.doesNotMatch(shell, /"use client"/);
    for (const src of [shell, view]) assert.doesNotMatch(src, /ScheduleItemForm|DeleteScheduleItemButton|canManage|lib\/actions|FamilyCard|Invitation/);
  });
  test("Útvonal gomb csak a meglévő buildScheduleRouteHref()-ből", () => {
    assert.match(read("lib/family/travelCard.ts"), /routeHref: buildScheduleRouteHref\(item\),/);
    assert.match(view, /const routeHref = card\.routeHref;/);
    assert.match(view, /\{routeHref && \(\s*<a\s+href=\{routeHref\}/);
    assert.doesNotMatch(view, /\/vedett-utvonal\?/);
  });
});
