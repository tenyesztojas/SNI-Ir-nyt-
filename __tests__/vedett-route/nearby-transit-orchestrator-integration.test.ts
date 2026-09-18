// VÉDETT ÚTVONAL — NEARBY TRANSIT ACCESS ORCHESTRATOR-INTEGRÁCIÓS TESZTEK
// (NEARBY TRANSIT ACCESS / DIRECT TRANSIT CANDIDATE SPRINT, 2026-09-18).
//
// A deli-kossuth-nearby-transit-regression.test.ts a KONKRÉT, valós hibát
// reprodukálja. Ez a fájl a searchVedettRoutes() nearby-integrációjának
// TOVÁBBI, generikus (NEM Budapest/Déli/M2-specifikus) garanciáit fedi le
// a Section 14 specifikáció-lista még hiányzó pontjaira: eredeti transit
// ID-k megőrzése, duplikátum-dedup, fail-safe (nearby/MOTIS-bővítés hibája
// esetén a normál eredmény túlél), és hogy a direct candidate CSAK akkor
// nyer kategóriát, ha a metrikák ezt tényleg indokolják (nincs beégetett
// győztes).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

const ORIGIN = { lat: 40.0, lon: 20.0 };
const DESTINATION = { lat: 40.02, lon: 20.02 };
const DEPART_AT = "2026-09-18T10:00:00+02:00";
const NEARBY_STOP_LAT = 40.001;
const NEARBY_STOP_LON = 20.001;

function withMockedEnv(): { restore: () => void } {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    MOTIS_BASE_URL: process.env.MOTIS_BASE_URL,
    ACCESSIBILITY_SIDECAR_URL: process.env.ACCESSIBILITY_SIDECAR_URL,
    ACCESSIBILITY_SIDECAR_AUTH_TOKEN: process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN,
  };
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  process.env.ACCESSIBILITY_SIDECAR_URL = "http://localhost:19998";
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token";
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

function nearbyStopsResponse(): Response {
  return new Response(
    JSON.stringify({ ok: true, status: "ok", stops: [{ stopId: "X001", name: "Teszt Megálló", lat: NEARBY_STOP_LAT, lon: NEARBY_STOP_LON, distanceMeters: 120 }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function walkingRouteResponse(): Response {
  return new Response(
    JSON.stringify({
      type: "FeatureCollection",
      metadata: { duration: 100, distance: 120, uses_elevator: false },
      features: [{ type: "Feature", properties: { level: 0 }, geometry: { type: "LineString", coordinates: [[ORIGIN.lon, ORIGIN.lat], [NEARBY_STOP_LON, NEARBY_STOP_LAT]] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("searchVedettRoutes — NEARBY TRANSIT ACCESS integráció, generikus garanciák", () => {
  test("az eredeti transit stopId-k (fromStopId/toStopId) megőrződnek a nearby-generált candidate-ben", async () => {
    const { restore } = withMockedEnv();
    const nearbyItinerary: MotisItinerary = {
      duration: 300,
      startTime: "2026-09-18T10:02:00+02:00",
      endTime: "2026-09-18T10:07:00+02:00",
      transfers: 0,
      legs: [
        { mode: "SUBWAY", from: { name: "Teszt Megálló", stopId: "bkkgtfs_X001" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 300, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:07:00+02:00", routeShortName: "T1" },
      ],
    };
    const normalItinerary: MotisItinerary = {
      duration: 900,
      startTime: "2026-09-18T10:00:00+02:00",
      endTime: "2026-09-18T10:15:00+02:00",
      transfers: 1,
      legs: [
        { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Feeder megálló" }, duration: 120, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:02:00+02:00" },
        { mode: "BUS", from: { name: "Feeder megálló", stopId: "bkkgtfs_FEED" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 780, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:15:00+02:00", routeShortName: "99" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return nearbyStopsResponse();
      if (u.pathname === "/api/route") return walkingRouteResponse();
      if (u.pathname === "/api/v6/plan") {
        const fromPlace = u.searchParams.get("fromPlace") ?? "";
        if (fromPlace.startsWith("bkkgtfs_")) return new Response(JSON.stringify({ itineraries: [nearbyItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ itineraries: [normalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const direct = result.journeys.find((r) => r.journey.transfers === 0);
      assert.ok(direct, "a nearby-generált 0-átszállásos candidate-nek megjelennie kell");
      const transitLeg = direct!.journey.legs.find((l) => l.mode === "TRANSIT");
      assert.ok(transitLeg, "a candidate-nek tartalmaznia kell a transit lábat");
      assert.equal(transitLeg!.fromStopId, "bkkgtfs_X001");
      assert.equal(transitLeg!.toStopId, "bkkgtfs_DEST");
      assert.equal(transitLeg!.routeShortName, "T1");
    } finally {
      restore();
    }
  });

  test("ha a nearby-generált candidate MEGEGYEZIK egy normál MOTIS candidate-tel (azonos transit lábak+időpont), a MEGLÉVŐ dedup egyben tartja (nincs duplikátum kártya)", async () => {
    const { restore } = withMockedEnv();
    // A normál MOTIS válasz MÁR magában a walk->T1->walk alakot adja (a
    // felhasználó szempontjából ez ekvivalens a nearby-bővítéssel, csak a
    // MOTIS eleve megtalálta) — a fingerprint (indulási perc + transit
    // lábak) EGYEZIK a nearby candidate-ével, tehát deduplicateJourneys()
    // (fingerprint.ts, VÁLTOZATLAN) egyben tartja.
    const sameShapeNormalItinerary: MotisItinerary = {
      duration: 420,
      startTime: "2026-09-18T10:00:00+02:00",
      endTime: "2026-09-18T10:07:00+02:00",
      transfers: 0,
      legs: [
        { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Teszt Megálló" }, duration: 120, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:02:00+02:00" },
        { mode: "SUBWAY", from: { name: "Teszt Megálló", stopId: "bkkgtfs_X001" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 300, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:07:00+02:00", routeShortName: "T1" },
      ],
    };
    const nearbyItinerary: MotisItinerary = {
      duration: 300,
      startTime: "2026-09-18T10:02:00+02:00",
      endTime: "2026-09-18T10:07:00+02:00",
      transfers: 0,
      legs: [
        { mode: "SUBWAY", from: { name: "Teszt Megálló", stopId: "bkkgtfs_X001" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 300, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:07:00+02:00", routeShortName: "T1" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return nearbyStopsResponse();
      if (u.pathname === "/api/route") return walkingRouteResponse();
      if (u.pathname === "/api/v6/plan") {
        const fromPlace = u.searchParams.get("fromPlace") ?? "";
        if (fromPlace.startsWith("bkkgtfs_")) return new Response(JSON.stringify({ itineraries: [nearbyItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ itineraries: [sameShapeNormalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const zeroTransferMatches = result.journeys.filter((r) => r.journey.transfers === 0);
      assert.equal(zeroTransferMatches.length, 1, "a normál és a nearby candidate ugyanazt az utat írja le — a dedupnak EGYETLEN kártyát kell megtartania");
    } finally {
      restore();
    }
  });

  test("a nearby-stops sidecar teljes hibája (500) esetén a normál MOTIS találatok VÁLTOZATLANUL megjelennek — a bővítés csak enhancement", async () => {
    const { restore } = withMockedEnv();
    const normalItinerary: MotisItinerary = {
      duration: 900,
      startTime: "2026-09-18T10:00:00+02:00",
      endTime: "2026-09-18T10:15:00+02:00",
      transfers: 1,
      legs: [
        { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Feeder megálló" }, duration: 120, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:02:00+02:00" },
        { mode: "BUS", from: { name: "Feeder megálló", stopId: "bkkgtfs_FEED" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 780, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:15:00+02:00", routeShortName: "99" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return new Response("internal error", { status: 500 });
      if (u.pathname === "/api/v6/plan") {
        return new Response(JSON.stringify({ itineraries: [normalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.journeys.length, 1);
      assert.equal(result.journeys[0].journey.transfers, 1);
    } finally {
      restore();
    }
  });

  test("a nearby-stops sikeres, de a MOTIS transit-tervezés (a nearby megállótól) sikertelen (500) — a normál találatok túlélik, nincs félkész/hibás nearby kártya", async () => {
    const { restore } = withMockedEnv();
    const normalItinerary: MotisItinerary = {
      duration: 900,
      startTime: "2026-09-18T10:00:00+02:00",
      endTime: "2026-09-18T10:15:00+02:00",
      transfers: 1,
      legs: [
        { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Feeder megálló" }, duration: 120, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:02:00+02:00" },
        { mode: "BUS", from: { name: "Feeder megálló", stopId: "bkkgtfs_FEED" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 780, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:15:00+02:00", routeShortName: "99" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return nearbyStopsResponse();
      if (u.pathname === "/api/route") return walkingRouteResponse();
      if (u.pathname === "/api/v6/plan") {
        const fromPlace = u.searchParams.get("fromPlace") ?? "";
        if (fromPlace.startsWith("bkkgtfs_")) return new Response("internal error", { status: 500 });
        return new Response(JSON.stringify({ itineraries: [normalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.journeys.length, 1);
      assert.equal(result.journeys[0].journey.transfers, 1);
    } finally {
      restore();
    }
  });

  test("a nearby-generált candidate CSAK akkor nyeri meg a FASTEST/FEWEST_TRANSFERS kategóriát, ha a metrikák ezt tényleg indokolják — ha a normál (feeder) candidate GYORSABB és kevesebb átszállású, ő nyer, NEM a nearby (nincs beégetett győztes)", async () => {
    const { restore } = withMockedEnv();
    // A nearby candidate itt SZÁNDÉKOSAN lassabb és több átszállású, mint a
    // normál (feeder) candidate — ez bizonyítja, hogy a ranking.ts
    // (VÁLTOZATLAN) valós metrikák alapján dönt, nem automatikusan a
    // "direct"/nearby-generált candidate-nek ad elsőbbséget.
    const slowerNearbyItinerary: MotisItinerary = {
      duration: 1800,
      startTime: "2026-09-18T10:02:00+02:00",
      endTime: "2026-09-18T10:32:00+02:00",
      transfers: 2,
      legs: [
        { mode: "SUBWAY", from: { name: "Teszt Megálló", stopId: "bkkgtfs_X001" }, to: { name: "Átszálló", stopId: "bkkgtfs_MID" }, duration: 900, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:17:00+02:00", routeShortName: "T1" },
        { mode: "BUS", from: { name: "Átszálló", stopId: "bkkgtfs_MID" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 900, startTime: "2026-09-18T10:17:00+02:00", endTime: "2026-09-18T10:32:00+02:00", routeShortName: "77" },
      ],
    };
    const fasterNormalItinerary: MotisItinerary = {
      duration: 300,
      startTime: "2026-09-18T10:00:00+02:00",
      endTime: "2026-09-18T10:05:00+02:00",
      transfers: 0,
      legs: [
        { mode: "SUBWAY", from: { name: "Jelenlegi hely melletti megálló", stopId: "bkkgtfs_CLOSE" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 300, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:05:00+02:00", routeShortName: "T9" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return nearbyStopsResponse();
      if (u.pathname === "/api/route") return walkingRouteResponse();
      if (u.pathname === "/api/v6/plan") {
        const fromPlace = u.searchParams.get("fromPlace") ?? "";
        if (fromPlace.startsWith("bkkgtfs_")) return new Response(JSON.stringify({ itineraries: [slowerNearbyItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ itineraries: [fasterNormalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const nearbyEntry = result.journeys.find((r) => r.journey.legs.some((l) => l.routeShortName === "T1"));
      const normalEntry = result.journeys.find((r) => r.journey.legs.some((l) => l.routeShortName === "T9"));
      assert.ok(normalEntry, "a gyorsabb normál candidate-nek meg kell jelennie");
      assert.ok(normalEntry!.labels.includes("FASTEST"));
      assert.ok(normalEntry!.labels.includes("FEWEST_TRANSFERS"));
      if (nearbyEntry) {
        assert.ok(!nearbyEntry.labels.includes("FASTEST"), "a lassabb nearby candidate NEM nyerheti a FASTEST kategóriát");
        assert.ok(!nearbyEntry.labels.includes("FEWEST_TRANSFERS"), "a több átszállású nearby candidate NEM nyerheti a FEWEST_TRANSFERS kategóriát");
      }
    } finally {
      restore();
    }
  });

  test("a nearby-generált candidate a MEGLÉVŐ Sensory Engine-en megy át (journey.sensory definiált, nincs mesterséges előny)", async () => {
    const { restore } = withMockedEnv();
    const nearbyItinerary: MotisItinerary = {
      duration: 300,
      startTime: "2026-09-18T10:02:00+02:00",
      endTime: "2026-09-18T10:07:00+02:00",
      transfers: 0,
      legs: [
        { mode: "SUBWAY", from: { name: "Teszt Megálló", stopId: "bkkgtfs_X001" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 300, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:07:00+02:00", routeShortName: "T1" },
      ],
    };
    // @ts-expect-error teszt mock
    globalThis.fetch = async (input: string | URL) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      if (u.pathname === "/nearby-stops") return nearbyStopsResponse();
      if (u.pathname === "/api/route") return walkingRouteResponse();
      if (u.pathname === "/api/v6/plan") {
        const fromPlace = u.searchParams.get("fromPlace") ?? "";
        if (fromPlace.startsWith("bkkgtfs_")) return new Response(JSON.stringify({ itineraries: [nearbyItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
        // Legalább EGY normál itinerary szükséges, különben a
        // rawItineraries.length===0 korai ág (lásd orchestrator.ts
        // searchVedettRoutes() "no_route_found" visszatérése) MÉG A
        // nearby-merge ELŐTT visszatérne — ez egy KORÁBBI, dokumentált,
        // szándékos scope-döntés (a nearby bővítés jelenleg NEM menti meg
        // a 0-normál-itinerary esetet), NEM ennek a tesztnek a tárgya.
        const otherNormalItinerary: MotisItinerary = {
          duration: 600,
          startTime: "2026-09-18T10:00:00+02:00",
          endTime: "2026-09-18T10:10:00+02:00",
          transfers: 1,
          legs: [
            { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Másik megálló" }, duration: 100, startTime: "2026-09-18T10:00:00+02:00", endTime: "2026-09-18T10:01:40+02:00" },
            { mode: "BUS", from: { name: "Másik megálló", stopId: "bkkgtfs_OTHER" }, to: { name: "Cél", stopId: "bkkgtfs_DEST" }, duration: 500, startTime: "2026-09-18T10:02:00+02:00", endTime: "2026-09-18T10:10:00+02:00", routeShortName: "55" },
          ],
        };
        return new Response(JSON.stringify({ itineraries: [otherNormalItinerary] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json" } });
    };

    try {
      const result = await searchVedettRoutes({ from: { name: "Origin", ...ORIGIN }, to: { name: "Cél", ...DESTINATION }, departAt: DEPART_AT });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const direct = result.journeys.find((r) => r.journey.transfers === 0);
      assert.ok(direct);
      const journeyWithSensory = direct!.journey as unknown as { sensory?: { score: number; confidence: number } };
      assert.ok(journeyWithSensory.sensory, "a nearby candidate-nek is rendelkeznie kell sensory score-ral, mint minden más journey-nek");
      assert.equal(typeof journeyWithSensory.sensory!.score, "number");
    } finally {
      restore();
    }
  });
});
