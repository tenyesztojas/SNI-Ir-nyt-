// VÉDETT ÚTVONAL PWA — elkülönített service worker scope + takeover
// (2026-09-21, "SW SCOPE EXACT FIX" kör). Forráskód-szintű,
// source-contract teszt (nincs jsdom/render), a projekt konvenciója
// szerint.

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

describe("1) scope pontosan '/vedett-utvonal' (manifest ÉS registration)", () => {
  test("manifest.scope === '/vedett-utvonal', registration scope ugyanaz", () => {
    assert.equal(vedettManifest.scope, "/vedett-utvonal");
    assert.match(layoutSrc, /register\('\/vedett-utvonal-sw\.js',\{scope:'\/vedett-utvonal'\}\)/);
  });
});

describe("2) '/vedett-utvonal' (landing, trailing slash NÉLKÜL) lefedett", () => {
  test("a scope '/vedett-utvonal' string-prefix illeszkedik a pontos landing URL-re is (nincs kötelező záró '/')", () => {
    const scope = vedettManifest.scope as string;
    assert.ok("/vedett-utvonal".startsWith(scope), "a landing URL-nek a scope prefixének kell lennie");
    assert.notEqual(scope, "/vedett-utvonal/", "a scope NEM végződhet '/'-vel, különben a landing kimaradna");
  });
});

describe("3) '/vedett-utvonal/app' (dedikált shell) is lefedett", () => {
  test("a start_url a scope prefix alá esik", () => {
    const scope = vedettManifest.scope as string;
    assert.ok(vedettManifest.start_url.startsWith(scope));
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.equal(vedettManifest.id, "/vedett-utvonal");
    assert.equal(vedettManifest.display, "standalone");
  });
});

describe("4) root SW más route-okon változatlan", () => {
  test("a root public/sw.js NEM módosult, és a registration routing a root ágat is megőrzi", () => {
    assert.match(rootSwSrc, /const CACHE = "vedettsarok-v2";/);
    assert.match(rootSwSrc, /self\.addEventListener\("push", \(e\) => \{/);
    const registerBlock = layoutSrc.match(/__html: isVedettUtvonalRoute\s*\n\s*\? `[^`]*`\s*\n\s*: `[^`]*`,/)?.[0] ?? "";
    assert.ok(registerBlock.length > 0);
    assert.match(registerBlock, /register\('\/sw\.js'\)/);
  });

  test("a dedikált SW takeover logikája (skipWaiting/clients.claim) változatlan", () => {
    assert.match(vedettSwSrc, /self\.skipWaiting\(\);/);
    assert.match(vedettSwSrc, /e\.waitUntil\(self\.clients\.claim\(\)\);/);
  });
});

describe("5) Android — nincs böngésző-menüs manual fallback", () => {
  test("a 'Telepítéshez nyisd meg a böngésző menüjét' szöveg és a régi !deferredPrompt ág nincs jelen", () => {
    assert.doesNotMatch(installSrc, /Telepítéshez nyisd meg a böngésző menüjét/);
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
  });
});
