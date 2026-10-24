// VÉDETT CSALÁD — audit-tesztek (EGYSÉG + STATIKUS). Valódi Supabase RLS/RPC
// integrációs teszt NINCS: ezek a pontok tesztadatbázison még ellenőrizendők.
//   node --test __tests__/family/family-audit.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budapestLocalDay, todayDepartureAlerts } from "../../lib/family/todaySchedule.ts";
import { latestTravelByChild, travelErrorCode } from "../../lib/family/travelStatus.ts";

const read = (p: string) => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261014_child_travel_status.sql");
const item = (o: Record<string, unknown>) =>
  ({ id: "a", title: "T", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "08:00", arrivalTimeLocal: null, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], originLabel: null,
    originLat: null, originLon: null, destinationLabel: null, destinationLat: null, destinationLon: null,
    isActive: true, ...o }) as never;

describe("egység: időszámítás-váltás (Europe/Budapest)", () => {
  test("őszi váltás napja (2026-10-25): 08:00 előtt 10 perccel jelez, helyi idő szerint", () => {
    assert.deepEqual(budapestLocalDay(new Date("2026-10-25T06:50:00Z")), { date: "2026-10-25", weekday: 7, minutes: 7 * 60 + 50 });
    assert.deepEqual(todayDepartureAlerts([item({})], new Date("2026-10-25T06:50:00Z")), [{ itemId: "a", level: "10", minutesLeft: 10 }]);
  });
  test("tavaszi váltás napja (2026-03-29): UTC+2", () => {
    assert.equal(budapestLocalDay(new Date("2026-03-29T05:55:00Z")).minutes, 7 * 60 + 55);
  });
});

describe("egység: többgyermekes család", () => {
  test("gyermekenként külön legfrissebb állapot, egymást nem írják felül", () => {
    const m = latestTravelByChild([
      { child_id: "c1", updated_at: "2026-10-14T07:00:00Z", status: "arrived" },
      { child_id: "c2", updated_at: "2026-10-14T07:05:00Z", status: "help_requested" },
      { child_id: "c1", updated_at: "2026-10-14T06:00:00Z", status: "departed" },
    ]);
    assert.equal(m.get("c1")?.status, "arrived");
    assert.equal(m.get("c2")?.status, "help_requested");
  });
  test("API-hibakódok: ismeretlen hiba nem lesz sikeres állapot", () => {
    assert.equal(travelErrorCode(undefined), "travel_unknown");
    assert.equal(travelErrorCode("JWT expired"), "travel_unknown");
  });
});

describe("statikus: migráció és jogosultságok", () => {
  test("tábla: FK cascade, egyediség, index, RLS, public/anon visszavonás, csak SELECT", () => {
    assert.match(sql, /references public\.child_profiles \(id\) on delete cascade/);
    assert.match(sql, /references public\.child_schedule_items \(id\) on delete cascade/);
    assert.match(sql, /create index if not exists child_travel_statuses_child_updated_idx/);
    assert.match(sql, /revoke all on public\.child_travel_statuses from public;/);
    assert.match(sql, /grant select on public\.child_travel_statuses to authenticated;/);
    assert.match(sql, /grant execute on function public\.set_child_travel_status\(uuid, text\) to authenticated;/);
  });
  test("idempotens újrafuttatás és visszaállítási lépések", () => {
    assert.match(sql, /create table if not exists public\.child_travel_statuses/);
    assert.match(sql, /drop policy if exists "child_travel_statuses_select_via_family"/);
    assert.match(sql, /create or replace function public\.set_child_travel_status/);
    assert.match(sql, /drop table if exists public\.child_travel_statuses;/);
  });
  test("gyermekazonosító SOHA nem a klienstől jön: az RPC a hívó fiókjából vezeti le", () => {
    assert.doesNotMatch(sql, /p_child_id/);
    assert.match(sql, /select ca\.child_id into v_child_id/);
    const action = read("lib/actions/travelStatus.ts");
    assert.doesNotMatch(action, /childId|child_id/);
  });
  test("gondviselő: aktív jogosultság ÉS aktív guardian tagság kell; visszavont/inaktív kiesik", () => {
    assert.match(sql, /gcp\.status = 'active'/);
    assert.match(sql, /fm\.status = 'active'/);
    assert.match(sql, /ca\.status = 'active'/);
  });
  test("szülői lekérdezés: időablak (adatminimalizálás) és többgyermekes limit", () => {
    const d = read("lib/family/travelStatusData.ts");
    assert.match(d, /\.gte\("travel_date", previousDate\(budapestLocalDay\(new Date\(\)\)\.date\)\)/);
    assert.match(d, /\.limit\(500\)/);
  });
});
