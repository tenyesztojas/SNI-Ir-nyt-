// VÉDETT ÚTVONAL PWA — INSTALL CTA NEM JELENIK MEG (2026-09-21 hotfix)
// regressziós tesztek. Forráskód-szintű, source-contract tesztek — a
// projekt konvenciója szerint (nincs jsdom/render), ugyanúgy, mint a
// c390ab9/5399c0b sprintek tesztjei.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const normalPageSrc = read("app/vedett-utvonal/page.tsx");
const pwaPageSrc = read("app/vedett-utvonal/app/page.tsx");
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");
const rootManifest = JSON.parse(read("public/manifest.json"));
const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));

describe("1/12/13) Manifest — install surface-ök a Védett Útvonal identitást hordozzák, a VédettSarok identitás változatlan", () => {
  test("a normál /vedett-utvonal oldal (install surface) a Védett Útvonal manifestet exportálja", () => {
    assert.match(normalPageSrc, /export const metadata: Metadata = \{\s*\n\s*manifest: "\/manifest-vedett-utvonal\.json",/);
  });

  test("a dedikált /vedett-utvonal/app shell is a Védett Útvonal manifestet exportálja", () => {
    assert.match(pwaPageSrc, /manifest: "\/manifest-vedett-utvonal\.json",/);
  });

  test("egyik oldal sem hardcode-ol manuális <link rel=\"manifest\"> taget — mindkettő a Next.js metadata API-n (per-route override, egyszerre csak egy manifest link aktív) keresztül dönt", () => {
    assert.doesNotMatch(normalPageSrc, /<link[^>]*rel="manifest"/);
    assert.doesNotMatch(pwaPageSrc, /<link[^>]*rel="manifest"/);
  });

  test("a Védett Útvonal manifest identitása helyes (name/start_url/icon), a VédettSarok manifest változatlan", () => {
    assert.equal(vedettManifest.name, "Védett Útvonal");
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.match(vedettManifest.icons[0].src, /^\/vedett-utvonal-icon/);
    assert.equal(rootManifest.name, "VédettSarok");
  });
});

describe("D/E) Az install CTA MOSTANTÓL mindkét felületen mountolódik", () => {
  test("a normál /vedett-utvonal oldal importálja és rendereli a VedettUtvonalPwaInstall-t", () => {
    assert.match(normalPageSrc, /import VedettUtvonalPwaInstall from "@\/components\/vedett-utvonal\/VedettUtvonalPwaInstall";/);
    assert.match(normalPageSrc, /<VedettUtvonalPwaInstall \/>/);
  });

  test("a dedikált PWA shell (VedettUtvonalPwaShell) is rendereli — ez korábban is így volt, nem regresszió", () => {
    const shellSrc = read("components/vedett-utvonal/VedettUtvonalPwaShell.tsx");
    assert.match(shellSrc, /<VedettUtvonalPwaInstall \/>/);
  });
});

describe("SZUPERSZEDÁLT (3. kör, 2026-09-21) — ez a describe-blokk a2706ff heurisztikáját tesztelte, amit a következő production hibajelentés megcáfolt", () => {
  test("a display-mode/referrer alapú 'installed' találgatás TELJESEN el lett távolítva — lásd vedett-utvonal-pwa-install-cta-reliability.test.ts", () => {
    assert.doesNotMatch(installSrc, /if \(isStandaloneDisplay\(\)[^)]*\)\s*\{/);
  });
});

describe("5/6/7/8) Android/iOS CTA — nincs kizárólag beforeinstallprompt-hoz kötve", () => {
  // 7. kori spec-valtozas (2026-09-21): a korabbi allitas (a CTA prompt
  // NELKUL is renderel egy fallback-szoveget) TEVES installalhatosagot
  // sugallt, ezert a felhasznalo explicit keresere eltavolitottuk - lasd
  // vedett-utvonal-pwa-install-cta-reliability.test.ts "3-4" describe
  // blokkjat a reszletes uj elvarasert.
  test("Android: CTA prompt NÉLKÜL a TELJES install lehetőség rejtve marad (nincs félrevezető fallback szöveg)", () => {
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
    assert.match(installSrc, /androidAwaitingPrompt = platform === "android" && deferredPrompt === null/);
  });

  test("Android: van deferredPrompt esetén natív prompt() az explicit CTA-ból", () => {
    assert.match(installSrc, /onClick=\{handleAndroidInstall\}/);
    assert.match(installSrc, /await deferredPrompt\.prompt\(\);/);
  });

  test("iOS: a CTA-ág NEM függ deferredPrompt-tól (beforeinstallprompt Chromium-only, iOS-en nincs ilyen esemény)", () => {
    const iosButtonBlock = installSrc.match(/\{platform === "ios" && !showIosGuide && \([\s\S]*?<\/button>\s*\n\s*\)\}/)?.[0] ?? "";
    assert.ok(iosButtonBlock.length > 0, "meg kell találni az iOS CTA gomb ágat");
    assert.doesNotMatch(iosButtonBlock, /deferredPrompt/);
  });

  test("iOS: a CTA a meglévő Megosztás -> Főképernyőhöz guide-ot nyitja meg", () => {
    assert.match(installSrc, /Koppints a Megosztás ikonra/);
    assert.match(installSrc, /Hozzáadás a Főképernyőhöz/);
  });
});

describe("11) A navigáció (VedettUtvonalWorkspace) használata FÜGGETLEN az install CTA-tól", () => {
  test("a normál oldalon a VedettUtvonalWorkspace renderelése nincs a VedettUtvonalPwaInstall JSX-en belülre ágyazva", () => {
    const installIdx = normalPageSrc.indexOf("<VedettUtvonalPwaInstall />");
    const workspaceIdx = normalPageSrc.indexOf("<VedettUtvonalWorkspace");
    assert.ok(installIdx > 0 && workspaceIdx > installIdx, "a workspace-nek az install CTA UTÁN, azzal egy szinten (nem beágyazva) kell szerepelnie");
    assert.match(normalPageSrc, /<VedettUtvonalWorkspace disabled=\{!enabled\} initialDestination=\{initialDestination\} \/>/);
  });
});
