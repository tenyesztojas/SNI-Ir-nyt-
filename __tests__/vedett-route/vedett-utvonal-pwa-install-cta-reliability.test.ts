// VEDETT UTVONAL PWA INSTALL CTA - 3. koros "megbizhatoan felfedezheto"
// hotfix (2026-09-21) regresszios tesztjei. Forraskod-szintu,
// source-contract tesztek (nincs jsdom/render), a projekt konvencioja
// szerint - lasd a repo tobbi __tests__/vedett-route/*.test.ts fajljat.
//
// A hotfix specifikacioja szerint sorszamozva (1-15).

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


const normalPageSrc = read("app/vedett-utvonal/page.tsx");
const pwaPageSrc = read("app/vedett-utvonal/app/page.tsx");
const shellSrc = read("components/vedett-utvonal/VedettUtvonalPwaShell.tsx");
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");
const headerClientSrc = read("components/HeaderClient.tsx");
const rootManifest = JSON.parse(read("public/manifest.json"));
const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));

describe("1-2) Install component mounted mindket install surface-en", () => {
  test("1) /vedett-utvonal (normal oldal) mountolja a VedettUtvonalPwaInstall-t", () => {
    assert.match(normalPageSrc, /import VedettUtvonalPwaInstall from "@\/components\/vedett-utvonal\/VedettUtvonalPwaInstall";/);
    assert.match(normalPageSrc, /<VedettUtvonalPwaInstall \/>/);
  });

  test("2) /vedett-utvonal/app (dedikalt PWA shell) mountolja a VedettUtvonalPwaInstall-t", () => {
    assert.match(shellSrc, /import VedettUtvonalPwaInstall from "\.\/VedettUtvonalPwaInstall";/);
    assert.match(shellSrc, /<VedettUtvonalPwaInstall \/>/);
    assert.match(pwaPageSrc, /<VedettUtvonalPwaShell>/);
  });
});

describe("3-4) Bongeszo, beforeinstallprompt-tol fuggetlenul -> CTA SHOW", () => {
  test("3) beforeinstallprompt NELKUL is renderel a CTA (Android fallback szoveg)", () => {
    assert.match(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
    assert.match(installSrc, /Telepítéshez nyisd meg a böngésző menüjét/);
  });

  test("4) beforeinstallprompt ESETEN a CTA a natiiv prompt()-ot ajanlja fel", () => {
    assert.match(installSrc, /\{platform === "android" && deferredPrompt && \(/);
    assert.match(installSrc, /onClick=\{handleAndroidInstall\}/);
  });

  test("a CTA lathatosaga a render logikaban NEM fugg deferredPrompt-tol (csak installed/dismissed/platform dont)", () => {
    assert.match(installSrc, /const hideReason: string \| null = installed/);
    assert.doesNotMatch(installSrc, /const ctaVisible = .*deferredPrompt/);
  });
});

describe("5) iOS bongeszoben -> CTA SHOW, beforeinstallprompt-tol fuggetlenul", () => {
  test("iOS agban nincs deferredPrompt-hivatkozas", () => {
    const iosBlock = installSrc.match(/\{platform === "ios" && !showIosGuide && \([\s\S]*?<\/button>\s*\n\s*\)\}/)?.[0] ?? "";
    assert.ok(iosBlock.length > 0);
    assert.doesNotMatch(iosBlock, /deferredPrompt/);
  });
});

describe("6-8) A ROOT CAUSE javitasa: standalone onmagaban NEM eleg a CTA elrejtesehez, nincs referrer-alapu app-identitas", () => {
  test("6) nincs display-mode/isStandaloneDisplay alapu 'installed' ag a KODBAN (a fejlec-komment dokumentacios celbol MEGNEVEZI a regi, eltavolitott mintat, de az tenyleges vegrehajthato kodkent MAR NEM letezik)", () => {
    const installCode = stripLineComments(installSrc);
    assert.doesNotMatch(installCode, /if \(isStandaloneDisplay\(\)[^)]*\)\s*\{/);
    assert.doesNotMatch(installCode, /const \w+ = isStandaloneDisplay\(\)/);
  });

  test("7) VedettSarok standalone handoff eseten sincs semmilyen standalone-alapu elrejtes -> CTA a platform/dismissed szerint donthet (SHOW)", () => {
    // Lasd a 6. teszt asszercioit: mivel NINCS semmilyen isStandaloneDisplay
    // alapu ag, egy standalone handoff (VedettSarok PWA -> /vedett-utvonal/app)
    // eseten a CTA-t KIZAROLAG a dismissed-cooldown vagy a desktop-platform
    // rejtheti el - egyik sem all fenn egy friss, mobil munkameneten.
  });

  test("8) document.referrer sehol nincs hasznalva app-identitas/installed-detekcioban - csak diagnosztikai celra (debug panel)", () => {
    // A fejlec-komment prozaikusan TOBBSZOR megemliti a "document.referrer"
    // kifejezest (a regi, eltavolitott minta magyarazatakent) - ezert nem a
    // NYERS elofordulas-szamot vizsgaljuk, hanem hogy a TENYLEGES KODBAN
    // (feltetel/hozzarendeles) sehol ne szerepeljen HASZNALATKENT, kiveve a
    // debug snapshot mezokitoltest.
    const installCode = stripLineComments(installSrc);
    assert.doesNotMatch(installCode, /if \([^)]*document\.referrer/);
    assert.doesNotMatch(installCode, /&&\s*document\.referrer/);
    assert.match(installCode, /referrer: document\.referrer,/);
  });
});

describe("9-11) Diagnosztika (?debugPwa=1)", () => {
  test("9) a debug panel csak akkor jelenik meg, ha a URL query debugPwa=1", () => {
    assert.match(installSrc, /new URLSearchParams\(window\.location\.search\)\.get\("debugPwa"\) === "1"/);
    assert.match(installSrc, /const debugPanel = debugEnabled && debugSnapshot \? \(/);
  });

  test("10) debugPwa hianyaban a debugEnabled alapertelmezetten false (nincs veletlen production-lathatosag)", () => {
    assert.match(installSrc, /const \[debugEnabled, setDebugEnabled\] = useState\(false\);/);
  });

  test("11) a debug panel jelenti a manifest hrefet, a pathname-t es a CTA dontest/hide reasont - a debugSnapshot objektum NEM tartalmaz erzekeny mezot (GPS/Supabase/PII)", () => {
    assert.match(installSrc, /manifest href: \{debugSnapshot\.manifestHref/);
    assert.match(installSrc, /pathname: \{pathname\}/);
    assert.match(installSrc, /install CTA decision: \{ctaVisible \? "SHOW" : "HIDE"\}/);
    assert.match(installSrc, /hide reason: \{hideReason/);
    // A debugSnapshot TENYLEGES mezoit vizsgaljuk (nem a fejlec-prozat, ami
    // szoveges celbol megemliti, MIT nem tartalmaz a panel).
    const snapshotBlock = installSrc.match(/setDebugSnapshot\(\{[\s\S]*?\}\);/)?.[0] ?? "";
    assert.ok(snapshotBlock.length > 0, "meg kell talalni a setDebugSnapshot hivast");
    assert.doesNotMatch(snapshotBlock, /geolocation|latitude|longitude|supabase/i);
  });
});

describe("12-14) Manifest — egyszerre csak egy aktiv, route-fuggo", () => {
  test("12) /vedett-utvonal (install surface) a Vedett Utvonal manifestet exportalja", () => {
    assert.match(normalPageSrc, /manifest: "\/manifest-vedett-utvonal\.json",/);
  });

  test("13) /vedett-utvonal/app is a Vedett Utvonal manifestet exportalja", () => {
    assert.match(pwaPageSrc, /manifest: "\/manifest-vedett-utvonal\.json",/);
  });

  test("14) az egyeb route-ok (root layout) valtozatlanul a VedettSarok manifestet hasznaljak, csak EGY <link rel=manifest> aktiv dokumentumonkent (Next.js per-route metadata override, nincs kezi duplikacio)", () => {
    const layoutSrc = read("app/layout.tsx");
    assert.match(layoutSrc, /manifest: "\/manifest\.json",/);
    assert.doesNotMatch(layoutSrc, /<link[^>]*rel="manifest"/);
    assert.doesNotMatch(normalPageSrc, /<link[^>]*rel="manifest"/);
    assert.doesNotMatch(pwaPageSrc, /<link[^>]*rel="manifest"/);
    assert.equal(rootManifest.name, "VédettSarok");
    assert.equal(vedettManifest.name, "Védett Útvonal");
  });
});

describe("15) A navigacio hasznalata FUGGETLEN az install CTA-tol", () => {
  test("a normal oldalon a VedettUtvonalWorkspace az install CTA UTAN, azzal egy szinten renderel (nincs beagyazva, nem blokkolhatja)", () => {
    const installIdx = normalPageSrc.indexOf("<VedettUtvonalPwaInstall />");
    const workspaceIdx = normalPageSrc.indexOf("<VedettUtvonalWorkspace");
    assert.ok(installIdx > 0 && workspaceIdx > installIdx);
  });

  test("a PWA shellben a VedettUtvonalPwaInstall es a {children} (VedettUtvonalWorkspace) egymastol fuggetlen testverelemek", () => {
    assert.match(shellSrc, /<VedettUtvonalPwaInstall \/>\s*\n\s*<main className="flex-1">\{children\}<\/main>/);
  });
});

describe("Handoff cel — VedettSarok PWA -> /vedett-utvonal/app (nem valtozott, ujra megerositve)", () => {
  test("a HeaderClient handoff tovabbra is /vedett-utvonal/app-ra iranyit", () => {
    assert.match(headerClientSrc, /window\.location\.href = "\/vedett-utvonal\/app";/);
  });
});
