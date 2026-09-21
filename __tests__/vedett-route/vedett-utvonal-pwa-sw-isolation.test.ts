// VÉDETT ÚTVONAL PWA — elkülönített service worker scope + takeover
// (2026-09-21, "SW TAKEOVER FIX" kör). Forráskód-szintű, source-contract
// teszt (nincs jsdom/render), a projekt konvenciója szerint.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const layoutSrc = read("app/layout.tsx");
const vedettSwSrc = read("public/vedett-utvonal-sw.js");
const rootSwSrc = read("public/sw.js");
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");

describe("Dedikált SW — takeover (skipWaiting + clients.claim)", () => {
  test("install -> self.skipWaiting(), activate -> event.waitUntil(self.clients.claim())", () => {
    assert.match(vedettSwSrc, /self\.addEventListener\("install", \(e\) => \{\s*\n\s*self\.skipWaiting\(\);/);
    assert.match(vedettSwSrc, /self\.addEventListener\("activate", \(e\) => \{\s*\n\s*e\.waitUntil\(self\.clients\.claim\(\)\);/);
  });
});

describe("/vedett-utvonal -> dedikált SW registration, root NEM regisztrálódik ezen a route-on", () => {
  test("isVedettUtvonalRoute ? dedikált SW (scope /vedett-utvonal/) : root /sw.js — kizárják egymást", () => {
    assert.match(layoutSrc, /const isVedettUtvonalRoute = pathname\.startsWith\("\/vedett-utvonal"\);/);
    const registerBlock = layoutSrc.match(/__html: isVedettUtvonalRoute\s*\n\s*\? `[^`]*`\s*\n\s*: `[^`]*`,/)?.[0] ?? "";
    assert.ok(registerBlock.length > 0, "meg kell találni a feltételes SW-regisztráló __html blokkot");
    assert.match(registerBlock, /register\('\/vedett-utvonal-sw\.js',\{scope:'\/vedett-utvonal\/'\}\)/);
    assert.match(registerBlock, /register\('\/sw\.js'\)/);
  });
});

describe("más route -> root /sw.js változatlan", () => {
  test("a root public/sw.js fájl NEM módosult (push/notificationclick logika megmaradt)", () => {
    assert.match(rootSwSrc, /const CACHE = "vedettsarok-v2";/);
    assert.match(rootSwSrc, /self\.addEventListener\("push", \(e\) => \{/);
    assert.match(rootSwSrc, /self\.addEventListener\("notificationclick", \(e\) => \{/);
  });
});

describe("Nincs új cache-stratégia a dedikált SW-ben", () => {
  test("nincs caches.open/addAll/match hívás, a fetch handler nem hív respondWith-et", () => {
    assert.doesNotMatch(vedettSwSrc, /caches\.(open|match|keys)/);
    assert.doesNotMatch(vedettSwSrc, /respondWith/);
    assert.match(vedettSwSrc, /self\.addEventListener\("fetch", \(e\) => \{/);
  });
});

describe("Android — nincs böngésző-menüs manual fallback", () => {
  test("a 'Telepítéshez nyisd meg a böngésző menüjét' szöveg és a régi !deferredPrompt ág nincs jelen", () => {
    assert.doesNotMatch(installSrc, /Telepítéshez nyisd meg a böngésző menüjét/);
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
  });
});
