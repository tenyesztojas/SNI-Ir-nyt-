import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { DEFAULT_PERSONALIZATION_WEIGHTS } from "../../lib/vedett-route/personalization.ts";
import type { Journey } from "../../lib/vedett-route/types.ts";

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    totalDurationMinutes: 20,
    departureTime: "2026-09-06T10:00:00Z",
    arrivalTime: "2026-09-06T10:20:00Z",
    walkingMinutes: 5,
    waitingMinutes: 2,
    transfers: 0,
    legs: [
      { mode: "TRANSIT", transitMode: "SUBWAY", fromName: "A", toName: "B", durationMinutes: 13, realtime: false },
    ],
    alerts: [],
    realtimeAvailable: false,
    ...overrides,
  };
}

test("a crowding és vehicleAccessibility tényező MINDIG a missingFactors listában van, sosem kap 0 értéket hallgatólagosan", () => {
  const score = computeSensoryScore(journey(), DEFAULT_PERSONALIZATION_WEIGHTS);
  assert.ok(score.missingFactors.includes("crowding"));
  assert.ok(score.missingFactors.includes("vehicleAccessibility"));
  const crowdingFactor = score.factors.find((f) => f.key === "crowding")!;
  assert.equal(crowdingFactor.available, false);
  assert.equal(crowdingFactor.normalizedLoad, undefined, "hiányzó tényezőnek nincs normalizált értéke, még 0 sem");
});

test("a confidence sosem 1.0, amíg legalább egy tényező hiányzik", () => {
  const score = computeSensoryScore(journey(), DEFAULT_PERSONALIZATION_WEIGHTS);
  assert.ok(score.confidence < 1);
  assert.ok(score.confidence > 0);
});

test("több átszállás -> magasabb (rosszabb) score, minden más változatlan mellett", () => {
  const zero = computeSensoryScore(journey({ transfers: 0 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  const three = computeSensoryScore(journey({ transfers: 3 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  assert.ok(three.score > zero.score);
});

test("minden súly 0-ra állítva -> score 0 (nincs mit súlyozni)", () => {
  const zeroed = { transfers: 0, modeSwitches: 0, underground: 0, walking: 0, duration: 0, waiting: 0 };
  const score = computeSensoryScore(journey({ transfers: 3 }), zeroed);
  assert.equal(score.score, 0);
  // a confidence a súlytól FÜGGETLEN adatlefedettségi mutató, ez nem változik:
  assert.ok(score.confidence > 0);
});

test("földalatti (SUBWAY) szakasz növeli az 'underground' faktor terhelését, felszíni (BUS) nem", () => {
  const subway = computeSensoryScore(
    journey({ legs: [{ mode: "TRANSIT", transitMode: "SUBWAY", fromName: "A", toName: "B", durationMinutes: 13, realtime: false }] }),
    DEFAULT_PERSONALIZATION_WEIGHTS
  );
  const bus = computeSensoryScore(
    journey({ legs: [{ mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 13, realtime: false }] }),
    DEFAULT_PERSONALIZATION_WEIGHTS
  );
  const subwayFactor = subway.factors.find((f) => f.key === "underground")!;
  const busFactor = bus.factors.find((f) => f.key === "underground")!;
  assert.ok((subwayFactor.normalizedLoad ?? 0) > (busFactor.normalizedLoad ?? 0));
});

// Sprint 2 böngészős E2E kapu, 8. pont: explicit szenzoros józanság-ellenőrzések
// (nem csak az össz-score-ra, hanem az EGYES faktorokra is), hogy a 25
// útvonalas route-matrix teszt eredménye mögött ne csak a végösszeg legyen
// helyes, hanem a komponensek is dokumentáltan monoton viselkedésűek legyenek.

test("a 'transfers' faktor terhelése sosem alacsonyabb 3 átszállásnál, mint 0 átszállásnál (nem csak az összesített score, hanem külön a faktor is)", () => {
  const zero = computeSensoryScore(journey({ transfers: 0 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  const three = computeSensoryScore(journey({ transfers: 3 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  const zeroTransfersFactor = zero.factors.find((f) => f.key === "transfers")!;
  const threeTransfersFactor = three.factors.find((f) => f.key === "transfers")!;
  assert.ok(
    (threeTransfersFactor.normalizedLoad ?? 0) >= (zeroTransfersFactor.normalizedLoad ?? 0),
    "a 3-átszállásos útvonal 'transfers' faktor-terhelése nem lehet alacsonyabb, mint a 0-átszállásosé"
  );
});

test("több gyaloglás -> a 'walking' faktor terhelése sosem alacsonyabb, mint kevesebb gyaloglásnál", () => {
  const lessWalk = computeSensoryScore(journey({ walkingMinutes: 3 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  const moreWalk = computeSensoryScore(journey({ walkingMinutes: 20 }), DEFAULT_PERSONALIZATION_WEIGHTS);
  const lessWalkFactor = lessWalk.factors.find((f) => f.key === "walking")!;
  const moreWalkFactor = moreWalk.factors.find((f) => f.key === "walking")!;
  assert.ok(
    (moreWalkFactor.normalizedLoad ?? 0) >= (lessWalkFactor.normalizedLoad ?? 0),
    "a több gyaloglással járó útvonal 'walking' faktor-terhelése nem lehet alacsonyabb"
  );
});

test("egy csak felszíni (metrómentes) legekből álló útvonalon egyetlen leg sem SUBWAY módú", () => {
  const noSubwayJourney = journey({
    transfers: 1,
    legs: [
      { mode: "TRANSIT", transitMode: "BUS", fromName: "A", toName: "B", durationMinutes: 10, realtime: false },
      { mode: "TRANSIT", transitMode: "TRAM", fromName: "B", toName: "C", durationMinutes: 8, realtime: false },
    ],
  });
  assert.ok(noSubwayJourney.legs.every((l) => l.transitMode !== "SUBWAY"));
  // a sensory engine-nek ettől függetlenül helyesen kell számolnia (nem dobhat kivételt, nem hiányozhat adat emiatt)
  const score = computeSensoryScore(noSubwayJourney, DEFAULT_PERSONALIZATION_WEIGHTS);
  const undergroundFactor = score.factors.find((f) => f.key === "underground")!;
  assert.equal(undergroundFactor.normalizedLoad, 0, "metrómentes útvonalon az underground faktor terhelése 0, nem hiányzó adat");
});
