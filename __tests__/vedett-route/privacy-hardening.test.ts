// Privacy-hardening regressziós tesztek: GA4 helper whitelist, platform
// felismerés, fióktörlés route, kijelentkezési cleanup, SW /api/ kizárás,
// Nominatim UA.
//   node --test --experimental-strip-types __tests__/vedett-route/privacy-hardening.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const analytics: any = await import(pathToFileURL(resolve(ROOT, "lib/vedett-route/analytics.ts")).href);

describe("GA4 helper", () => {
  test("platform detection", () => {
    const f = analytics.detectAnalyticsPlatform;
    assert.equal(f("Mozilla/5.0 (Windows NT 10.0) Chrome/120"), "web");
    assert.equal(f(undefined), "web");
    assert.equal(f("Mozilla/5.0 (Linux; Android 14) VedettUtvonalNative/0.1 Android"), "android");
    assert.equal(f("Mozilla/5.0 (Linux; Android 14) wv VedettUtvonalNative/0.1"), "android"); // régi build
    assert.equal(f("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148 VedettUtvonalNative/0.1 iOS"), "ios");
    assert.equal(f("Mozilla/5.0 (Macintosh) VedettUtvonalNative/0.1 iOS"), "ios");
  });
  test("params are whitelisted and cannot carry arbitrary data", () => {
    const p = analytics.buildEventParams({ platform: "web", authState: "authenticated", result: "success", latitude: 47.5, address: "x", email: "a@b.hu" } as any);
    assert.deepEqual(Object.keys(p).sort(), ["auth_state", "platform", "result"]);
    for (const k of Object.keys(p)) assert.ok(analytics.ALLOWED_EVENT_PARAMS.includes(k));
    assert.equal(analytics.buildEventParams({ platform: "ios", authState: "anonymous", result: "weird" as any }).result, undefined);
  });
  test("exactly the planned events exist", () => {
    assert.deepEqual([...analytics.VEDETT_ROUTE_EVENTS].sort(), [
      "login_started", "navigation_finished", "navigation_started", "registration_started",
      "route_search", "route_search_error", "route_search_success", "saved_place_used", "vedett_route_open",
    ]);
  });
  test("helper source has no free-form payload parameter", () => {
    const src = strip(read("lib/vedett-route/analytics.ts"));
    assert.doesNotMatch(src, /Record<string,\s*unknown>|params\??:\s*(any|object)/);
    assert.match(src, /options:\s*\{\s*authState: AnalyticsAuthState; result\?: AnalyticsResult\s*\}/);
  });
  test("call sites pass only authState/result (no coordinates, addresses, ids)", () => {
    for (const f of [
      "components/vedett-utvonal/VedettUtvonalSearchForm.tsx",
      "app/belepes/page.tsx",
      "components/auth/GoogleLoginButton.tsx",
    ]) {
      const calls = strip(read(f)).match(/trackVedettRouteEvent\([\s\S]*?\}\)/g) ?? [];
      assert.ok(calls.length > 0, f);
      for (const c of calls) assert.doesNotMatch(c, /latitude|longitude|lat\b|lon\b|address|email|userId|weights|stepFree|displayName|query/i, c);
    }
  });
  test("GA4 id retained; page_location stripped of query/hash", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /G-T748C867DW/);
    assert.match(layout, /page_location:location\.origin\+location\.pathname/);
  });
  test("native UA markers keep the VedettUtvonalNative/0.1 prefix", () => {
    const cfg = read("vedett-utvonal-native/capacitor.config.ts");
    assert.match(cfg, /appendUserAgent: 'VedettUtvonalNative\/0\.1 Android'/);
    assert.match(cfg, /appendUserAgent: 'VedettUtvonalNative\/0\.1 iOS'/);
  });
});

describe("account deletion", () => {
  const route = strip(read("app/api/account/delete/route.ts"));
  test("user comes only from the authenticated session", () => {
    assert.match(route, /supabase\.auth\.getUser\(\)/);
    assert.match(route, /status: 401/);
    assert.match(route, /deleteUser\(user\.id\)/);
    assert.doesNotMatch(route, /body\.(user_?id|id)|searchParams|params\./);
  });
  test("requires confirmation and fails closed on Family data", () => {
    assert.match(route, /body\.confirm !== true/);
    for (const t of ["family_members", "guardian_child_permissions", "child_accounts"]) assert.match(route, new RegExp(t));
    assert.match(route, /status: 409/);
  });
  test("service role never reaches client code", () => {
    const ui = read("components/DeleteAccountSection.tsx");
    assert.doesNotMatch(ui, /createAdminClient|SERVICE_ROLE/);
    assert.match(ui, /Fiókom végleges törlése/);
  });
});

describe("local data, SW, Nominatim", () => {
  test("sign-out sets cookie and cleanup clears navigation session", () => {
    assert.match(read("lib/actions/auth.ts"), /name: "vu_signed_out"/);
    const c = read("components/SignOutDataCleanup.tsx");
    assert.match(c, /clearNavigationSession\(\)/);
    assert.doesNotMatch(strip(c), /vs-a11y|localStorage\.clear/);
    assert.match(read("app/layout.tsx"), /<SignOutDataCleanup \/>/);
  });
  test("service worker never caches /api/ or /auth/ responses", () => {
    const sw = read("public/sw.js");
    assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
    assert.ok(sw.indexOf('startsWith("/api/")') < sw.indexOf("respondWith("));
    assert.match(sw, /vedettsarok-v3/);
  });
  test("Nominatim User-Agent has no personal email", () => {
    const g = read("lib/vedett-route/geocode.ts");
    assert.doesNotMatch(g, /holvay|@gmail\.com/);
    assert.match(g, /USER_AGENT = "VedettSarok-VedettUtvonal\/1\.0/);
  });
});
