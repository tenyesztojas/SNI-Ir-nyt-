// VÉDETT ÚTVONAL / VÉDETTSAROK MOBIL UX sprint (2026-09-10) — PWA install UX
// (spec C. feladat) regresszió-tesztjei.
//
// FONTOS — ez a fájl a components/PWAInstallBanner.tsx (a MEGLÉVŐ, sitewide
// install-infrastruktúra bővítése, lásd a komponens fejléce) és a
// lib/pwa/navigationModeSignal.ts (a Navigation Mode <-> install-panel híd)
// forráskódját olvassa be, konzisztensen a repo többi vedett-route
// tesztjének mintájával.
//
//   node --test --experimental-strip-types __tests__/vedett-route/pwa-install-ux.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BANNER_PATH = join(import.meta.dirname, "..", "..", "components", "PWAInstallBanner.tsx");
const SIGNAL_PATH = join(import.meta.dirname, "..", "..", "lib", "pwa", "navigationModeSignal.ts");
const NAV_FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");

const bannerSrc = readFileSync(BANNER_PATH, "utf-8");
const signalSrc = readFileSync(SIGNAL_PATH, "utf-8");
const navFormSrc = readFileSync(NAV_FORM_PATH, "utf-8");

describe("12) Meglévő PWA infrastruktúra audit — nincs párhuzamos második rendszer", () => {
  test("a PWAInstallBanner a MEGLÉVŐ komponens bővítése (nincs új, második install-komponens) — a fájl fejléce dokumentálja az audit eredményét", () => {
    // A komment sortöréseit "// " folytatja, nem sima "\n"-t.
    assert.match(bannerSrc, /MEGLÉVŐ, sitewide install-\n\/\/ infrastruktúra/);
  });

  test("a manifest.json és sw.js útjai NEM változtak (a layout.tsx-ben lévő regisztráció NEM ehhez a fájlhoz tartozik, nem is kell duplikálni)", () => {
    // A TÉNYLEGES kódot vizsgáljuk (nem a fejléc-kommentet, amely
    // dokumentációs célból megnevezi a public/manifest.json és public/sw.js
    // fájlokat, mint a MEGLÉVŐ, változatlan infrastruktúra részét).
    assert.ok(!/<link[^>]*rel="manifest"/.test(bannerSrc), "a banner nem regisztrálhat manifest linket — az a layout.tsx metadata.manifest mezőjének a felelőssége, változatlanul");
    assert.ok(!/serviceWorker\.register\(/.test(bannerSrc), "a banner nem regisztrál service workert — az a layout.tsx inline scriptjének felelőssége, változatlanul");
  });
});

describe("V-X) Mikor NEM jelenjen meg — desktop / standalone / iOS standalone", () => {
  test("V) desktopon (platform==='other') a sheet nem lesz eligible, tehát nem jelenhet meg", () => {
    assert.match(bannerSrc, /if \(detected === "other"\) return;/);
  });

  test("W) window.matchMedia('(display-mode: standalone)') esetén installed=true, a sheet nem renderelődik", () => {
    assert.match(bannerSrc, /window\.matchMedia\("\(display-mode: standalone\)"\)\.matches/);
    assert.match(bannerSrc, /if \(isStandalone\(\)\) \{\s*\n\s*setInstalled\(true\);\s*\n\s*return;\s*\n\s*\}/);
  });

  test("X) iOS navigator.standalone===true esetén is installed=true (típusosan kezelve, kulturáltan)", () => {
    assert.match(bannerSrc, /\(window\.navigator as Navigator & \{ standalone\?: boolean \}\)\.standalone === true/);
  });

  test("15. pont — a nagy sheet csak durva pointerű ÉS szűk (<=640px) nézeten eligible, nem kizárólag UA-sniffing alapján (tabletnek ne ugorjon fel agresszíven)", () => {
    assert.match(bannerSrc, /window\.matchMedia\("\(pointer: coarse\)"\)\.matches/);
    assert.match(bannerSrc, /window\.matchMedia\("\(max-width: 640px\)"\)\.matches/);
    assert.match(bannerSrc, /if \(!isMobileLikeViewport\(\)\) \{\s*\n\s*return;\s*\n\s*\}/);
  });
});

describe("Y) Mikor jelenhet meg — mobile non-standalone", () => {
  test("Y) a `visible` levezetés armed && eligible && !installed && !dismissed && !navigationModeActive — mind az öt feltétel szükséges", () => {
    assert.match(bannerSrc, /const visible = armed && eligible && !installed && !dismissed && !navigationModeActive;/);
  });
});

describe("Z-AA) Dismiss cooldown — 7 nap, localStorage, nem Supabase", () => {
  test("Z) a dismiss cooldown pontosan 7 nap (7 * 24 * 60 * 60 * 1000 ms)", () => {
    assert.match(bannerSrc, /const DISMISS_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
  });

  test("Z) dismiss() localStorage-ba ír egy időbélyeget (Date.now()), NEM egy örökös '1' flag-et", () => {
    assert.match(bannerSrc, /window\.localStorage\.setItem\(DISMISS_KEY, String\(Date\.now\(\)\)\);/);
  });

  test("AA) a cooldown-on belüli dismiss után azonnali route váltás/re-mount esetén sem jelenik meg újra — a mount-effekt szinkron, useState-mentes olvasással dönt korán (isDismissedWithinCooldown), nem várja meg a delay-timert", () => {
    assert.match(bannerSrc, /if \(isDismissedWithinCooldown\(\)\) \{\s*\n\s*setDismissed\(true\);\s*\n\s*return;\s*\n\s*\}/);
  });

  test("AI) az install/dismiss state KIZÁRÓLAG localStorage-ban él — nincs Supabase-hívás ebben a fájlban", () => {
    // Tényleges Supabase-hívást/importot vizsgálunk, nem a fájl fejlécében
    // lévő "SEMMI Supabase" magyarázó kommentet (amely éppen az ellenkezőjét
    // dokumentálja, és nyers substring-keresésnél hamis pozitívot adna).
    assert.ok(!/from ["'].*supabase/i.test(bannerSrc), "a fájl nem importálhat semmit a supabase kliensből");
    assert.ok(!/supabase\s*\.\s*(from|auth|storage)/i.test(bannerSrc), "a fájl nem hívhat supabase API-t");
    assert.match(bannerSrc, /window\.localStorage\.setItem\(DISMISS_KEY/, "a dismiss állapotnak localStorage-ba kell írnia");
  });

  test("AJ) az install/dismiss state NEM tartalmaz GPS-adatot (nincs geolocation/latitude/longitude hivatkozás)", () => {
    assert.ok(!/geolocation|latitude|longitude/i.test(bannerSrc));
  });
});

describe("AB-AE) Android / Chromium install flow", () => {
  test("AB) beforeinstallprompt esetén e.preventDefault() fut, az eventet in-memory state-ben tárolja (NEM localStorage-ban/analyticsban)", () => {
    assert.match(bannerSrc, /const handler = \(e: Event\) => \{\s*\n\s*e\.preventDefault\(\);/);
    assert.match(bannerSrc, /setDeferredPrompt\(e as BeforeInstallPromptEvent\);/);
  });

  test("AC) a natív prompt() KIZÁRÓLAG a 'Telepítem' gomb explicit onClick-jéből (handleAndroidInstall) fut — nincs automatikus prompt() hívás mountkor", () => {
    const promptCalls = bannerSrc.match(/deferredPrompt\.prompt\(\)/g) ?? [];
    assert.equal(promptCalls.length, 1, "a deferredPrompt.prompt() hívásnak pontosan egyszer, a handleAndroidInstall-ban kell szerepelnie");
    assert.match(bannerSrc, /async function handleAndroidInstall\(\) \{\s*\n\s*if \(!deferredPrompt\) return;\s*\n\s*await deferredPrompt\.prompt\(\);/);
    assert.match(bannerSrc, /onClick=\{handleAndroidInstall\}/);
  });

  test("AD) userChoice kezelve (outcome ellenőrzés, deferredPrompt nullázása utána)", () => {
    assert.match(bannerSrc, /const \{ outcome \} = await deferredPrompt\.userChoice;\s*\n\s*if \(outcome === "accepted"\) setInstalled\(true\);\s*\n\s*setDeferredPrompt\(null\);/);
  });

  test("AE) appinstalled után installed=true (a panel emiatt nem renderelődik többé — lásd a `visible` levezetést), és analytics hívás fut (a meglévő /api/pwa-event, nem új rendszer)", () => {
    assert.match(bannerSrc, /const installedHandler = \(\) => \{\s*\n\s*setInstalled\(true\);/);
    assert.match(bannerSrc, /fetch\("\/api\/pwa-event", \{/);
  });

  test("17. pont — Android fallback, ha nincs beforeinstallprompt: NEM tűnik el a panel, rövid, nem egzakt menüpontra hivatkozó útmutatást ad", () => {
    assert.match(bannerSrc, /\{platform === "android" && !deferredPrompt && \(/);
    assert.match(bannerSrc, /"Alkalmazás telepítése" vagy "Hozzáadás a kezdőképernyőhöz"/);
  });
});

describe("AF-AG) iPhone / iOS install flow — nincs hamis programmatic install", () => {
  test("AF) iOS-en NINCS deferredPrompt/prompt() hívás felkényszerítve — a fő CTA 'Megmutatjuk, hogyan', ami csak egy instrukciós modalt nyit", () => {
    const iosBlockMatch = bannerSrc.match(/\{platform === "ios" && \(\s*\n\s*<button[\s\S]*?<\/button>\s*\n\s*\)\}/);
    assert.ok(iosBlockMatch, "meg kell találni az iOS CTA blokkot");
    assert.ok(!/deferredPrompt/.test(iosBlockMatch![0]), "az iOS ágnak nem szabad a deferredPrompt-ra hivatkoznia");
    assert.match(iosBlockMatch![0], /onClick=\{\(\) => setShowIOSModal\(true\)\}/);
  });

  test("AG) az iOS instrukció tartalmazza a Megosztás és a Hozzáadás a Főképernyőhöz lépéseket", () => {
    assert.match(bannerSrc, /Koppints a Megosztás ikonra/);
    assert.match(bannerSrc, /Hozzáadás a Főképernyőhöz/);
  });

  test("18. pont — iOS-en nem-Safari böngésző esetén kulturált Safari-átirányítás, nem hamis install-gomb", () => {
    assert.match(bannerSrc, /isNonSafariIOSBrowser = \/CriOS\|FxiOS\|EdgiOS\|OPiOS\//);
    assert.match(bannerSrc, /\{platform === "ios-other-browser" && \(/);
    assert.match(bannerSrc, /nyisd meg az oldalt Safariban/);
  });

  test("AH) 'Most nem' gomb mindig jelen van és működik (dismiss())", () => {
    const mostNemMatches = bannerSrc.match(/onClick=\{dismiss\}/g) ?? [];
    assert.ok(mostNemMatches.length >= 1, "legalább egy 'Most nem'-jellegű gombnak dismiss()-t kell hívnia");
    assert.match(bannerSrc, />\s*Most nem\s*</);
  });
});

describe("21) Modal / bottom sheet accessibility — dialog, Escape, nincs focus trap", () => {
  test("role=dialog, aria-modal, aria-labelledby a headline-ra mutat", () => {
    assert.match(bannerSrc, /role="dialog"/);
    assert.match(bannerSrc, /aria-modal="true"/);
    assert.match(bannerSrc, /aria-labelledby=\{headlineId\}/);
    assert.match(bannerSrc, /<h2 id=\{headlineId\}/);
  });

  test("Escape lezárja a panelt (dismiss())", () => {
    assert.match(bannerSrc, /if \(e\.key === "Escape"\) dismiss\(\);/);
  });

  test("nincs explicit focus trap (nem korlátozza a Tab-bal kilépést — csak kezdő fókuszt ad a dialógusnak)", () => {
    // Konkrét, tényleges Tab-billentyű-elfogást vizsgálunk (pl. egy keydown
    // handlerben e.key === "Tab" ág preventDefault-tal) — NEM egy tág,
    // többsoros regex-et, amely a dokumentációs kommentben szereplő "Tab"
    // szót (amely éppen azt írja le, hogy NINCS focus trap) hamis pozitívként
    // találná meg.
    assert.ok(!/e\.key === "Tab"/.test(bannerSrc), "nem szabad a Tab-billentyűt elfogni/megakadályozni");
    assert.match(bannerSrc, /dialogRef\.current\?\.focus\(\);/);
  });
});

describe("20/23) Panel méret és időzítés — nagy bottom sheet, kulturált késleltetés", () => {
  test("a sheet magassága 40-55dvh tartományba esik (min-h-[40dvh], max-h-[55dvh])", () => {
    assert.match(bannerSrc, /max-h-\[55dvh\] min-h-\[40dvh\]/);
  });

  test("safe-area-bottom padding be van állítva", () => {
    assert.match(bannerSrc, /env\(safe-area-inset-bottom, 0px\)/);
  });

  test("23. pont — a panel csak SHOW_DELAY_MS (2-4s tartományban, itt 2500ms) után válik láthatóvá, nem a render első pillanatában", () => {
    assert.match(bannerSrc, /const SHOW_DELAY_MS = 2500;/);
    assert.match(bannerSrc, /setTimeout\(\(\) => setArmed\(true\), SHOW_DELAY_MS\)/);
  });
});

describe("24. Sitewide elhelyezés és 25/AK. Navigation Mode regresszióvédelem", () => {
  test("a navigationModeSignal modul egy minimális pub/sub, NEM egy új globális routing state architektúra (nincs Context.Provider/Redux/Zustand import)", () => {
    // A tényleges KÓDOT vizsgáljuk (import-okat, API-hívásokat), NEM a
    // fájl fejlécében lévő magyarázó kommentet, amely szándékosan megnevezi
    // a Context/Redux/Zustand alternatívákat éppen azért, hogy leírja: a
    // modul EZEKET NEM használja (ez a komment maga okozna hamis pozitívot
    // egy nyers substring-keresésnél).
    assert.ok(!/from ["']react["']/.test(signalSrc), "a modul nem importál semmit a react-ből (nincs createContext/useContext/useState)");
    assert.ok(!/from ["'](redux|react-redux|zustand|@reduxjs\/toolkit)["']/i.test(signalSrc), "a modul nem importál state-management könyvtárat");
    assert.ok(!/\bcreateContext\(/.test(signalSrc), "a modul nem hív createContext()-et");
    assert.match(signalSrc, /const EVENT_NAME = "vedettsarok:navigation-mode-change";/);
  });

  test("AK) a banner subscribeNavigationModeActive-on keresztül figyeli a Navigation Mode állapotát, és a `visible` levezetésben kizárja a megjelenést, amíg az aktív", () => {
    assert.match(bannerSrc, /subscribeNavigationModeActive\(setNavigationModeActiveLocal\)/);
    assert.match(bannerSrc, /!navigationModeActive/);
  });

  test("a VedettUtvonalSearchForm.tsx a navigationMode változásait setNavigationModeActive()-on keresztül sugározza ki, és unmountkor/leállításkor explicit false-ra állítja (nem marad 'beragadva' true-n)", () => {
    assert.match(navFormSrc, /import \{ setNavigationModeActive \} from "@\/lib\/pwa\/navigationModeSignal";/);
    assert.match(
      navFormSrc,
      /useEffect\(\(\) => \{\s*\n\s*setNavigationModeActive\(navigationMode\);\s*\n\s*return \(\) => \{\s*\n\s*setNavigationModeActive\(false\);\s*\n\s*\};\s*\n\s*\}, \[navigationMode\]\);/
    );
  });

  test("25. pont regressziólista: a Navigation Mode UI-elemek (▶ Navigáció indítása, ✕ Navigáció befejezése, 📍 Kövesd a helyzetem, ⛶ Teljes képernyő) továbbra is jelen vannak a formban — ezt a kört nem törölte", () => {
    assert.match(navFormSrc, /▶ Navigáció indítása/);
    assert.match(navFormSrc, /✕ Navigáció befejezése/);
    assert.match(navFormSrc, /📍 Kövesd a helyzetem/);
    assert.match(navFormSrc, /⛶ Teljes képernyő/);
  });

  test("a Favorite CTA módosítás (favoriteSaveState) és a Navigation Mode (navigationMode) egymástól FÜGGETLEN state-ek — a favoriteSaveState setterei sehol nem hivatkoznak navigationMode-ra vagy a térkép state-jeire", () => {
    const saveFavoriteFn = navFormSrc.match(/async function handleSaveFavorite\(\) \{[\s\S]*?\n  \}/);
    assert.ok(saveFavoriteFn);
    assert.ok(!/navigationMode|followMode|VedettUtvonalMap/.test(saveFavoriteFn![0]), "a favorite-mentés logikájának nem szabad a Navigation Mode / térkép állapotára hivatkoznia");
  });
});
