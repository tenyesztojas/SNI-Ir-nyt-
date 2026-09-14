import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCarSensoryScore } from "../../lib/vedett-route/car/sensoryScore.ts";
import type { CarNavigationLeg } from "../../lib/vedett-route/car/types.ts";

function makeLeg(overrides: Partial<CarNavigationLeg> = {}): CarNavigationLeg {
  return {
    distanceMeters: 10000,
    durationSeconds: 600,
    typicalDurationSeconds: 600,
    steps: [],
    annotations: {
      distanceMeters: [5000, 5000],
      durationSeconds: [300, 300],
      speedMetersPerSecond: [16, 16],
      congestion: ["low", "low"],
      congestionNumeric: [10, 10],
      maxSpeed: [
        { speedKmh: 50, unknown: false, unlimited: false },
        { speedKmh: 50, unknown: false, unlimited: false },
      ],
    },
    ...overrides,
  };
}

describe("car sensory score v1", () => {
  test("0..100 közötti stabil score-t ad", () => {
    const result = buildCarSensoryScore({
      durationSeconds: 600,
      typicalDurationSeconds: 600,
      distanceMeters: 10000,
      legs: [makeLeg()],
    });

    assert.ok(result.score >= 0 && result.score <= 100);
    for (const value of Object.values(result.components)) {
      assert.ok(value >= 0 && value <= 100);
    }
  });

  test("erős torlódás magasabb trafficStress értéket ad", () => {
    const low = buildCarSensoryScore({
      durationSeconds: 600,
      typicalDurationSeconds: 600,
      distanceMeters: 10000,
      legs: [makeLeg()],
    });

    const heavy = buildCarSensoryScore({
      durationSeconds: 900,
      typicalDurationSeconds: 600,
      distanceMeters: 10000,
      legs: [makeLeg({
        annotations: {
          distanceMeters: [5000, 5000],
          durationSeconds: [450, 450],
          speedMetersPerSecond: [8, 8],
          congestion: ["heavy", "severe"],
          congestionNumeric: [80, 95],
          maxSpeed: [
            { speedKmh: 50, unknown: false, unlimited: false },
            { speedKmh: 50, unknown: false, unlimited: false },
          ],
        },
      })],
    });

    assert.ok(heavy.components.trafficStress > low.components.trafficStress);
    assert.ok(heavy.components.uncertainty > low.components.uncertainty);
    assert.ok(heavy.score > low.score);
  });

  test("a modell explicit kísérleti és verziózott", () => {
    const result = buildCarSensoryScore({
      durationSeconds: 600,
      distanceMeters: 10000,
      legs: [makeLeg()],
    });

    assert.equal(result.experimental, true);
    assert.equal(result.version, "car-sensory-v1");
  });
});
