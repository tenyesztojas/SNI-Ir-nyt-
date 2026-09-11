// VÉDETT ÚTVONAL — ACCESSIBILITY LOOKUP CLIENT tesztek (Task C3, spec 23.
// pont "NEXT.JS CLIENT" kategória).
//
// A modul SOSEM dob kivételt — minden teszt ezt a szerződést ellenőrzi:
// nincs konfiguráció / timeout / 401/403/5xx / malformed JSON /
// generation-mismatch-szerű "unavailable" állapot -> mindegyik ugyanarra
// az egyetlen `null` visszatérési értékre vezet.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lookupAccessibilityIndexForItineraries } from "../../lib/vedett-route/accessibilityLookupClient.ts";
import type { StepFreeLegLike } from "../../lib/vedett-route/accessibility.ts";

const originalFetch = globalThis.fetch;
const ENV_KEYS = ["ACCESSIBILITY_SIDECAR_URL", "ACCESSIBILITY_SIDECAR_AUTH_TOKEN", "ACCESSIBILITY_SIDECAR_TIMEOUT_MS"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function configureSidecar(): void {
  process.env.ACCESSIBILITY_SIDECAR_URL = "https://route.vedettsarok.hu/accessibility";
  process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN = "sidecar-secret";
}

function walkTransferLeg(fromStopId: string, toStopId: string): StepFreeLegLike {
  return { mode: "WALK", from: { stopId: fromStopId }, to: { stopId: toStopId } };
}

function transitLeg(fromStopId: string, toStopId: string, tripId: string): StepFreeLegLike {
  return {
    mode: "BUS",
    tripId,
    wheelchairAccessible: "ACCESSIBLE",
    from: { stopId: fromStopId },
    to: { stopId: toStopId },
  };
}

describe("lookupAccessibilityIndexForItineraries — nincs mit lekérdezni / nincs konfigurálva", () => {
  test("nincs ACCESSIBILITY_SIDECAR_URL/TOKEN konfigurálva -> null, és SOHA nem hív fetch-et", async () => {
    delete process.env.ACCESSIBILITY_SIDECAR_URL;
    delete process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch-nek soha nem kellene meghívódnia");
    }) as typeof fetch;

    const result = await lookupAccessibilityIndexForItineraries([[transitLeg("bkkgtfs_S1", "bkkgtfs_S2", "20260911_10:00_bkkgtfs_T1")]]);
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });

  test("konfigurálva van, de az itinerary-k semelyik lába sem normalizálható ismert providerre -> null, fetch NEM hívódik", async () => {
    configureSidecar();
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch-nek soha nem kellene meghívódnia");
    }) as typeof fetch;

    const result = await lookupAccessibilityIndexForItineraries([[transitLeg("ismeretlen_dataset_S1", "ismeretlen_dataset_S2", "trip")]]);
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });

  test("üres itinerary-lista -> null, fetch nem hívódik", async () => {
    configureSidecar();
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;
    const result = await lookupAccessibilityIndexForItineraries([]);
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });
});

describe("lookupAccessibilityIndexForItineraries — batch-elés (N+1 elkerülése, spec 14. pont)", () => {
  test("TÖBB itinerary/láb esetén is EGYETLEN HTTP hívás indul, minden releváns id-vel egy batch-ben", async () => {
    configureSidecar();
    let callCount = 0;
    let capturedBody: { stopIds: string[]; tripIds: string[]; pathwayQueries: { fromStopId: string; toStopId: string }[] } | null = null;
    globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
      callCount++;
      capturedBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", provider: "BKK", dataset: "bkkgtfs", generation: "g1", builtAt: "now", stops: {}, trips: {}, pathways: [] }),
      } as unknown as Response;
    }) as typeof fetch;

    const itineraries: StepFreeLegLike[][] = [
      [transitLeg("bkkgtfs_S1", "bkkgtfs_S2", "20260911_10:00_bkkgtfs_T1")],
      [
        transitLeg("bkkgtfs_S3", "bkkgtfs_S4", "20260911_10:00_bkkgtfs_T2"),
        walkTransferLeg("bkkgtfs_S4", "bkkgtfs_S5"),
        transitLeg("bkkgtfs_S5", "bkkgtfs_S6", "20260911_10:00_bkkgtfs_T3"),
      ],
    ];
    await lookupAccessibilityIndexForItineraries(itineraries);
    assert.equal(callCount, 1, "sosem N+1: pontosan egy batch-elt hívás, függetlenül az itinerary/láb-számtól");
    assert.ok(capturedBody);
    assert.deepEqual(new Set(capturedBody!.stopIds), new Set(["S1", "S2", "S3", "S4", "S5", "S6"]));
    assert.deepEqual(new Set(capturedBody!.tripIds), new Set(["T1", "T2", "T3"]));
    assert.equal(capturedBody!.pathwayQueries.length, 1, "csak a KÉT transit láb közötti WALK láb (valódi transfer) kerül be pathway-kérdésként");
    assert.deepEqual(capturedBody!.pathwayQueries[0], { fromStopId: "S4", toStopId: "S5" });
  });

  test("első/utolsó (nem-transfer) WALK láb NEM kerül be pathway-kérdésként", async () => {
    configureSidecar();
    let capturedBody: { pathwayQueries: unknown[] } | null = null;
    globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => ({ status: "ok", stops: {}, trips: {}, pathways: [] }) } as unknown as Response;
    }) as typeof fetch;

    await lookupAccessibilityIndexForItineraries([
      [walkTransferLeg("bkkgtfs_FIRSTMILE", "bkkgtfs_S1"), transitLeg("bkkgtfs_S1", "bkkgtfs_S2", "20260911_10:00_bkkgtfs_T1"), walkTransferLeg("bkkgtfs_S2", "bkkgtfs_LASTMILE")],
    ]);
    assert.deepEqual(capturedBody!.pathwayQueries, []);
  });
});

describe("lookupAccessibilityIndexForItineraries — fail-safe szemantika (spec 15. pont: SOHA nem KNOWN_ACCESSIBLE hiba miatt)", () => {
  const legs: StepFreeLegLike[][] = [[transitLeg("bkkgtfs_S1", "bkkgtfs_S2", "20260911_10:00_bkkgtfs_T1")]];

  test("HTTP 401 -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await lookupAccessibilityIndexForItineraries(legs), null);
  });

  test("HTTP 500 -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await lookupAccessibilityIndexForItineraries(legs), null);
  });

  test("hálózati hiba (fetch reject) -> null, nem dob kivételt", async () => {
    configureSidecar();
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await assert.doesNotReject(async () => {
      const result = await lookupAccessibilityIndexForItineraries(legs);
      assert.equal(result, null);
    });
  });

  test("timeout (AbortError-t dobó fetch) -> null", async () => {
    configureSidecar();
    process.env.ACCESSIBILITY_SIDECAR_TIMEOUT_MS = "50";
    globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const result = await lookupAccessibilityIndexForItineraries(legs);
    assert.equal(result, null);
  });

  test("malformed JSON válasz (a .json() dob) -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;
    assert.equal(await lookupAccessibilityIndexForItineraries(legs), null);
  });

  test("strukturálisan hiányos (malformed) válasz-body -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ nemJoAlak: true }) })) as unknown as typeof fetch;
    assert.equal(await lookupAccessibilityIndexForItineraries(legs), null);
  });

  test("sidecar 'unavailable' státusza (dataset ismert, de nincs betöltve generation) -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "unavailable", provider: null, dataset: "bkkgtfs", generation: null, builtAt: null, stops: {}, trips: {}, pathways: [] }),
    })) as unknown as typeof fetch;
    assert.equal(await lookupAccessibilityIndexForItineraries(legs), null);
  });
});

describe("lookupAccessibilityIndexForItineraries — happy path", () => {
  test("sikeres válasz esetén PONTOSAN az AccessibilityIndexLike alakot adja vissza (stopsById/tripsById/pathways)", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        provider: "BKK",
        dataset: "bkkgtfs",
        generation: "g1",
        builtAt: "2026-09-11T00:00:00Z",
        stops: { S1: { stopId: "S1", wheelchairBoarding: 1 } },
        trips: { T1: { tripId: "T1", wheelchairAccessible: 1 } },
        pathways: [{ pathwayId: "PW1", fromStopId: "S1", toStopId: "S2", pathwayMode: 2, isBidirectional: true }],
      }),
    })) as unknown as typeof fetch;

    const result = await lookupAccessibilityIndexForItineraries([[transitLeg("bkkgtfs_S1", "bkkgtfs_S2", "20260911_10:00_bkkgtfs_T1")]]);
    assert.ok(result);
    assert.deepEqual(result!.stopsById, { S1: { stopId: "S1", wheelchairBoarding: 1 } });
    assert.deepEqual(result!.tripsById, { T1: { tripId: "T1", wheelchairAccessible: 1 } });
    assert.equal(result!.pathways.length, 1);
  });
});
