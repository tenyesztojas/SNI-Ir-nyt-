// VÉDETT ÚTVONAL — iPhone Safari: 16 px alatti betűméretű beviteli mezőre
// fókuszáláskor a Safari automatikusan ránagyít. Ezért a /vedett-utvonal
// oldal minden szöveges beviteli mezője (input, select, textarea, dátum)
// mobilon legalább `text-base` (16 px), és csak `sm:` (>= 640 px) felett
// kapja a korábbi `text-sm` méretet — az asztali megjelenés változatlan.
// A böngésző nagyítása NINCS letiltva (viewport változatlan).
//   node --test __tests__/vedett-route/ios-safari-input-font-size.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  "components/vedett-utvonal/VedettUtvonalSearchForm.tsx",
  "components/vedett-utvonal/SettlementAutocomplete.tsx",
  "components/vedett-utvonal/VedettUtvonalWorkspace.tsx",
  "components/vedett-utvonal/FavoriteRoutesPanel.tsx",
  "components/vedett-utvonal/RestPointQuickAdd.tsx",
  "components/vedett-utvonal/SavedPlacesPanel.tsx",
];
const NON_TEXT_TYPES = new Set(["radio", "checkbox", "range", "hidden", "file", "submit", "button", "color"]);

function openingTags(src: string): { line: number; kind: string; tag: string }[] {
  const out: { line: number; kind: string; tag: string }[] = [];
  const re = /<(input|select|textarea)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = re.lastIndex;
    let depth = 0;
    let quote: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ line: src.slice(0, m.index).split("\n").length, kind: m[1], tag: src.slice(m.index, i + 1) });
  }
  return out;
}

test("minden szöveges beviteli mező mobilon >= 16 px (text-base), asztalon sm:text-sm marad", () => {
  let checked = 0;
  for (const file of FILES) {
    for (const { line, kind, tag } of openingTags(readFileSync(file, "utf8"))) {
      const type = /\btype="([^"]+)"/.exec(tag)?.[1] ?? (kind === "input" ? "text" : kind);
      if (NON_TEXT_TYPES.has(type)) continue;
      const cls = /className="([^"]*)"/.exec(tag)?.[1];
      if (cls === undefined) continue;
      const tokens = cls.split(/\s+/);
      const where = `${file}:${line} <${kind} type=${type}>`;
      assert.ok(!tokens.includes("text-xs"), `${where}: text-xs (12 px) mobilon nagyítást okoz`);
      if (tokens.includes("text-sm")) assert.fail(`${where}: mobilon text-sm (14 px) — 'text-base sm:text-sm' kell`);
      if (tokens.includes("sm:text-sm")) {
        assert.ok(tokens.includes("text-base"), `${where}: sm:text-sm mellé mobilon text-base kell`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 18, `legalább 18 mező ellenőrizve (talált: ${checked})`);
});

test("a böngésző nagyítása nincs letiltva (nincs maximum-scale / user-scalable a layoutban)", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /maximum-?scale|user-?scalable|maximumScale|userScalable/i);
});
