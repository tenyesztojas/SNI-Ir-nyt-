import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../components/vedett-utvonal/VedettUtvonalSearchForm.tsx", import.meta.url),
  "utf8",
);

test("Navigation off-route production integration", async (t) => {
  await t.test("a felhasználói figyelmeztetés kizárólag megerősített OFF_ROUTE állapotban jelenik meg", () => {
    assert.match(source, /navigationMode && routeProgress\.offRouteStatus === "OFF_ROUTE"/);
    assert.doesNotMatch(source, /routeProgress\.offRouteStatus === "POSSIBLY_OFF_ROUTE"/);
  });

  await t.test("a figyelmeztetés szövege rövid és egyértelmű", () => {
    assert.match(source, /Letértél az útvonalról\./);
    assert.match(source, /Az aktuális helyzeted alapján már nem az útvonalon haladsz\./);
  });

  await t.test("a státusz akadálymentesen, de nem agresszív alertként kerül közlésre", () => {
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.doesNotMatch(source, /role="alert"/);
  });

  await t.test("az off-route jelzés nem indít automatikus újratervezést", () => {
    const block = source.match(/\{navigationMode && routeProgress\.offRouteStatus === "OFF_ROUTE" && \([\s\S]*?\n\s*\)\}/)?.[0] ?? "";
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /fetch\(|router\.|reroute|onClick|setDisplayedJourney/);
  });

  await t.test("a figyelmeztetés a térkép fölött középen jelenik meg és nem fogja el a térkép érintéseit", () => {
    assert.match(source, /pointer-events-none absolute left-1\/2 top-\[4\.25rem\] z-20[^"]*-translate-x-1\/2/);
  });
});
