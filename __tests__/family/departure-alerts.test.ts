// VÉDETT NAPOM — indulás előtti figyelmeztetések
//   node --test __tests__/family/departure-alerts.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { departureAlertLevel, todayDepartureAlerts } from "../../lib/family/todaySchedule.ts";

const item = (o: Record<string, unknown>) =>
  ({
    id: "x", title: "T", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "08:00:00", arrivalTimeLocal: null, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], originLabel: null,
    destinationLabel: null, originLat: null, originLon: null, destinationLat: null, destinationLon: null,
    isActive: true, ...o,
  }) as never;
// 2026-10-14 (szerda) budapesti idő = UTC+2 (nyári idő)
const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+02:00`);

describe("időablakok", () => {
  test("határok: 15–11, 10–6, 5–1, 0; kívül nincs", () => {
    const exp: Array<[number, string | null]> = [
      [16, null], [15, "15"], [11, "15"], [10, "10"], [6, "10"], [5, "5"], [1, "5"], [0, "now"], [-1, null],
    ];
    for (const [m, l] of exp) assert.equal(departureAlertLevel(m), l, String(m));
  });
  test("eseményenként egy figyelmeztetés, budapesti idő szerint", () => {
    const list = [item({ id: "a", timeLocal: "08:00:00" }), item({ id: "b", timeLocal: "07:55" })];
    assert.deepEqual(todayDepartureAlerts(list, at("07:50")), [
      { itemId: "b", level: "5", minutesLeft: 5 },
      { itemId: "a", level: "10", minutesLeft: 10 },
    ]);
    assert.deepEqual(todayDepartureAlerts(list, at("08:00")), [{ itemId: "a", level: "now", minutesLeft: 0 }]);
  });
  test("inaktív, más napra szóló vagy lejárt esemény nem jelez", () => {
    const list = [
      item({ id: "i", isActive: false }),
      item({ id: "d", daysOfWeek: [6] }),
      item({ id: "e", endDate: "2026-10-13" }),
      item({ id: "o", scheduleType: "one_time", startDate: "2026-10-15" }),
    ];
    assert.deepEqual(todayDepartureAlerts(list, at("07:55")), []);
  });
});

describe("napváltás", () => {
  test("23:55-kor nem jelez a holnapi 00:05-ös egyszeri eseményre, éjfél után igen", () => {
    const list = [item({ id: "n", scheduleType: "one_time", startDate: "2026-10-15", timeLocal: "00:05", daysOfWeek: null })];
    assert.deepEqual(todayDepartureAlerts(list, new Date("2026-10-14T23:55:00+02:00")), []);
    assert.deepEqual(todayDepartureAlerts(list, new Date("2026-10-15T00:00:00+02:00")), [{ itemId: "n", level: "5", minutesLeft: 5 }]);
  });
  test("UTC-éjfél nem budapesti napváltás (22:00Z = 00:00 helyi)", () => {
    const list = [item({ id: "w", daysOfWeek: [4], timeLocal: "00:10" })]; // csütörtök
    assert.deepEqual(todayDepartureAlerts(list, new Date("2026-10-14T22:00:00Z")), [{ itemId: "w", level: "10", minutesLeft: 10 }]);
  });
});

describe("komponens", () => {
  const c = readFileSync("components/family/DepartureAlerts.tsx", "utf8");
  test("percenként frissít, rejtett lapon nem ütemez, unmountkor leáll, meglévő útvonallinkkel", () => {
    // Saját időzítő nincs: az órát a ChildTodayLive egyetlen useVisibleTick-je adja.
    assert.doesNotMatch(c, /setTimeout|setInterval|useEffect/);
    const h = readFileSync("lib/hooks/useVisibleTick.ts", "utf8");
    assert.match(h, /return 60_000 - \(nowMs % 60_000\) \+ 50;/);
    assert.match(h, /if \(stopped \|\| document\.visibilityState === "hidden"\) return;/);
    assert.match(h, /return \(\) => \{\s*stopped = true;\s*if \(timer\) clearTimeout\(timer\);\s*document\.removeEventListener/);
    assert.match(c, /buildScheduleRouteHref\(item\)/);
    assert.doesNotMatch(c, /console\.|fetch\(|Notification/);
  });
  test("a gyermeknézet beköti", () => {
    assert.match(readFileSync("components/family/ChildTodayLive.tsx", "utf8"), /<DepartureAlerts items=\{child\.scheduleItems\} now=\{now\} \/>/);
  });
});
