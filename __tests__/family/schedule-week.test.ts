// VÉDETT CSALÁD — gyermekenkénti napi/heti napirend-nézet
//   node --test --experimental-strip-types __tests__/family/schedule-week.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDays,
  buildDaySchedule,
  buildWeekSchedule,
  formatShortDateHu,
  weekOf,
} from "../../lib/family/scheduleWeek.ts";

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

describe("naptári segédfüggvények", () => {
  test("addDays hónap- és évhatáron, DST-váltás napján is", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-10-25", 1), "2026-10-26"); // téli időszámítás kezdete
    assert.throws(() => addDays("2026-13", 1));
  });
  test("weekOf: hétfőtől vasárnapig, a mai nap a helyén", () => {
    const w = weekOf(wed);
    assert.deepEqual(w.map((d) => d.date), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    assert.deepEqual(w.map((d) => d.weekday), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(weekOf({ date: "2026-10-18", weekday: 7 })[0], { date: "2026-10-12", weekday: 1 });
    assert.deepEqual(weekOf({ date: "2026-10-12", weekday: 1 })[6], { date: "2026-10-18", weekday: 7 });
    assert.throws(() => weekOf({ date: "2026-10-14", weekday: 0 }));
  });
  test("rövid magyar dátum", () => {
    assert.equal(formatShortDateHu("2026-10-30"), "okt. 30.");
    assert.equal(formatShortDateHu("2026-01-05"), "jan. 5.");
  });
});

describe("napi nézet", () => {
  test("csak a mai elemek, időrendben; inaktív és más napi kimarad", () => {
    const day = buildDaySchedule(
      [
        item({ id: "late", timeLocal: "16:00" }),
        item({ id: "early", timeLocal: "07:30" }),
        item({ id: "weekend", daysOfWeek: [6, 7] }),
        item({ id: "off", isActive: false }),
        item({ id: "once-today", scheduleType: "one_time", startDate: "2026-10-14", daysOfWeek: null, timeLocal: "12:00" }),
        item({ id: "once-other", scheduleType: "one_time", startDate: "2026-10-15", daysOfWeek: null }),
      ],
      wed
    );
    assert.equal(day.isToday, true);
    assert.deepEqual(day.items.map((i: { id: string }) => i.id), ["early", "once-today", "late"]);
  });
  test("üres napirend: üres lista, nem hiba", () => {
    assert.deepEqual(buildDaySchedule([], wed).items, []);
  });
});

describe("heti nézet", () => {
  test("ismétlődő, egyszeri, kezdő-/záródátum és inaktív elemek napokra vetítve", () => {
    const week = buildWeekSchedule(
      [
        item({ id: "school" }), // H–P
        item({ id: "sport", daysOfWeek: [2, 4], timeLocal: "17:00" }),
        item({ id: "starts-thu", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: "2026-10-15", timeLocal: "19:00" }),
        item({ id: "ends-tue", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], endDate: "2026-10-13", timeLocal: "06:00" }),
        item({ id: "once-sat", scheduleType: "one_time", startDate: "2026-10-17", daysOfWeek: null, timeLocal: "10:00" }),
        item({ id: "once-next-week", scheduleType: "one_time", startDate: "2026-10-19", daysOfWeek: null }),
        item({ id: "off", isActive: false, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }),
      ],
      wed
    );
    const ids = (i: number) => week[i].items.map((x: { id: string }) => x.id);
    assert.deepEqual(ids(0), ["ends-tue", "school"]); // hétfő
    assert.deepEqual(ids(1), ["ends-tue", "school", "sport"]); // kedd
    assert.deepEqual(ids(2), ["school"]); // szerda (ma)
    assert.deepEqual(ids(3), ["school", "sport", "starts-thu"]); // csütörtök
    assert.deepEqual(ids(4), ["school", "starts-thu"]); // péntek
    assert.deepEqual(ids(5), ["once-sat", "starts-thu"]); // szombat
    assert.deepEqual(ids(6), ["starts-thu"]); // vasárnap
    assert.deepEqual(week.map((d) => d.isToday), [false, false, true, false, false, false, false]);
  });
  test("a heti és a napi nézet a mai napon azonos elemeket ad", () => {
    const items = [item({ id: "a" }), item({ id: "b", timeLocal: "06:00" }), item({ id: "c", daysOfWeek: [6] })];
    assert.deepEqual(
      buildWeekSchedule(items, wed)[2].items.map((x: { id: string }) => x.id),
      buildDaySchedule(items, wed).items.map((x: { id: string }) => x.id)
    );
  });
});

describe("bekötés és hozzáférhetőség (forrás-szint)", () => {
  const comp = read("components/family/ChildWeekSchedule.tsx");
  const section = read("components/family/ChildScheduleSection.tsx");
  test("a nézetváltó gombok aria-pressed állapotot és 44px érintési felületet kapnak", () => {
    assert.match(comp, /aria-pressed=\{mode === "day"\}/);
    assert.match(comp, /aria-pressed=\{mode === "week"\}/);
    assert.match(comp, /min-h-\[44px\]/);
  });
  test("üres állapotok magyarul, napi és heti nézetben is", () => {
    assert.match(comp, /Ma nincs \{childName\} napirendjében program\./);
    assert.match(comp, /Ezen a héten nincs \{childName\} napirendjében program\./);
    assert.match(comp, /Nincs program\./);
  });
  test("a komponens nem kér le és nem ír adatot (csak a szerveroldali, RLS-szűrt elemeket jeleníti meg)", () => {
    assert.doesNotMatch(comp, /fetch\(|createClient|supabase|use server|\/api\//);
  });
  test("a szekcióba bekötve, a meglévő szerkesztő lista megmarad", () => {
    assert.match(section, /<ChildWeekSchedule childName=\{child\.firstName\} items=\{child\.scheduleItems\} \/>/);
    assert.match(section, /<ScheduleItemForm/);
    assert.match(section, /<DeleteScheduleItemButton/);
    assert.match(section, /aria-expanded=\{false\}/);
  });
});
