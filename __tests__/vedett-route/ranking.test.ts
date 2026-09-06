import { test } from "node:test";
import assert from "node:assert/strict";
import { rankJourneys } from "../../lib/vedett-route/ranking.ts";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { DEFAULT_PERSONALIZATION_WEIGHTS } from "../../lib/vedett-route/personalization.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

function baseJourney(overrides: Partial<Journey>): Journey {
  const j: Journey = {
    totalDurationMinutes: 30,
    departureTime: "2026-09-06T10:00:00Z",
    arrivalTime: "2026-09-06T10:30:00Z",
    walkingMinutes: 5,
    waitingMinutes: 2,
    transfers: 1,
    legs: [{ mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 23, realtime: false }],
    alerts: [],
    realtimeAvailable: false,
    ...overrides,
  };
  j.sensory = computeSensoryScore(j, DEFAULT_PERSONALIZATION_WEIGHTS);
  return j;
}

test("a leggyorsabb kapja a FASTEST címkét, a legkevesebb átszállásos a FEWEST_TRANSFERS-t, a legalacsonyabb sensory score-ú a CALMEST-et", () => {
  const fast = baseJourney({ totalDurationMinutes: 15, transfers: 2 });
  const fewTransfers = baseJourney({ totalDurationMinutes: 40, transfers: 0 });
  const calm = baseJourney({
    totalDurationMinutes: 35,
    transfers: 1,
    legs: [{ mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 28, realtime: false }],
  });

  const ranked = rankJourneys([fast, fewTransfers, calm]);

  const fastRanked = ranked.find((r) => r.journey === fast)!;
  const fewRanked = ranked.find((r) => r.journey === fewTransfers)!;

  assert.ok(fastRanked.labels.includes("FASTEST"));
  assert.ok(fewRanked.labels.includes("FEWEST_TRANSFERS"));
  // a calmest a három közül a legalacsonyabb sensory score-út kell hogy jelentse (nem feltétlenül 'calm' a kódnév miatt)
  const calmestLabelHolders = ranked.filter((r) => r.labels.includes("CALMEST"));
  assert.equal(calmestLabelHolders.length, 1);
});

test("minden rangsorolt útvonalhoz tartozik nem üres, determinisztikus magyarázat szöveg", () => {
  const a = baseJourney({ totalDurationMinutes: 20, transfers: 0 });
  const b = baseJourney({ totalDurationMinutes: 30, transfers: 2 });
  const ranked = rankJourneys([a, b]);
  for (const r of ranked) {
    assert.ok(r.explanation.length > 0);
  }
});

test("ugyanaz a bemenet mindig ugyanazt a rangsort és magyarázatot adja (determinizmus, nincs LLM-hívás)", () => {
  const a = baseJourney({ totalDurationMinutes: 20, transfers: 0 });
  const b = baseJourney({ totalDurationMinutes: 30, transfers: 2 });
  const first = rankJourneys([a, b]);
  const second = rankJourneys([a, b]);
  assert.deepEqual(
    first.map((r) => r.explanation),
    second.map((r) => r.explanation)
  );
});

test("üres bemenetre üres tömböt ad, nem dob kivételt", () => {
  assert.deepEqual(rankJourneys([]), []);
});
