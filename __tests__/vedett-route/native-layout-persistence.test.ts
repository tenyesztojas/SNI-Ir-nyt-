// Védett Útvonal natív megjelenés megőrzése a Google OAuth visszatérés után
// (2026-10-03). Gyökérok: a public/sw.js minden same-origin GET-et (navigációt
// is) újra-fetch-el, és az így kiadott kérések UA-ja nem tartalmazza a
// Capacitor appendUserAgent markert -> a szerver-oldali UA-detektálás elveszett.
// Statikus forrás-regressziós tesztek (a layout egy async szerver komponens).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const layout = read("app/layout.tsx");
const sw = read("public/sw.js");
const button = read("components/auth/GoogleLoginButton.tsx");
const helper = read("lib/auth/nativeGoogleOAuth.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n === ".next") continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe("a gyökérok dokumentált (service worker újra-fetch)", () => {
  test("a service worker minden same-origin GET-et re-fetch-el", () => {
    assert.match(sw, /respondWith\(\s*fetch\(e\.request\)/);
    assert.match(sw, /clients\.claim\(\)/);
  });
});

describe("natív layout natív marad", () => {
  test("a szerver az UA markert VAGY a vu_native sütit olvassa", () => {
    assert.match(layout, /includes\("VedettUtvonalNative"\) \|\|\s*cookies\(\)\.get\("vu_native"\)\?\.value === "1"/);
    assert.match(layout, /import \{ cookies, headers \} from "next\/headers"/);
  });
  test("a Header/Footer/banner továbbra is hideSiteChrome mögött (natívban rejtett)", () => {
    for (const c of ["Header", "Footer", "PWAInstallBanner", "PWASessionTracker"]) {
      assert.match(layout, new RegExp(`\\{!hideSiteChrome && <${c} />\\}`));
    }
    assert.match(layout, /const hideSiteChrome = isVedettUtvonalPwaShell \|\| isNativeApp/);
  });
  test("normál böngésző: marker nélkül nincs rejtés, a SW regisztráció megmarad", () => {
    assert.match(layout, /window\.addEventListener\('load',function\(\)\{navigator\.serviceWorker\.register\('\/sw\.js'\)\}\)/);
    // a rejtés kizárólag a marker/süti feltételtől függ
    assert.doesNotMatch(layout, /hideSiteChrome = true/);
  });
  test("natívban (kliens-oldali marker): süti beállítása, SW leiratkozás, cache törlés, nincs regisztráció", () => {
    assert.match(layout, /navigator\.userAgent\.indexOf\('VedettUtvonalNative'\)>-1/);
    assert.match(layout, /document\.cookie='vu_native=1; path=\/; max-age=31536000; SameSite=Lax; Secure'/);
    assert.match(layout, /getRegistrations\(\)\.then\(function\(rs\)\{rs\.forEach\(function\(r\)\{r\.unregister\(\)\}\)\}\)/);
    assert.match(layout, /k\.indexOf\('vedettsarok-'\)===0\)caches\.delete\(k\)/);
    // natív ág `return`-nel kilép, mielőtt a regisztráció futna
    const native = layout.indexOf("indexOf('VedettUtvonalNative')>-1");
    const ret = layout.indexOf("return}", native);
    const reg = layout.indexOf("serviceWorker.register('/sw.js')");
    assert.ok(native > 0 && ret > native && reg > ret);
  });
  test("a SW script továbbra is nonce-os (CSP változatlan)", () => {
    const i = layout.indexOf("(function(){try{if(navigator.userAgent");
    assert.match(layout.slice(Math.max(0, i - 200), i), /nonce=\{nonce\}/);
  });
});

describe("a marker CSAK megjelenítési: nincs auth/jogosultsági függés", () => {
  test("sem a marker, sem a süti nem szerepel auth/access/middleware kódban", () => {
    const offenders: string[] = [];
    for (const f of [...walk("app"), ...walk("lib"), ...walk("components"), "middleware.ts"]) {
      if (f === join("app", "layout.tsx")) continue;
      const s = read(f);
      if (/vu_native|VedettUtvonalNative/.test(s)) offenders.push(f);
    }
    // a Védett Útvonal natív/PWA komponensek és a Google helper SEM hivatkozhat rá
    assert.deepEqual(offenders.filter((f) => /access|auth|middleware|supabase/i.test(f)), []);
  });
  test("a süti nem HttpOnly-kritikus és nem kerül URL-be", () => {
    assert.doesNotMatch(layout, /vu_native[^\n]*(access_token|refresh_token)/);
    assert.doesNotMatch(layout, /\?vu_native|&vu_native/);
  });
});

describe("OAuth átmenet + a Google flow változatlan", () => {
  test("loading állapot a callback navigáció előtt", () => {
    assert.match(helper, /options\.onReturning\?\.\(\);\s*win\.location\.assign\(buildWebViewCallbackPath/);
    assert.match(button, /Belépés folyamatban…/);
    assert.match(button, /data-testid="native-login-loading"/);
    assert.match(button, /onReturning: \(\) => setReturning\(true\)/);
  });
  test("a Google flow érintetlen: skipBrowserRedirect, pontos deep link, Browser", () => {
    assert.match(helper, /skipBrowserRedirect: true/);
    assert.match(helper, /NATIVE_OAUTH_REDIRECT_URI = "hu\.vedettsarok\.utvonal:\/\/auth\/callback"/);
    assert.match(helper, /"Browser", "open"/);
    assert.doesNotMatch(helper, /accounts\.google\.com/);
  });
  test("a callback biztonsága változatlan (sanitizált next)", () => {
    const cb = read("app/auth/callback/route.ts");
    assert.match(cb, /safeReturnPath\(searchParams\.get\("next"\), "\/profil"\)/);
  });
});
