// VEDETT UTVONAL - kulon telepitheto PWA identitas (2026-09-21) -
// regressziok. Forraskod-szintu, source-contract tesztek (nincs jsdom),
// a projekt konvencioja szerint.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));
const rootManifest = JSON.parse(read("public/manifest.json"));
const normalPageSrc = read("app/vedett-utvonal/page.tsx");
const pwaPageSrc = read("app/vedett-utvonal/app/page.tsx");
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");

describe("1-4) Vedett Utvonal manifest explicit, stabil PWA identitas", () => {
  test("1) explicit id: /vedett-utvonal/app", () => {
    assert.equal(vedettManifest.id, "/vedett-utvonal/app");
  });
  test("2) start_url: /vedett-utvonal/app", () => {
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
  });
  test("3) scope: /vedett-utvonal/app", () => {
    assert.equal(vedettManifest.scope, "/vedett-utvonal/app");
  });
  test("4) display: standalone", () => {
    assert.equal(vedettManifest.display, "standalone");
  });
});

describe("5-6) Manifest binding es root identitas erintetlen", () => {
  test("5) mindket Vedett Utvonal route (normal + dedikalt PWA shell) a sajat manifestjet exportalja", () => {
    assert.match(normalPageSrc, /manifest: "\/manifest-vedett-utvonal\.json",/);
    assert.match(pwaPageSrc, /manifest: "\/manifest-vedett-utvonal\.json",/);
  });
  test("6) a root VedettSarok manifest valtozatlan (nincs id mezo hozzaadva, scope marad /)", () => {
    assert.equal(rootManifest.name, "VédettSarok");
    assert.equal(rootManifest.scope, "/");
    assert.equal("id" in rootManifest, false, "a root manifest NEM kapott id mezot ebben a sprintben - csak a Vedett Utvonal");
  });
});

describe("7-8) Meglevo install flow es debug diagnosztika erintetlen", () => {
  test("7) beforeinstallprompt -> deferredPrompt -> nativ install flow valtozatlan", () => {
    assert.match(installSrc, /window\.addEventListener\("beforeinstallprompt", handler\);/);
    assert.match(installSrc, /onClick=\{handleAndroidInstall\}/);
    assert.match(installSrc, /const installedHandler = \(\) => setInstalled\(true\);/);
    assert.match(installSrc, /window\.addEventListener\("appinstalled", installedHandler\);/);
  });
  test("8) ?debugPwa=1 diagnosztika valtozatlan", () => {
    assert.match(installSrc, /new URLSearchParams\(window\.location\.search\)\.get\("debugPwa"\) === "1"/);
    assert.match(installSrc, /const debugPanel = debugEnabled && debugSnapshot \? \(/);
  });
});
