// VÉDETT ÚTVONAL — alkalmazásletöltési jelzések (config + forrásszintű integráció)
//   node --test __tests__/vedett-route/app-download-badges.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_PLAY_URL,
  APP_STORE_URL,
  STORE_BADGE_IMAGES,
  STORE_LABELS,
  getVedettAppStoreLinks,
  normalizeAppStoreUrl,
} from "../../lib/vedett-route/appStoreLinks.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("letöltési linkek konfigurációja", () => {
  test("Google Play: az éles, hivatalos URL (változatlan)", () => {
    assert.equal(GOOGLE_PLAY_URL, "https://play.google.com/store/apps/details?id=hu.vedettsarok.utvonal");
    assert.equal(getVedettAppStoreLinks().googlePlay.href, GOOGLE_PLAY_URL);
  });

  test("App Store: az éles, hivatalos URL, pontosan", () => {
    assert.equal(APP_STORE_URL, "https://apps.apple.com/hu/app/védett-útvonal/id6821697394?l=hu");
    assert.equal(getVedettAppStoreLinks().appStore.href, APP_STORE_URL);
    const u = new URL(APP_STORE_URL);
    assert.equal(u.protocol, "https:");
    assert.equal(u.hostname, "apps.apple.com");
    assert.match(u.pathname, /\/id6821697394$/);
    assert.equal(u.searchParams.get("l"), "hu");
    assert.notEqual(normalizeAppStoreUrl(APP_STORE_URL), null);
  });

  test("feliratok (akadálymentes név)", () => {
    assert.equal(STORE_LABELS.googlePlay, "Letöltés a Google Playből");
    assert.equal(STORE_LABELS.appStore, "Letöltés az App Store-ból");
    const l = getVedettAppStoreLinks();
    assert.equal(l.googlePlay.label, STORE_LABELS.googlePlay);
    assert.equal(l.appStore.label, STORE_LABELS.appStore);
  });

  test("jelvényképek: létező PNG-k, az eredeti méretekkel", () => {
    for (const b of Object.values(STORE_BADGE_IMAGES)) {
      const buf = readFileSync(join(process.cwd(), "public", b.src));
      assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", b.src);
      assert.equal(buf.readUInt32BE(16), b.width, b.src);
      assert.equal(buf.readUInt32BE(20), b.height, b.src);
    }
  });

  test("normalizeAppStoreUrl: hibás / idegen / nem https URL elutasítva", () => {
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
    }
  });
});

describe("AppDownloadBadges komponens", () => {
  const c = read("components/vedett-utvonal/AppDownloadBadges.tsx");

  test("nincs beégetett áruházi URL, csak a configból jön", () => {
    assert.doesNotMatch(c, /play\.google\.com|apps\.apple\.com/);
    assert.match(c, /getVedettAppStoreLinks\(\)/);
  });

  test("mindkét áruház link: új lapon, biztonságos rel-lel, akadálymentes névvel", () => {
    assert.match(c, /<StoreBadge link=\{googlePlay\} testId="google-play-badge" \/>/);
    assert.match(c, /<StoreBadge link=\{appStore\} testId="app-store-badge" \/>/);
    assert.match(c, /target="_blank"/);
    assert.match(c, /rel="noopener noreferrer"/);
    assert.match(c, /aria-label=\{`\$\{link\.label\}/);
    assert.match(c, /focus-visible:ring-2/);
  });

  test("nincs „Hamarosan” jelzés, nincs ismételt szöveges felirat a jelvény mellett", () => {
    assert.doesNotMatch(c, /Hamarosan|coming_soon|iPhone-ra is/);
    assert.doesNotMatch(c, /Google Playről|App Store-ból|StoreButtonContent/);
  });

  test("jelvénykép nem torzul (fix magasság, w-auto, eredeti méret-attribútumok), dekoratív alt", () => {
    assert.match(c, /width=\{link\.badge\.width\}/);
    assert.match(c, /height=\{link\.badge\.height\}/);
    assert.match(c, /alt=""/);
    assert.match(c, /className="h-12 w-auto"/);
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
    assert.match(page, /<VedettUtvonalWorkspace disabled=\{!enabled\} initialDestination=\{initialDestination\} initialOrigin=\{initialOrigin\} isAuthenticated=\{Boolean\(user\)\} \/>/);
  });
});
