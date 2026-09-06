// realtimeFreshness.ts tesztek — BKK Realtime integráció, 15. pont.
//   node --test __tests__/vedett-route/realtime-freshness.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRealtimeFreshness } from "../../lib/vedett-route/realtimeFreshness.ts";

test("a küszöbön belüli adat friss-nek számít", () => {
  const nowMs = 1_000_000_000_000;
  const feedTimestampSeconds = nowMs / 1000 - 30; // 30 mp régi
  const result = evaluateRealtimeFreshness(feedTimestampSeconds, nowMs);
  assert.equal(result.ageSeconds, 30);
  assert.equal(result.fresh, true);
});

test("a küszöbnél régebbi adat NEM számít frissnek", () => {
  const nowMs = 1_000_000_000_000;
  const feedTimestampSeconds = nowMs / 1000 - 500; // jóval a küszöb felett
  const result = evaluateRealtimeFreshness(feedTimestampSeconds, nowMs);
  assert.equal(result.fresh, false);
  assert.equal(result.ageSeconds, 500);
});

test("pontosan a küszöbön lévő adat még friss (határeset, <=)", () => {
  const nowMs = 1_000_000_000_000;
  const threshold = 90; // config.ts alapértéke
  const feedTimestampSeconds = nowMs / 1000 - threshold;
  const result = evaluateRealtimeFreshness(feedTimestampSeconds, nowMs);
  assert.equal(result.ageSeconds, threshold);
  assert.equal(result.fresh, true);
});

test("jövőbeli (óra-eltérésből adódó) feed timestamp sosem ad negatív kort", () => {
  const nowMs = 1_000_000_000_000;
  const feedTimestampSeconds = nowMs / 1000 + 50; // "jövőben" van, óra-eltérés
  const result = evaluateRealtimeFreshness(feedTimestampSeconds, nowMs);
  assert.equal(result.ageSeconds, 0);
  assert.equal(result.fresh, true);
});
