// Szülői push-feliratkozás (UI + API) — célzott tesztek.
//   node --test --experimental-strip-types __tests__/family/travel-push-subscription.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideTravelNotificationEligibility,
  guardianChildIds,
  isPushApiSuccess,
  isPushLinked,
  TRAVEL_PUSH_CARD_TEXT as T,
} from "../../lib/family/travelPushUi.ts";
import { parsePushEndpoint, parsePushSubscriptionBody } from "../../lib/pushSubscription.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const owner = (n: number) => ({ myRole: "owner", children: Array.from({ length: n }, (_, i) => ({ id: `o${i}` })) });
const guardian = (...ids: string[]) => ({ myRole: "guardian", children: ids.map((id) => ({ id })) });

describe("jogosultság a kártyához", () => {
  test("owner gyermekkel igen, gyermek nélkül nem", () => {
    assert.equal(decideTravelNotificationEligibility([owner(1)], []), true);
    assert.equal(decideTravelNotificationEligibility([owner(0)], []), false);
  });
  test("guardian csak aktív megtekintési joggal, a saját családja gyermekére", () => {
    assert.equal(decideTravelNotificationEligibility([guardian("c1")], []), false);
    assert.equal(decideTravelNotificationEligibility([guardian("c1")], ["c1"]), true);
    assert.equal(decideTravelNotificationEligibility([guardian("c1")], ["c2"]), false);
    assert.deepEqual(guardianChildIds([owner(1), guardian("c1", "c2"), guardian("c2")]), ["c1", "c2"]);
  });
  test("meghívott, még nem tag (nincs család) -> nem", () => {
    assert.equal(decideTravelNotificationEligibility([], ["c1"]), false);
  });
  test("szerveroldali lekérdezés: session-kliens, aktív jog, fail closed", () => {
    const e = read("lib/family/travelPushEligibility.ts");
    assert.match(e, /createClient\(\)/);
    assert.doesNotMatch(e, /createAdminClient|SERVICE_ROLE/);
    assert.match(e, /\.eq\("guardian_user_id", userId\)/);
    assert.match(e, /\.eq\("status", "active"\)/);
    assert.match(e, /can_view_schedule\.eq\.true,can_manage_schedule\.eq\.true/);
    assert.match(e, /if \(error \|\| !data\) return false;/);
  });
});

describe("/csalad: a kártya csak a szülői ágban, jogosultsághoz kötve", () => {
  const page = read("app/csalad/page.tsx");
  test("a gyermek-saját ág előbb tér vissza, mint a kártya", () => {
    const childReturn = page.indexOf("return <ChildTodayView");
    assert.ok(childReturn > 0 && childReturn < page.indexOf("showTravelPush"));
  });
  test("megjelenítés szerveroldali jogosultsághoz kötve", () => {
    assert.match(page, /const showTravelPush = !error && families\.length > 0 && \(await hasTravelNotificationEligibility\(user\.id, families\)\);/);
    assert.match(page, /\{showTravelPush && <TravelPushCard \/>\}/);
  });
});

describe("API-válaszok kezelése", () => {
  test("csak kifejezett ok:true siker; linked csak true esetén", () => {
    assert.equal(isPushApiSuccess(true, { ok: true }), true);
    for (const [ok, j] of [[false, { ok: true }], [true, { ok: false }], [true, null], [true, { ok: "true" }], [true, {}]] as const) {
      assert.equal(isPushApiSuccess(ok, j), false);
    }
    assert.equal(isPushLinked(true, { ok: true, linked: true }), true);
    assert.equal(isPushLinked(true, { ok: true, linked: false }), false);
    assert.equal(isPushLinked(false, { ok: true, linked: true }), false);
  });
  test("UI: „Bekapcsolva” csak sikeres mentés/ellenőrzés után", () => {
    const c = read("components/family/TravelPushCard.tsx");
    assert.match(c, /const saved = await subscribeAndSave\(/);
    assert.match(c, /if \(!saved\) \{\s*setError\(T\.saveError\);\s*return setStatus\("off"\);\s*\}\s*setStatus\("on"\);/);
    assert.match(c, /setStatus\(isPushLinked\(r\.ok, r\.json\) \? "on" : "off"\)/);
    // leiratkozás: szerverhiba esetén marad „on”, a böngészős leiratkozás csak siker után
    const off = c.slice(c.indexOf("async function turnOff"));
    assert.ok(off.indexOf('return setStatus("on");') < off.indexOf("await sub.unsubscribe()"));
    // fiókváltás: idegen végpontot a böngésző bont, a szerver nem töröl
    assert.match(c, /if \(isPushStale\(r\.ok, r\.json\)\) \{\s*await sub\.unsubscribe\(\)/);
  });
  test("hiányzó VAPID, SW-hiba, nem támogatott, natív app, letiltott engedély", () => {
    const c = read("components/family/TravelPushCard.tsx");
    for (const s of ['setStatus("no_vapid")', 'setStatus("sw_error")', 'setStatus("unsupported")', 'setStatus("native")', 'setStatus("denied")']) {
      assert.ok(c.includes(s), s);
    }
    assert.match(c, /SW_TIMEOUT_MS/);
  });
});

describe("feliratkozás-validálás", () => {
  const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
  test("érvényes https végpont és kulcsok", () => {
    assert.deepEqual(parsePushSubscriptionBody({ endpoint: "https://fcm.googleapis.com/x", keys, expirationTime: null }), {
      endpoint: "https://fcm.googleapis.com/x",
      keys,
    });
  });
  test("elutasított bemenetek", () => {
    for (const b of [null, {}, { endpoint: "http://x/y", keys }, { endpoint: "javascript:alert(1)", keys },
      { endpoint: "https://u:p@x/y", keys }, { endpoint: "https://x/" + "a".repeat(3000), keys },
      { endpoint: "https://x/y" }, { endpoint: "https://x/y", keys: { p256dh: "short", auth: keys.auth } },
      { endpoint: "https://x/y", keys: { p256dh: keys.p256dh, auth: "<script>" } }]) {
      assert.equal(parsePushSubscriptionBody(b), null, JSON.stringify(b)?.slice(0, 60));
    }
    assert.equal(parsePushEndpoint(42), null);
  });
});

describe("API-jogosultságok (statikus)", () => {
  const sub = read("app/api/push/subscribe/route.ts");
  const sync = read("app/api/push/sync/route.ts");
  test("subscribe: session-user, validálás, hiba nem „ok”", () => {
    assert.match(sub, /supabase\.auth\.getUser\(\)/);
    assert.match(sub, /status: 401/);
    assert.match(sub, /parsePushSubscriptionBody\(/);
    assert.match(sub, /user_id: user\.id/);
    assert.doesNotMatch(sub, /upsert\(/);
    assert.match(sub, /if \(write === "conflict"\) \{\s*return NextResponse\.json\(\{ ok: false, error: "Endpoint in use" \}, \{ status: 409 \}\)/);
    assert.match(sub, /\.update\(\{ keys: sub\.keys \}\)\.eq\("endpoint", sub\.endpoint\)\.eq\("user_id", user\.id\)/);
    assert.match(sub, /if \(error\) \{[\s\S]*?status: 500/);
    assert.doesNotMatch(sub, /body\??\.user_?id|userId/);
    // törlés csak a saját sorra
    assert.match(sub, /\.eq\("endpoint", endpoint\)\s*\.eq\("user_id", user\.id\)/);
  });
  test("sync: csak olvas — idegen sort nem töröl és nem vesz át", () => {
    assert.match(sync, /supabase\.auth\.getUser\(\)/);
    assert.match(sync, /classifySyncOwner\(owners, user\.id\)/);
    assert.doesNotMatch(sync, /\.delete\(|upsert|insert\(|update\(/);
  });
});

describe("tájékoztató szöveg", () => {
  test("esemény-típusok, nem garantált, nem segélyhívó", () => {
    assert.equal(T.title, "Gyermekem utazási értesítései");
    assert.match(T.intro, /elindult/);
    assert.match(T.intro, /megérkezett/);
    assert.match(T.intro, /segítséget kér/);
    assert.match(T.disclaimer, /nem garantált/);
    assert.match(T.disclaimer, /nem segélyhívó szolgáltatás/);
    assert.match(T.disclaimer, /112/);
  });
});

describe("admin push változatlan", () => {
  test("PushNotifButton szövege és viselkedése érintetlen", () => {
    const b = read("components/PushNotifButton.tsx");
    assert.match(b, /Push értesítések \(PWA\)/);
    assert.match(b, /subscribeAndSave\(flowDeps\(reg\)\)/);
    assert.doesNotMatch(b, /travelPushUi|TravelPushCard/);
  });
});
