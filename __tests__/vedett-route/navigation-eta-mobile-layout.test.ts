import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../components/vedett-utvonal/VedettUtvonalSearchForm.tsx", import.meta.url),
  "utf8",
);

test("Navigation ETA mobile layout", async (t) => {
  await t.test("mobilon az ETA-kártya a bal alsó szélhez igazodik, nem középre", () => {
    assert.match(
      source,
      /navigationMode && navigationEta[\s\S]*?className="[^"]*bottom-3[^"]*left-3[^"]*w-\[42vw\][^"]*max-w-\[180px\][^"]*"/,
    );
  });

  await t.test("mobilon nincs alapértelmezett középre toló translate", () => {
    const etaBlock = source.match(/\{navigationMode && navigationEta && \([\s\S]*?\n\s*\)\}/)?.[0] ?? "";
    assert.ok(etaBlock.length > 0);
    assert.doesNotMatch(etaBlock, /(?<!md:)-translate-x-1\/2/);
  });

  await t.test("desktopon megmarad a korábbi középre igazított ETA-elrendezés", () => {
    assert.match(
      source,
      /md:bottom-4[^"]*md:left-1\/2[^"]*md:w-auto[^"]*md:min-w-\[180px\][^"]*md:-translate-x-1\/2/,
    );
  });
});
