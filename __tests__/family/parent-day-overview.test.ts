// VÉDETT CSALÁD — szülői napi áttekintés + értesítési szakaszok (egység- és
// statikus forráskód-tesztek). Valódi Supabase/RLS nincs: a jogosultsági és
// értesítési DB-oldal SQL-tesztekben ellenőrzött.
//   node --test --experimental-strip-types __tests__/family/parent-day-overview.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildParentDayOverview, PARENT_TRAVEL_HINT, PARENT_TRAVEL_LABEL,
} from "../../lib/family/parentDayOverview.ts";
import type { TravelStatusRow } from "../../lib/family/travelStatus.ts";
import { travelNotificationStage, notifyTravelEvent, type TravelNotifyDeps } from "../../lib/family/travelNotify.ts";

const read = (p: string) => readFileSync(p, "utf8");
// 2026-11-04 szerda, 10:00 Budapest (CET, UTC+1).
const NOW = new Date("2026-11-04T09:00:00Z");
const TODAY = "2026-11-04";
const YESTERDAY = "2026-11-03";
const item = (o: Record<string, unknown>) =>
  ({ id: "a", title: "Edzés", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "16:00", arrivalTimeLocal: "16:40", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], originLabel: "Otthon",
    originLat: null, originLon: null, destinationLabel: "Sportcsarnok", destinationLat: null,
    destinationLon: null, isActive: true, ...o }) as never;
const row = (o: Partial<TravelStatusRow>): TravelStatusRow => ({
  child_id: "c1", schedule_item_id: "a", travel_date: TODAY, status: "departed",
  departed_at: "2026-11-04T08:00:00Z", arrived_at: null, help_requested_at: null, updated_at: "2026-11-04T08:00:00Z", ...o,
});
const build = (items: unknown[], rows: TravelStatusRow[], dataAvailable = true) =>
  buildParentDayOverview({ items: items as never, rows, now: NOW, dataAvailable });

describe("szülői napi áttekintés", () => {
  test("több gyermek eltérő napirenddel: gyermekenként külön, a saját soraikból", () => {
    const anna = build(
      [item({ id: "a1", title: "Iskola", timeLocal: "07:30", arrivalTimeLocal: "07:55" }), item({ id: "a2", title: "Úszás", timeLocal: "15:00", arrivalTimeLocal: "15:30" })],
      [row({ child_id: "anna", schedule_item_id: "a1", status: "arrived", arrived_at: "2026-11-04T06:55:00Z", updated_at: "2026-11-04T06:55:00Z" })]
    );
    const bence = build([item({ id: "b1", title: "Zene", daysOfWeek: [1] })], []);
    assert.deepEqual(anna.items.map((i) => [i.id, i.travel.kind]), [["a1", "arrived"], ["a2", "not_started"]]);
    assert.equal(anna.nextItemId, "a2"); // a1 már lezajlott 10:00-kor
    assert.equal(anna.items[1].isNext, true);
    // Bence ma (szerda) nem jár zenére: üres nap, nem hiba.
    assert.equal(bence.items.length, 0);
    assert.equal(bence.nextItemId, null);
    assert.equal(bence.helpActive, false);
  });

  test("elindult, de még nem érkezett: departed, nem vészhelyzet", () => {
    const o = build([item({})], [row({})]);
    assert.equal(o.items[0].travel.kind, "departed");
    assert.equal(o.items[0].travel.departedAt, "2026-11-04T08:00:00Z");
    assert.equal(o.helpActive, false);
    assert.doesNotMatch(PARENT_TRAVEL_HINT.departed + PARENT_TRAVEL_HINT.not_started, /vészhelyzet|riaszt/i);
  });

  test("segítségkérés: kiemelt, de nem segélyhívás", () => {
    const o = build([item({})], [row({ status: "help_requested", help_requested_at: "2026-11-04T08:30:00Z", updated_at: "2026-11-04T08:30:00Z" })]);
    assert.equal(o.items[0].travel.kind, "help_requested");
    assert.equal(o.helpActive, true);
    assert.deepEqual(o.lastEvent, { kind: "help_requested", at: "2026-11-04T08:30:00Z" });
    assert.match(PARENT_TRAVEL_HINT.help_requested, /nem segélyhívás/);
    assert.match(PARENT_TRAVEL_HINT.help_requested, /112/);
  });

  test("előző napi esemény: lezárt tegnapi út nem hat a mára; nyitott út = nincs friss adat", () => {
    const closed = build([item({})], [row({ travel_date: YESTERDAY, status: "arrived", arrived_at: "2026-11-03T16:40:00Z" })]);
    assert.equal(closed.items[0].travel.kind, "not_started");
    const open = build([item({})], [row({ travel_date: YESTERDAY, departed_at: "2026-11-03T15:00:00Z", updated_at: "2026-11-03T15:00:00Z" })]);
    assert.equal(open.items[0].travel.kind, "unknown");
    assert.equal(open.items[0].travel.lastKnown, "departed");
    assert.equal(open.items[0].travel.carriedOver, true);
    // A mai sor elsőbbséget élvez a tegnapi nyitott sorral szemben.
    const both = build([item({})], [row({ travel_date: YESTERDAY }), row({ status: "arrived", arrived_at: "2026-11-04T08:40:00Z" })]);
    assert.equal(both.items[0].travel.kind, "arrived");
  });

  test("tegnapi nyitott út olyan programhoz, amely ma nincs: külön listában, unknown", () => {
    const o = build([], [row({ schedule_item_id: "x", travel_date: YESTERDAY })]);
    assert.equal(o.items.length, 0);
    assert.equal(o.carriedOver.length, 1);
    assert.equal(o.carriedOver[0].travel.kind, "unknown");
    const help = build([], [row({ schedule_item_id: "x", travel_date: YESTERDAY, status: "help_requested", help_requested_at: "2026-11-03T20:00:00Z" })]);
    assert.equal(help.helpActive, true);
  });

  test("hiányzó vagy elavult adat: régi sor figyelmen kívül; betöltési hiba = unknown, sosem not_started", () => {
    const stale = build([item({})], [row({ travel_date: "2026-11-01", status: "help_requested" })]);
    assert.equal(stale.items[0].travel.kind, "not_started");
    assert.equal(stale.helpActive, false);
    assert.equal(stale.lastEvent, null);
    const failed = build([item({})], [row({})], false);
    assert.equal(failed.items[0].travel.kind, "unknown");
    assert.equal(failed.dataAvailable, false);
    assert.equal(failed.lastEvent, null);
  });

  test("késői állapotfrissítés: a legutóbbi esemény az időbélyeg alapján, nem a sorrend alapján", () => {
    const o = build(
      [item({ id: "a1", timeLocal: "07:30" }), item({ id: "a2", timeLocal: "09:00" })],
      [
        row({ schedule_item_id: "a2", departed_at: "2026-11-04T07:50:00Z", updated_at: "2026-11-04T07:50:00Z" }),
        // későn beérkezett, de korábbi út érkezése
        row({ schedule_item_id: "a1", status: "arrived", departed_at: "2026-11-04T06:30:00Z", arrived_at: "2026-11-04T08:10:00Z", updated_at: "2026-11-04T08:10:00Z" }),
      ]
    );
    assert.deepEqual(o.lastEvent, { kind: "arrived", at: "2026-11-04T08:10:00Z" });
    assert.deepEqual(o.items.map((i) => i.travel.kind), ["arrived", "departed"]);
  });

  test("címkék: nincs „biztonságban” állítás, nincs helykövetés", () => {
    const all = Object.values(PARENT_TRAVEL_LABEL).join(" ") + Object.values(PARENT_TRAVEL_HINT).join(" ");
    assert.doesNotMatch(all, /biztonságban van|valós idejű|élő követés|GPS/i);
  });
});

describe("értesítési szakaszok (őszinte címkék)", () => {
  test("szakaszok szétválasztva; „kézbesítve” sosem", () => {
    assert.equal(travelNotificationStage(null).stage, "recorded");
    assert.equal(travelNotificationStage("pending").stage, "prepared");
    assert.equal(travelNotificationStage("sent").stage, "accepted");
    assert.equal(travelNotificationStage("partial").stage, "accepted");
    for (const s of ["no_recipients", "no_subscriptions", "skipped_config"]) assert.equal(travelNotificationStage(s).stage, "not_sent");
    assert.equal(travelNotificationStage("failed").stage, "failed");
    assert.equal(travelNotificationStage("error").stage, "failed");
    assert.equal(travelNotificationStage("delivered").stage, "failed"); // ismeretlen érték: nincs sikerállítás
    for (const s of [null, "pending", "sent", "partial", "failed", "error", "no_recipients", "no_subscriptions", "skipped_config", "x"]) {
      const v = travelNotificationStage(s);
      assert.doesNotMatch(`${v.label} ${v.detail ?? ""}`, /kézbesítve|megkapta|elolvasta/i);
    }
    assert.match(travelNotificationStage("sent").detail ?? "", /nem igazolja vissza/);
  });

  const deps = (over: Partial<TravelNotifyDeps> = {}) => {
    const recorded: unknown[] = [];
    const d: TravelNotifyDeps = {
      claim: async () => ({ notificationId: "n1", recipients: ["u1"] }),
      vapidReady: () => true,
      loadSubscriptions: async () => [{ endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" }, user_id: "u1" }],
      send: async () => {},
      removeSubscription: async () => {},
      recordResult: async (_id, r) => { recorded.push(r); },
      logError: () => {},
      ...over,
    };
    return { d, recorded };
  };

  test("szolgáltatói hiba: failed szakasz, nem sikeres", async () => {
    const { d, recorded } = deps({ send: async () => { throw Object.assign(new Error("x"), { statusCode: 500 }); } });
    const out = await notifyTravelEvent(d, "ts1", "departed");
    assert.equal(out.notified, true);
    const st = (out as { result: { delivery_status: string } }).result.delivery_status;
    assert.equal(st, "failed");
    assert.equal(travelNotificationStage(st).stage, "failed");
    assert.equal(recorded.length, 1);
  });

  test("ismételt értesítés: a második claim null → nincs újraküldés", async () => {
    let claimed = false;
    let sends = 0;
    const { d } = deps({
      claim: async () => (claimed ? null : ((claimed = true), { notificationId: "n1", recipients: ["u1"] })),
      send: async () => { sends++; },
    });
    await notifyTravelEvent(d, "ts1", "arrived");
    const second = await notifyTravelEvent(d, "ts1", "arrived");
    assert.deepEqual(second, { notified: false, reason: "not_claimed" });
    assert.equal(sends, 1);
  });

  test("visszavont gondviselő: ha a DB nem adja címzettnek, nincs küldés", async () => {
    let sends = 0;
    const { d } = deps({ claim: async () => ({ notificationId: "n1", recipients: [] }), send: async () => { sends++; } });
    const out = await notifyTravelEvent(d, "ts1", "help_requested");
    assert.equal((out as { result: { delivery_status: string } }).result.delivery_status, "no_recipients");
    assert.equal(sends, 0);
  });

  test("visszavont gondviselő régi feliratkozása: nem címzett → kiszűrve", async () => {
    const sentTo: string[] = [];
    const { d } = deps({
      loadSubscriptions: async () => [
        { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" }, user_id: "u1" },
        { endpoint: "https://push.example/revoked", keys: { p256dh: "k", auth: "a" }, user_id: "revoked" },
      ],
      send: async (sub) => { sentTo.push(sub.user_id); },
    });
    await notifyTravelEvent(d, "ts1", "departed");
    assert.deepEqual(sentTo, ["u1"]);
  });
});

describe("forráskód: bekötés és adatvédelem", () => {
  test("API rows: csak minimális mezők, nincs cím; jogosulatlan = 401", () => {
    const r = read("app/api/family/travel-status/route.ts");
    const rowsSrc = r.slice(r.indexOf("rows: res.rows.map("), r.indexOf("statuses: Object.fromEntries("));
    for (const f of ["child_id", "schedule_item_id", "travel_date", "status", "departed_at", "arrived_at", "help_requested_at", "updated_at"]) {
      assert.match(rowsSrc, new RegExp(`${f}: r\\.${f}`));
    }
    assert.doesNotMatch(rowsSrc, /title|lat|lon|label/i);
    assert.match(r, /status: 401/);
  });

  test("ChildDayOverview: segítségkérés role=alert, felelősségkizárás, nincs biztonsági állítás", () => {
    const c = read("components/family/ChildDayOverview.tsx");
    assert.match(c, /role="alert"/);
    assert.match(c, /nem helymeghatározás/);
    assert.match(c, /Mára nincs napirendi program\./);
    assert.doesNotMatch(c.replace(/nem jelenti, hogy a gyermek biztonságban van/g, ""), /biztonságban van/);
    assert.doesNotMatch(c, /console\.|localStorage/);
  });

  test("FamilyCard + oldal: az áttekintés be van kötve, az összegzés megmarad", () => {
    const f = read("components/family/FamilyCard.tsx");
    assert.match(f, /<ChildTravelStatusSummary childId=\{child\.id\} status=\{travelStatusByChild\[child\.id\]\} \/>/);
    assert.match(f, /<ChildDayOverview\s+childId=\{child\.id\}/);
    assert.match(f, /initialDataAvailable=\{travelDataAvailable\}/);
    const p = read("app/csalad/page.tsx");
    assert.match(p, /fetchRecentTravelStatuses\(visibleChildIds\)/);
    assert.match(p, /travelDataAvailable=\{travelRes\.ok\}/);
  });

  test("szülői szöveg: értesítésről őszinte, nem állít hamis „nincs értesítés”-t", () => {
    const s = read("components/family/ChildTravelStatusSummary.tsx");
    assert.doesNotMatch(s, /nem megy automatikus értesítés/);
    assert.match(s, /kézbesítést nem tudjuk garantálni/);
  });
});
