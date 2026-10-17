// VÉDETT ÚTVONAL — iOS natív Google belépés: /vedett-utvonal/auth/callback
// (a 13-as build diagnózisa: a Capacitor iOS a server.url előtagon kívüli
// /auth/callback-et a rendszer-Safariban nyitotta meg, PKCE verifier nélkül).
//   node --test __tests__/vedett-route/ios-native-oauth-callback.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import {
  NATIVE_CALLBACK_ERROR_PARAM,
  NATIVE_IOS_WEBVIEW_CALLBACK_PATH,
  handleNativeOAuthCallback,
  nativeCallbackErrorPath,
  resolveNativeCallbackNext,
  updateOAuthProfile,
  type NativeCallbackDeps,
  type OAuthUserLike,
} from "../../lib/auth/nativeOAuthCallback.ts";
import {
  NATIVE_AUTH_SESSION_METHOD,
  NATIVE_AUTH_SESSION_PLUGIN,
  NATIVE_OAUTH_REDIRECT_URI,
  WEB_OAUTH_CALLBACK_PATH,
  buildWebViewCallbackPath,
  startNativeGoogleLogin,
  type NativeOAuthWindow,
} from "../../lib/auth/nativeGoogleOAuth.ts";

const CODE = "3f2b8a1e-9c4d-4e57-8a60-1b2c3d4e5f60";
const ORIGIN = "https://www.vedettsarok.hu";
const read = (p: string) => readFileSync(p, "utf8");
const flush = () => new Promise((r) => setTimeout(r, 0));

// A Capacitor iOS (8.x) WebViewDelegationHandler.decidePolicyFor szabálya:
// fő keretbeli navigáció csak akkor marad a WebView-ban, ha az abszolút URL a
// server.url-lel kezdődik (allowNavigation nincs beállítva). A server.url-t a
// beépített iOS konfigurációból olvassuk, hogy a teszt a valós értékhez kötődjön.
const iosConfig = JSON.parse(read("vedett-utvonal-native/ios/App/App/capacitor.config.json"));
const SERVER_URL: string = iosConfig.server.url;
const staysInIosWebView = (absoluteUrl: string) => absoluteUrl.startsWith(SERVER_URL);

const USER: OAuthUserLike = { id: "u1", email: "x@example.com", app_metadata: { provider: "google" } };
function deps(over: Partial<NativeCallbackDeps> = {}) {
  const exchanged: string[] = [];
  const updated: OAuthUserLike[] = [];
  const d: NativeCallbackDeps = {
    exchangeCodeForSession: async (code) => {
      exchanged.push(code);
      return { data: { user: USER }, error: null };
    },
    updateProfileAfterLogin: async (u) => void updated.push(u),
    ...over,
  };
  return { d, exchanged, updated };
}
const cb = (q: string) => `${ORIGIN}${NATIVE_IOS_WEBVIEW_CALLBACK_PATH}?${q}`;

describe("Capacitor iOS navigációs szabály (a hiba és a javítás)", () => {
  test("a beépített iOS server.url a /vedett-utvonal előtag, allowNavigation nélkül", () => {
    assert.equal(SERVER_URL, `${ORIGIN}/vedett-utvonal`);
    assert.equal(iosConfig.server.allowNavigation, undefined);
  });
  test("a régi /auth/callback az előtagon kívül esik (ezért nyílt meg Safariban)", () => {
    assert.equal(staysInIosWebView(`${ORIGIN}${buildWebViewCallbackPath(CODE)}`), false);
  });
  test("az új callback útvonal és minden átirányítása a WebView-ban marad", async () => {
    assert.equal(staysInIosWebView(`${ORIGIN}${buildWebViewCallbackPath(CODE, "/vedett-utvonal", NATIVE_IOS_WEBVIEW_CALLBACK_PATH)}`), true);
    const targets = [
      await handleNativeOAuthCallback(cb(`code=${CODE}&next=%2Fvedett-utvonal`), deps().d),
      await handleNativeOAuthCallback(cb(`code=${CODE}&next=%2Fprofil`), deps().d),
      await handleNativeOAuthCallback(cb(`code=${CODE}`), deps({ exchangeCodeForSession: async () => ({ data: null, error: new Error("x") }) }).d),
      await handleNativeOAuthCallback(cb("error=access_denied"), deps().d),
      await handleNativeOAuthCallback(cb(""), deps().d),
    ];
    for (const t of targets) assert.equal(staysInIosWebView(t), true, t);
  });
});

describe("handleNativeOAuthCallback — sikeres kódcsere", () => {
  test("a kódot pontosan egyszer cseréli; profilfrissítés; vissza a next-re", async () => {
    const e = deps();
    const t = await handleNativeOAuthCallback(cb(`code=${CODE}&next=%2Fvedett-utvonal%2Fapp`), e.d);
    assert.equal(t, `${ORIGIN}/vedett-utvonal/app`);
    assert.deepEqual(e.exchanged, [CODE]);
    assert.deepEqual(e.updated, [USER]);
  });
  test("az origin a kérésből jön (nincs hardcode-olt host)", async () => {
    const t = await handleNativeOAuthCallback(`https://preview.example.dev${NATIVE_IOS_WEBVIEW_CALLBACK_PATH}?code=${CODE}`, deps().d);
    assert.equal(t, "https://preview.example.dev/vedett-utvonal");
  });
  test("a profilfrissítés hibája nem buktatja el a belépést", async () => {
    const e = deps({ updateProfileAfterLogin: async () => { throw new Error("db"); } });
    assert.equal(await handleNativeOAuthCallback(cb(`code=${CODE}`), e.d), `${ORIGIN}/vedett-utvonal`);
  });
});

describe("handleNativeOAuthCallback — hibakezelés (mindig /vedett-utvonal-on belül)", () => {
  const failed = `${ORIGIN}/vedett-utvonal?${NATIVE_CALLBACK_ERROR_PARAM}=oauth_failed`;
  const cancelled = `${ORIGIN}/vedett-utvonal?${NATIVE_CALLBACK_ERROR_PARAM}=oauth_cancelled`;
  test("kódcsere hiba / nincs user / kivétel → oauth_failed, profilfrissítés nélkül", async () => {
    for (const ex of [
      async () => ({ data: null, error: new Error("invalid flow state") }),
      async () => ({ data: { user: null }, error: null }),
      async () => { throw new Error("network"); },
    ] as NativeCallbackDeps["exchangeCodeForSession"][]) {
      const e = deps({ exchangeCodeForSession: ex });
      assert.equal(await handleNativeOAuthCallback(cb(`code=${CODE}&next=%2Fvedett-utvonal`), e.d), failed);
      assert.deepEqual(e.updated, []);
    }
  });
  test("provider hiba: access_denied → oauth_cancelled, más → oauth_failed; nincs kódcsere", async () => {
    const e = deps();
    assert.equal(await handleNativeOAuthCallback(cb(`error=access_denied&code=${CODE}`), e.d), cancelled);
    assert.equal(await handleNativeOAuthCallback(cb("error=server_error&error_description=%3Cscript%3E"), e.d), failed);
    assert.deepEqual(e.exchanged, []);
  });
  test("hiányzó vagy érvénytelen kód → oauth_failed, nincs kódcsere", async () => {
    const e = deps();
    for (const q of ["", "code=", "code=abc", `code=${encodeURIComponent("x y<z>" + CODE)}`]) {
      assert.equal(await handleNativeOAuthCallback(cb(q), e.d), failed, q);
    }
    assert.deepEqual(e.exchanged, []);
  });
  test("a nyers hibaszöveg sosem kerül az átirányításba", async () => {
    const t = await handleNativeOAuthCallback(cb("error=server_error&error_description=secret+detail"), deps().d);
    assert.ok(!t.includes("secret") && !t.includes("server_error"));
    assert.equal(nativeCallbackErrorPath("oauth_failed"), "/vedett-utvonal?login_error=oauth_failed");
  });
});

describe("resolveNativeCallbackNext — nyílt redirect és előtag", () => {
  test("elfogadott Védett Útvonal célok", () => {
    for (const ok of ["/vedett-utvonal", "/vedett-utvonal/app", "/vedett-utvonal?x=1"]) {
      assert.equal(resolveNativeCallbackNext(ok), ok);
    }
  });
  test("minden más → /vedett-utvonal", () => {
    for (const bad of [
      null, undefined, "", "/profil", "/belepes", "/vedett-utvonalx", "//evil.com", "https://evil.com",
      "/vedett-utvonal/\\evil.com", "/\\evil.com", "/vedett-utvonal/a://b", "/vedett-utvonal\n/x",
      "/vedett-utvonal/auth/callback", "/vedett-utvonal/auth/callback?code=1", "/vedett-utvonal/" + "a".repeat(600),
    ]) {
      assert.equal(resolveNativeCallbackNext(bad as string | null | undefined), "/vedett-utvonal", String(bad));
    }
  });
});

describe("PKCE: ugyanaz a code_verifier süti a belépés kezdetén és a callbackben", () => {
  test("browser kliens (WebView) írja, a szerveroldali callback ugyanazt küldi a Supabase-nek", async () => {
    // Egyetlen sütitár = a WebView sütijei (ugyanaz a host, path="/").
    const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
    const cookies = {
      get: (n: string) => jar.get(n)?.value,
      set: (n: string, value: string, options: Record<string, unknown>) => void jar.set(n, { value, options }),
      remove: (n: string) => void jar.delete(n),
    };
    let tokenBody: Record<string, string> | null = null;
    const fetchMock = (async (input: unknown, init?: { body?: string }) => {
      if (String(input).includes("/auth/v1/token?grant_type=pkce")) {
        tokenBody = JSON.parse(init?.body ?? "{}");
        return new Response(JSON.stringify({
          access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer",
          user: { id: "u1", aud: "authenticated", app_metadata: { provider: "google" }, user_metadata: {}, created_at: "" },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const SUPA = "https://dummyref.supabase.co";

    const browser = createBrowserClient(SUPA, "anon", { cookies, global: { fetch: fetchMock }, isSingleton: false } as never);
    const { data } = await browser.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_OAUTH_REDIRECT_URI, skipBrowserRedirect: true },
    });
    const authUrl = new URL(data.url!);
    assert.equal(authUrl.searchParams.get("redirect_to"), NATIVE_OAUTH_REDIRECT_URI);
    const verifierCookie = jar.get("sb-dummyref-auth-token-code-verifier");
    assert.ok(verifierCookie, "a verifier süti létrejött");
    assert.equal(verifierCookie.options.path, "/", "path=/ → a /vedett-utvonal/auth/callback kérés is megkapja");
    // @supabase/ssr a sütiértéket "base64-" előtaggal, JSON-ként kódolja.
    const raw = verifierCookie.value.startsWith("base64-")
      ? Buffer.from(verifierCookie.value.slice("base64-".length), "base64url").toString("utf8")
      : verifierCookie.value;
    const verifier = (() => { try { return JSON.parse(raw); } catch { return raw; } })() as string;
    assert.match(verifier, /^[0-9a-f]{40,}$/);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(authUrl.searchParams.get("code_challenge"), challenge, "a challenge ebből a verifierből készült");

    const server = createServerClient(SUPA, "anon", { cookies, global: { fetch: fetchMock } });
    const target = await handleNativeOAuthCallback(cb(`code=${CODE}&next=%2Fvedett-utvonal`), {
      exchangeCodeForSession: (code) => server.auth.exchangeCodeForSession(code),
    });
    assert.equal(target, `${ORIGIN}/vedett-utvonal`);
    assert.deepEqual(tokenBody, { auth_code: CODE, code_verifier: verifier });
    assert.ok(!jar.has("sb-dummyref-auth-token-code-verifier"), "a verifier felhasználás után törlődik");
    assert.ok(jar.has("sb-dummyref-auth-token"), "a session süti a WebView sütitárába íródott");
  });
});

describe("platformonkénti útvonalválasztás", () => {
  function env(platform: "ios" | "android", withAuthSession: boolean) {
    const assigned: string[] = [];
    let fireUrlOpen: ((d?: { url?: string }) => void) | undefined;
    let resolveAuth: ((v: unknown) => void) | undefined;
    const win: NativeOAuthWindow = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => platform,
        PluginHeaders: withAuthSession
          ? [{ name: NATIVE_AUTH_SESSION_PLUGIN, methods: [{ name: NATIVE_AUTH_SESSION_METHOD }] }]
          : [{ name: NATIVE_AUTH_SESSION_PLUGIN, methods: [{ name: "start" }] }],
        nativePromise: (plugin, method) =>
          plugin === NATIVE_AUTH_SESSION_PLUGIN && method === NATIVE_AUTH_SESSION_METHOD
            ? new Promise((r) => { resolveAuth = r; })
            : Promise.resolve({}),
        addListener: (plugin, event, fn) => {
          if (plugin === "App" && event === "appUrlOpen") fireUrlOpen = fn;
          return { remove: () => undefined };
        },
      },
      location: { assign: (u: string) => void assigned.push(u) },
    };
    const supabase = { auth: { signInWithOAuth: async () => ({ data: { url: "https://x.supabase.co/auth/v1/authorize" }, error: null }) } } as never;
    return { win, supabase, assigned, fire: () => fireUrlOpen, resolve: () => resolveAuth };
  }
  const deepLink = `${NATIVE_OAUTH_REDIRECT_URI}?code=${CODE}`;

  test("iOS + ASWebAuthenticationSession → /vedett-utvonal/auth/callback", async () => {
    const e = env("ios", true);
    const run = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail() });
    await flush();
    e.resolve()?.({ url: deepLink });
    await run;
    assert.deepEqual(e.assigned, [`${NATIVE_IOS_WEBVIEW_CALLBACK_PATH}?code=${CODE}&next=%2Fvedett-utvonal`]);
  });
  test("Android (Browser + appUrlOpen) → változatlanul /auth/callback", async () => {
    const e = env("android", false);
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail() });
    e.fire()?.({ url: deepLink });
    assert.deepEqual(e.assigned, [`${WEB_OAUTH_CALLBACK_PATH}?code=${CODE}&next=%2Fvedett-utvonal`]);
  });
  test("régi iOS-build (nincs authenticate) → változatlanul /auth/callback", async () => {
    const e = env("ios", false);
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail() });
    e.fire()?.({ url: deepLink });
    assert.deepEqual(e.assigned, [`${WEB_OAUTH_CALLBACK_PATH}?code=${CODE}&next=%2Fvedett-utvonal`]);
  });
  test("a webes Google-belépés (GoogleLoginButton) továbbra is a /auth/callback-et használja", () => {
    const btn = read("components/auth/GoogleLoginButton.tsx");
    assert.match(btn, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
    assert.match(btn, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback\?next=\$\{encodeURIComponent\(safeNext\)\}`/);
    assert.ok(!btn.includes(NATIVE_IOS_WEBVIEW_CALLBACK_PATH));
  });
});

describe("route és middleware", () => {
  const route = read("app/vedett-utvonal/auth/callback/route.ts");
  const mw = read("middleware.ts");
  test("a route a szerveroldali (sütis) klienssel és a közös logikával dolgozik, csak GET", () => {
    assert.ok(existsSync("app/vedett-utvonal/auth/callback/route.ts"));
    assert.match(route, /import \{ createClient \} from "@\/lib\/supabase\/server";/);
    assert.match(route, /handleNativeOAuthCallback\(request\.url,/);
    assert.match(route, /export async function GET\(/);
    assert.ok(!/export async function (POST|PUT|DELETE)/.test(route));
    assert.match(route, /export const dynamic = "force-dynamic";/);
    assert.match(route, /"Cache-Control", "private, no-store"/);
  });
  test("a meglévő /auth/callback route érintetlen marad (/belepes hibaág, /profil alapértelmezés)", () => {
    const old = read("app/auth/callback/route.ts");
    assert.match(old, /safeReturnPath\(searchParams\.get\("next"\), "\/profil"\)/);
    assert.match(old, /\/belepes\?next=/);
  });
  test("middleware: a callback nem kap rate-limit szabályt / átirányítást, a matcher lefedi (session-frissítés)", () => {
    const path = NATIVE_IOS_WEBVIEW_CALLBACK_PATH;
    const patterns = [...mw.matchAll(/pattern:\s*(\/.+?\/),\s*limit/g)].map((m) => m[1]);
    assert.ok(patterns.length > 0);
    for (const p of patterns) {
      const re = new RegExp(p.slice(1, p.lastIndexOf("/")));
      assert.equal(re.test(path), false, p);
    }
    assert.ok(!/NextResponse\.redirect/.test(mw), "a middleware nem irányít át");
    const matcher = /"\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\|\.\*\\\\\.\(\?:svg\|png\|jpg\|jpeg\|gif\|webp\)\$\)\.\*\)"/;
    assert.match(mw, matcher);
  });
});
