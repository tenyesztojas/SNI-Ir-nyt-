// VÉDETT CSALÁD — gyermek utazási állapotok
//   node --test __tests__/family/travel-status.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyTravelAction,
  availableTravelActions,
  latestTravelByChild,
  travelErrorCode,
  type TravelState,
} from "../../lib/family/travelStatus.ts";

const read = (p: string) => readFileSync(p, "utf8");
const T1 = "2026-10-14T07:00:00Z";
const T2 = "2026-10-14T07:30:00Z";
const ok = (r: ReturnType<typeof applyTravelAction>) => {
  assert.equal(r.ok, true);
  return r as { ok: true; state: TravelState; changed: boolean };
};

describe("állapotátmenetek", () => {
  test("indulás -> megérkezés", () => {
    const a = ok(applyTravelAction(null, "depart", T1));
    assert.equal(a.state.status, "departed");
    assert.equal(a.state.departedAt, T1);
    const b = ok(applyTravelAction(a.state, "arrive", T2));
    assert.equal(b.state.status, "arrived");
    assert.equal(b.state.arrivedAt, T2);
  });
  test("indulás nélkül nincs megérkezés", () => {
    assert.deepEqual(applyTravelAction(null, "arrive", T1), { ok: false, error: "travel_not_departed" });
  });
  test("segítségkérés megkülönböztetett állapot, és megmarad indulás után is", () => {
    const h = ok(applyTravelAction(null, "help", T1));
    assert.equal(h.state.status, "help_requested");
    const d = ok(applyTravelAction(h.state, "depart", T2));
    assert.equal(d.state.status, "help_requested");
    assert.equal(d.state.departedAt, T2);
    assert.equal(ok(applyTravelAction(d.state, "arrive", T2)).state.status, "arrived");
  });
  test("lezárt utazás nem indul újra, semmilyen művelettel", () => {
    const done = ok(applyTravelAction(ok(applyTravelAction(null, "depart", T1)).state, "arrive", T2)).state;
    for (const a of ["depart", "arrive", "help"] as const) {
      assert.deepEqual(applyTravelAction(done, a, T2), { ok: false, error: "travel_closed" });
    }
    assert.deepEqual(availableTravelActions(done), []);
  });
});

describe("ismételt műveletek", () => {
  test("dupla „Elindultam” és dupla segítségkérés nem írja felül az időpontot", () => {
    const a = ok(applyTravelAction(null, "depart", T1)).state;
    const again = ok(applyTravelAction(a, "depart", T2));
    assert.equal(again.changed, false);
    assert.equal(again.state.departedAt, T1);
    const h = ok(applyTravelAction(a, "help", T1)).state;
    const h2 = ok(applyTravelAction(h, "help", T2));
    assert.equal(h2.changed, false);
    assert.equal(h2.state.helpRequestedAt, T1);
  });
  test("elérhető gombok állapotonként", () => {
    assert.deepEqual(availableTravelActions(null), ["depart", "help"]);
    const d = ok(applyTravelAction(null, "depart", T1)).state;
    assert.deepEqual(availableTravelActions(d), ["arrive", "help"]);
    assert.deepEqual(availableTravelActions(ok(applyTravelAction(null, "help", T1)).state), ["depart", "arrive"]);
  });
  test("kliens: szinkron zár + letiltás a kérés alatt", () => {
    const c = read("components/family/TravelStatusControls.tsx");
    assert.match(c, /if \(busy\.current\) return;\s*busy\.current = true;/);
    assert.match(c, /disabled=\{pending\}/);
  });
});

describe("jogosultság és adatvédelem (migráció + szerverakció)", () => {
  const sql = read("supabase/migrations/20261014_child_travel_status.sql");
  test("RLS bekapcsolva, csak SELECT policy, közvetlen írás visszavonva, anon semmi", () => {
    assert.match(sql, /alter table public\.child_travel_statuses enable row level security;/);
    assert.match(sql, /revoke all on public\.child_travel_statuses from anon;/);
    assert.match(sql, /revoke insert, update, delete on public\.child_travel_statuses from authenticated;/);
    assert.doesNotMatch(sql, /on public\.child_travel_statuses\s+for (insert|update|delete|all)\b/);
  });
  test("írás csak a hívó SAJÁT aktív gyermekfiókjával, saját aktív, mai eseményére", () => {
    assert.match(sql, /where ca\.auth_user_id = v_uid and ca\.status = 'active'/);
    assert.match(sql, /where id = p_schedule_item_id and child_id = v_child_id/);
    assert.match(sql, /not v_item\.is_active/);
    assert.match(sql, /now\(\) at time zone 'Europe\/Budapest'/);
    assert.match(sql, /raise exception 'travel_closed'/);
    assert.match(sql, /revoke all on function public\.set_child_travel_status\(uuid, text\) from public, anon;/);
  });
  test("dátum szerinti elkülönítés és nincs helyadat", () => {
    assert.match(sql, /unique \(schedule_item_id, travel_date\)/);
    assert.doesNotMatch(sql, /\b(lat|lon|latitude|longitude|location)\b\s+(numeric|double|float|real)/i);
  });
  test("szülő/gondviselő olvasás a napirend SELECT policy mintájával", () => {
    assert.match(sql, /public\.is_child_family_owner\(child_id\)/);
    assert.match(sql, /\(gcp\.can_view_schedule or gcp\.can_manage_schedule\)/);
    assert.match(sql, /fm\.role = 'guardian'\s*and fm\.status = 'active'/);
  });
  test("szerverakció: bemenet-validáció, RPC, nincs logolás", () => {
    const a = read("lib/actions/travelStatus.ts");
    assert.match(a, /^"use server";/);
    assert.match(a, /supabase\.rpc\("set_child_travel_status"/);
    assert.match(a, /UUID_RE\.test\(scheduleItemId\)/);
    assert.doesNotMatch(a, /console\./);
  });
  test("hibakód-leképezés", () => {
    assert.equal(travelErrorCode('P0001: travel_closed'), "travel_closed");
    assert.equal(travelErrorCode("permission denied"), "travel_unknown");
  });
});

describe("megjelenítés", () => {
  test("gyermek: gombok a Védett Napomban; szülő: legfrissebb jelzés, nincs „élő követés”", () => {
    assert.match(read("components/family/ChildTodayLive.tsx"), /<TravelStatusControls\s+key=\{`\$\{item\.id\}\|\$\{day\.date\}`\}\s+scheduleItemId=\{item\.id\}/);
    const s = read("components/family/ChildTravelStatusSummary.tsx");
    assert.doesNotMatch(s, /élő követés|valós idejű/i);
    assert.match(read("components/family/FamilyCard.tsx"), /<ChildTravelStatusSummary childId=\{child\.id\} status=\{travelStatusByChild\[child\.id\]\} \/>/);
  });
  test("legfrissebb sor gyermekenként", () => {
    const m = latestTravelByChild([
      { child_id: "a", updated_at: "2026-10-14T07:00:00Z" },
      { child_id: "a", updated_at: "2026-10-14T08:00:00Z" },
      { child_id: "b", updated_at: "2026-10-13T08:00:00Z" },
    ]);
    assert.equal(m.get("a")?.updated_at, "2026-10-14T08:00:00Z");
    assert.equal(m.size, 2);
  });
});
