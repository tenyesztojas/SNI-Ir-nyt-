// VÉDETT ÚTVONAL — NEARBY TRANSIT ACCESS BACKEND sprint (2026-09-17) —
// lookupNearbyStops() kliens tesztek. UGYANAZ a fail-safe szerződés-teszt
// minta, mint accessibility-sidecar-client.test.ts: minden hibaágon
// (nincs konfigurálva, ismeretlen provider, timeout, 401/500, malformed
// JSON/body, "unavailable" státusz) `null`.
//
// FONTOS: ez a kliensfüggvény ebben a sprintben SEHOL nincs meghívva a
// production route-search flow-ból — ezek a tesztek KIZÁRÓLAG a
// standalone kliens-viselkedést ellenőrzik.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lookupNearbyStops } from "../../lib/vedett-route/accessibilityLookupClient.ts";

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

describe("lookupNearbyStops — nincs mit lekérdezni / nincs konfigurálva", () => {
  test("nincs ACCESSIBILITY_SIDECAR_URL/TOKEN konfigurálva -> null, és SOHA nem hív fetch-et", async () => {
    delete process.env.ACCESSIBILITY_SIDECAR_URL;
    delete process.env.ACCESSIBILITY_SIDECAR_AUTH_TOKEN;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch-nek soha nem kellene meghívódnia");
    }) as typeof fetch;

    const result = await lookupNearbyStops("BKK", 47.5, 19.0);
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });

  test("ismeretlen provider (nincs sidecar dataset leképezés) -> null, fetch NEM hívódik", async () => {
    configureSidecar();
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fetch-nek soha nem kellene meghívódnia");
    }) as typeof fetch;

    const result = await lookupNearbyStops("MAV_RAIL", 47.5, 19.0);
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });
});

describe("lookupNearbyStops — request alak", () => {
  test("a helyes URL-t (/nearby-stops), datasetet és koordinátákat küldi", async () => {
    configureSidecar();
    let capturedUrl = "";
    let capturedBody: { dataset: string; lat: number; lon: number; radiusMeters?: number; limit?: number } | null = null;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", stops: [] }) } as unknown as Response;
    }) as typeof fetch;

    await lookupNearbyStops("BKK", 47.5005, 19.0248, 500, 3);
    assert.equal(capturedUrl, "https://route.vedettsarok.hu/accessibility/nearby-stops");
    assert.ok(capturedBody);
    assert.equal(capturedBody!.dataset, "bkkgtfs");
    assert.equal(capturedBody!.lat, 47.5005);
    assert.equal(capturedBody!.lon, 19.0248);
    assert.equal(capturedBody!.radiusMeters, 500);
    assert.equal(capturedBody!.limit, 3);
  });
});

describe("lookupNearbyStops — fail-safe szemantika", () => {
  test("HTTP 401 -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
  });

  test("HTTP 500 -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
  });

  test("hálózati hiba (fetch reject) -> null, nem dob kivételt", async () => {
    configureSidecar();
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await assert.doesNotReject(async () => {
      assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
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
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
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
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
  });

  test("strukturálisan hiányos (malformed) válasz-body -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ nemJoAlak: true }) })) as unknown as typeof fetch;
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
  });

  test("sidecar 'unavailable' státusza -> null", async () => {
    configureSidecar();
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "unavailable", stops: [] }),
    })) as unknown as typeof fetch;
    assert.equal(await lookupNearbyStops("BKK", 47.5, 19.0), null);
  });
});

describe("lookupNearbyStops — happy path", () => {
  test("sikeres válasz esetén PONTOSAN a stops tömböt adja vissza", async () => {
    configureSidecar();
    const stops = [{ stopId: "S1", parentStation: "P1", name: "Stop One", lat: 47.5001, lon: 19.0, distanceMeters: 42 }];
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "ok", stops }),
    })) as unknown as typeof fetch;

    const result = await lookupNearbyStops("BKK", 47.5, 19.0);
    assert.deepEqual(result, stops);
  });
});
