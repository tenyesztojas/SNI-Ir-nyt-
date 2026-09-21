// VÉDETT ÚTVONAL PWA — identity/scope igazítás (2026-09-21, célzott kör).
// Forráskód-szintű, source-contract teszt (nincs jsdom/render), a projekt
// konvenciója szerint.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const vedettManifest = JSON.parse(read("public/manifest-vedett-utvonal.json"));
const installSrc = read("components/vedett-utvonal/VedettUtvonalPwaInstall.tsx");

describe("Védett Útvonal PWA identity — igazított scope (id=/vedett-utvonal)", () => {
  test("id/start_url/scope/display a megkövetelt értékekre állítva", () => {
    assert.equal(vedettManifest.id, "/vedett-utvonal");
    assert.equal(vedettManifest.start_url, "/vedett-utvonal/app");
    assert.equal(vedettManifest.scope, "/vedett-utvonal/");
    assert.equal(vedettManifest.display, "standalone");
  });

  test("name/short_name/description/theme/background/icons változatlan", () => {
    assert.equal(vedettManifest.name, "Védett Útvonal");
    assert.equal(vedettManifest.short_name, "Védett Útvonal");
    assert.equal(vedettManifest.theme_color, "#0a4a6e");
    assert.equal(vedettManifest.background_color, "#f3f4f6");
    assert.equal(vedettManifest.icons.length, 4);
    assert.match(vedettManifest.icons[0].src, /^\/vedett-utvonal-icon/);
  });
});

describe("Android — nincs böngésző-menüs fallback szöveg", () => {
  test("a 'Telepítéshez nyisd meg a böngésző menüjét' szöveg és a régi !deferredPrompt ág nincs jelen", () => {
    assert.doesNotMatch(installSrc, /Telepítéshez nyisd meg a böngésző menüjét/);
    assert.doesNotMatch(installSrc, /\{platform === "android" && !deferredPrompt && \(/);
  });
});
