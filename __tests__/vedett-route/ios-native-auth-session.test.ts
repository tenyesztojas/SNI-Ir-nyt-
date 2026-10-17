// VÉDETT ÚTVONAL — iOS Google-belépés: ASWebAuthenticationSession + a
// visszajátszott / későn érkező callbackek kezelése (13-as build előkészítése).
//   node --test __tests__/vedett-route/ios-native-auth-session.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NATIVE_AUTH_SESSION_METHOD,
  NATIVE_AUTH_SESSION_PLUGIN,
  NATIVE_GOOGLE_ERRORS,
  NATIVE_LOGIN_RETURN_TIMEOUT_MS,
  startNativeGoogleLogin,
  supportsNativeAuthSession,
  type NativeOAuthWindow,
} from "../../lib/auth/nativeGoogleOAuth.ts";

const CODE = "3f2b8a1e-9c4d-4e57-8a60-1b2c3d4e5f60";
const CODE2 = "9a8b7c6d-1111-4222-8333-444455556666";
const AUTH_URL = "https://abc.supabase.co/auth/v1/authorize?provider=google";
const flush = () => new Promise((r) => setTimeout(r, 0));

type Call = { plugin: string; method: string; options?: Record<string, unknown> };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** iOS 13+ build: a natív `authenticate` metódus a PluginHeaders-ben szerepel. */
function iosEnv(opts: { platform?: string; methods?: string[]; headers?: boolean } = {}) {
  const { platform = "ios", methods = ["start", NATIVE_AUTH_SESSION_METHOD], headers = true } = opts;
  const calls: Call[] = [];
  const assigned: string[] = [];
  const oauthArgs: unknown[] = [];
  const pendingAuth: ReturnType<typeof deferred<unknown>>[] = [];
  const win: NativeOAuthWindow = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      PluginHeaders: headers
        ? [{ name: "App", methods: [{ name: "getState" }] }, { name: NATIVE_AUTH_SESSION_PLUGIN, methods: methods.map((name) => ({ name })) }]
        : undefined,
      nativePromise: (plugin, method, options) => {
        calls.push({ plugin, method, options });
        if (plugin === NATIVE_AUTH_SESSION_PLUGIN && method === NATIVE_AUTH_SESSION_METHOD) {
          const d = deferred<unknown>();
          pendingAuth.push(d);
          return d.promise;
        }
        return Promise.resolve({});
      },
      addListener: () => ({ remove: () => undefined }),
    },
    location: { assign: (u: string) => void assigned.push(u) },
  };
  const supabase = {
    auth: {
      signInWithOAuth: async (args: unknown) => {
        oauthArgs.push(args);
        return { data: { provider: "google", url: AUTH_URL }, error: null };
      },
    },
  } as never;
  return { win, supabase, calls, assigned, oauthArgs, pendingAuth };
}

/** Régi iOS-build / Android: Browser + appUrlOpen út, megőrzött esemény-visszajátszással. */
function legacyEnv(opts: { retained?: string } = {}) {
  const calls: Call[] = [];
  const assigned: string[] = [];
  const listeners: Record<string, ((d?: { url?: string }) => void) | undefined> = {};
  let retained = opts.retained;
  const oauth = { count: 0, gate: null as null | ReturnType<typeof deferred<void>> };
  const win: NativeOAuthWindow = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      PluginHeaders: [{ name: NATIVE_AUTH_SESSION_PLUGIN, methods: [{ name: "start" }] }],
      nativePromise: async (plugin, method, options) => {
        calls.push({ plugin, method, options });
        return {};
      },
      addListener: (plugin, event, cb) => {
        listeners[`${plugin}.${event}`] = cb;
        // A Capacitor App plugin a figyelő nélkül érkezett eseményt a
        // feliratkozáskor (aszinkron) visszajátssza.
        if (plugin === "App" && event === "appUrlOpen" && retained) {
          const url = retained;
          retained = undefined;
          queueMicrotask(() => cb({ url }));
        }
        return { remove: () => void delete listeners[`${plugin}.${event}`] };
      },
    },
    location: { assign: (u: string) => void assigned.push(u) },
  };
  const supabase = {
    auth: {
      signInWithOAuth: async () => {
        oauth.count++;
        if (oauth.gate) await oauth.gate.promise;
        return { data: { provider: "google", url: AUTH_URL }, error: null };
      },
    },
  } as never;
  return { win, supabase, calls, assigned, listeners, oauth };
}

describe("képességvizsgálat (hívás nélkül, PluginHeaders alapján)", () => {
  test("iOS + authenticate metódus → natív hitelesítési munkamenet", () => {
    assert.equal(supportsNativeAuthSession(iosEnv().win), true);
  });
  test("régebbi iOS-build (nincs authenticate) → nem; Android → nem; fejléc nélkül → nem", () => {
    assert.equal(supportsNativeAuthSession(iosEnv({ methods: ["start", "getSafeAreaInsets"] }).win), false);
    assert.equal(supportsNativeAuthSession(iosEnv({ platform: "android" }).win), false);
    assert.equal(supportsNativeAuthSession(iosEnv({ headers: false }).win), false);
    assert.equal(supportsNativeAuthSession({ location: { assign() {} } }), false);
  });
  test("a régi build nem kap authenticate hívást (az sosem válaszolna)", async () => {
    const e = legacyEnv();
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba") });
    assert.ok(!e.calls.some((c) => c.method === NATIVE_AUTH_SESSION_METHOD));
    assert.ok(e.calls.some((c) => c.plugin === "Browser" && c.method === "open"));
  });
});

describe("iOS ASWebAuthenticationSession út", () => {
  test("sikeres callback → /vedett-utvonal/auth/callback a kóddal (WebView-ban marad); nincs Browser és appUrlOpen", async () => {
    const e = iosEnv();
    let returning = 0;
    const run = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba"), onReturning: () => returning++ });
    await flush();
    const auth = e.calls.find((c) => c.method === NATIVE_AUTH_SESSION_METHOD);
    assert.deepEqual(auth?.options, { url: AUTH_URL, callbackScheme: "hu.vedettsarok.utvonal" });
    assert.deepEqual(e.oauthArgs, [{ provider: "google", options: { redirectTo: "hu.vedettsarok.utvonal://auth/callback", skipBrowserRedirect: true } }]);
    e.pendingAuth[0].resolve({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    await run;
    assert.deepEqual(e.assigned, [`/vedett-utvonal/auth/callback?code=${CODE}&next=%2Fvedett-utvonal`]);
    assert.equal(returning, 1);
    assert.ok(!e.calls.some((c) => c.plugin === "Browser"));
  });

  test("PKCE: a kódcsere a SAJÁT signInWithOAuth utáni kóddal, egyetlen verifier-generálással", async () => {
    const e = iosEnv();
    const run = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => {} });
    await flush();
    assert.equal(e.oauthArgs.length, 1, "a kísérlet pontosan egyszer hoz létre code_verifiert");
    e.pendingAuth[0].resolve({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    await run;
    assert.equal(e.oauthArgs.length, 1, "a callback után nincs új signInWithOAuth (a verifier nem íródik felül)");
    // Az iOS út callbackje ugyanazzal a szerveroldali (sütis) klienssel cserél kódot.
    const route = readFileSync("app/vedett-utvonal/auth/callback/route.ts", "utf8");
    assert.match(route, /const supabase = createClient\(\);/);
    assert.match(route, /exchangeCodeForSession: \(code\) => supabase\.auth\.exchangeCodeForSession\(code\)/);
  });

  test("megszakítás (AUTH_CANCELLED) → onCancel, nincs navigáció", async () => {
    const e = iosEnv();
    let cancelled = false;
    const run = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba"), onCancel: () => { cancelled = true; } });
    await flush();
    e.pendingAuth[0].reject(new Error("AUTH_CANCELLED"));
    await run;
    assert.equal(cancelled, true);
    assert.equal(e.assigned.length, 0);
  });

  test("natív hiba vagy érvénytelen callback URL → hibaüzenet, nincs navigáció", async () => {
    for (const outcome of ["reject", "bad-url", "error-param"] as const) {
      const e = iosEnv();
      const msgs: string[] = [];
      const run = startNativeGoogleLogin(e.supabase, { win: e.win, onError: (m) => msgs.push(m) });
      await flush();
      if (outcome === "reject") e.pendingAuth[0].reject(new Error("AUTH_FAILED"));
      else if (outcome === "bad-url") e.pendingAuth[0].resolve({ url: `evil.app://auth/callback?code=${CODE}` });
      else e.pendingAuth[0].resolve({ url: "hu.vedettsarok.utvonal://auth/callback?error=server_error" });
      await run;
      assert.deepEqual(msgs, [NATIVE_GOOGLE_ERRORS.failed], outcome);
      assert.equal(e.assigned.length, 0, outcome);
    }
  });

  test("új kísérlet után a korábbi kísérlet későn érkező eredménye semmit nem csinál", async () => {
    const e = iosEnv();
    const msgs: string[] = [];
    const first = startNativeGoogleLogin(e.supabase, { win: e.win, onError: (m) => msgs.push(m) });
    await flush();
    const second = startNativeGoogleLogin(e.supabase, { win: e.win, onError: (m) => msgs.push(m) });
    await flush();
    assert.equal(e.pendingAuth.length, 2);
    e.pendingAuth[0].resolve({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    await first;
    assert.equal(e.assigned.length, 0, "a lezárt kísérlet kódja nem navigál");
    e.pendingAuth[1].resolve({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE2}` });
    await second;
    assert.deepEqual(e.assigned, [`/vedett-utvonal/auth/callback?code=${CODE2}&next=%2Fvedett-utvonal`]);
    assert.deepEqual(msgs, []);
  });
});

describe("Browser út (Android / régebbi iOS-build): visszajátszott és késői callback", () => {
  test("a korábbi kísérletből megőrzött appUrlOpen nem navigál; a friss callback igen, egyszer", async () => {
    const e = legacyEnv({ retained: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => assert.fail("nincs hiba") });
    assert.equal(e.assigned.length, 0, "a visszajátszott régi kód eldobva");
    assert.ok(e.calls.some((c) => c.plugin === "App" && c.method === "getState"), "natív oda-vissza a visszajátszás lezárásához");
    assert.ok(e.calls.some((c) => c.plugin === "Browser" && c.method === "open"), "az új OAuth folyamat elindul");
    e.listeners["App.appUrlOpen"]?.({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE2}` });
    e.listeners["App.appUrlOpen"]?.({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE2}` });
    assert.deepEqual(e.assigned, [`/auth/callback?code=${CODE2}&next=%2Fvedett-utvonal`]);
  });

  test("megszakítás (browserFinished) után érkező callback figyelmen kívül", async () => {
    const e = legacyEnv();
    let cancelled = false;
    const appUrlOpen = () => e.listeners["App.appUrlOpen"];
    await startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => {}, onCancel: () => { cancelled = true; }, cancelGraceMs: 5 });
    const late = appUrlOpen();
    e.listeners["Browser.browserFinished"]?.();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(cancelled, true);
    late?.({ url: `hu.vedettsarok.utvonal://auth/callback?code=${CODE}` });
    assert.equal(e.assigned.length, 0);
  });

  test("ha közben új kísérlet indult, a régi nem nyit böngészőt", async () => {
    const e = legacyEnv();
    e.oauth.gate = deferred<void>();
    const first = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => {} });
    await flush();
    await flush();
    const gate = e.oauth.gate;
    e.oauth.gate = null;
    const second = startNativeGoogleLogin(e.supabase, { win: e.win, onError: () => {} });
    await second;
    gate.resolve();
    await first;
    assert.equal(e.calls.filter((c) => c.plugin === "Browser" && c.method === "open").length, 1);
  });
});

describe("Belépés folyamatban — időkorlát (forrás-szint)", () => {
  const button = readFileSync("components/auth/GoogleLoginButton.tsx", "utf8");
  test("20 s után a takaró eltűnik, hibaüzenet jelenik meg, a gomb újra használható", () => {
    assert.equal(NATIVE_LOGIN_RETURN_TIMEOUT_MS, 20_000);
    assert.equal(NATIVE_GOOGLE_ERRORS.timeout, "A belépés nem fejeződött be. Próbáld újra.");
    assert.match(
      button,
      /if \(!returning\) return;\s*const timer = setTimeout\(\(\) => \{\s*setReturning\(false\);\s*setErrorMessage\(NATIVE_GOOGLE_ERRORS\.timeout\);\s*\}, NATIVE_LOGIN_RETURN_TIMEOUT_MS\);\s*return \(\) => clearTimeout\(timer\);/,
    );
    assert.match(button, /setErrorMessage\(null\);\s*setReturning\(false\);/);
  });
});

describe("natív iOS oldal (forrás-szint; a fordítást az iOS Build Check végzi)", () => {
  const plugin = readFileSync("vedett-utvonal-native/ios/App/App/Navigation/VedettNavigationPlugin.swift", "utf8");
  test("authenticate regisztrálva, ASWebAuthenticationSession, csak https + saját séma", () => {
    assert.match(plugin, /import AuthenticationServices/);
    assert.match(plugin, /CAPPluginMethod\(name: "authenticate", returnType: CAPPluginReturnPromise\)/);
    assert.match(plugin, /static let allowedAuthCallbackScheme = "hu\.vedettsarok\.utvonal"/);
    assert.match(plugin, /url\.scheme\?\.lowercased\(\) == "https"/);
    assert.match(plugin, /call\.getString\("callbackScheme"\) == Self\.allowedAuthCallbackScheme/);
    assert.match(plugin, /ASWebAuthenticationSession\(\s*url: url,\s*callbackURLScheme: Self\.allowedAuthCallbackScheme/);
    assert.match(plugin, /prefersEphemeralWebBrowserSession = false/);
    assert.match(plugin, /self\.authSession\?\.cancel\(\)/);
    assert.match(plugin, /authError\.code == \.canceledLogin \{\s*call\.reject\("AUTH_CANCELLED"\)/);
    assert.match(plugin, /if !newSession\.start\(\) \{/);
  });
  test("a webes kód nem próbálja ki hívással a metódust (régi buildeken sosem válaszolna)", () => {
    const helper = readFileSync("lib/auth/nativeGoogleOAuth.ts", "utf8");
    assert.match(helper, /const useAuthSession = supportsNativeAuthSession\(win\);/);
    assert.match(helper, /bridge\.PluginHeaders/);
  });
});
