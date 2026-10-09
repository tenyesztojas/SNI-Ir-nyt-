// VÉDETT ÚTVONAL — alkalmazásletöltési jelzések (config + forrásszintű integráció)
//   node --test __tests__/vedett-route/app-download-badges.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_PLAY_URL,
  APP_STORE_URL_ENV,
  getVedettAppStoreLinks,
  normalizeAppStoreUrl,
} from "../../lib/vedett-route/appStoreLinks.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("letöltési linkek konfigurációja", () => {
  test("Google Play: az éles, hivatalos URL", () => {
    assert.equal(GOOGLE_PLAY_URL, "https://play.google.com/store/apps/details?id=hu.vedettsarok.utvonal");
    const links = getVedettAppStoreLinks({});
    assert.deepEqual(links.googlePlay.status, "available");
    assert.equal(links.googlePlay.status === "available" && links.googlePlay.href, GOOGLE_PLAY_URL);
  });

  test("App Store: env nélkül 'coming_soon', nincs href", () => {
    const { appStore } = getVedettAppStoreLinks({});
    assert.equal(appStore.status, "coming_soon");
    assert.ok(!("href" in appStore));
  });

  test("App Store: érvényes apps.apple.com URL beállításakor kattintható", () => {
    const url = "https://apps.apple.com/hu/app/vedett-utvonal/id1234567890";
    const { appStore } = getVedettAppStoreLinks({ [APP_STORE_URL_ENV]: url });
    assert.equal(appStore.status, "available");
    assert.equal(appStore.status === "available" && appStore.href, url);
  });

  test("App Store: hibás / idegen / nem https URL elutasítva", () => {
    for (const bad of [
      "",
      "   ",
      "http://apps.apple.com/hu/app/x/id1",
      "https://evil.example/app/id1",
      "https://apps.apple.com/hu/developer/x/id1",
      "javascript:alert(1)",
      "nem url",
    ]) {
      assert.equal(normalizeAppStoreUrl(bad), null, bad);
      assert.equal(getVedettAppStoreLinks({ [APP_STORE_URL_ENV]: bad }).appStore.status, "coming_soon");
    }
  });
});

describe("AppDownloadBadges komponens", () => {
  const c = read("components/vedett-utvonal/AppDownloadBadges.tsx");

  test("nincs beégetett áruházi URL, csak a configból jön", () => {
    assert.doesNotMatch(c, /play\.google\.com|apps\.apple\.com/);
    assert.match(c, /getVedettAppStoreLinks\(\)/);
  });

  test("Google Play link új lapon, biztonságos rel-lel, akadálymentes névvel", () => {
    assert.match(c, /target="_blank"/);
    assert.match(c, /rel="noopener noreferrer"/);
    assert.match(c, /Letöltés a Google Playről|"Google Playről"/);
    assert.match(c, /focus-visible:ring-2/);
  });

  test("App Store 'Hamarosan iPhone-ra is': nem link, nem gomb", () => {
    const i = c.indexOf('data-testid="app-store-coming-soon"');
    assert.ok(i > 0);
    const start = c.lastIndexOf("<span", i);
    const block = c.slice(start, c.indexOf("</span>\n      )}", i));
    assert.match(block, /Hamarosan iPhone-ra is/);
    assert.doesNotMatch(block, /<a\b|href=|<button|onClick|tabIndex/);
  });

  test("hivatalos jelvénykép nem torzul (fix magasság, w-auto)", () => {
    assert.match(c, /<img src=\{link\.badgeSrc\}[^>]*className="h-12 w-auto"/);
  });

  test("natív appon belül nem jelenik meg", () => {
    assert.match(c, /VedettUtvonalNative/);
    assert.match(c, /if \(isNativeAppRequest\(\)\) return null;/);
  });
});

describe("megjelenési helyek", () => {
  test("főoldali Védett Útvonal kártya: a meglévő CTA megmarad, mellette a jelvények", () => {
    const home = read("app/page.tsx");
    const i = home.indexOf("Megtervezem az útvonalam");
    const j = home.indexOf('<AppDownloadBadges testId="homepage-app-download-badges" />');
    assert.ok(i > 0 && j > i, "CTA után következik a letöltés");
    assert.match(home.slice(i - 600, j), /sm:flex-row/);
  });

  test("/vedett-utvonal aloldal: jelvények a kereső fölött, a workspace változatlan", () => {
    const page = read("app/vedett-utvonal/page.tsx");
    const badge = page.lastIndexOf('<AppDownloadBadges className="mt-4"');
    const ws = page.indexOf("<VedettUtvonalWorkspace disabled={!enabled}");
    assert.ok(badge > 0 && ws > badge);
    assert.match(page, /<VedettUtvonalWorkspace disabled=\{!enabled\} initialDestination=\{initialDestination\} isAuthenticated=\{Boolean\(user\)\} \/>/);
  });
});
