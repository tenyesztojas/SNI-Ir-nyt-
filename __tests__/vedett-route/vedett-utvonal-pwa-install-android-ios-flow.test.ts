// VÉDETT ÚTVONAL PWA INSTALL UX — 7. kör (2026-09-21), "MINIMÁLIS,
// kredittakarékos fix" regressziós tesztjei. Forráskód-szintű,
// source-contract tesztek (nincs jsdom/render), a projekt konvenciója
// szerint — lásd a repo többi __tests__/vedett-route/*.test.ts fájlját.
//
// A hotfix spec szerinti 8, kifejezetten megkövetelt tesztet fedi le:
//   1) Android + deferredPrompt -> natív gomb látható
//   2) Android klikk -> deferredPrompt.prompt() PONTOSAN egyszer
//   3) Android + NINCS deferredPrompt -> nincs böngésző-menüs instrukció
//   4) appinstalled -> CTA eltűnik
//   5) iOS böngészőben -> a MEGLÉVŐ (root) mintával megegyező install-help
//   6) iOS telepítve -> nincs install UI (dokumentált korlát)
//   7) manifest identitás (id/start_url/scope) VÁLTOZATLAN (daf40eb)
//   8) ?debugPwa=1 továbbra is működik

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
const stripLineComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");
const bannerSrc = read("components/PWAInstallBanner.tsx");
const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));

describe("1) Android + deferredPrompt -> natív telepítő gomb látható", () => {
  test("a deferredPrompt ágban egy 'Védett Útvonal telepítése' feliratú, handleAndroidInstall-ra kötött gomb renderel", () => {
    const block = installSrc.match(/\{platform === "android" && deferredPrompt && \([\s\S]*?<\/button>\s*\n\s*\)\}/)?.[0] ?? "";
    assert.ok(block.length > 0, "meg kell találni az Android deferredPrompt CTA ágat");
    assert.match(block, /onClick=\{handleAndroidInstall\}/);
    assert.match(block, /Védett Útvonal telepítése/);
  });
});

describe("2) Android klikk -> deferredPrompt.prompt() PONTOSAN egyszer fut le", () => {
  test("handleAndroidInstall pontosan egy await deferredPrompt.prompt() hívást tartalmaz, nincs automatikus/duplikált hívás", () => {
    const fnBlock = installSrc.match(/async function handleAndroidInstall\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(fnBlock.length > 0, "meg kell találni a handleAndroidInstall függvényt");
    const promptCalls = fnBlock.match(/deferredPrompt\.prompt\(\)/g) ?? [];
    assert.equal(promptCalls.length, 1, "a prompt() pontosan egyszer szerepelhet a kattintás-kezelőben");
    assert.match(fnBlock, /await deferredPrompt\.prompt\(\);/);
    const allPromptCalls = installSrc.match(/deferredPrompt\.prompt\(\)/g) ?? [];
    assert.equal(allPromptCalls.length, 1, "a deferredPrompt.prompt() a teljes fájlban is csak egyszer fordulhat elő");
  });
});

describe("3) Android + NINCS deferredPrompt -> nincs böngésző-menüs instrukció, a TELJES CTA rejtve", () => {
  test("nincs 'Telepítéshez nyisd meg a böngésző menüjét' szövegű ág, és az androidAwaitingPrompt elrejti a teljes CTA-t", () => {
    const code = stripLineComments(installSrc);
    assert.doesNotMatch(code, /Telepítéshez nyisd meg a böngésző menüjét/);
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
    assert.match(installSrc, /const androidAwaitingPrompt = platform === "android" && deferredPrompt === null;/);
    assert.match(installSrc, /androidAwaitingPrompt\s*\n\s*\? "android-awaiting-beforeinstallprompt"/);
    assert.match(installSrc, /if \(!ctaVisible\) return debugPanel;/);
  });
});

describe("4) appinstalled esemény -> a CTA eltűnik", () => {
  test("az appinstalled listener setInstalled(true)-t hív, és installed=true esetén a hideReason 'appinstalled-event'", () => {
    assert.match(installSrc, /const installedHandler = \(\) => setInstalled\(true\);/);
    assert.match(installSrc, /window\.addEventListener\("appinstalled", installedHandler\);/);
    assert.match(installSrc, /const hideReason: string \| null = installed\s*\n\s*\? "appinstalled-event"/);
  });
});

describe("5) iOS böngészőben -> a MEGLÉVŐ (root PWAInstallBanner) mintával megegyező install-help", () => {
  test("a Védett Útvonal iOS guide-ja ugyanazt a 3 lépéses Megosztás -> Főképernyőhöz mintát követi, mint a root banner", () => {
    assert.match(installSrc, /Koppints a Megosztás ikonra/);
    assert.match(installSrc, /Hozzáadás a Főképernyőhöz/);
    assert.match(bannerSrc, /Megosztás/);
    assert.match(bannerSrc, /Főképernyőhöz/);
    const iosBlock = installSrc.match(/\{platform === "ios" && !showIosGuide && \([\s\S]*?<\/button>\s*\n\s*\)\}/)?.[0] ?? "";
    assert.ok(iosBlock.length > 0);
    assert.doesNotMatch(iosBlock, /deferredPrompt/);
  });
});

describe("6) iOS telepítve -> nincs install UI (dokumentált korlát, nincs kitalált detekció)", () => {
  test("nincs navigator.standalone/isStandaloneDisplay alapú 'installed' találgatás iOS-re sem — a fejléc-komment dokumentálja a korlátot", () => {
    const code = stripLineComments(installSrc);
    assert.doesNotMatch(code, /if \(isStandaloneDisplay\(\)[^)]*\)\s*\{/);
    assert.doesNotMatch(code, /navigator\.standalone === true\)\s*\{/);
    assert.doesNotMatch(code, /if \([^)]*navigatorStandalone/);
    assert.match(installSrc, /redundans CTA/);
  });
});

describe("7) Manifest identitás (daf40eb) VÁLTOZATLAN ebben a körben", () => {
  test("a public/manifest-vedett-utvonal.json id/start_url/scope mezői nem változtak", () => {
    assert.equal(vedettManifest.id, "/vedett-utvonal/app");
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.equal(vedettManifest.scope, "/vedett-utvonal/app");
    assert.equal(vedettManifest.name, "Védett Útvonal");
  });
});

describe("8) ?debugPwa=1 diagnosztikai panel továbbra is működik", () => {
  test("a debug panel csak debugPwa=1 esetén jelenik meg, és a jelenlegi (androidAwaitingPrompt-ot is tartalmazó) hideReason-t jelenti", () => {
    assert.match(installSrc, /new URLSearchParams\(window\.location\.search\)\.get\("debugPwa"\) === "1"/);
    assert.match(installSrc, /const debugPanel = debugEnabled && debugSnapshot \? \(/);
    assert.match(installSrc, /install CTA decision: \{ctaVisible \? "SHOW" : "HIDE"\}/);
    assert.match(installSrc, /hide reason: \{hideReason/);
    assert.match(installSrc, /if \(!ctaVisible\) return debugPanel;/);
  });
});
