// Routing tesztek (31. pont "Routing" kategória — a MOTIS-hoz nem kötött
// rész: a hiányzó/nem elérhető routing engine kezelése).
//   node --test __tests__/vedett-route/motisClient.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

test("MOTIS_BASE_URL nélkül a keresés routing_engine_unavailable-t ad vissza, sosem dob kivételt", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { planJourneyWithMotis } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await planJourneyWithMotis({
    from: { name: "A", lat: 47.5, lon: 19.05 },
    to: { name: "B", lat: 47.49, lon: 19.06 },
    departAt: new Date().toISOString(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
    assert.equal(result.message, "Az útvonaltervezés átmenetileg nem érhető el.");
  }
});

test("a hibaüzenet sosem tartalmaz kitalált/AI-generált útvonaladatot", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { planJourneyWithMotis } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await planJourneyWithMotis({
    from: { name: "A", lat: 47.5, lon: 19.05 },
    to: { name: "B", lat: 47.49, lon: 19.06 },
    departAt: new Date().toISOString(),
  });

  assert.equal("journeys" in result, false, "unavailable válasz nem tartalmazhat journeys mezőt");
});
