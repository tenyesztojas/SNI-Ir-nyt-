// Kijelentkezéskori push-biztonság — célzott tesztek.
//   node --test --experimental-strip-types __tests__/family/push-signout.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsSignOutPushWarning, PUSH_DETACHED_COOKIE, PUSH_ENDPOINT_FIELD, SIGN_OUT_PUSH_WARNING } from "../../lib/pushSignOut.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("figyelmeztetési döntés (nincs hamis siker)", () => {
  test("csak akkor nincs figyelmeztetés, ha igazolhatóan nincs aktív hozzárendelés", () => {
    assert.equal(needsSignOutPushWarning({ serverDetached: false, browserSubscriptionRemains: true }), true);
    assert.equal(needsSignOutPushWarning({ serverDetached: true, browserSubscriptionRemains: true }), false);
    assert.equal(needsSignOutPushWarning({ serverDetached: false, browserSubscriptionRemains: false }), false);
    assert.match(SIGN_OUT_PUSH_WARNING, /nem sikerült/);
  });
});

describe("szerver: leválasztás a kijelentkezés ELŐTT", () => {
  const a = read("lib/actions/auth.ts");
  const fn = a.slice(a.indexOf("export async function signOutAction"));
  test("sorrend: getUser -> push leválasztás -> signOut -> sütik -> redirect", () => {
    const i = (s: string) => fn.indexOf(s);
    assert.ok(i("supabase.auth.getUser()") >= 0);
    assert.ok(i("supabase.auth.getUser()") < i("detachBrowserPushOnSignOut("));
    assert.ok(i("detachBrowserPushOnSignOut(") < i("supabase.auth.signOut()"));
    assert.ok(i("supabase.auth.signOut()") < i('name: "vu_signed_out"'));
    assert.ok(i('name: "vu_signed_out"') < i("redirect(nextPath)"));
  });
  test("siker-süti csak megerősített leválasztásnál", () => {
    assert.match(fn, /if \(pushDetach === "detached"\) \{\s*cookies\(\)\.set\(\{ name: PUSH_DETACHED_COOKIE/);
    assert.match(fn, /formData\.get\(PUSH_ENDPOINT_FIELD\)/);
    assert.match(fn, /safeReturnPath\(/);
  });
  test("csak az adott böngésző végpontja törlődik; session nélkül semmi", () => {
    const s = read("lib/pushSignOutServer.ts");
    assert.match(s, /if \(!userId\) return "none";/);
    assert.match(s, /parsePushEndpoint\(rawEndpoint\)/);
    assert.match(s, /\.delete\(\)\.eq\("endpoint", ep\)\.eq\("user_id", uid\)/);
    assert.equal((s.match(/\.delete\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(s, /\.in\("user_id"|\.neq\(|\.or\(/);
    assert.match(s, /detachOwnPushSubscription\(/);
  });
});

describe("minden kijelentkező űrlap küldi a végpontot", () => {
  test("profil, fejléc (asztali + mobil), Védett Útvonal", () => {
    assert.equal(PUSH_ENDPOINT_FIELD, "push_endpoint");
    const counts: Record<string, number> = { "app/profil/page.tsx": 1, "components/HeaderClient.tsx": 2, "app/vedett-utvonal/page.tsx": 1 };
    for (const [f, n] of Object.entries(counts)) {
      const s = read(f);
      const forms = s.split("<form action={signOutAction}>").length - 1;
      assert.equal(forms, n, f);
      const withField = s.match(/<form action=\{signOutAction\}>\s*(<input type="hidden" name="next" value="\/vedett-utvonal" \/>\s*)?<PushEndpointField \/>/g) ?? [];
      assert.equal(withField.length, n, f);
    }
    assert.match(read("app/vedett-utvonal/page.tsx"), /name="next" value="\/vedett-utvonal" \/>\s*<PushEndpointField \/>/);
  });
  test("mező: rejtett, csak saját böngésző végpontja", () => {
    const f = read("components/PushEndpointField.tsx");
    assert.match(f, /type="hidden" name=\{PUSH_ENDPOINT_FIELD\}/);
    assert.match(f, /pushManager\.getSubscription\(\)/);
    assert.doesNotMatch(f, /fetch\(/);
  });
});

describe("kliens-takarítás", () => {
  const c = read("components/SignOutDataCleanup.tsx");
  test("navigációs adat törlése és vu_signed_out kezelése megmaradt", () => {
    assert.match(c, /clearNavigationSession\(\)/);
    assert.match(c, /export const SIGNED_OUT_COOKIE = "vu_signed_out";/);
    assert.doesNotMatch(c.replace(/^\s*\/\/.*$/gm, ""), /vs-a11y|localStorage\.clear/);
  });
  test("böngészős leiratkozás + figyelmeztetés, a siker-süti egyszer használatos", () => {
    assert.match(c, /sub\.unsubscribe\(\)/);
    assert.match(c, new RegExp(`\\$\\{PUSH_DETACHED_COOKIE\\}=; path=/; max-age=0`));
    assert.match(c, /needsSignOutPushWarning\(/);
    assert.match(c, /role="alert"/);
    assert.equal(PUSH_DETACHED_COOKIE, "vu_push_detached");
  });
});

describe("fióktörlés", () => {
  test("a push sorok kaszkádban törlődnek; a kliens jelzést kap", () => {
    assert.match(read("supabase/migrations/20240715_push_subscriptions.sql"), /user_id uuid REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    const r = read("app/api/account/delete/route.ts");
    assert.ok(r.indexOf('name: "vu_signed_out"') < r.indexOf("name: PUSH_DETACHED_COOKIE"));
  });
});
