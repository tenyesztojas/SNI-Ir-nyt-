import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { normalizeCarRoute } from "../../lib/vedett-route/car/normalizeDirections.ts";

const routePath = join(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "api",
  "admin",
  "vedett-utvonal",
  "car-route",
  "route.ts",
);

const routeSrc = readFileSync(routePath, "utf8");

describe("car navigation background sprint 1 — Directions request", () => {
  test("driving-traffic + alternatives + turn-by-turn guidance", () => {
    assert.match(routeSrc, /mapbox\/driving-traffic/);
    assert.match(routeSrc, /params\.set\("alternatives", "true"\)/);
    assert.match(routeSrc, /params\.set\("steps", "true"\)/);
    assert.match(routeSrc, /params\.set\("language", "hu"\)/);
    assert.match(routeSrc, /params\.set\("voice_instructions", "true"\)/);
    assert.match(routeSrc, /params\.set\("banner_instructions", "true"\)/);
    assert.match(routeSrc, /params\.set\("roundabout_exits", "true"\)/);
    assert.match(routeSrc, /params\.set\("voice_units", "metric"\)/);
  });

  test("sensory feature extractionhez traffic/speed annotationt kér", () => {
    assert.match(
      routeSrc,
      /distance,duration,speed,congestion,congestion_numeric,maxspeed/,
    );
  });

  test("MAPBOX_ACCESS_TOKEN szerveroldali marad", () => {
    assert.match(routeSrc, /process\.env\.MAPBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(routeSrc, /pk\.[A-Za-z0-9._-]{20,}/);
  });

  test("a backend route nem deklarál és nem módosít CAR_ROUTING_ENABLED flaget", () => {
    assert.doesNotMatch(
      routeSrc,
      /\b(?:const|let|var)\s+CAR_ROUTING_ENABLED\b/,
    );

    assert.doesNotMatch(
      routeSrc,
      /\bCAR_ROUTING_ENABLED\s*=/,
    );

    assert.doesNotMatch(
      routeSrc,
      /\bCAR_ROUTING_ENABLED\s*\+\+/,
    );

    assert.doesNotMatch(
      routeSrc,
      /\bCAR_ROUTING_ENABLED\s*--/,
    );
  });
});

describe("normalizeCarRoute — turn-by-turn normalizáció", () => {
  test("legs/steps/maneuver/voice/banner/intersection normalizálódik", () => {
    const route = normalizeCarRoute({
      duration: 620,
      duration_typical: 500,
      distance: 8000,

      geometry: {
        type: "LineString",
        coordinates: [
          [19.0, 47.5],
          [19.1, 47.55],
        ],
      },

      legs: [
        {
          distance: 8000,
          duration: 620,
          duration_typical: 500,
          summary: "M1",

          annotation: {
            distance: [4000, 4000],
            duration: [250, 370],
            speed: [16, 11],
            congestion: ["low", "heavy"],
            congestion_numeric: [10, 80],

            maxspeed: [
              {
                speed: 70,
                unit: "km/h",
              },
              {
                speed: 110,
                unit: "km/h",
              },
            ],
          },

          steps: [
            {
              distance: 180,
              duration: 20,
              duration_typical: 15,
              name: "Fő utca",
              exits: "12",
              driving_side: "right",

              maneuver: {
                type: "turn",
                modifier: "sharp right",
                instruction: "Fordulj jobbra",
                location: [19.02, 47.51],
                bearing_before: 10,
                bearing_after: 90,
              },

              intersections: [
                {
                  location: [19.02, 47.51],
                  traffic_signal: true,
                  stop_sign: false,
                  yield_sign: false,
                  railway_crossing: false,
                  classes: ["motorway"],
                },
              ],

              voiceInstructions: [
                {
                  distanceAlongGeometry: 100,
                  announcement: "100 méter múlva fordulj jobbra",
                  ssmlAnnouncement: "<speak>...</speak>",
                },
              ],

              bannerInstructions: [
                {
                  distanceAlongGeometry: 120,
                  primary: {
                    text: "Jobbra",
                  },
                  secondary: {
                    text: "Fő utca",
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    assert.ok(route);

    assert.equal(route.durationSeconds, 620);
    assert.equal(route.typicalDurationSeconds, 500);
    assert.equal(route.distanceMeters, 8000);

    assert.equal(route.geometry.type, "LineString");
    assert.equal(route.geometry.coordinates.length, 2);

    assert.equal(route.legs.length, 1);
    assert.equal(route.legs[0].steps.length, 1);

    const step = route.legs[0].steps[0];

    assert.equal(step.distanceMeters, 180);
    assert.equal(step.durationSeconds, 20);
    assert.equal(step.typicalDurationSeconds, 15);
    assert.equal(step.roadName, "Fő utca");
    assert.equal(step.exits, "12");
    assert.equal(step.drivingSide, "right");

    assert.equal(step.maneuver.type, "turn");
    assert.equal(step.maneuver.modifier, "sharp right");
    assert.equal(step.maneuver.instruction, "Fordulj jobbra");
    assert.deepEqual(step.maneuver.location, [19.02, 47.51]);
    assert.equal(step.maneuver.bearingBefore, 10);
    assert.equal(step.maneuver.bearingAfter, 90);

    assert.equal(step.voiceInstructions.length, 1);
    assert.equal(
      step.voiceInstructions[0].announcement,
      "100 méter múlva fordulj jobbra",
    );

    assert.equal(step.bannerInstructions.length, 1);
    assert.equal(step.bannerInstructions[0].primaryText, "Jobbra");
    assert.equal(step.bannerInstructions[0].secondaryText, "Fő utca");

    assert.equal(step.intersections.length, 1);
    assert.equal(step.intersections[0].trafficSignal, true);
    assert.equal(step.intersections[0].stopSign, false);
    assert.equal(step.intersections[0].yieldSign, false);
    assert.equal(step.intersections[0].railwayCrossing, false);

    assert.equal(route.sensory.version, "car-sensory-v1");
    assert.equal(route.sensory.experimental, true);

    assert.ok(route.sensory.score >= 0);
    assert.ok(route.sensory.score <= 100);

    assert.ok(route.sensory.components.trafficStress >= 0);
    assert.ok(route.sensory.components.trafficStress <= 100);

    assert.ok(route.sensory.components.maneuverLoad >= 0);
    assert.ok(route.sensory.components.maneuverLoad <= 100);

    assert.ok(route.sensory.components.roadComplexity >= 0);
    assert.ok(route.sensory.components.roadComplexity <= 100);

    assert.ok(route.sensory.components.speedStress >= 0);
    assert.ok(route.sensory.components.speedStress <= 100);

    assert.ok(route.sensory.components.uncertainty >= 0);
    assert.ok(route.sensory.components.uncertainty <= 100);
  });

  test("hibás geometry esetén null", () => {
    assert.equal(
      normalizeCarRoute({
        duration: 10,
        distance: 100,

        geometry: {
          type: "Point",
          coordinates: [19, 47],
        },
      }),
      null,
    );
  });

  test("hiányzó duration esetén null", () => {
    assert.equal(
      normalizeCarRoute({
        distance: 100,

        geometry: {
          type: "LineString",
          coordinates: [
            [19, 47],
            [19.01, 47.01],
          ],
        },
      }),
      null,
    );
  });

  test("hiányzó distance esetén null", () => {
    assert.equal(
      normalizeCarRoute({
        duration: 10,

        geometry: {
          type: "LineString",
          coordinates: [
            [19, 47],
            [19.01, 47.01],
          ],
        },
      }),
      null,
    );
  });

  test("hibás koordináta esetén null", () => {
    assert.equal(
      normalizeCarRoute({
        duration: 10,
        distance: 100,

        geometry: {
          type: "LineString",
          coordinates: [
            [19, 47],
            ["invalid", 47.01],
          ],
        },
      }),
      null,
    );
  });
});