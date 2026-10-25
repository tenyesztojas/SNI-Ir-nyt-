// Gyermekutazási push-értesítések — célzott tesztek (DB nélkül; a DB-oldali
// címzett-/duplikáció-/jogosultság-logikát a supabase/tests/
// child_travel_notifications_test.sql ellenőrzi scratch Postgresen).
//   node --test --experimental-strip-types __tests__/family/travel-push.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTravelPushPayload,
  notifyTravelEvent,
  travelNotifyEventFor,
  travelPushOptions,
  TRAVEL_PUSH_TEXT,
  type PushSubscriptionRow,
  type TravelNotifyDeps,
  type TravelNotifyResult,
} from "../../lib/family/travelNotify.ts";

const read = (p: string) => readFileSync(p, "utf8");
const ID = "11111111-2222-4333-8444-555555555555";
const NID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const sub = (user_id: string, n = 1): PushSubscriptionRow => ({
  endpoint: `https://push.example/${user_id}/${n}`,
  keys: { p256dh: "p", auth: "a" },
  user_id,
});

function fakeDeps(over: Partial<TravelNotifyDeps> = {}) {
  const log: { sent: Array<{ sub: PushSubscriptionRow; payload: string; opts: unknown }>; removed: string[]; results: TravelNotifyResult[]; errors: string[] } =
    { sent: [], removed: [], results: [], errors: [] };
  const deps: TravelNotifyDeps = {
    claim: async () => ({ notificationId: NID, recipients: ["owner", "guardian"] }),
    vapidReady: () => true,
    loadSubscriptions: async () => [sub("owner"), sub("guardian")],
    send: async (s, payload, opts) => void log.sent.push({ sub: s, payload, opts }),
    removeSubscription: async (s) => void log.removed.push(s.endpoint),
    recordResult: async (_id, r) => void log.results.push(r),
    logError: (m) => void log.errors.push(m),
    ...over,
  };
  return { deps, log };
}

describe("eseményjelölt a sikeres RPC-sorból", () => {
  const row = { id: ID, status: "departed", departed_at: "t", arrived_at: null, help_requested_at: null };
  test("akció -> esemény, csak ha a DB-sor szerint megtörtént", () => {
    assert.equal(travelNotifyEventFor("depart", row), "departed");
    assert.equal(travelNotifyEventFor("arrive", row), null);
    assert.equal(travelNotifyEventFor("help", row), null);
    assert.equal(travelNotifyEventFor("arrive", { ...row, status: "arrived", arrived_at: "t" }), "arrived");
    assert.equal(travelNotifyEventFor("help", { ...row, status: "help_requested", help_requested_at: "t" }), "help_requested");
  });
  test("hiányzó/hibás sorazonosító -> nincs értesítés", () => {
    assert.equal(travelNotifyEventFor("depart", null), null);
    assert.equal(travelNotifyEventFor("depart", { ...row, id: undefined }), null);
    assert.equal(travelNotifyEventFor("depart", { ...row, id: "x' or 1=1" }), null);
  });
});

describe("payload: adatminimalizálás, nincs garancia-ígéret", () => {
  test("csak általános szöveg, url és átlátszatlan tag", () => {
    for (const ev of ["departed", "arrived", "help_requested"] as const) {
      const p = buildTravelPushPayload(ev, NID);
      assert.deepEqual(Object.keys(p).sort(), ["body", "requireInteraction", "tag", "title", "url"]);
      assert.equal(p.url, "/csalad");
      assert.equal(p.tag, `family-travel-${NID}`);
      const text = `${p.title} ${p.body}`;
      assert.doesNotMatch(text, /garant|biztosan|azonnal|kézbesít|értesítettük|segítség (úton|érkezik)/i);
    }
  });
  test("segítségkérés kiemelt, és kimondja: nem segélyhívás", () => {
    const p = buildTravelPushPayload("help_requested", NID);
    assert.equal(p.requireInteraction, true);
    assert.match(p.title, /segítségkérés/);
    assert.match(p.body, /nem segélyhívás/);
    assert.match(p.body, /112/);
    assert.equal(travelPushOptions("help_requested").urgency, "high");
    assert.equal(buildTravelPushPayload("departed", NID).requireInteraction, false);
    assert.equal(travelPushOptions("departed").urgency, "normal");
    assert.match(TRAVEL_PUSH_TEXT.departed.body, /elindult/);
    assert.match(TRAVEL_PUSH_TEXT.arrived.body, /megérkezett/);
  });
});

describe("notifyTravelEvent", () => {
  test("csak a DB által visszaadott címzettek feliratkozásai kapnak üzenetet", async () => {
    const { deps, log } = fakeDeps({
      loadSubscriptions: async () => [sub("owner"), sub("guardian"), sub("stranger")],
    });
    const out = await notifyTravelEvent(deps, ID, "departed");
    assert.ok(out.notified);
    assert.deepEqual(log.sent.map((s) => s.sub.user_id).sort(), ["guardian", "owner"]);
    assert.equal(log.results[0].delivery_status, "sent");
    assert.equal(log.results[0].sent_count, 2);
    const payload = JSON.parse(log.sent[0].payload);
    assert.doesNotMatch(JSON.stringify(payload), new RegExp(`${ID}|owner|guardian`));
  });
  test("ismételt esemény (claim null) -> semmi nem megy ki, nincs eredményírás", async () => {
    const { deps, log } = fakeDeps({ claim: async () => null });
    const out = await notifyTravelEvent(deps, ID, "help_requested");
    assert.deepEqual(out, { notified: false, reason: "not_claimed" });
    assert.equal(log.sent.length, 0);
    assert.equal(log.results.length, 0);
  });
  test("párhuzamos hívások: csak a claim nyertese küld", async () => {
    let first = true;
    const { deps, log } = fakeDeps({
      claim: async () => (first ? ((first = false), { notificationId: NID, recipients: ["owner"] }) : null),
      loadSubscriptions: async () => [sub("owner")],
    });
    await Promise.all([notifyTravelEvent(deps, ID, "help_requested"), notifyTravelEvent(deps, ID, "help_requested")]);
    assert.equal(log.sent.length, 1);
  });
  test("claim hiba -> nem dob, naplóz, nem küld", async () => {
    const { deps, log } = fakeDeps({ claim: async () => { throw Object.assign(new Error("db"), { code: "42501" }); } });
    const out = await notifyTravelEvent(deps, ID, "departed");
    assert.deepEqual(out, { notified: false, reason: "claim_error" });
    assert.equal(log.sent.length, 0);
    assert.equal(log.errors.length, 1);
  });
  test("részleges kézbesítési hiba: rögzítve; lejárt (410/404) feliratkozás törlődik", async () => {
    const { deps, log } = fakeDeps({
      loadSubscriptions: async () => [sub("owner", 1), sub("owner", 2), sub("guardian")],
      send: async (s) => {
        if (s.endpoint.endsWith("/2")) throw { statusCode: 410 };
        if (s.user_id === "guardian") throw { statusCode: 500 };
      },
    });
    const out = await notifyTravelEvent(deps, ID, "arrived");
    assert.ok(out.notified);
    const r = log.results[0];
    assert.equal(r.delivery_status, "partial");
    assert.equal(r.sent_count, 1);
    assert.equal(r.failed_count, 2);
    assert.equal(r.removed_count, 1);
    assert.deepEqual(log.removed, ["https://push.example/owner/2"]);
    assert.match(r.last_error ?? "", /push_status_410x1/);
    assert.doesNotMatch(r.last_error ?? "", /https?:/);
    assert.ok(log.errors.some((e) => /delivery problem/.test(e)));
  });
  test("minden küldés hibás -> failed; dobó függőségek sem jutnak ki", async () => {
    const { deps, log } = fakeDeps({
      send: async () => { throw new Error("net"); },
      recordResult: async () => { throw new Error("db down"); },
      logError: () => { throw new Error("log down"); },
    });
    const out = await notifyTravelEvent(deps, ID, "departed");
    assert.ok(out.notified && out.result.delivery_status === "failed");
    assert.equal(log.sent.length, 0);
  });
  test("nincs címzett / nincs feliratkozás / nincs VAPID -> rögzített, nem küld", async () => {
    let r = fakeDeps({ claim: async () => ({ notificationId: NID, recipients: [] }) });
    await notifyTravelEvent(r.deps, ID, "departed");
    assert.equal(r.log.results[0].delivery_status, "no_recipients");
    r = fakeDeps({ loadSubscriptions: async () => [] });
    await notifyTravelEvent(r.deps, ID, "departed");
    assert.equal(r.log.results[0].delivery_status, "no_subscriptions");
    r = fakeDeps({ vapidReady: () => false });
    await notifyTravelEvent(r.deps, ID, "help_requested");
    assert.equal(r.log.results[0].delivery_status, "skipped_config");
    assert.equal(r.log.sent.length, 0);
  });
  test("feliratkozás-betöltési hiba -> error, nem dob", async () => {
    const { deps, log } = fakeDeps({ loadSubscriptions: async () => { throw new Error("x"); } });
    const out = await notifyTravelEvent(deps, ID, "departed");
    assert.ok(out.notified && out.result.delivery_status === "error");
    assert.equal(log.results[0].last_error, "internal_error");
  });
});

describe("bekötés és migráció (statikus)", () => {
  const action = read("lib/actions/travelStatus.ts");
  const server = read("lib/family/travelPushServer.ts");
  const sql = read("supabase/migrations/20261019_child_travel_notifications.sql");
  test("értesítés csak sikeres RPC után, hibája elnyelve, válasz változatlan", () => {
    const i = (s: string) => action.indexOf(s);
    assert.ok(i('supabase.rpc("set_child_travel_status"') < i("if (error || !data) return"));
    assert.ok(i("if (error || !data) return") < i("notifyChildTravelEvent("));
    assert.ok(i("notifyChildTravelEvent(") < i('revalidatePath("/csalad")'));
    assert.match(action, /try \{\s*await notifyChildTravelEvent\(row\.id as string, event\);\s*\} catch \{/);
    assert.doesNotMatch(action, /recipients|push_subscriptions|createAdminClient/);
  });
  test("címzett a DB claimből; kliensadat nem jut be", () => {
    assert.match(server, /admin\.rpc\("claim_child_travel_notification"/);
    assert.match(server, /\.in\("user_id", userIds\)/);
    assert.match(server, /\.eq\("endpoint", sub\.endpoint\)\.eq\("user_id", sub\.user_id\)/);
  });
  test("migráció: egyszeri claim, service_role only, policy-paritás", () => {
    assert.match(sql, /constraint child_travel_notifications_once unique \(travel_status_id, event\)/);
    assert.match(sql, /on conflict \(travel_status_id, event\) do nothing/);
    assert.match(sql, /revoke all on public\.child_travel_notifications from public, anon, authenticated;/);
    assert.match(sql, /revoke all on function public\.claim_child_travel_notification\(uuid, text\) from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function public\.claim_child_travel_notification\(uuid, text\) to service_role;/);
    assert.match(sql, /revoke all on function public\._child_travel_notification_recipients\(uuid\) from public, anon, authenticated;/);
    for (const c of ["fm.role = 'owner'", "gcp.status = 'active'", "(gcp.can_view_schedule or gcp.can_manage_schedule)", "fm.role = 'guardian'", "fm.status = 'active'"]) {
      assert.ok(sql.includes(c), c);
    }
    assert.doesNotMatch(sql, /is_admin\(\)/);
    assert.match(sql, /interval '15 minutes'/);
  });
  test("admin push változatlan; a SW admin alapértéke megmaradt", () => {
    const push = read("lib/push.ts");
    assert.match(push, /export async function sendAdminPush\(title: string, body: string, url = "\/admin"\)/);
    assert.match(push, /\.eq\("role", "admin"\)/);
    const sw = read("public/sw.js");
    assert.match(sw, /typeof data\.tag === "string" \? data\.tag : "admin-notification"/);
    assert.match(sw, /requireInteraction: data\.requireInteraction === true/);
  });
});
