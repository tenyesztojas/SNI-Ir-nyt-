// VÉDETT ÚTVONAL — NEARBY TRANSIT ACCESS, 3. KÖR DIAGNOSZTIKAI TESZT
// (2026-09-18, "hol tűnik el a direct-M2 candidate production után
// eef7ebd-vel is" hibajegy).
//
// CÉL (FELADAT 1-3, lásd a felhasználó "FONTOS" instrukcióját): PONTOSAN
// bizonyítani, hogy a VALÓS production /nearby-stops lista (lat=47.5015,
// lon=19.0197) mellett, eef7ebd defaultjaival (discovery=10, dedup,
// processing=6) a "Déli pályaudvar M" candidate (stopId F00024) EDDIG A
// PONTIG helyesen halad át a pipeline-on (discovery+dedup+processing
// selection -> walking access -> MOTIS transit-plan KÉRÉS ELINDÍTÁSA
// PONTOSAN "bkkgtfs_F00024" fromPlace-szel), és hogy — HA a MOTIS
// pontosan ERRE a fromPlace-re legitim módon 0 itineraryt ad (a sidecar
// discovery-je ÁLTAL FELFEDEZETT stopId NEM feltétlenül egyezik egy
// MOTIS-graph szerint boardolható stoppal, lásd nearbyStops.ts/
// accessibilityIndex.ts location_type-kezelésének hiányát) — a candidate
// PONTOSAN a nearbyTransitJourneyCandidates.ts evaluateTransitCandidate()
// itineraries.length===0 fail-safe ágán, NÉMÁN, hiba nélkül esik ki, MÉG
// a kombinált candidate-halmazba kerülés ELŐTT (tehát a ranking.ts-t
// SOHA nem éri el) — pontosan reprodukálva a felhasználó screenshotján
// látott végeredményt (KIZÁRÓLAG a feeder 56 villamos+M2 route látszik).
//
// NEM PERMISSZÍV MOCK (FELADAT 2, explicit user-instrukció): a korábbi
// deli-kossuth-nearby-transit-regression.test.ts MOTIS-mockja MINDEN
// "bkkgtfs_"-prefixű fromPlace-re sikert ad ("fromPlace.startsWith(...)")
// — ez NEM bizonyítja, hogy a VALÓS, discovery által megtalált konkrét
// stopId (F00024) tényleg boardolható MOTIS-oldalon. Ez a fájl EZT a
// hiányt zárja: a MOTIS-mock KONKRÉT fromPlace-érték szerint dönt, és
// EGYETLEN speciális esetben ("bkkgtfs_F00024") ad üres itinerary-listát
// — minden más fromPlace-re (a többi 5 feldolgozott candidate, illetve a
// normál, nem-nearby MOTIS hívás) realisztikus, de KÜLÖNBÖZŐ választ ad,
// hogy a teszt semmilyen véletlenszerű/permisszív "minden bkkgtfs_ sikeres"
// mintára ne támaszkodjon.
//
// A teszt MÁSODIK fele (checkpoint D/E/F) UGYANEZZEL a valós fixture-rel,
// de a MOTIS-mockot megfordítva bizonyítja, hogy a pipeline A TÖBBI
// LÉPÉSE (Journey-építés, kombinált candidate-halmazba kerülés, ranking)
// helyesen működik, HA a MOTIS tényleg ad direct M2 itineraryt a
// discovery-stopId-től — tehát a hiba (ha H1 igaz) KIZÁRÓLAG a MOTIS
// transit-plan válasz-tartalmán múlik, NEM a nearby-transit pipeline
// egyéb lépésein.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildNearbyTransitJourneyCandidates } from "../../lib/vedett-route/nearbyTransitJourneyCandidates.ts";
import { searchVedettRoutes } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";
import type { NearbyStopCandidate } from "../../lib/vedett-route/accessibilityLookupClient.ts";

const ORIGIN = { lat: 47.5015, lon: 19.0197 };
const DESTINATION = { lat: 47.5069, lon: 19.0457 }; // Kossuth Lajos tér környéke
const DEPART_AT = "2026-09-18T17:00:00+02:00";

// A VALÓS production /nearby-stops válasz (2026-09-18 smoke test,
// PONTOSAN ugyanaz a lista, mint nearby-transit-real-production-list-regression.test.ts-ben).
const REAL_PRODUCTION_NEARBY_LIST: NearbyStopCandidate[] = [
  { stopId: "F02488", name: "Csemegi utca", lat: 47.5019, lon: 19.0186, distanceMeters: 119 },
  { stopId: "F02406", name: "Ráth György utca", lat: 47.5006, lon: 19.0203, distanceMeters: 181 },
  { stopId: "F02403", name: "Tóth Lőrinc utca", lat: 47.5031, lon: 19.0198, distanceMeters: 258 },
  { stopId: "F02404", name: "Goldmark Károly utca", lat: 47.5035, lon: 19.0212, distanceMeters: 313 },
  { stopId: "007900", name: "Maros utcai rendelőintézet", lat: 47.4995, lon: 19.0175, distanceMeters: 320 },
  { stopId: "F00024", name: "Déli pályaudvar M", lat: 47.5013, lon: 19.0146, distanceMeters: 333 },
  { stopId: "072851", name: "Maros utcai rendelőintézet", lat: 47.4996, lon: 19.0173, distanceMeters: 334 },
  { stopId: "F00025", name: "Déli pályaudvar M", lat: 47.5012, lon: 19.0145, distanceMeters: 339 },
  { stopId: "F00023", name: "Déli pályaudvar M", lat: 47.5014, lon: 19.0147, distanceMeters: 351 },
  { stopId: "F02405", name: "Határőr út", lat: 47.5042, lon: 19.0221, distanceMeters: 353 },
];

// A VALÓS production screenshot szerinti feeder route (56 villamos Déli ->
// Széll Kálmán M2 -> Kossuth) — ez a NORMÁL (nem-nearby) MOTIS hívásra jön.
const FEEDER_ITINERARY: MotisItinerary = {
  duration: 960,
  startTime: DEPART_AT,
  endTime: "2026-09-18T17:16:00+02:00",
  transfers: 1,
  legs: [
    { mode: "WALK", from: { name: "Jelenlegi hely" }, to: { name: "Böszörményi út" }, duration: 180, startTime: DEPART_AT, endTime: "2026-09-18T17:03:00+02:00" },
    { mode: "TRAM", from: { name: "Böszörményi út", stopId: "bkkgtfs_TRAM56" }, to: { name: "Széll Kálmán tér M", stopId: "bkkgtfs_SZELL" }, duration: 300, startTime: "2026-09-18T17:03:00+02:00", endTime: "2026-09-18T17:08:00+02:00", routeShortName: "56" },
    { mode: "SUBWAY", from: { name: "Széll Kálmán tér M", stopId: "bkkgtfs_SZELL" }, to: { name: "Kossuth Lajos tér", stopId: "bkkgtfs_KOSSUTH" }, duration: 420, startTime: "2026-09-18T17:08:30+02:00", endTime: "2026-09-18T17:15:30+02:00", routeShortName: "M2" },
    { mode: "WALK", from: { name: "Kossuth Lajos tér" }, to: { name: "Cél" }, duration: 30, startTime: "2026-09-18T17:15:30+02:00", endTime: "2026-09-18T17:16:00+02:00" },
  ],
};

// Egy NEM-feeder, de NEM is direkt-M2 itinerary a többi (Déli-n kívüli)
// feldolgozott candidate-hez — hogy a teszt megkülönböztethető legyen a
// "minden nearby fromPlace ugyanazt kapja" permisszív mintától.
function genericItineraryFor(stopId: string): MotisItinerary {
  return {
    duration: 1500,
    startTime: DEPART_AT,
    endTime: "2026-09-18T17:25:00+02:00",
    transfers: 1,
    legs: [
      { mode: "BUS", from: { name: `Innen: ${stopId}`, stopId: `bkkgtfs_${stopId}` }, to: { name: "Átszálló", stopId: "bkkgtfs_XFER" }, duration: 600, startTime: DEPART_AT, endTime: "2026-09-18T17:10:00+02:00", routeShortName: "9" },
      { mode: "BUS", from: { name: "Átszálló", stopId: "bkkgtfs_XFER" }, to: { name: "Cél közelében", stopId: "bkkgtfs_NEAR_DEST" }, duration: 900, startTime: "2026-09-18T17:10:30+02:00", endTime: "2026-09-18T17:25:00+02:00", routeShortName: "15" },
    ],
  };
}

const DIRECT_M2_ITINERARY: MotisItinerary = {
  duration: 420,
  startTime: "2026-09-18T17:05:40+02:00",
  endTime: "2026-09-18T17:12:40+02:00",
  transfers: 0,
  legs: [
    { mode: "SUBWAY", from: { name: "Déli pályaudvar M", stopId: "bkkgtfs_F00024" }, to: { name: "Kossuth Lajos tér", stopId: "bkkgtfs_KOSSUTH" }, duration: 420, startTime: "2026-09-18T17:05:40+02:00", endTime: "2026-09-18T17:12:40+02:00", routeShortName: "M2" },
  ],
};

/**
 * A walking-route mock MINDIG sikeres (realisztikus geometriával) — ez a
 * teszt a MOTIS transit-plan válasz-tartalmát vizsgálja, nem a
 * gyalogos-hívás hibakezelését (azt a meglévő tesztek már lefedik).
 */
function walkingRouteResponse(destLat: number, destLon: number): Response {
  return new Response(
    JSON.stringify({
      type: "FeatureCollection",
      metadata: { duration: 240, distance: 330, uses_elevator: false },
      features: [{ type: "Feature", properties: { level: 0 }, geometry: { type: "LineString", coordinates: [[ORIGIN.lon, ORIGIN.lat], [destLon, destLat]] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function nearbyStopsResponse(limit: number): Response {
  return new Response(
    JSON.stringify({ ok: true, status: "ok", stops: REAL_PRODUCTION_NEARBY_LIST.slice(0, limit) }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

interface MockEnv {
  restore: () => void;
  capturedFromPlaces: string[];
}

function installMock(motisPlanForFromPlace: (fromPlace: string) => MotisItinerary[]): MockEnv {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    MOTIS_BASE_URL: process.env.MOTIS_BASE_URL,
    ACCESSIBILITY_SIDECAR_URL: process.env.ACCESSIBILITY_SIDECAR_URL,
    ACCESSIBILITY_SIDECAR_AUTH_TOKEN: process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN,
  };
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  process.env.ACCESSIBILITY_SIDECAR_URL = "http://localhost:19998";
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token";
  const capturedFromPlaces: string[] = [];

  // @ts-expect-error teszt mock
  globalThis.fetch = async (input: string | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input.toString());
    if (u.pathname === "/nearby-stops") {
      const body = JSON.parse(String(init?.body));
      return nearbyStopsResponse(body.limit);
    }
    if (u.pathname === "/api/route") {
      const body = JSON.parse(String(init?.body));
      return walkingRouteResponse(body.destination.lat, body.destination.lng);
    }
    if (u.pathname === "/api/v6/plan") {
      const fromPlace = u.searchParams.get("fromPlace") ?? "";
      capturedFromPlaces.push(fromPlace);
      // A NORMÁL (nem-nearby) hívás fromPlace-e az eredeti koordináta —
      // ez SOSEM "bkkgtfs_"-prefixű, tehát egyértelműen megkülönböztethető.
      if (!fromPlace.startsWith("bkkgtfs_")) {
        return new Response(JSON.stringify({ itineraries: [FEEDER_ITINERARY] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ itineraries: motisPlanForFromPlace(fromPlace) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json" } });
  };

  return {
    capturedFromPlaces,
    restore: () => {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

describe("NEARBY TRANSIT ACCESS 3. kör diagnosztika — MOTIS boardability boundary (valós production lista, NEM permisszív mock)", () => {
  test("CHECKPOINT A/B/C: a Déli (F00024) candidate a discovery+dedup+processing szűrőn túl a MOTIS-ig ELJUT, PONTOSAN fromPlace=bkkgtfs_F00024-gyel", async () => {
    const { restore, capturedFromPlaces } = installMock((fromPlace) => (fromPlace === "bkkgtfs_F00024" ? [] : [genericItineraryFor(fromPlace.replace("bkkgtfs_", ""))]));
    try {
      const result = await buildNearbyTransitJourneyCandidates({
        provider: "BKK",
        originLat: ORIGIN.lat,
        originLon: ORIGIN.lon,
        destination: DESTINATION,
        originalDepartAt: DEPART_AT,
      });

      assert.ok(capturedFromPlaces.includes("bkkgtfs_F00024"), `a MOTIS transit-plan kérésnek EL KELL indulnia a Déli candidate-re — elküldött fromPlace-ek: ${capturedFromPlaces.join(", ")}`);

      // CHECKPOINT (H1 bizonyítás): ha a MOTIS pontosan ERRE a fromPlace-re
      // 0 itineraryt ad, a candidate NEM kerül be a végleges listába — de a
      // TÖBBI, sikeresen boardolható candidate (5 db) igen.
      const deliInResult = result.candidates.some((c) => c.access.stopId === "F00024");
      assert.equal(deliInResult, false, "H1 szimuláció: ha a MOTIS 0 itineraryt ad ERRE a konkrét fromPlace-re, a candidate NÉMÁN kiesik (fail-safe), MÉG A KOMBINÁLT HALMAZ ELŐTT");
      assert.equal(result.candidates.length, 5, "a másik 5, sikeresen boardolható candidate-nek túl kell élnie");
    } finally {
      restore();
    }
  });

  test("CHECKPOINT D/E/F: UGYANEZZEL a valós listával, HA a MOTIS direct M2 itineraryt ad a Déli fromPlace-re, a Journey létrejön, bekerül a kombinált halmazba, és a rangsorolás (metrikák alapján) megtartja/megnyeri a releváns kategóriákat", async () => {
    const { restore } = installMock((fromPlace) => (fromPlace === "bkkgtfs_F00024" ? [DIRECT_M2_ITINERARY] : [genericItineraryFor(fromPlace.replace("bkkgtfs_", ""))]));
    try {
      const result = await searchVedettRoutes({
        from: { name: "Budapest-Déli környéke", lat: ORIGIN.lat, lon: ORIGIN.lon },
        to: { name: "Kossuth Lajos tér 2.", lat: DESTINATION.lat, lon: DESTINATION.lon },
        departAt: DEPART_AT,
      });

      assert.equal(result.ok, true);
      if (!result.ok) return;

      const direct = result.journeys.find((r) => r.journey.transfers === 0 && r.journey.legs.some((l) => l.routeShortName === "M2"));
      assert.ok(direct, "a direct M2 candidate-nek (WALK->M2->[WALK]) létre kell jönnie és bekerülnie a végleges listába, ha a MOTIS tényleg ad rá itineraryt");

      const accessLeg = direct!.journey.legs[0];
      assert.equal(accessLeg.mode, "WALK");
      assert.equal(accessLeg.fromLat, ORIGIN.lat);
      assert.equal(accessLeg.fromLon, ORIGIN.lon);
      assert.equal(accessLeg.toLat, 47.5013, "a WALK access láb célja PONTOSAN a discovery által adott F00024 koordináta, nem egy másik Déli-platform");
      assert.equal(accessLeg.toLon, 19.0146);

      assert.equal(direct!.journey.departureTime, DEPART_AT, "a megjelenített indulási idő a fagyasztott eredeti departAt, sosem a transit-tervezési idő");

      const feederStillPresent = result.journeys.some((r) => r.journey.transfers === 1 && r.journey.legs.some((l) => l.routeShortName === "56"));
      // A direct minden metrikában jobb (0 átszállás, rövidebb idő) -> a
      // MEGLÉVŐ ranking.ts helyesen a direct-nek adja a kategóriákat; a
      // feeder jelenléte/hiánya a labeledOnly szűrőtől függ, ez NEM ennek a
      // tesztnek a tárgya, csak dokumentáljuk.
      assert.ok(direct!.labels.includes("FASTEST") || direct!.labels.includes("FEWEST_TRANSFERS"), "a direct candidate-nek legalább egy releváns kategóriát meg kell nyernie, mert minden metrikában jobb, mint a feeder");
      void feederStillPresent;
    } finally {
      restore();
    }
  });
});
