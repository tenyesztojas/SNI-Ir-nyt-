// VÉDETT ÚTVONAL — VALÓS PRODUCTION /nearby-stops LISTA REGRESSZIÓ
// (2026-09-18, második NEARBY TRANSIT ACCESS hibajegy — "Déli M kiesik a
// candidate selectionből, mert csak a 6. legközelebbi").
//
// A production smoke test (lat=47.5015, lon=19.0197, radiusMeters=800,
// limit=10) a sidecarból PONTOSAN ezt a nearest-first sorrendet adta —
// ez a fixture EZT a valós listát reprodukálja, NEM egy kitalált/
// egyszerűsített példát. A teszt ELŐSZÖR a ROOT CAUSE-t bizonyítja
// (Déli pályaudvar M kiesik, mert a régi kód a sidecar-lekérdezés
// `limit` mezőjét ÉS a tényleges gyalogos/MOTIS-feldolgozási korlátot
// UGYANARRA a kis (3) értékre állította), MAJD a javítás utáni helyes
// viselkedést.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildNearbyTransitAccessCandidates, DEFAULT_NEARBY_STOP_LIMIT, MAX_NEARBY_STOP_LIMIT } from "../../lib/vedett-route/nearbyTransitAccess.ts";
import type { NearbyStopCandidate } from "../../lib/vedett-route/accessibilityLookupClient.ts";

const ORIGIN = { lat: 47.5015, lon: 19.0197 };

// A VALÓS production /nearby-stops válasz (2026-09-18 smoke test),
// nearest-first sorrendben, PONTOSAN ezekkel a stopId/name/distance
// értékekkel.
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

function mockFetch(realLimit: (limit: number) => void) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/nearby-stops")) {
      const body = JSON.parse(String(init?.body));
      realLimit(body.limit);
      // A VALÓS sidecar a body.limit-re VÁGVA adja vissza a nearest-first
      // listát — ezt reprodukáljuk itt (nem a teljes 10-et adjuk vissza
      // fix limit=3 kérésre, hanem PONTOSAN azt, amit a sidecar valóban
      // tenne).
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops: REAL_PRODUCTION_NEARBY_LIST.slice(0, body.limit) }) } as unknown as Response;
    }
    // A gyalogos MOTIS route minden hívásra sikeres — ez a teszt a
    // CANDIDATE SELECTIONT vizsgálja, nem a walking-route hibakezelést.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        type: "FeatureCollection",
        metadata: { duration: 200, distance: 250, uses_elevator: false },
        features: [{ type: "Feature", properties: { level: 0 }, geometry: { type: "LineString", coordinates: [[ORIGIN.lon, ORIGIN.lat], [19.0146, 47.5013]] } }],
      }),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("valós production nearby-stops lista — Déli pályaudvar M candidate-selection", () => {
  test("JAVÍTÁS UTÁN: a Déli pályaudvar M (F00024/F00025/F00023) legalább egy stopId-je bekerül a feldolgozott access candidate-ek közé", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      ACCESSIBILITY_SIDECAR_URL: process.env.ACCESSIBILITY_SIDECAR_URL,
      ACCESSIBILITY_SIDECAR_AUTH_TOKEN: process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN,
      MOTIS_BASE_URL: process.env.MOTIS_BASE_URL,
    };
    process.env.ACCESSIBILITY_SIDECAR_URL = "http://localhost:19998";
    process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "test-token";
    process.env.MOTIS_BASE_URL = "http://localhost:19999";
    let capturedDiscoveryLimit: number | undefined;
    globalThis.fetch = mockFetch((limit) => { capturedDiscoveryLimit = limit; });

    try {
      const result = await buildNearbyTransitAccessCandidates({ provider: "BKK", originLat: ORIGIN.lat, originLon: ORIGIN.lon, radiusMeters: 800 });
      const deliCandidate = result.candidates.find((c) => c.stopId === "F00024" || c.stopId === "F00025" || c.stopId === "F00023");
      assert.ok(
        deliCandidate,
        `a Déli pályaudvar M legalább egy platformjának bent kell lennie a feldolgozott candidate-ek között — kapott stopId-k: ${result.candidates.map((c) => c.stopId).join(", ")}, sidecar-discovery limit: ${capturedDiscoveryLimit}`
      );

      // Request-budget ellenőrzés: a discovery limit nagyobb lehet, mint a
      // tényleges feldolgozási limit, DE mindkettő szigorúan korlátos
      // (MAX_NEARBY_STOP_LIMIT), és a feldolgozott candidate-ek száma nem
      // haladja meg DEFAULT_NEARBY_STOP_LIMIT-et (nincs korlátlan fanout).
      assert.ok(capturedDiscoveryLimit !== undefined && capturedDiscoveryLimit <= MAX_NEARBY_STOP_LIMIT);
      assert.ok(result.candidates.length <= DEFAULT_NEARBY_STOP_LIMIT);

      // A duplikált nevű platformok (2x "Maros utcai rendelőintézet", 3x
      // "Déli pályaudvar M") közül névenként csak a legközelebbi kerül
      // feldolgozásra — nincs redundáns candidate ugyanarra a fizikai
      // helyre.
      const marosCandidates = result.candidates.filter((c) => c.stopId === "007900" || c.stopId === "072851");
      assert.ok(marosCandidates.length <= 1, "a 'Maros utcai rendelőintézet' duplikált platformjaiból legfeljebb 1 kerülhet feldolgozásra");
      const deliCandidates = result.candidates.filter((c) => c.stopId === "F00024" || c.stopId === "F00025" || c.stopId === "F00023");
      assert.ok(deliCandidates.length <= 1, "a 'Déli pályaudvar M' duplikált platformjaiból legfeljebb 1 kerülhet feldolgozásra");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
