// VÉDETT ÚTVONAL — iOS natív fiókkezelés és fióktörlés (App Review 5.1.1(v)).
//   node --test __tests__/vedett-route/ios-account-deletion.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH,
  VEDETT_UTVONAL_ACCOUNT_PATH,
  VEDETT_UTVONAL_AFTER_DELETE_PATH,
  isIosNativeApp,
} from "../../lib/vedett-route/native/iosAccount.ts";
import { isVedettUtvonalReturnPath, safeReturnPath } from "../../lib/pwa/safeReturnPath.ts";
import { resolveNativeCallbackNext } from "../../lib/auth/nativeOAuthCallback.ts";

const read = (p: string) => readFileSync(p, "utf8");
const ORIGIN = "https://www.vedettsarok.hu";
// A Capacitor iOS csak a server.url előtagú teljes navigációt tartja a WebView-ban.
// A server.url a gitben követett capacitor.config.ts-ből jön (a generált
// ios/App/App/capacitor.config.json gitignore-olt, tiszta checkoutban nincs meg).
const SERVER_URL: string = (() => {
  const m = read("vedett-utvonal-native/capacitor.config.ts").match(/server:\s*\{[^}]*?\burl:\s*['"]([^'"]+)['"]/);
  assert.ok(m, "server.url nem található a capacitor.config.ts-ben");
  return m[1];
})();
const staysInIosWebView = (path: string) => `${ORIGIN}${path}`.startsWith(SERVER_URL);

const page = read("app/vedett-utvonal/fiok/page.tsx");
const link = read("components/vedett-utvonal/IosAccountLink.tsx");
const vu = read("app/vedett-utvonal/page.tsx");
const section = read("components/DeleteAccountSection.tsx");
const profil = read("app/profil/page.tsx");

const bridge = (platform: string, native = true) => ({
  Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
});

describe("platformfelismerés (natív híd, nem User-Agent)", () => {
  test("csak natív iOS → igaz", () => {
    assert.equal(isIosNativeApp(bridge("ios")), true);
  });
  test("Android, webes böngésző, nem natív, hiányos vagy hibás híd → hamis", () => {
    assert.equal(isIosNativeApp(bridge("android")), false);
    assert.equal(isIosNativeApp(bridge("web", false)), false);
    assert.equal(isIosNativeApp(bridge("ios", false)), false);
    assert.equal(isIosNativeApp({}), false);
    assert.equal(isIosNativeApp(null), false);
    assert.equal(isIosNativeApp({ Capacitor: { isNativePlatform: () => true } }), false);
    assert.equal(
      isIosNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error("x"); }, getPlatform: () => "ios" } }),
      false,
    );
  });
  test("a link csak mount után, a híd alapján jelenik meg (SSR-ben semmi)", () => {
    assert.match(link, /^"use client";/);
    assert.match(link, /useState\(false\)/);
    assert.match(link, /useEffect\(\(\) => \{\s*setShow\(isIosNativeApp\(\)\);/);
    assert.match(link, /if \(!show\) return null;/);
    assert.match(link, /href=\{VEDETT_UTVONAL_ACCOUNT_PATH\}/);
    assert.match(link, />\s*Fiókom és fióktörlés\s*</);
    assert.ok(!/userAgent/.test(link), "nem User-Agent alapú");
  });
});

describe("a link a bejelentkezett fiók-sávban, a Kilépés mellett", () => {
  test("a bejelentkezett ágban, közvetlenül a kilépés űrlap előtt", () => {
    assert.match(vu, /import IosAccountLink from "@\/components\/vedett-utvonal\/IosAccountLink";/);
    assert.match(vu, /\{user \? \([\s\S]*?<IosAccountLink \/>\s*<form action=\{signOutAction\}>[\s\S]*?Kilépés[\s\S]*?\) : \(/);
    assert.equal((vu.match(/<IosAccountLink \/>/g) ?? []).length, 1, "kijelentkezett ágban nincs");
  });
});

describe("Capacitor iOS: minden cél a WebView-ban marad", () => {
  test("a fiókoldal, a törlés utáni cél és a vissza link az előtagon belül van", () => {
    assert.equal(SERVER_URL, `${ORIGIN}/vedett-utvonal`);
    assert.equal(VEDETT_UTVONAL_ACCOUNT_PATH, "/vedett-utvonal/fiok");
    assert.equal(VEDETT_UTVONAL_AFTER_DELETE_PATH, "/vedett-utvonal");
    assert.ok(staysInIosWebView(VEDETT_UTVONAL_ACCOUNT_PATH));
    assert.ok(staysInIosWebView(VEDETT_UTVONAL_AFTER_DELETE_PATH));
    assert.equal(staysInIosWebView("/"), false, "a régi / cél Safarit nyitna");
  });
  test("a fiókoldalon csak engedélyezett hivatkozások: előtagon belüli, a meglévő belépés ide visszatérve, mailto", () => {
    const hrefs = [...page.matchAll(/href=(?:"([^"]*)"|\{([A-Z_]+)\})/g)].map((m) => m[1] ?? m[2]);
    assert.deepEqual(hrefs.sort(), [
      "VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH",
      "VEDETT_UTVONAL_AFTER_DELETE_PATH",
      "mailto:kapcsolat@vedettsarok.hu",
    ].sort());
    assert.ok(!/window\.location|redirect\(/.test(page), "nincs teljes oldalas navigáció / szerver redirect");
  });
  test("kijelentkezett állapot: a belépés a fiókoldalra tér vissza (web és natív Google callback is)", () => {
    assert.equal(VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH, "/belepes?next=%2Fvedett-utvonal%2Ffiok");
    const next = decodeURIComponent(VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH.split("next=")[1]);
    assert.equal(next, "/vedett-utvonal/fiok");
    assert.equal(safeReturnPath(next, "/profil"), next);
    assert.equal(isVedettUtvonalReturnPath(next), true, "Védett Útvonal belépési mód");
    assert.equal(resolveNativeCallbackNext(next), next, "iOS Google callback ide irányít vissza");
    assert.ok(staysInIosWebView(next));
    assert.match(page, /\{user \? \([\s\S]*<DeleteAccountSection[\s\S]*\) : \([\s\S]*href=\{VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH\}/);
  });
  test("a fiókoldal Link-kel (kliensoldali navigációval) visz tovább", () => {
    assert.match(page, /<Link\s+href=\{VEDETT_UTVONAL_AFTER_DELETE_PATH\}/);
    assert.match(page, /<Link\s+href=\{VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH\}/);
  });
});

describe("törlés utáni cél és a meglévő /profil változatlansága", () => {
  test("DeleteAccountSection: alapértelmezés továbbra is \"/\"; a cél prop-ból jön", () => {
    assert.match(section, /export default function DeleteAccountSection\(\{ afterDeleteHref = "\/" \}/);
    assert.match(section, /clearNavigationSession\(\);\s*window\.location\.assign\(afterDeleteHref\);/);
    assert.ok(!section.includes('window.location.assign("/")'));
    assert.match(section, /fetch\("\/api\/account\/delete", \{\s*method: "POST"/, "ugyanaz a törlési API");
  });
  test("a webes /profil prop nélkül használja (cél: \"/\", változatlan)", () => {
    assert.match(profil, /delete: <DeleteAccountSection \/>,/);
  });
  test("a fiókoldal a /vedett-utvonal célt adja át", () => {
    assert.match(page, /<DeleteAccountSection afterDeleteHref=\{VEDETT_UTVONAL_AFTER_DELETE_PATH\} \/>/);
  });
});

describe("a felület egyértelműen jelzi: a teljes VédettSarok-fiók törlődik", () => {
  test("hatókör szöveg", () => {
    assert.match(page, /A Védett Útvonal a VédettSarok-fiókodat használja\./);
    assert.match(page, /<strong>teljes VédettSarok-fiókot<\/strong> véglegesen törli – nem csak a Védett\s+Útvonalat\./);
    assert.match(page, /sem a VédettSarok weboldalra, sem a Védett Útvonal\s+webes, Android vagy iOS alkalmazásába/);
  });
  test("a fiókoldal nem indexelődik, mindig friss (force-dynamic)", () => {
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(page, /export const dynamic = "force-dynamic";/);
  });
});

describe("Next.js route és middleware", () => {
  test("az útvonal létezik, nem ütközik", () => {
    assert.ok(existsSync("app/vedett-utvonal/fiok/page.tsx"));
    assert.ok(!existsSync("app/vedett-utvonal/fiok/route.ts"));
  });
  test("a middleware rate-limit szabályai nem illeszkednek, és a middleware nem irányít át", () => {
    const mw = read("middleware.ts");
    const patterns = [...mw.matchAll(/pattern:\s*(\/.+?\/),\s*limit/g)].map((m) => m[1]);
    assert.ok(patterns.length > 0);
    for (const p of patterns) {
      assert.equal(new RegExp(p.slice(1, p.lastIndexOf("/"))).test(VEDETT_UTVONAL_ACCOUNT_PATH), false, p);
    }
    assert.ok(!/NextResponse\.redirect/.test(mw));
  });
});
