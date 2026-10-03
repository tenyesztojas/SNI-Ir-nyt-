// Védett Útvonal — NATÍV GOOGLE BELÉPÉS (Capacitor Browser + Supabase PKCE +
// deep link, 2026-10-03). Tiszta egység (lib/auth/nativeGoogleOAuth.ts, fake
// Capacitor híddal) + statikus forrás-regressziós tesztek.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NATIVE_OAUTH_REDIRECT_URI,
  buildWebViewCallbackPath,
  parseNativeOAuthCallback,
  getCapacitorBridge,
  startNativeGoogleLogin,
  type NativeOAuthWindow,
} from "../../lib/auth/nativeGoogleOAuth.ts";

const read = (p: string) => readFileSync(p, "utf8");
const button = read("components/auth/GoogleLoginButton.tsx");
const belepes = read("app/belepes/page.tsx");
const callback = read("app/auth/callback/route.ts");
const helper = read("lib/auth/nativeGoogleOAuth.ts");
const manifest = read("vedett-utvonal-native/android/app/src/main/AndroidManifest.xml");
const CODE = "3f2b8a1e-9c4d-4e57-8a60-1b2c3d4e5f60";

function fakeEnv(opts: { native?: boolean; authUrl?: string | null; oauthError?: boolean } = {}) {
  const { native = true, authUrl = "https://abc.supabase.co/auth/v1/authorize?provider=google", oauthError = false } = opts;
  const listeners: Record<string, (d?: { url?: string }) => void> = {};
  const calls: { plugin: string; method: string; options?: Record<string, unknown> }[] = [];
  const assigned: string[] = [];
  const oauthArgs: unknown[] = [];
  const win: NativeOAuthWindow = {
    Capacitor: {
      isNativePlatform: () => native,
      nativePromise: async (plugin, method, options) => {
        calls.push({ plugin, method, options });
        return {};
      },
      addListener: (plugin, event, cb) => {
        listeners[`${plugin}.${event}`] = cb;
        return { remove: async () => { delete listeners[`${plugin}.${event}`]; } };
      },
    },
    location: { assign: (u: string) => { assigned.push(u); } },
  };
  const supabase = {
    auth: {
      signInWithOAuth: async (args: unknown) => {
        oauthArgs.push(args);
        return oauthError
          ? { data: { provider: "google", url: null }, error: { message: "boom" } }
          : { data: { provider: "google", url: authUrl }, error: null };
      },
    },
  } as never;
  return { win, supabase, listeners, calls, assigned, oauthArgs };
}

describe("deep link parser", () => {
  test("pontos séma/host/útvonal + code elfogadva", () => {
    assert.deepEqual(parseNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT_URI}?code=${CODE}`), { kind: "code", code: CODE });
  });
  test("rossz séma elutasítva", () => {
    for (const u of [`https://auth/callback?code=${CODE}`, `evil.app://auth/callback?code=${CODE}`, `hu.vedettsarok://auth/callback?code=${CODE}`]) {
      assert.equal(parseNativeOAuthCallback(u), null, u);
    }
  });
  test("rossz host / útvonal elutasítva", () => {
    for (const u of [
      `hu.vedettsarok.utvonal://evil/callback?code=${CODE}`,
      `hu.vedettsarok.utvonal://auth/other?code=${CODE}`,
      `hu.vedettsarok.utvonal://auth/callback/x?code=${CODE}`,
      `hu.vedettsarok.utvonal://user:pw@auth/callback?code=${CODE}`,
      "not a url", "", undefined, null, 42,
    ]) {
      assert.equal(parseNativeOAuthCallback(u), null, String(u));
    }
  });
  test("hiányzó / érvénytelen code -> null; hibaparaméterek értelmezve", () => {
    assert.equal(parseNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT_URI}`), null);
    assert.equal(parseNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT_URI}?code=a%26b%3Dc`), null);
    assert.deepEqual(
      parseNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT_URI}?error=access_denied&error_description=User+denied`),
      { kind: "error", error: "access_denied", description: "User denied" }
    );
  });
  test("token paraméterek nem olvasódnak (csak code/error/error_description)", () => {
    const r = parseNativeOAuthCallback(`${NATIVE_OAUTH_REDIRECT_URI}?code=${CODE}&access_token=AAA&refresh_token=BBB`);
    assert.deepEqual(r, { kind: "code", code: CODE });
  });
});

describe("WebView callback útvonal", () => {
  test("a code URL-kódolt, next=/vedett-utvonal megmarad", () => {
    assert.equal(
      buildWebViewCallbackPath("a/b c&d"),
      "/auth/callback?code=a%2Fb%20c%26d&next=%2Fvedett-utvonal"
    );
    assert.equal(buildWebViewCallbackPath(CODE), `/auth/callback?code=${CODE}&next=%2Fvedett-utvonal`);
  });
  test("nem biztonságos next -> /vedett-utvonal", () => {
    assert.match(buildWebViewCallbackPath(CODE, "//evil.com"), /next=%2Fvedett-utvonal$/);
    assert.match(buildWebViewCallbackPath(CODE, "https://evil.com"), /next=%2Fvedett-utvonal$/);
  });
  test("a callback útvonalban nincs token", () => {
    assert.doesNotMatch(buildWebViewCallbackPath(CODE), /access_token|refresh_token|session/);
  });
});

describe("natív flow (fake Capacitor híd)", () => {
  test("natív detektálás", () => {
    assert.ok(getCapacitorBridge(fakeEnv().win));
    assert.equal(getCapacitorBridge(fakeEnv({ native: false }).win), null);
    assert.equal(getCapacitorBridge({ location: { assign() {} } }), null);
  });
  test("skipBrowserRedirect true + pontos redirect URI; Browser.open az auth URL-lel", async () => {
    const e = fakeEnv();
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba") });
    assert.deepEqual(e.oauthArgs[0], {
      provider: "google",
      options: { redirectTo: "hu.vedettsarok.utvonal://auth/callback", skipBrowserRedirect: true },
    });
    const open = e.calls.find((c) => c.plugin === "Browser" && c.method === "open");
    assert.equal(open?.options?.url, "https://abc.supabase.co/auth/v1/authorize?provider=google");
    assert.equal(e.assigned.length, 0, "a WebView nem navigál a Google-re");
  });
  test("appUrlOpen: rossz URL figyelmen kívül; helyes URL -> /auth/callback + Browser.close", async () => {
    const e = fakeEnv();
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba") });
    const fire = e.listeners["App.appUrlOpen"];
    fire({ url: `evil.app://auth/callback?code=${CODE}` });
    fire({ url: `hu.vedettsarok.utvonal://wrong/callback?code=${CODE}` });
    assert.equal(e.assigned.length, 0);
    fire({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    assert.deepEqual(e.assigned, [`/auth/callback?code=${CODE}&next=%2Fvedett-utvonal`]);
    assert.ok(e.calls.some((c) => c.plugin === "Browser" && c.method === "close"));
  });
  test("Google hiba / megszakítás -> rövid magyar üzenet, nincs navigáció", async () => {
    const e = fakeEnv();
    const msgs: string[] = [];
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: (m) => msgs.push(m) });
    e.listeners["App.appUrlOpen"]({ url: "hu.vedettsarok.utvonal://auth/callback?error=access_denied&error_description=secret+detail" });
    assert.deepEqual(msgs, ["A Google-belépés megszakadt."]);
    assert.equal(e.assigned.length, 0);
    assert.ok(!msgs.join().includes("secret"));
  });
  test("Supabase nem ad URL-t / hiba -> hibaüzenet, Browser nem nyílik, nincs WebView fallback", async () => {
    for (const env of [fakeEnv({ authUrl: null }), fakeEnv({ oauthError: true }), fakeEnv({ authUrl: "javascript:alert(1)" })]) {
      const msgs: string[] = [];
      await startNativeGoogleLogin(env.supabase, { win: env.win, onError: (m) => msgs.push(m) });
      assert.equal(msgs.length, 1);
      assert.ok(!env.calls.some((c) => c.method === "open"));
      assert.equal(env.assigned.length, 0);
    }
  });
  test("híd/plugin nem elérhető -> hibaüzenet", async () => {
    const msgs: string[] = [];
    const e = fakeEnv({ native: false });
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: (m) => msgs.push(m) });
    assert.equal(msgs.length, 1);
    assert.equal(e.oauthArgs.length, 0);
  });
  test("a Custom Tab bezárása (browserFinished) cancel", async () => {
    const e = fakeEnv();
    let cancelled = false;
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => {}, onCancel: () => { cancelled = true; }, cancelGraceMs: 5 });
    e.listeners["Browser.browserFinished"]();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(cancelled, true);
  });
});

describe("GoogleLoginButton / belepes / callback (statikus)", () => {
  test("next nélkül a normál webes Google belépés VÁLTOZATLAN", () => {
    assert.match(button, /if \(next === undefined\) \{\s*await supabase\.auth\.signInWithOAuth\(\{\s*provider: "google",\s*options: \{ redirectTo: `\$\{window\.location\.origin\}\/auth\/callback` \},/);
  });
  test("VU böngészőben webes OAuth, sanitizált next-tel", () => {
    assert.match(button, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback\?next=\$\{encodeURIComponent\(safeNext\)\}`/);
    assert.match(button, /safeReturnPath\(next, "\/profil"\)/);
  });
  test("VU natívban a natív branch; nincs WebView-s Google fallback", () => {
    assert.match(button, /if \(isNativeCapacitor\(\)\) \{\s*await startNativeGoogleLogin/);
    assert.doesNotMatch(helper, /accounts\.google\.com/);
    assert.doesNotMatch(helper, /signInWithIdToken/);
  });
  test("a helper nem importál Capacitor csomagot (root build-biztos)", () => {
    assert.doesNotMatch(helper, /from ["']@capacitor/);
    assert.match(helper, /skipBrowserRedirect: true/);
    assert.match(helper, /NATIVE_OAUTH_REDIRECT_URI = "hu\.vedettsarok\.utvonal:\/\/auth\/callback"/);
  });
  test("nincs token URL-ben / localStorage-ben", () => {
    assert.doesNotMatch(helper + button, /localStorage|sessionStorage/);
    assert.doesNotMatch(helper, /[?&](access_token|refresh_token)=/);
  });
  test("/belepes: VU módban Google next-tel, e-mail/jelszó megmarad, közösségi opt-in rejtve", () => {
    assert.match(belepes, /<GoogleLoginButton next=\{safeNext\} \/>/);
    assert.match(belepes, /signInFormAction/);
    assert.match(belepes, /signUpFormAction/);
    assert.match(belepes, /\{!vuMode && \(\s*<div className="rounded-xl border border-sni-brand-teal\/30/);
  });
  test("/belepes: csak ismert hibakódok jelennek meg", () => {
    assert.match(belepes, /"oauth_failed"/);
    assert.match(belepes, /"oauth_cancelled"/);
  });
  test("/auth/callback: next sanitizált; hiba csak explicit next esetén megy /belepes-re", () => {
    assert.match(callback, /safeReturnPath\(searchParams\.get\("next"\), "\/profil"\)/);
    assert.match(callback, /hasExplicitNext && !isPopup && \(exchangeFailed \|\| providerError\)/);
    assert.match(callback, /NextResponse\.redirect\(`\$\{origin\}\$\{nextPath\}`\)/);
  });
  test("AndroidManifest: pontos deep link intent filter", () => {
    assert.match(manifest, /android\.intent\.action\.VIEW/);
    assert.match(manifest, /android\.intent\.category\.DEFAULT/);
    assert.match(manifest, /android\.intent\.category\.BROWSABLE/);
    assert.match(manifest, /android:scheme="hu\.vedettsarok\.utvonal"\s+android:host="auth"\s+android:path="\/callback"/);
  });
  test("a natív csomag függőségei csak a natív projektben vannak", () => {
    const rootPkg = read("package.json");
    assert.doesNotMatch(rootPkg, /@capacitor/);
    const nativePkg = read("vedett-utvonal-native/package.json");
    assert.match(nativePkg, /"@capacitor\/browser"/);
    assert.match(nativePkg, /"@capacitor\/app"/);
  });
  test("a root tsconfig kizárja a natív projektet", () => {
    assert.match(read("tsconfig.json"), /"vedett-utvonal-native"/);
  });
});
