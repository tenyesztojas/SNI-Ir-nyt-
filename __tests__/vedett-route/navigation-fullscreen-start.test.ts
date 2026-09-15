import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const fullscreenStart = formSrc.indexOf("{mapFullscreen && (");
const controlsStart = formSrc.indexOf('<div className="flex flex-wrap items-center gap-2">', fullscreenStart);
const fullscreenBlock = formSrc.slice(fullscreenStart, controlsStart);

describe("fullscreen térképből közvetlenül indítható navigáció", () => {
  test("a manuális fullscreen felső vezérlősávjában a Kis nézet mellett ott a Navigáció indítása", () => {
    assert.ok(fullscreenStart >= 0, "meg kell találni a fullscreen felső vezérlősávját");
    assert.match(fullscreenBlock, /✕ Kis nézet/);
    assert.match(fullscreenBlock, /▶ Navigáció indítása/);
  });

  test("a fullscreen Navigáció indítása ugyanazt a startNavigation handlert használja", () => {
    assert.match(
      fullscreenBlock,
      /onClick=\{startNavigation\}[\s\S]*?▶ Navigáció indítása/,
      "nem külön navigációs flow kell: a meglévő startNavigation fusson",
    );
  });

  test("aktív navigációban továbbra is csak a Navigáció befejezése ág látszik", () => {
    assert.match(fullscreenBlock, /\{navigationMode \? \([\s\S]*?onClick=\{stopNavigation\}[\s\S]*?✕ Navigáció befejezése[\s\S]*?\) : \(/);
  });

  test("a normál, nem fullscreen navigációindító kontroll megmarad", () => {
    const matches = formSrc.match(/onClick=\{startNavigation\}/g) ?? [];
    assert.equal(matches.length, 2, "egy fullscreen és egy normál Navigáció indítása gombot várunk");
  });
});
