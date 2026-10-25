// VÉDETT CSALÁD — élő frissítés + utazási állapot SQL-audit (STATIKUS és
// EGYSÉGTESZTEK; valódi Supabase/RLS integrációs teszt NINCS — ahhoz
// tesztadatbázis kell, lásd a migráció fejlécét).
//   node --test __tests__/family/travel-live-and-audit.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { msUntilNextMinute } from "../../lib/hooks/useVisibleTick.ts";
import { applyTravelAction, parseChildIds, type TravelState } from "../../lib/family/travelStatus.ts";
import { budapestLocalDay, nextScheduleItemId, todayScheduleItems } from "../../lib/family/todaySchedule.ts";

const read = (p: string) => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261014_child_travel_status.sql").replace(/\r\n/g, "\n");
const fnBody = sql.slice(sql.indexOf("create or replace function public.set_child_travel_status"));

describe("egység: időzítés és napváltás", () => {
  test("perchatárra igazított késleltetés", () => {
    assert.equal(msUntilNextMinute(Date.UTC(2026, 9, 14, 7, 0, 0, 0)), 60_050);
    assert.equal(msUntilNextMinute(Date.UTC(2026, 9, 14, 7, 0, 59, 500)), 550);
  });
  test("éjfélkor (budapesti idő) új napi lista és új következő program", () => {
    const item = (id: string, days: number[], t: string) =>
      ({ id, title: id, description: null, scheduleType: "recurring", startDate: null, endDate: null, timeLocal: t,
        arrivalTimeLocal: null, daysOfWeek: days, originLabel: null, destinationLabel: null, originLat: null,
        originLon: null, destinationLat: null, destinationLon: null, isActive: true }) as never;
    const list = [item("sze", [3], "08:00"), item("csu", [4], "07:30")];
    const before = budapestLocalDay(new Date("2026-10-14T23:59:00+02:00"));
    const after = budapestLocalDay(new Date("2026-10-15T00:00:00+02:00"));
    assert.deepEqual(todayScheduleItems(list, before).map((i: { id: string }) => i.id), ["sze"]);
    assert.equal(nextScheduleItemId(todayScheduleItems(list, before), before.minutes), null);
    assert.equal(nextScheduleItemId(todayScheduleItems(list, after), after.minutes), "csu");
  });
  test("child ids paraméter: csak UUID, max 50, duplikátum nélkül", () => {
    const u = "11111111-1111-4111-8111-111111111111";
    assert.deepEqual(parseChildIds(`${u},${u}`), [u]);
    assert.equal(parseChildIds("abc"), null);
    assert.equal(parseChildIds(null), null);
    assert.equal(parseChildIds(Array(51).fill(0).map((_, i) => u.slice(0, -2) + String(i).padStart(2, "0")).join(",")), null);
  });
  test("segítségkérés időpontja megérkezés után is megmarad (TS)", () => {
    const h = applyTravelAction(null, "help", "T1") as { ok: true; state: TravelState };
    const a = applyTravelAction(h.state, "arrive", "T2") as { ok: true; state: TravelState };
    assert.equal(a.state.status, "arrived");
    assert.equal(a.state.helpRequestedAt, "T1");
  });
});

describe("statikus: élő frissítés", () => {
  test("gyermeknézet: egyetlen óra, hydration-biztos kezdőérték", () => {
    const live = read("components/family/ChildTodayLive.tsx");
    assert.match(live, /useState\(\(\) => new Date\(nowIso\)\)/);
    assert.equal((live.match(/useVisibleTick\(/g) ?? []).length, 1);
    assert.doesNotMatch(live + read("components/family/DepartureAlerts.tsx"), /setInterval|setTimeout/);
    assert.match(live, /const travel = resolveItemTravelState\(travelRows, item\.id, day\.date\);/);
  });
  test("szülői polling: 45 mp, csak látható lapon, hiba esetén a régi adat marad", () => {
    const p = read("components/family/TravelStatusLive.tsx");
    assert.match(p, /TRAVEL_POLL_MS = 45_000/);
    assert.match(p, /useVisibleTick\(poll, \(\) => TRAVEL_POLL_MS, \{ immediate: false \}\)/);
    assert.match(p, /setLive\(\(prev\) => \(\{ \.\.\.prev, failed: true \}\)\)/);
    const s = read("components/family/ChildTravelStatusSummary.tsx");
    assert.match(s, /Ez nem vészhelyzeti értesítés\./);
    assert.match(s, /Útközben segítséget kért/);
    assert.doesNotMatch(s, /élő követés|valós idejű/i);
  });
  test("API: bejelentkezés kötelező, validált bemenet, RLS-en át olvas, no-store", () => {
    const r = read("app/api/family/travel-status/route.ts");
    assert.match(r, /if \(!user\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401/);
    assert.match(r, /parseChildIds\(/);
    assert.match(r, /if \(!res\.ok\) return NextResponse\.json\(\{ ok: false \}, \{ status: 503/);
    assert.match(r, /"Cache-Control": "no-store"/);
    assert.doesNotMatch(r, /service_role|createAdminClient|console\./);
    assert.doesNotMatch(r, /^export (const|function) (?!dynamic|GET)/m);
  });
});

describe("statikus: SQL-audit (nem DB-integrációs teszt)", () => {
  test("SECURITY DEFINER zárt search_path-tal, anon/public végrehajtás visszavonva", () => {
    assert.match(fnBody, /security definer\s+set search_path = public, pg_temp/);
    assert.match(sql, /revoke all on function public\.set_child_travel_status\(uuid, text\) from public, anon;/);
  });
  test("gyermekhez kötött sorválasztás, tegnapi nyitott út lezárható, új sor csak aktív mai eseményhez", () => {
    assert.match(fnBody, /and child_id = v_child_id\s+and \(\s+travel_date = v_today\s+or \(p_action <> 'depart' and travel_date = v_today - 1 and status <> 'arrived'\)/);
    const creation = fnBody.slice(fnBody.indexOf("if not found then\n    if p_action = 'arrive'"), fnBody.indexOf("on conflict"));
    assert.match(creation, /if not v_item\.is_active then/);
    assert.match(creation, /raise exception 'travel_not_today'/);
  });
  test("help_requested_at sosem nullázódik; lezárt út nem nyílik újra", () => {
    assert.doesNotMatch(fnBody, /help_requested_at = null/);
    assert.match(fnBody, /if v_row\.status = 'arrived' then\s+raise exception 'travel_closed';/);
  });
  test("SQL és TS átmenetek: ismételt depart/help nem ír felül", () => {
    assert.match(fnBody, /if v_row\.departed_at is null then/);
    assert.match(fnBody, /elsif v_row\.status <> 'help_requested' then/);
  });
});
