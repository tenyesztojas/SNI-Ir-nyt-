// VÉDETT ÚTVONAL PWA — elkülönített service worker scope (2026-09-21,
// célzott kör). Forráskód-szintű, source-contract teszt (nincs jsdom/
// render), a projekt konvenciója szerint.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const layoutSrc = read("app/layout.tsx");
const vedettSwSrc = read("public/vedett-utvonal-sw.js");
const rootSwSrc = read("public/sw.js");
const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");

describe("/vedett-utvonal route -> dedikált SW regisztráció, /vedett-utvonal/ scope-pal", () => {
  test("isVedettUtvonalRoute igaz esetén a vedett-utvonal-sw.js regisztrálódik, scope: '/vedett-utvonal/'", () => {
    assert.match(layoutSrc, /const isVedettUtvonalRoute = pathname\.startsWith\("\/vedett-utvonal"\);/);
    assert.match(
      layoutSrc,
      /register\('\/vedett-utvonal-sw\.js',\{scope:'\/vedett-utvonal\/'\}\)/
    );
  });
});

describe("root SW nem regisztrálódik konkurensen a Védett Útvonal route-on", () => {
  test("a register hívás isVedettUtvonalRoute ? dedikált SW : root /sw.js — a kettő kizárja egymást (ternary), nem futhat egyszerre", () => {
    const registerBlock = layoutSrc.match(/__html: isVedettUtvonalRoute\s*\n\s*\? `[^`]*`\s*\n\s*: `[^`]*`,/)?.[0] ?? "";
    assert.ok(registerBlock.length > 0, "meg kell találni a feltételes SW-regisztráló __html blokkot");
    assert.match(registerBlock, /register\('\/vedett-utvonal-sw\.js'/);
    assert.match(registerBlock, /register\('\/sw\.js'\)/);
  });
});

describe("más route -> root /sw.js változatlan", () => {
  test("a root public/sw.js fájl tartalma NEM módosult (push/notificationclick logika megmaradt)", () => {
    assert.match(rootSwSrc, /const CACHE = "vedettsarok-v2";/);
    assert.match(rootSwSrc, /self\.addEventListener\("push", \(e\) => \{/);
    assert.match(rootSwSrc, /self\.addEventListener\("notificationclick", \(e\) => \{/);
  });
});

describe("Védett Útvonal dedikált SW — minimális install/activate/fetch, nincs agresszív cache", () => {
  test("install/activate/fetch jelen van, navigáció mindig hálózatra megy, csak a saját statikus PRECACHE-t szolgálja ki", () => {
    assert.match(vedettSwSrc, /self\.addEventListener\("install", \(e\) => \{/);
    assert.match(vedettSwSrc, /self\.addEventListener\("activate", \(e\) => \{/);
    assert.match(vedettSwSrc, /self\.addEventListener\("fetch", \(e\) => \{/);
    assert.match(vedettSwSrc, /if \(e\.request\.mode === "navigate"\) return;/);
    assert.doesNotMatch(vedettSwSrc, /\/api\//);
  });
});

describe("Manifest identity változatlan ebben a körben", () => {
  test("id/start_url/scope/display nem módosult", () => {
    assert.equal(vedettManifest.id, "/vedett-utvonal");
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.equal(vedettManifest.scope, "/vedett-utvonal/");
    assert.equal(vedettManifest.display, "standalone");
  });
});

describe("Android — nincs böngésző-menüs manual fallback", () => {
  test("a 'Telepítéshez nyisd meg a böngésző menüjét' szöveg és a régi !deferredPrompt ág nincs jelen", () => {
    assert.doesNotMatch(installSrc, /Telepítéshez nyisd meg a böngésző menüjét/);
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
  });
});
