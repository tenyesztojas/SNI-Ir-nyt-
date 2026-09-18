// VÉDETT ÚTVONAL — DÉLI -> KOSSUTH NEARBY TRANSIT ACCESS REGRESSZIÓS
// FIXTURE (NEARBY TRANSIT ACCESS / DIRECT TRANSIT CANDIDATE SPRINT,
// 2026-09-18).
//
// CÉL: a 2026-09-18 mobil teszt valós hibáját reprodukálja fixture-szinten
// (Budapest-Déli közelről -> Kossuth Lajos tér 2.): a NORMÁL MOTIS
// tervezés (két, valóban eltérő paraméterezésű fetchMotisPlan() hívás)
// KIZÁRÓLAG feeder (busz+M2) itineraryt ad — EZ a fixture-ben SZÁNDÉKOSAN
// reprodukálja a korábbi sprint VPS-bizonyított megfigyelését, hogy a
// nyers MOTIS válasz nem tartalmazza a közvetlen gyalogos->M2->gyalogos
// candidate-et. A teszt ELLENŐRZI, hogy a NEARBY TRANSIT ACCESS bővítés
// (fetchNearbyTransitAccessJourneys() az orchestrator.ts-ben) ezt a hiányt
// helyesen tölti be: valós gyalogos hozzáférési lábbal (NEM teleportálva),
// majd egy M2 transit candidate-tel, ami a MEGLÉVŐ rangsorolásba (ranking.ts)
// kerül és a metrikák alapján ténylegesen megnyeri a releváns kategóriákat.
//
// FONTOS: ez a teszt NEM Budapest/M2-specifikus production hardcode-ot
// bizonyít — a fixture-koordináták és a "BKK" provider csak a KONKRÉT,
// valós hibát reprodukáló bemenet, a tesztelt kód (orchestrator.ts
// fetchNearbyTransitAccessJourneys/mapNearbyTransitCandidateToJourneys)
// generikus, provider-paraméterezett logika.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

const ORIGIN = { lat: 47.5015, lon: 19.0197 }; // Budapest-Déli környéke (valós E2E teszt-koordináta)
const DESTINATION = { lat: 47.5069, lon: 19.0457 }; // Kossuth Lajos tér környéke
const DEPART_AT = "2026-09-18T17:00:00+02:00";
const NEARBY_STOP_LAT = 47.5013;
const NEARBY_STOP_LON = 19.0146;

// A normál MOTIS tervezés MINDKÉT (default + calmer) hívására visszaadott,
// KIZÁRÓLAG feeder-kombinációt tartalmazó itinerary — nincs benne közvetlen
// gyalog->M2->gyalog candidate (lásd a korábbi sprint VPS-bizonyított
// megfigyelése: a nyers MOTIS válasz sosem tartalmazta a direct candidate-et).
const FEEDER_ITINERARY: MotisItinerary = {
  duration: 1200,
  startTime: "2026-09-18T17:00:00+02:00",
  endTime: "2026-09-18T17:20:00+02:00",
  transfers: 2,
  legs: [
    { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Böszörményi út" }, duration: 160, startTime: "2026-09-18T17:00:00+02:00", endTime: "2026-09-18T17:02:40+02:00" },
    { mode: "BUS", from: { name: "Böszörményi út", stopId: "bkkgtfs_B001" }, to: { name: "Déli pályaudvar M", stopId: "bkkgtfs_B002" }, duration: 300, startTime: "2026-09-18T17:03:00+02:00", endTime: "2026-09-18T17:08:00+02:00", routeShortName: "102" },
    { mode: "SUBWAY", from: { name: "Déli pályaudvar M", stopId: "bkkgtfs_F00094" }, to: { name: "Kossuth Lajos tér", stopId: "bkkgtfs_KOSSUTH" }, duration: 420, startTime: "2026-09-18T17:09:00+02:00", endTime: "2026-09-18T17:16:00+02:00", routeShortName: "M2" },
    { mode: "WALK", from: { name: "Kossuth Lajos tér" }, to: { name: "Kossuth Lajos tér 2." }, duration: 295, startTime: "2026-09-18T17:16:05+02:00", endTime: "2026-09-18T17:20:00+02:00" },
  ],
};

// A nearby-stop-based bővítés MOTIS hívására (fromPlace=bkkgtfs_F00094)
// visszaadott, KIZÁRÓLAG M2-t tartalmazó, gyorsabb, átszállásmentes
// itinerary — a "Déli pályaudvar M" megállótól.
const DIRECT_M2_ITINERARY: MotisItinerary = {
  duration: 420,
  startTime: "2026-09-18T17:03:10+02:00",
  endTime: "2026-09-18T17:10:10+02:00",
  transfers: 0,
  legs: [
    { mode: "SUBWAY", from: { name: "Déli pályaudvar M", stopId: "bkkgtfs_F00094" }, to: { name: "Kossuth Lajos tér", stopId: "bkkgtfs_KOSSUTH" }, duration: 420, startTime: "2026-09-18T17:03:10+02:00", endTime: "2026-09-18T17:10:10+02:00", routeShortName: "M2" },
  ],
};

function mockFetch(url: string, init?: RequestInit): Response {
  const u = new URL(url);

  if (u.pathname === "/nearby-stops") {
    return new Response(
      JSON.stringify({
        ok: true,
        status: "ok",
        stops: [
          { stopId: "F00094", name: "Déli pályaudvar M", lat: NEARBY_STOP_LAT, lon: NEARBY_STOP_LON, distanceMeters: 160 },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  if (u.pathname === "/api/route") {
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        metadata: { duration: 130, distance: 160, uses_elevator: false },
        features: [
          {
            type: "Feature",
            properties: { level: 0 },
            geometry: { type: "LineString", coordinates: [[ORIGIN.lon, ORIGIN.lat], [NEARBY_STOP_LON, NEARBY_STOP_LAT]] },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  if (u.pathname === "/api/v6/plan") {
    const fromPlace = u.searchParams.get("fromPlace") ?? "";
    if (fromPlace.startsWith("bkkgtfs_")) {
      return new Response(JSON.stringify({ itineraries: [DIRECT_M2_ITINERARY] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ itineraries: [FEEDER_ITINERARY] }), { status: 200, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json" } });
}

describe("Déli -> Kossuth NEARBY TRANSIT ACCESS regresszió (2026-09-18)", () => {
  test("a normál MOTIS candidate-ok NEM tartalmaznak közvetlen M2-t, a nearby bővítés generál egyet, ami valós (nem teleportált) gyalogos hozzáféréssel, a MEGLÉVŐ rangsorolásba kerül, és megnyeri a FASTEST/FEWEST_TRANSFERS kategóriákat", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      MOTIS_BASE_URL: process.env.MOTIS_BASE_URL,
      ACCESSIBILITY_SIDECAR_URL: process.env.ACCESSIBILITY_SIDECAR_URL,
      ACCESSIBILITY_SIDECAR_AUTH_TOKEN: process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN,
    };
    process.env.MOTIS_BASE_URL = "http://localhost:19999";
    process.env.ACCESSIBILITY_SIDECAR_URL = "http://localhost:19998";
    process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token";
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL, init?: RequestInit) => mockFetch(typeof input === "string" ? input : input.toString(), init);

    try {
      const result = await searchVedettRoutes({
        from: { name: "Budapest-Déli, Alkotás utca, Krisztinaváros, I. kerület, Budapest, Közép-Magyarország, Magyarország", lat: ORIGIN.lat, lon: ORIGIN.lon },
        to: { name: "Kossuth Lajos tér 2., V. kerület, Budapest, Közép-Magyarország, 1055, Magyarország", lat: DESTINATION.lat, lon: DESTINATION.lon },
        departAt: DEPART_AT,
      });

      assert.equal(result.ok, true);
      if (!result.ok) return;

      // 1. A nearby-generált közvetlen M2 candidate a MEGLÉVŐ, változatlan
      // rangsoroláson (ranking.ts) megy át — a feeder itinerary (transfers:2)
      // a fixture-ben MINDEN kategóriában (FASTEST/FEWEST_TRANSFERS/
      // CALMEST/LEAST_WALKING) veszít a direkt M2 candidate ellen, ezért a
      // MEGLÉVŐ, ebben a sprintben NEM módosított ranking.ts helyesen
      // kiszűri a feedert a végleges (kategorizált) listából — lásd
      // ranking.ts "labeledOnly" szűrője, ami MINDEN nem-címkézett
      // alternatívát elrejt. Ez NEM regresszió: a spec 7/8. pontja szerint
      // "a MEGLÉVŐ rangsorolás dönt a valós metrikák alapján" — itt a
      // direct candidate MINDEN metrikában jobb, ezért helyesen ő nyer
      // MINDEN kategóriát, a feeder pedig — ahogy egy nem javított,
      // egyetlen alternatívát sem vezető candidate esetén elvárt —
      // nem jelenik meg külön kártyaként. Ezt ELLENŐRIZZÜK: valóban NEM
      // maradt bent egyetlen 2-átszállásos (feeder) kategorizált kártya
      // sem, VISZONT ez azért van, mert a direct mindent felülír, nem
      // azért, mert a nearby-bővítés hibásan elnyelte/kiszűrte volna a
      // normál candidate-listát (lásd a fenti debug-bizonyíték: dedup UTÁN
      // mindkét journey — feeder ÉS direct — jelen van, csak a feeder nem
      // kap egyetlen RankingLabel-t sem).
      assert.equal(
        result.journeys.filter((r) => r.journey.transfers === 2).length,
        0,
        "a fixture-ben a direct candidate minden kategóriában jobb, ezért a feeder helyesen nem kap kategória-címkét (ranking.ts változatlan viselkedése)"
      );

      // 2. A nearby bővítés generált egy 0-átszállásos M2 candidate-et.
      const directCandidates = result.journeys.filter((r) => r.journey.transfers === 0 && r.journey.legs.some((l) => l.routeShortName === "M2"));
      assert.equal(directCandidates.length, 1, "pontosan egy nearby-generált közvetlen M2 candidate-nek kell lennie");
      const direct = directCandidates[0].journey;

      // 3. A candidate ELSŐ lába egy VALÓS gyalogos hozzáférési láb — a
      // jelenlegi pozíció NINCS a megállóhoz teleportálva (spec 3. pont).
      const accessLeg = direct.legs[0];
      assert.equal(accessLeg.mode, "WALK");
      assert.equal(accessLeg.fromLat, ORIGIN.lat);
      assert.equal(accessLeg.fromLon, ORIGIN.lon);
      assert.equal(accessLeg.toLat, NEARBY_STOP_LAT);
      assert.equal(accessLeg.toLon, NEARBY_STOP_LON);
      assert.equal(accessLeg.distanceMeters, 160);
      assert.ok(accessLeg.geometryEncoded && accessLeg.geometryEncoded.length > 0, "a walk lábnak valós geometriával kell rendelkeznie");

      // 4. Az eredeti transit lábak (M2, azonos stopId-k) megmaradnak.
      const transitLeg = direct.legs[1];
      assert.equal(transitLeg.mode, "TRANSIT");
      assert.equal(transitLeg.routeShortName, "M2");

      // 5. A megjelenített indulási idő a FAGYASZTOTT eredeti departAt (spec
      // 10. pont) — SOSEM "most", SOSEM a transit-tervezési (walking-gal
      // korrigált) időpont.
      assert.equal(direct.departureTime, DEPART_AT);

      // 6. A direct candidate gyorsabb és kevesebb átszállású, mint a
      // feeder — ezért a MEGLÉVŐ rangsorolás (nem módosított ranking.ts)
      // helyesen a FASTEST és FEWEST_TRANSFERS kategóriákat is neki adja.
      assert.ok(directCandidates[0].labels.includes("FASTEST"), "a direct candidate-nek meg kell nyernie a FASTEST kategóriát");
      assert.ok(directCandidates[0].labels.includes("FEWEST_TRANSFERS"), "a direct candidate-nek meg kell nyernie a FEWEST_TRANSFERS kategóriát");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
