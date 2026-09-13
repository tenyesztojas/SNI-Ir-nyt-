// Egységtesztek — formatDurationMinutes pure helper
// (2026-09-12, spec: 9 kötelező eset + szélső értékek)
//
// A helper tisztán esztétikai / megjelenítési célú — routing/rangsorolást NEM érinti.
// Futtatás: node --test __tests__/vedett-route/format-duration-minutes.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatDurationMinutes } from "../../lib/vedett-route/formatDurationMinutes.ts";

describe("formatDurationMinutes — spec szerint kötelező 9 eset", () => {
  test("0 perc → '0 perc'", () => {
    assert.strictEqual(formatDurationMinutes(0), "0 perc");
  });

  test("1 perc → '1 perc'", () => {
    assert.strictEqual(formatDurationMinutes(1), "1 perc");
  });

  test("59 perc → '59 perc'", () => {
    assert.strictEqual(formatDurationMinutes(59), "59 perc");
  });

  test("60 perc → '1 óra' (NEM '1 óra 0 perc')", () => {
    assert.strictEqual(formatDurationMinutes(60), "1 óra");
    assert.notStrictEqual(formatDurationMinutes(60), "1 óra 0 perc");
  });

  test("61 perc → '1 óra 1 perc'", () => {
    assert.strictEqual(formatDurationMinutes(61), "1 óra 1 perc");
  });

  test("83 perc → '1 óra 23 perc'", () => {
    assert.strictEqual(formatDurationMinutes(83), "1 óra 23 perc");
  });

  test("120 perc → '2 óra' (NEM '2 óra 0 perc')", () => {
    assert.strictEqual(formatDurationMinutes(120), "2 óra");
    assert.notStrictEqual(formatDurationMinutes(120), "2 óra 0 perc");
  });

  test("121 perc → '2 óra 1 perc'", () => {
    assert.strictEqual(formatDurationMinutes(121), "2 óra 1 perc");
  });

  test("267 perc → '4 óra 27 perc'", () => {
    assert.strictEqual(formatDurationMinutes(267), "4 óra 27 perc");
  });
});

describe("formatDurationMinutes — szélső értékek és robusztusság", () => {
  test("negatív bemenet → '0 perc' (Math.max(0, ...) védelme)", () => {
    assert.strictEqual(formatDurationMinutes(-5), "0 perc");
  });

  test("tört szám (pl. 61.9) → lefelé kerekítve, '1 óra 1 perc'", () => {
    assert.strictEqual(formatDurationMinutes(61.9), "1 óra 1 perc");
  });

  test("egész óra sorozat — SOHA nem produkál 'X óra 0 perc' alakot", () => {
    for (const h of [1, 2, 3, 4, 5]) {
      const result = formatDurationMinutes(h * 60);
      assert.strictEqual(result, `${h} óra`, `${h * 60} perc → '${h} óra'`);
      assert.doesNotMatch(result, /0 perc/, `'${result}' SOHA nem tartalmaz '0 perc'-et`);
    }
  });

  test("nagy érték: 480 perc → '8 óra'", () => {
    assert.strictEqual(formatDurationMinutes(480), "8 óra");
  });

  test("nagy + perc: 485 perc → '8 óra 5 perc'", () => {
    assert.strictEqual(formatDurationMinutes(485), "8 óra 5 perc");
  });
});
