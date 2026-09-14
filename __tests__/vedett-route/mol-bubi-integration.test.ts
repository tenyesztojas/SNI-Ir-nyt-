// VÉDETT ÚTVONAL – MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13),
// PHASE 1.1 HARDENING (2026-09-13, ugyanaznapi javító kör) — lásd a Phase
// 1.1 kör két kötelező korrekcióját:
//   (1) a spekulatív "vehiclesAvailable"-szerű MOTIS mezők és minden
//       darabszám-megjelenítés eltávolítva — a MOTIS /api/v6/plan válaszban
//       nincs erre bizonyított adatforrás (lásd motisTypes.ts).
//   (2) "RENTAL leg = mol-bubi" NEM globális szabály többé — a domain
//       normalizer (orchestrator.ts mapLeg()) csak akkor jelöl "mol-bubi"
//       providert, ha az adott leg egy TÉNYLEGESEN Bubi-enabled kérésből
//       származik (molBubiRequestActive context).
//
// Két módszert használ, a kódbázis meglévő, bevált mintáit követve:
//   - direkt függvényhívás fixture-ökkel/mockolt fetch-csel (lásd
//     motisClient.test.ts, orchestrator.test.ts),
//   - forráskód-szintű, readFileSync+regex strukturális teszt (lásd
//     fullscreen-rest-point-integration.test.ts) a UI-nak a felhasználó felé
//     SOHA nem jeleníthető nyers stringekre (RENTAL/GBFS/ELECTRIC_ASSIST/
//     HUMAN/mol-bubi) és a "MOL Bubi" kártya jelenlétére vonatkozó
//     ellenőrzéséhez.
//
//   node --test --experimental-strip-types __tests__/vedett-route/mol-bubi-integration.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapMotisItineraryToJourney,
  searchVedettRoutes,
  buildBubiMotisParams,
  BUBI_RENTAL_PROVIDER,
} from "../../lib/vedett-route/orchestrator.ts";
import { computeSensoryScore } from "../../lib/vedett-route/sensoryEngine.ts";
import { rankJourneys } from "../../lib/vedett-route/ranking.ts";
import { computeJourneyFingerprint } from "../../lib/vedett-route/fingerprint.ts";
import { journeySearchSchema } from "../../lib/vedett-route/schemas.ts";
import { buildRouteCacheKey } from "../../lib/vedett-route/routeCache.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";
import type { Journey, PersonalizationWeights } from "../../lib/vedett-route/types.ts";

const WEIGHTS: PersonalizationWeights = {
  transfers: 1,
  modeSwitches: 1,
  underground: 1,
  walking: 1,
  duration: 1,
  waiting: 1,
};

function walkTransitItinerary(): MotisItinerary {
  return {
    duration: 780,
    startTime: "2026-09-13T07:00:00Z",
    endTime: "2026-09-13T07:13:00Z",
    transfers: 0,
    legs: [
      { mode: "WALK", from: { name: "A" }, to: { name: "Deák Ferenc tér" }, duration: 300, distance: 400 },
      {
        mode: "SUBWAY",
        from: { name: "Deák Ferenc tér" },
        to: { name: "Blaha Lujza tér" },
        duration: 180,
        routeShortName: "M2",
      },
      { mode: "WALK", from: { name: "Blaha Lujza tér" }, to: { name: "B" }, duration: 300, distance: 350 },
    ],
  };
}

function rentalIntermodalItinerary(overrides: { propulsion?: string } = {}): MotisItinerary {
  return {
    duration: 900,
    startTime: "2026-09-13T07:00:00Z",
    endTime: "2026-09-13T07:15:00Z",
    transfers: 0,
    legs: [
      { mode: "WALK", from: { name: "A" }, to: { name: "Széchenyi utca" }, duration: 120, distance: 150 },
      {
        mode: "RENTAL",
        from: { name: "Széchenyi utca" },
        to: { name: "Uszoda utca" },
        duration: 420,
        distance: 1600,
        rentalVehiclePropulsionType: overrides.propulsion,
      },
      { mode: "WALK", from: { name: "Uszoda utca" }, to: { name: "B" }, duration: 180, distance: 200 },
      { mode: "BUS", from: { name: "B" }, to: { name: "C" }, duration: 180, routeShortName: "7" },
    ],
  };
}

// =========================================================================
// A) Bubi default OFF + B/C/D) OFF request byte-azonosság (base/metro-free/
//    last-mile fallback) + E) OFF fingerprint/cache kompatibilis
// =========================================================================

test("A) JourneySearchRequest.molBubiEnabled hiánya esetén searchVedettRoutes ugyanúgy fut le, mint Bubi bevezetése előtt (nincs kötelező mező)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error teszt mock
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ itineraries: [walkTransitItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
    });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("B) OFF mód: az ALAP (base) MOTIS kérés URL-je NEM tartalmaz semmilyen preTransit* paramétert", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    return new Response(JSON.stringify({ itineraries: [walkTransitItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
    });
    const baseUrl = capturedUrls.find((u) => !u.includes("transitModes=BUS"));
    assert.ok(baseUrl, "kell legyen 'alap' stratégiájú hívás");
    assert.doesNotMatch(baseUrl!, /preTransitModes|preTransitRentalProviders|preTransitRentalFormFactors|preTransitRentalPropulsionTypes/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("C) OFF mód: a METRÓMENTES (calmer, transitModes=BUS,TRAM,RAIL,COACH) MOTIS kérés URL-je NEM tartalmaz semmilyen preTransit* paramétert", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    return new Response(JSON.stringify({ itineraries: [walkTransitItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
    });
    const calmerUrl = capturedUrls.find((u) => u.includes("transitModes=BUS"));
    assert.ok(calmerUrl, "kell legyen 'metrómentes' stratégiájú hívás");
    assert.doesNotMatch(calmerUrl!, /preTransitModes|preTransitRentalProviders|preTransitRentalFormFactors|preTransitRentalPropulsionTypes/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("D) OFF mód: a last-mile fallback (radius=1500) MOTIS kérés URL-je is byte-azonos marad — NEM tartalmaz preTransit* paramétert", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock — 0 itinerary + explicit n_start_offsets=0
  // váltja ki a last-mile fallback ágat (lásd shouldAttemptLastMileFallback()).
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    if (url.includes("radius=1500")) {
      return new Response(JSON.stringify({ itineraries: [walkTransitItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ itineraries: [], debugOutput: { n_start_offsets: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
    });
    const fallbackUrl = capturedUrls.find((u) => u.includes("radius=1500"));
    assert.ok(fallbackUrl, "kell legyen last-mile fallback hívás");
    assert.doesNotMatch(fallbackUrl!, /preTransitModes|preTransitRentalProviders|preTransitRentalFormFactors|preTransitRentalPropulsionTypes/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("E) OFF mód: fingerprint és cache-kulcs is byte-kompatibilis marad (nincs RENTAL szegmens/mező, ha nincs Bubi)", () => {
  const journey = mapMotisItineraryToJourney(walkTransitItinerary());
  // A fingerprint formátuma "...::<transitLegsKey>::<rentalLegsKey>" — RENTAL
  // nélküli journey-nél a rentalLegsKey mindig üres string, tehát a
  // formátum stabilan végződik "::"-tal, sosem tartalmaz RENTAL-adatot.
  assert.ok(computeJourneyFingerprint(journey).endsWith("::"));

  const base = { fromLat: 1, fromLon: 2, toLat: 3, toLon: 4, departAtMinute: "x", weights: null, stepFreeRequired: false };
  const offKey1 = buildRouteCacheKey({ ...base, molBubiEnabled: false, bikePropulsion: null });
  const offKey2 = buildRouteCacheKey({ ...base, molBubiEnabled: false, bikePropulsion: null });
  assert.equal(offKey1, offKey2, "két azonos OFF-kérés cache-kulcsa egyezzen");
});

// =========================================================================
// F/G/H) ON mód propulsion-variánsok + I) provider mindig mol-bubi +
// J/K) direct/postTransit RENTAL SOHA nincs hozzáadva
// =========================================================================

test("F) ON + ANY: NEM küld propulsion-szűrőt, de a többi Bubi paramétert igen", () => {
  const params = buildBubiMotisParams("ANY");
  assert.deepEqual(params.preTransitModes, ["RENTAL"]);
  assert.deepEqual(params.preTransitRentalProviders, [BUBI_RENTAL_PROVIDER]);
  assert.deepEqual(params.preTransitRentalFormFactors, ["BICYCLE"]);
  assert.equal("preTransitRentalPropulsionTypes" in params, false);
});

test("G) ON + HUMAN: KIZÁRÓLAG HUMAN propulsion-szűrőt küld", () => {
  const params = buildBubiMotisParams("HUMAN");
  assert.deepEqual(params.preTransitRentalPropulsionTypes, ["HUMAN"]);
});

test("H) ON + ELECTRIC_ASSIST: KIZÁRÓLAG ELECTRIC_ASSIST propulsion-szűrőt küld", () => {
  const params = buildBubiMotisParams("ELECTRIC_ASSIST");
  assert.deepEqual(params.preTransitRentalPropulsionTypes, ["ELECTRIC_ASSIST"]);
});

test("I) a preTransitRentalProviders MINDIG kizárólag ['mol-bubi'], semmilyen bemenettel nem szivárogtatható más érték", () => {
  for (const propulsion of ["ANY", "HUMAN", "ELECTRIC_ASSIST", undefined] as const) {
    const params = buildBubiMotisParams(propulsion);
    assert.deepEqual(params.preTransitRentalProviders, ["mol-bubi"]);
  }
});

test("J) ON mód: a MOTIS kérés URL-je SOHA nem tartalmaz directModes=RENTAL-t (Phase 1 KIZÁRÓLAG pre-transit)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    return new Response(JSON.stringify({ itineraries: [rentalIntermodalItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
      molBubiEnabled: true,
      bikePropulsion: "ANY",
    });
    for (const url of capturedUrls) {
      assert.doesNotMatch(new URL(url).search, /directModes/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("K) ON mód: a MOTIS kérés URL-je SOHA nem tartalmaz postTransitModes=RENTAL-t (Phase 1 KIZÁRÓLAG pre-transit)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    return new Response(JSON.stringify({ itineraries: [rentalIntermodalItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
      molBubiEnabled: true,
      bikePropulsion: "ANY",
    });
    for (const url of capturedUrls) {
      assert.doesNotMatch(new URL(url).search, /postTransitModes/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("ON mód: a bizonyított preTransit* paraméterek ténylegesen megjelennek az URL-ben (base + metrómentes hívás mindkettőn)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  // @ts-expect-error teszt mock
  globalThis.fetch = async (url: string) => {
    capturedUrls.push(url);
    return new Response(JSON.stringify({ itineraries: [rentalIntermodalItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
      molBubiEnabled: true,
      bikePropulsion: "HUMAN",
    });
    assert.ok(capturedUrls.length >= 2);
    for (const url of capturedUrls) {
      const parsed = new URL(url);
      assert.deepEqual(parsed.searchParams.getAll("preTransitModes"), ["RENTAL"]);
      assert.deepEqual(parsed.searchParams.getAll("preTransitRentalProviders"), ["mol-bubi"]);
      assert.deepEqual(parsed.searchParams.getAll("preTransitRentalFormFactors"), ["BICYCLE"]);
      assert.deepEqual(parsed.searchParams.getAll("preTransitRentalPropulsionTypes"), ["HUMAN"]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

// =========================================================================
// L) RENTAL parsing + M) RENTAL user-facing = MOL Bubi CSAK Bubi-kontextusban
// =========================================================================

test("L) mapMotisItineraryToJourney: RENTAL leg 'RENTAL' módra képződik le, pickup/dropoff/duration/distance/geometry helyesen normalizálódik", () => {
  const journey = mapMotisItineraryToJourney(rentalIntermodalItinerary(), undefined, true);
  const rentalLeg = journey.legs.find((l) => l.mode === "RENTAL");
  assert.ok(rentalLeg, "kell legyen RENTAL láb");
  assert.equal(rentalLeg!.fromName, "Széchenyi utca");
  assert.equal(rentalLeg!.toName, "Uszoda utca");
  assert.equal(rentalLeg!.durationMinutes, 7);
  assert.equal(rentalLeg!.distanceMeters, 1600);
  assert.equal(rentalLeg!.transitMode, undefined, "RENTAL leg nem TRANSIT, transitMode nélküle marad");
});

test("M1) mapMotisItineraryToJourney: molBubiRequestActive=true kontextusban a RENTAL leg 'mol-bubi' providert kap", () => {
  const journey = mapMotisItineraryToJourney(rentalIntermodalItinerary(), undefined, true);
  const rentalLeg = journey.legs.find((l) => l.mode === "RENTAL");
  assert.equal(rentalLeg!.rentalProvider, "mol-bubi");
});

test("M2) mapMotisItineraryToJourney: molBubiRequestActive=false (vagy hiányzó) kontextusban a RENTAL leg NEM kap 'mol-bubi' providert — RENTAL ≠ automatikusan MOL Bubi", () => {
  const journeyDefaultParam = mapMotisItineraryToJourney(rentalIntermodalItinerary());
  const rentalLegDefault = journeyDefaultParam.legs.find((l) => l.mode === "RENTAL");
  assert.equal(rentalLegDefault!.rentalProvider, undefined);

  const journeyExplicitFalse = mapMotisItineraryToJourney(rentalIntermodalItinerary(), undefined, false);
  const rentalLegExplicit = journeyExplicitFalse.legs.find((l) => l.mode === "RENTAL");
  assert.equal(rentalLegExplicit!.rentalProvider, undefined);
});

test("M3) searchVedettRoutes: a molBubiRequestActive context TÉNYLEGESEN a request.molBubiEnabled-ből származik (nem a válaszból találgatva)", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error teszt mock — a MOTIS egy RENTAL lábat ad vissza AKKOR IS,
  // ha a kérés maga nem kért Bubit (védekező teszt-szcenárió: sosem szabad
  // megbízni abban, hogy a válasz "önmagától" jelzi a kontextust).
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ itineraries: [rentalIntermodalItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
      // molBubiEnabled hiányzik/false — a kérés NEM Bubi-kontextusú.
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const rentalLeg = result.journeys[0].journey.legs.find((l) => l.mode === "RENTAL");
      assert.ok(rentalLeg);
      assert.equal(rentalLeg!.rentalProvider, undefined, "nem Bubi-kérésből NEM kaphat 'mol-bubi' címkét");
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("mapMotisItineraryToJourney: ismeretlen/hiányzó rentalVehiclePropulsionType esetén NEM találgat — undefined marad", () => {
  const journey = mapMotisItineraryToJourney(rentalIntermodalItinerary({ propulsion: "SOMETHING_UNEXPECTED" }), undefined, true);
  const rentalLeg = journey.legs.find((l) => l.mode === "RENTAL");
  assert.equal(rentalLeg!.rentalPropulsionType, undefined);
});

test("mapMotisItineraryToJourney: ismert rentalVehiclePropulsionType (ELECTRIC_ASSIST) átkerül a JourneyLeg-be", () => {
  const journey = mapMotisItineraryToJourney(rentalIntermodalItinerary({ propulsion: "ELECTRIC_ASSIST" }), undefined, true);
  const rentalLeg = journey.legs.find((l) => l.mode === "RENTAL");
  assert.equal(rentalLeg!.rentalPropulsionType, "ELECTRIC_ASSIST");
});

// =========================================================================
// N/O) raw string tilalom + P) availability darabszám tilalom
// =========================================================================

const repoRoot = join(import.meta.dirname, "..", "..");
const formSrc = readFileSync(join(repoRoot, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const mapSrc = readFileSync(join(repoRoot, "components/vedett-utvonal/VedettUtvonalMap.tsx"), "utf8");
const motisTypesSrc = readFileSync(join(repoRoot, "lib/vedett-route/motisTypes.ts"), "utf8");

test("N) VedettUtvonalSearchForm.tsx SOHA nem ír ki nyers 'RENTAL'/'GBFS' stringet a felhasználó felé (kizárólag kódban/kommentben szerepelhet)", () => {
  assert.doesNotMatch(formSrc, /\{leg\.mode\}/);
  assert.doesNotMatch(formSrc, />\s*GBFS\s*</);
  assert.doesNotMatch(formSrc, />\s*RENTAL\s*</);
  assert.doesNotMatch(formSrc, /\{leg\.rentalProvider\}/);
});

test("O) VedettUtvonalSearchForm.tsx SOHA nem ír ki nyers 'ELECTRIC_ASSIST'/'HUMAN'/'mol-bubi' stringet felhasználói szöveg-node-ba", () => {
  assert.doesNotMatch(formSrc, /\{leg\.rentalPropulsionType\}/);
  assert.doesNotMatch(formSrc, />\s*ELECTRIC_ASSIST\s*</);
  assert.doesNotMatch(formSrc, />\s*HUMAN\s*</);
  assert.doesNotMatch(formSrc, />\s*mol-bubi\s*</);
  // A pontos, felhasználó által kért magyar megnevezéseknek viszont jelen
  // kell lenniük.
  assert.match(formSrc, /Hagyományos kerékpár/);
  assert.match(formSrc, /Elektromos kerékpár/);
});

test("P) A Bubi leg-kártya SEHOL nem jelenít meg konkrét kerékpár-darabszámot — a spekulatív availability-mező és a hozzá tartozó megjelenítő függvény véglegesen eltávolítva", () => {
  // A "rentalAvailabilityText" segédfüggvény DEFINÍCIÓJA (nem csak
  // említése egy magyarázó kommentben) SEHOL nem szerepelhet.
  assert.doesNotMatch(formSrc, /function rentalAvailabilityText/);
  // A "leg.rentalVehiclesAvailable" property-hozzáférés (élő kód, nem
  // komment-szöveg) SEHOL nem szerepelhet.
  assert.doesNotMatch(formSrc, /leg\.rentalVehiclesAvailable/);
  // Semmilyen "N kerékpár/elektromos kerékpár elérhető" szöveg nem
  // jelenhet meg felhasználói JSX szöveg-node-ban.
  assert.doesNotMatch(formSrc, />\s*\{[^}]*kerékpár elérhető[^}]*\}\s*</);
  // A disclaimer mondat viszont KÖTELEZŐEN jelen van.
  assert.match(formSrc, /A kerékpárok elérhetősége folyamatosan változhat\./);
});

test("P2) types.ts JourneyLeg NEM tartalmaz rentalVehiclesAvailable (vagy más availability-darabszám) mezőt", () => {
  const typesSrc = readFileSync(join(repoRoot, "lib/vedett-route/types.ts"), "utf8");
  assert.doesNotMatch(typesSrc, /rentalVehiclesAvailable\s*\?\s*:/);
});

test("P3) motisTypes.ts MotisPlace NEM modellez spekulatív MOTIS availability mezőt (vehiclesAvailable/vehicleDocksAvailable eltávolítva)", () => {
  assert.doesNotMatch(motisTypesSrc, /vehiclesAvailable\s*\?\s*:/);
  assert.doesNotMatch(motisTypesSrc, /vehicleDocksAvailable\s*\?\s*:/);
});

// =========================================================================
// Q) régi (RENTAL nélküli) itinerary regresszió + R) RENTAL hiány graceful
// fallback + S) map mount invariant
// =========================================================================

test("Q) régi (RENTAL nélküli) itinerary regresszió: sensory score/fingerprint byte-ra ugyanaz marad", () => {
  const journey = mapMotisItineraryToJourney(walkTransitItinerary());
  const score = computeSensoryScore(journey, WEIGHTS);
  assert.equal(score.availableFactors.includes("crowding"), false);
  assert.equal(score.missingFactors.includes("crowding"), true);
  assert.ok(Number.isFinite(score.score));

  const a = mapMotisItineraryToJourney(walkTransitItinerary());
  const b = mapMotisItineraryToJourney(walkTransitItinerary());
  assert.equal(computeJourneyFingerprint(a), computeJourneyFingerprint(b));
});

test("R) searchVedettRoutes: molBubiEnabled=true, de a MOTIS válasz nem ad vissza RENTAL lábat (pl. GBFS átmenetileg nem elérhető) — a keresés attól még sikeres marad", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error teszt mock
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ itineraries: [walkTransitItinerary()] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await searchVedettRoutes({
      from: { name: "A", lat: 47.5, lon: 19.05 },
      to: { name: "B", lat: 47.49, lon: 19.06 },
      departAt: new Date().toISOString(),
      molBubiEnabled: true,
      bikePropulsion: "ANY",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.journeys.length > 0);
      assert.ok(result.journeys.every((rj) => rj.journey.legs.every((l) => l.mode !== "RENTAL")));
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("S) VedettUtvonalMap.tsx: a MOL Bubi (RENTAL) lábaknak van saját, megkülönböztetett szín/réteg, és pontosan EGY 'new maplibregl.Map(' hívás létezik (egyetlen közös térkép invariáns)", () => {
  assert.match(mapSrc, /RENTAL:\s*"#/);
  assert.match(mapSrc, /lines-rental/);
  const mapInstanceMatches = mapSrc.match(/new maplibregl\.Map\(/g) ?? [];
  assert.equal(mapInstanceMatches.length, 1);
});

// =========================================================================
// Egyéb — sensory/ranking crash-mentesség, séma, cache-izoláció, geometry
// =========================================================================

test("computeSensoryScore/rankJourneys nem dob hibát egy RENTAL lábat tartalmazó journey-n", () => {
  const rentalJourney: Journey = { ...mapMotisItineraryToJourney(rentalIntermodalItinerary(), undefined, true) };
  const transitJourney: Journey = { ...mapMotisItineraryToJourney(walkTransitItinerary()) };
  const withSensory = [rentalJourney, transitJourney].map((j) => ({ ...j, sensory: computeSensoryScore(j, WEIGHTS) }));
  assert.ok(withSensory.every((j) => Number.isFinite(j.sensory.score)));
  const ranked = rankJourneys(withSensory);
  assert.ok(ranked.length > 0);
});

test("egy RENTAL láb NEM számít bele a walkingMinutes-be, de a teljes totalDurationMinutes tartalmazza az idejét", () => {
  const journey = mapMotisItineraryToJourney(rentalIntermodalItinerary());
  assert.equal(journey.walkingMinutes, 5); // 2 WALK láb: 120s+180s=300s=5perc
  assert.equal(journey.totalDurationMinutes, 15); // 900s/60, a RENTAL 420s-a is benne van
});

test("computeJourneyFingerprint: két, csak a MOL Bubi állomáspárban eltérő journey KÜLÖNBÖZŐ fingerprintet kap (nincs hibás dedup)", () => {
  const a = mapMotisItineraryToJourney(rentalIntermodalItinerary());
  const bItinerary = rentalIntermodalItinerary();
  bItinerary.legs[1] = { ...bItinerary.legs[1], from: { name: "Másik állomás" } };
  const b = mapMotisItineraryToJourney(bItinerary);
  assert.notEqual(computeJourneyFingerprint(a), computeJourneyFingerprint(b));
});

test("journeySearchSchema elfogadja a molBubiEnabled + bikePropulsion mezőket, elutasítja az érvénytelen enumot, és opcionálisak maradnak", () => {
  assert.equal(
    journeySearchSchema.safeParse({
      fromCoordinates: { latitude: 47.5, longitude: 19.05 },
      toCoordinates: { latitude: 47.49, longitude: 19.06 },
      molBubiEnabled: true,
      bikePropulsion: "ELECTRIC_ASSIST",
    }).success,
    true
  );
  assert.equal(
    journeySearchSchema.safeParse({
      fromCoordinates: { latitude: 47.5, longitude: 19.05 },
      toCoordinates: { latitude: 47.49, longitude: 19.06 },
      bikePropulsion: "SUPER_FAST",
    }).success,
    false
  );
  assert.equal(
    journeySearchSchema.safeParse({
      fromCoordinates: { latitude: 47.5, longitude: 19.05 },
      toCoordinates: { latitude: 47.49, longitude: 19.06 },
    }).success,
    true
  );
});

test("buildRouteCacheKey: eltérő molBubiEnabled/bikePropulsion eltérő cache-kulcsot ad (nincs kereszt-szennyeződés)", () => {
  const base = { fromLat: 1, fromLon: 2, toLat: 3, toLon: 4, departAtMinute: "x", weights: null, stepFreeRequired: false };
  const off = buildRouteCacheKey({ ...base, molBubiEnabled: false, bikePropulsion: null });
  const onAny = buildRouteCacheKey({ ...base, molBubiEnabled: true, bikePropulsion: "ANY" });
  const onElectric = buildRouteCacheKey({ ...base, molBubiEnabled: true, bikePropulsion: "ELECTRIC_ASSIST" });
  assert.notEqual(off, onAny);
  assert.notEqual(onAny, onElectric);
});

test("VedettUtvonalSearchForm.tsx tartalmazza a checkbox 'MOL Bubi használata' és a select 'Kerékpár típusa' UI-t, pontos magyar opciócímkékkel", () => {
  assert.match(formSrc, /MOL Bubi használata/);
  assert.match(formSrc, /Kerékpár típusa/);
  assert.match(formSrc, /<option value="ANY">Mindegy<\/option>/);
});

test("geometry.ts JourneyLegForGeometry mode típusa tartalmazza a RENTAL-t (a map réteg-szűrők ehhez illeszkednek)", () => {
  const geometrySrc = readFileSync(join(repoRoot, "lib/vedett-route/geometry.ts"), "utf8");
  assert.match(geometrySrc, /mode:\s*"WALK"\s*\|\s*"TRANSIT"\s*\|\s*"RENTAL"/);
});
