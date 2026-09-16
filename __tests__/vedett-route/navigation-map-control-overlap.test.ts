// NAVIGATION — SPRINT 7.1, Section I: MAP CONTROL OVERLAP JAVÍTÁS
// (source-level regresszió, ugyanaz a minta, mint
// navigation-eta-mobile-layout.test.ts). A valódi MapLibre-rendering itt
// nem tesztelhető node --test alatt, ezért a fix tényleges forráskód-jelenlétét
// és a régi, ütköző mintázat HIÁNYÁT ellenőrizzük.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../components/vedett-utvonal/VedettUtvonalSearchForm.tsx", import.meta.url),
  "utf8",
);

test("Navigation card / map control overlap fix", async (t) => {
  await t.test(
    "29) a navigációs kártya nem használja többé a régi, MapLibre top-right kontrollokkal ütköző right-2-t",
    () => {
      const cardBlock =
        source.match(/\{navigationMode && navigationInstructionForDisplay && \([\s\S]*?\n\s{14}\)\}/)?.[0] ?? "";
      assert.ok(cardBlock.length > 0, "a navigációs kártya JSX blokkja megtalálható");
      assert.doesNotMatch(cardBlock, /className=\{`absolute left-2 right-2 z-20/);
    },
  );

  await t.test("30) mobilon fix, a MapLibre kontroll-oszlop szélességéhez méretezett jobb margót foglal (right-14)", () => {
    assert.match(source, /className=\{`absolute right-14 z-20 mx-auto max-w-sm/);
  });

  await t.test("a jobb margó safe-area-aware, de NINCS egyetlen konkrét telefonméretre hardcode-olva (nincs px-alapú media query)", () => {
    assert.match(source, /right:\s*"calc\(3\.5rem \+ env\(safe-area-inset-right, 0px\)\)"/);
    assert.doesNotMatch(source, /@media[^}]*\d+px[^}]*right-14/);
  });

  await t.test("31) desktopon a kártya SZÉLESSÉGE (max-w-sm) változatlan — nem lett teljes szélességűre húzva", () => {
    assert.match(source, /className=\{`absolute right-14 z-20 mx-auto max-w-sm rounded-xl bg-white\/95/);
  });

  await t.test("a zoom/geolocation kontrollok nincsenek elrejtve (nincs display:none/hidden a NavigationControl/CurrentLocationControl körül)", () => {
    // Csak azt ellenőrizzük, hogy a fix NEM a kontrollok elrejtésével történt —
    // a VedettUtvonalMap.tsx map.addControl(...) hívásai változatlanok.
    assert.doesNotMatch(source, /NavigationControl[\s\S]{0,80}(display:\s*none|className="hidden")/);
  });
});
