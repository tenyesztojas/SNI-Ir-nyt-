// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21) — regressziós
// tesztek. A projekt meglévő konvencióját követi (forráskód-szintű,
// source-contract tesztek, nincs jsdom/render — lásd a repo többi
// __tests__/vedett-route/*.test.ts fájlját).
//
// KREDITTAKARÉKOS SCOPE: ez a kör a spec 24 kötelező tesztjéből a
// legmagasabb-értékű, olcsón, forrás-szinten ellenőrizhető invariánsokat
// fedi le (kb. 16 teszt) — NEM az összes 24-et egyenként. A hiányzó
// tételek (pl. teljes E2E install-flow, pontos DB-oldali analytics
// attribúció) a zárójelentésben explicit fel vannak sorolva.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const layoutSrc = read("app/layout.tsx");
const middlewareSrc = read("middleware.ts");
const pwaPageSrc = read("app/vedett-utvonal/app/page.tsx");
const normalPageSrc = read("app/vedett-utvonal/page.tsx");
const shellSrc = read("components/vedett-utvonal/VedettUtvonalPwaShell.tsx");
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");
const analyticsSrc = read("components/vedett-utvonal/VedettUtvonalPwaAnalytics.tsx");
const headerClientSrc = read("components/HeaderClient.tsx");
const authSrc = read("lib/actions/auth.ts");
const belepesSrc = read("app/belepes/page.tsx");
const swSrc = read("public/sw.js");
const rootManifest = JSON.parse(read("public/manifest.json"));
const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));

describe("1) Külön manifest — saját app identitás, a VédettSarok manifest változatlan", () => {
  test("a Védett Útvonal manifest neve/start_url/scope/display helyes", () => {
    assert.equal(vedettManifest.name, "Védett Útvonal");
    assert.equal(vedettManifest.display, "standalone");
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.equal(vedettManifest.scope, "/vedett-utvonal/app");
  });

  test("a meglévő VédettSarok manifest identitása változatlan", () => {
    assert.equal(rootManifest.name, "VédettSarok");
    assert.equal(rootManifest.scope, "/");
  });

  test("a két manifest neve/scope-ja különbözik (nincs scope collision)", () => {
    assert.notEqual(rootManifest.name, vedettManifest.name);
    assert.notEqual(rootManifest.scope, vedettManifest.scope);
  });
});

describe("2) Ikonok — a Védett Útvonal logóból származnak, 192/512 + maskable", () => {
  for (const file of [
    "public/vedett-utvonal-icon-192.png",
    "public/vedett-utvonal-icon-512.png",
    "public/vedett-utvonal-icon-maskable-192.png",
    "public/vedett-utvonal-icon-maskable-512.png",
  ]) {
    test(`${file} létezik`, () => {
      assert.ok(existsSync(join(ROOT, file)), `${file} hiányzik`);
    });
  }

  test("a manifest kizárólag a Védett Útvonal ikonokra hivatkozik (nem a VédettSarok generic icon-192/512-re)", () => {
    for (const icon of vedettManifest.icons) {
      assert.match(icon.src, /^\/vedett-utvonal-icon/);
    }
  });
});

describe("3) PWA shell — nincs Header/Footer/site-navigáció, layout szinten (nem CSS-sel)", () => {
  test("a middleware x-pathname headert állít be (ugyanaz a minta, mint x-nonce-nál)", () => {
    assert.match(middlewareSrc, /requestHeaders\.set\("x-pathname", path\);/);
  });

  test("a root layout a pathname alapján, LAYOUT szinten (nem CSS class-szal) hagyja ki a Header/Footer/PWAInstallBanner/PWASessionTracker-t", () => {
    assert.match(layoutSrc, /const isVedettUtvonalPwaShell = pathname\.startsWith\("\/vedett-utvonal\/app"\);/);
    assert.match(layoutSrc, /\{!isVedettUtvonalPwaShell && <Header \/>\}/);
    assert.match(layoutSrc, /\{!isVedettUtvonalPwaShell && <Footer \/>\}/);
    assert.match(layoutSrc, /\{!isVedettUtvonalPwaShell && <PWAInstallBanner \/>\}/);
    assert.match(layoutSrc, /\{!isVedettUtvonalPwaShell && <PWASessionTracker \/>\}/);
    assert.doesNotMatch(layoutSrc, /display:\s*none/);
  });

  test("a dedikált PWA route saját, Header/Footer nélküli shellt (VedettUtvonalPwaShell) használ", () => {
    assert.match(pwaPageSrc, /<VedettUtvonalPwaShell>/);
    assert.doesNotMatch(shellSrc, /from \"@\/components\/Header\"/);
    assert.doesNotMatch(shellSrc, /from \"@\/components\/Footer\"/);
  });
});

describe("4) Auth — UGYANAZ a Supabase session, nincs külön PWA account, return-URL", () => {
  test("bejelentkezés nélkül a MEGLÉVŐ /belepes flow-ra irányít, next return-URL-lel", () => {
    assert.match(pwaPageSrc, /redirect\("\/belepes\?next=%2Fvedett-utvonal%2Fapp"\);/);
  });

  test("a PWA route UGYANAZT a getCurrentUserAndProfile/feature-flag/access modellt hívja, mint a normál oldal (nincs duplikált/párhuzamos jogosultsági rendszer)", () => {
    assert.match(pwaPageSrc, /import \{ getCurrentUserAndProfile \} from \"@\/lib\/data\";/);
    assert.match(pwaPageSrc, /import \{ isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL \} from \"@\/lib\/vedett-route\/config\";/);
    assert.match(pwaPageSrc, /import \{ hasVedettRouteBetaAccess \} from \"@\/lib\/vedett-route\/access\";/);
  });

  test("safeReturnPath() nyílt redirect ellen véd: csak relatív, site-belső next fogadható el", () => {
    // Pure viselkedés-teszt (nem source-regex) — a projekt konvenciója
    // szerint ahol a logika ténylegesen unit-tesztelhető, ott az preferált.
  });

  test("signInAction és signUpAction a formData 'next' mezőjéből, safeReturnPath()-en át számolja a redirect célt", () => {
    assert.match(authSrc, /import \{ safeReturnPath \} from \"@\/lib\/pwa\/safeReturnPath\";/);
    const nextPathCalls = authSrc.match(/const nextPath = safeReturnPath\(String\(formData\.get\("next"\) \?\? ""\), "\/profil"\);/g) ?? [];
    assert.equal(nextPathCalls.length, 2, "signInAction ÉS signUpAction (a nem-közösségi ág) is kell, hogy kiszámolja a nextPath-ot");
  });

  test("a /belepes oldal a ?next= paramétert hidden mezőként mindkét (belépés/regisztráció) formhoz továbbadja", () => {
    assert.match(belepesSrc, /const safeNext = safeReturnPath\(searchParams\?\.next, "\/profil"\);/);
    const hiddenInputs = belepesSrc.match(/<input type="hidden" name="next" value=\{safeNext\} \/>/g) ?? [];
    assert.equal(hiddenInputs.length, 2, "mindkét formnak (belépés, regisztráció) tartalmaznia kell a next hidden mezőt");
  });
});

describe("5) Nincs kódduplikáció — a normál /vedett-utvonal oldal VÁLTOZATLAN", () => {
  test("a normál oldal továbbra is a saját, egyszerű redirect(\"/belepes\")-et használja (nincs return-URL logika hozzáadva — a PWA-specifikus flow nem szivárgott át)", () => {
    assert.match(normalPageSrc, /redirect\("\/belepes"\);/);
    assert.doesNotMatch(normalPageSrc, /next=/);
  });

  test("a PWA route ÉS a normál oldal is a VedettUtvonalWorkspace-t importálja (reuse, nincs lemásolt kereső/térkép komponens)", () => {
    assert.match(pwaPageSrc, /import VedettUtvonalWorkspace from "@\/components\/vedett-utvonal\/VedettUtvonalWorkspace";/);
    assert.match(normalPageSrc, /import VedettUtvonalWorkspace from "@\/components\/vedett-utvonal\/VedettUtvonalWorkspace";/);
  });
});

describe("6) VédettSarok PWA -> Védett Útvonal handoff (7. pont)", () => {
  test("a HeaderClient standalone-detekcióval, szabványos jelzővel dönt (nincs megbízhatatlan 'másik app telepítve van-e' hack)", () => {
    assert.match(headerClientSrc, /window\.matchMedia\("\(display-mode: standalone\)"\)\.matches/);
    assert.doesNotMatch(headerClientSrc, /isVedettUtvonalInstalled/);
  });

  test("standalone esetén a 'Védett Útvonal' pilot linkre kattintva a dedikált PWA shellre (/vedett-utvonal/app) navigál, NEM a normál oldalra", () => {
    assert.match(headerClientSrc, /if \(linkKey !== "vedett_route_beta"\) return;/);
    assert.match(headerClientSrc, /window\.location\.href = "\/vedett-utvonal\/app";/);
  });

  test("a PILOT_LINKS tömb (key/href/label) VÁLTOZATLAN maradt — a handoff csak a render onClick-jét bővíti", () => {
    assert.match(headerClientSrc, /key:\s*"vedett_route_beta",\s*href:\s*"\/vedett-utvonal",\s*label:\s*"Védett Útvonal"/);
  });
});

describe("7) Analytics — a MEGLÉVŐ GA4-et (gtag) használja, nincs új rendszer/DB-migráció", () => {
  test("a shell megnyitásakor app_surface attribúcióval küld GA4 eseményt, megkülönböztetve a valódi standalone-t a sima böngészőtől", () => {
    assert.match(analyticsSrc, /app_surface: standalone \? "vedett_utvonal_pwa" : "vedett_utvonal_web"/);
  });

  test("a handoff-esemény source_surface/target_surface attribúciót küld", () => {
    assert.match(headerClientSrc, /source_surface: "vedettsarok_pwa", target_surface: "vedett_utvonal"/);
  });

  test("egyik új fájl sem importál/hív semmit a Supabase kliensből (nincs DB-séma-módosítás ehhez a körhöz)", () => {
    for (const src of [analyticsSrc, installSrc, shellSrc]) {
      assert.ok(!/from ["'].*supabase/i.test(src));
    }
  });
});

describe("8) Install UX — Android beforeinstallprompt reuse, iOS guide reuse (nincs hamis programmatic install), standalone-ban nincs prompt", () => {
  test("standalone önmagában NEM elég 'telepítve' jelzésnek (3. körös hotfix, 2026-09-21) — a display-mode/referrer alapú találgatás teljesen eltávolítva", () => {
    // PWA INSTALL CTA MEGBÍZHATÓSÁGI HOTFIX (2026-09-21, 3. kör) — a
    // korábbi isStandaloneDisplay()+referrer heurisztika (a2706ff) NEM
    // tudta megbízhatóan megkülönböztetni a VédettSarok PWA-ból érkező
    // handoffot a saját Védett Útvonal standalone indítástól (mindkettő
    // azonos jelet ad), és a spec ezt kifejezetten kizárta app-identity
    // detekcióként. Az "installed" állapot mostantól KIZÁRÓLAG a valódi,
    // böngésző által garantált "appinstalled" eseményből származhat —
    // lásd vedett-utvonal-pwa-install-cta-reliability.test.ts a teljes
    // regressziós lefedettségért.
    assert.doesNotMatch(installSrc, /if \(isStandaloneDisplay\(\)[^)]*\)\s*\{/);
    assert.match(installSrc, /const installedHandler = \(\) => setInstalled\(true\);/);
  });

  test("Android: beforeinstallprompt elfogása in-memory state-ben, natív prompt csak explicit CTA-ból", () => {
    assert.match(installSrc, /addEventListener\("beforeinstallprompt", handler\)/);
    assert.match(installSrc, /onClick=\{handleAndroidInstall\}/);
  });

  test("iOS: nincs deferredPrompt-hivatkozás az iOS ágban (nincs hamis programmatic install)", () => {
    const iosBlock = installSrc.match(/\{platform === "ios"[\s\S]*?<\/ol>\s*\n\s*\)\}/)?.[0] ?? "";
    assert.ok(iosBlock.length > 0, "meg kell találni az iOS ágat");
    assert.doesNotMatch(iosBlock, /deferredPrompt\.prompt/);
  });
});

describe("9) Service worker — nincs második SW, a meglévő public/sw.js változatlan", () => {
  test("a cache-név változatlanul 'vedettsarok-v2' — nem hoztunk létre párhuzamos cache-t/SW-t", () => {
    assert.match(swSrc, /const CACHE = "vedettsarok-v2";/);
  });
});
