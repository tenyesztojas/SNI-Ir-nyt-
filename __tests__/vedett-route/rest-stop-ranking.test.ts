// Sprint E Preparation Gate — determinisztikus pihenőpont-rangsorolás tesztek.
//   node --test __tests__/vedett-route/rest-stop-ranking.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineDistanceMeters, rankRestPoint, rankRestPoints } from "../../lib/vedett-route/restStopFlow/ranking.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";

function makeRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "rp-1",
    createdBy: "user-1",
    name: "Pad a téren",
    latitude: 47.5,
    longitude: 19.05,
    source: "USER",
    visibility: "PRIVATE",
    toilet: null,
    seating: null,
    quietSpace: null,
    indoors: null,
    outdoors: null,
    purchaseRequired: null,
    notes: null,
    createdAt: "2026-09-07T09:00:00.000Z",
    updatedAt: "2026-09-07T09:00:00.000Z",
    ...overrides,
  };
}

test("haversineDistanceMeters: ugyanaz a pont -> 0 méter", () => {
  const d = haversineDistanceMeters({ lat: 47.5, lon: 19.05 }, { lat: 47.5, lon: 19.05 });
  assert.equal(d, 0);
});

test("haversineDistanceMeters: ismert budapesti távolság nagyságrendileg helyes (néhány km)", () => {
  // Deák Ferenc tér és Astoria kb. 600-900 m egymástól.
  const d = haversineDistanceMeters({ lat: 47.4979, lon: 19.0552 }, { lat: 47.4952, lon: 19.0616 });
  assert.ok(d > 300 && d < 1500, `váratlan távolság: ${d}`);
});

test("minden mező null (teljesen hiányzó adat) esetén MINDEN faktor missing, a score 0, a confidence 0 — SOHA nem 'rossz pontnak' számít, csak 'ismeretlen'-nek", () => {
  const rp = makeRestPoint();
  const ranked = rankRestPoint(rp, null);
  assert.equal(ranked.ranking.score, 0);
  assert.equal(ranked.ranking.confidence, 0);
  assert.equal(ranked.ranking.availableFactors.length, 0);
  assert.ok(ranked.ranking.missingFactors.includes("distance"));
  assert.ok(ranked.ranking.missingFactors.includes("seating"));
  assert.ok(ranked.ranking.missingFactors.includes("toilet"));
  assert.ok(ranked.ranking.missingFactors.includes("quietSpace"));
  assert.ok(ranked.ranking.missingFactors.includes("shelter"));
  assert.ok(ranked.ranking.missingFactors.includes("purchaseRequired"));
  assert.ok(ranked.ranking.missingFactors.includes("openingHours"));
  assert.ok(ranked.ranking.missingFactors.includes("userPreference"));
});

test("nyitvatartás (openingHours) faktor MINDIG unavailable — a séma jelenleg nem tartalmaz ilyen mezőt", () => {
  const rp = makeRestPoint({ toilet: true, seating: true, quietSpace: true, indoors: true, outdoors: true, purchaseRequired: false });
  const ranked = rankRestPoint(rp, { lat: 47.5, lon: 19.05 });
  assert.ok(ranked.ranking.missingFactors.includes("openingHours"));
});

test("seating: false (explicit ismert 'nincs ülőhely') NEM ugyanaz, mint a hiányzó adat — available, alacsony pontszámmal", () => {
  const rp = makeRestPoint({ seating: false });
  const ranked = rankRestPoint(rp, null);
  const seatingFactor = ranked.ranking.factors.find((f) => f.key === "seating");
  assert.equal(seatingFactor?.available, true);
  assert.equal(seatingFactor?.normalizedScore, 0);
  assert.equal(ranked.ranking.missingFactors.includes("seating"), false);
});

test("seating: true -> available, magas pontszám", () => {
  const rp = makeRestPoint({ seating: true });
  const ranked = rankRestPoint(rp, null);
  const seatingFactor = ranked.ranking.factors.find((f) => f.key === "seating");
  assert.equal(seatingFactor?.available, true);
  assert.equal(seatingFactor?.normalizedScore, 100);
});

test("purchaseRequired: true -> alacsony pontszám (rosszabb pihenőpont-jelölt), false -> magas pontszám", () => {
  const requiresPurchase = rankRestPoint(makeRestPoint({ purchaseRequired: true }), null);
  const noPurchase = rankRestPoint(makeRestPoint({ purchaseRequired: false }), null);
  const factorA = requiresPurchase.ranking.factors.find((f) => f.key === "purchaseRequired");
  const factorB = noPurchase.ranking.factors.find((f) => f.key === "purchaseRequired");
  assert.equal(factorA?.normalizedScore, 0);
  assert.equal(factorB?.normalizedScore, 100);
});

test("közelebbi pihenőpont magasabb distance pontszámot kap, mint egy távolabbi (ugyanazon egyéb adatok mellett)", () => {
  const near = makeRestPoint({ id: "near", latitude: 47.5001, longitude: 19.0501 });
  const far = makeRestPoint({ id: "far", latitude: 47.6, longitude: 19.2 });
  const currentPosition = { lat: 47.5, lon: 19.05 };
  const rankedNear = rankRestPoint(near, currentPosition);
  const rankedFar = rankRestPoint(far, currentPosition);
  const nearScore = rankedNear.ranking.factors.find((f) => f.key === "distance")?.normalizedScore ?? 0;
  const farScore = rankedFar.ranking.factors.find((f) => f.key === "distance")?.normalizedScore ?? 0;
  assert.ok(nearScore > farScore);
  assert.ok((rankedNear.distanceMeters ?? Infinity) < (rankedFar.distanceMeters ?? 0));
});

test("aktuális pozíció nélkül a distance faktor unavailable, DE a többi faktor még számít", () => {
  const rp = makeRestPoint({ seating: true, toilet: true });
  const ranked = rankRestPoint(rp, null);
  const distanceFactor = ranked.ranking.factors.find((f) => f.key === "distance");
  assert.equal(distanceFactor?.available, false);
  assert.ok(ranked.ranking.availableFactors.includes("seating"));
  assert.ok(ranked.ranking.availableFactors.includes("toilet"));
  assert.ok(ranked.ranking.confidence > 0);
});

test("userPreference faktor csak akkor available, ha a hívó ténylegesen preferenciát ad át", () => {
  const rp = makeRestPoint({ quietSpace: true });
  const withoutPreference = rankRestPoint(rp, null);
  const withPreference = rankRestPoint(rp, null, undefined, { preferQuiet: true });
  assert.equal(withoutPreference.ranking.factors.find((f) => f.key === "userPreference")?.available, false);
  assert.equal(withPreference.ranking.factors.find((f) => f.key === "userPreference")?.available, true);
});

test("userPreference: preferQuiet=true ÉS a pont ténylegesen quietSpace=true -> magas pontszám; ellentmondás -> alacsony", () => {
  const quietMatch = rankRestPoint(makeRestPoint({ quietSpace: true }), null, undefined, { preferQuiet: true });
  const quietMismatch = rankRestPoint(makeRestPoint({ quietSpace: false }), null, undefined, { preferQuiet: true });
  const matchScore = quietMatch.ranking.factors.find((f) => f.key === "userPreference")?.normalizedScore ?? 0;
  const mismatchScore = quietMismatch.ranking.factors.find((f) => f.key === "userPreference")?.normalizedScore ?? 0;
  assert.ok(matchScore > mismatchScore);
});

test("rankRestPoints: determinisztikus, csökkenő score szerinti rendezés, egyenlő score esetén id szerint", () => {
  const currentPosition = { lat: 47.5, lon: 19.05 };
  const good = makeRestPoint({ id: "good", seating: true, toilet: true, quietSpace: true, latitude: 47.5001, longitude: 19.0501 });
  const bad = makeRestPoint({ id: "bad", seating: false, toilet: false, quietSpace: false, latitude: 48.0, longitude: 20.0 });
  const ranked = rankRestPoints([bad, good], currentPosition);
  assert.equal(ranked[0].restPoint.id, "good");
  assert.equal(ranked[1].restPoint.id, "bad");
});

test("rankRestPoints ugyanarra a bemenetre mindig ugyanazt az eredményt adja (nincs véletlenszerűség, nincs LLM)", () => {
  const currentPosition = { lat: 47.5, lon: 19.05 };
  const points = [
    makeRestPoint({ id: "a", seating: true }),
    makeRestPoint({ id: "b", toilet: true }),
    makeRestPoint({ id: "c", quietSpace: true }),
  ];
  const run1 = rankRestPoints(points, currentPosition).map((r) => r.restPoint.id);
  const run2 = rankRestPoints(points, currentPosition).map((r) => r.restPoint.id);
  assert.deepEqual(run1, run2);
});

test("egyedi súlyok (weightsInput) ténylegesen befolyásolják a score-t, determinisztikusan", () => {
  const rp = makeRestPoint({ seating: true, toilet: false });
  const defaultWeights = rankRestPoint(rp, null);
  const seatingHeavy = rankRestPoint(rp, null, { seating: 10, toilet: 0.1 });
  assert.notEqual(defaultWeights.ranking.score, seatingHeavy.ranking.score);
});
