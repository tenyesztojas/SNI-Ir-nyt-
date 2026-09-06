import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePersonalizationWeights, DEFAULT_PERSONALIZATION_WEIGHTS } from "../../lib/vedett-route/personalization.ts";

test("undefined bemenetre a default súlyokat adja vissza", () => {
  assert.deepEqual(normalizePersonalizationWeights(undefined), DEFAULT_PERSONALIZATION_WEIGHTS);
});

test("a súlyok 0 és 2 közé vannak szorítva", () => {
  const out = normalizePersonalizationWeights({ transfers: 99, walking: -5 });
  assert.equal(out.transfers, 2);
  assert.equal(out.walking, 0);
});

test("részleges bemenet esetén a meg nem adott súlyok a defaultot kapják", () => {
  const out = normalizePersonalizationWeights({ transfers: 1.5 });
  assert.equal(out.transfers, 1.5);
  assert.equal(out.modeSwitches, DEFAULT_PERSONALIZATION_WEIGHTS.modeSwitches);
});

test("nem szám (NaN, string-szerű) érték figyelmen kívül marad, default marad érvényben", () => {
  const out = normalizePersonalizationWeights({ transfers: Number.NaN });
  assert.equal(out.transfers, DEFAULT_PERSONALIZATION_WEIGHTS.transfers);
});
