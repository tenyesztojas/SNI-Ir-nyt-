// VPS → Staging Integration Gate (2026-09-07) — G) pont: "Staging E2E
// tesztek". Mivel ebben a futtatási környezetben nincs élő hálózati elérés
// a VPS route service-hez, ezek a tesztek a global.fetch mockolásával
// futnak (ugyanazt a mintát követve, mint __tests__/vedett-route/
// motisClient.test.ts már meglévő 3. tesztje) — a KLIENS KÓD tényleges
// viselkedését ellenőrzik minden hibaforgatókönyvre, nem magát az élő
// VPS-t. A route service tényleges élő elérhetőségének bizonyítása a
// felhasználó saját VPS-én már megtörtént (lásd
// docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md).
//
//   node --test __tests__/vedett-route/route-service-client.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

function setRouteServiceEnv() {
  process.env.ROUTE_SERVICE_URL = "https://route.example-vps.hu";
  process.env.ROUTE_SERVICE_AUTH_TOKEN = "test-token-not-a-real-secret";
  delete process.env.MOTIS_BASE_URL;
}

function clearEnv() {
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  delete process.env.ROUTE_SERVICE_TIMEOUT_MS;
  delete process.env.MOTIS_BASE_URL;
  delete process.env.NODE_ENV;
}

async function withMockedFetch<T>(impl: (url: string, init?: RequestInit) => Promise<unknown> | unknown, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async (url: string, init?: RequestInit) => impl(url, init);
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("normál realtime útvonal: sikeres válasz, ok:true, data átadva", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await withMockedFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        itineraries: [
          {
            duration: 900,
            startTime: "2026-09-07T10:58:00Z",
            endTime: "2026-09-07T11:13:00Z",
            scheduledStartTime: "2026-09-07T10:54:00Z",
            scheduledEndTime: "2026-09-07T11:09:00Z",
            realTime: true,
            transfers: 0,
            legs: [],
          },
        ],
      }),
    }),
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.itineraries?.[0]?.realTime, true);
  }
  clearEnv();
});

test("nincs realtime adat: sikeres válasz, de realTime hiányzik/false — ok:true marad, nincs hiba", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await withMockedFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        itineraries: [
          { duration: 900, startTime: "2026-09-07T10:54:00Z", endTime: "2026-09-07T11:09:00Z", transfers: 0, legs: [] },
        ],
      }),
    }),
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.itineraries?.[0]?.realTime, undefined);
  }
  clearEnv();
});

test("realtime feed unavailable (upstream 503): routing_error, static fallback nem akad el (ok:false, de nem exception)", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await withMockedFetch(
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_error");
    assert.equal(result.status, 503);
  }
  clearEnv();
});

test("MOTIS/route service timeout: reason: 'timeout', nem dob kivételt", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await withMockedFetch(
    async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    },
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "timeout");
  }
  clearEnv();
});

test("MOTIS/route service unavailable (hálózati hiba): reason: 'routing_engine_unavailable', EGY retry után is", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  let callCount = 0;
  const result = await withMockedFetch(
    async () => {
      callCount += 1;
      throw new TypeError("fetch failed: connection refused");
    },
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
  }
  // A retry stratégia miatt PONTOSAN egyszer próbálkozik újra hálózati hibán.
  assert.equal(callCount, 2, "hálózati hibán egyszer retry-olnia kell (összesen 2 hívás)");
  clearEnv();
});

test("auth failure (401): routing_error, a token SOSEM kerül a válaszba vagy a logba", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  let capturedHeaders: HeadersInit | undefined;
  const result = await withMockedFetch(
    async (_url, init) => {
      capturedHeaders = init?.headers;
      return { ok: false, status: 401, json: async () => ({}) };
    },
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_error");
    assert.equal(result.status, 401);
    assert.equal(JSON.stringify(result).includes("test-token-not-a-real-secret"), false);
  }
  assert.ok(capturedHeaders, "a hívásnak tartalmaznia kellett Authorization headert");
  clearEnv();
});

test("malformed upstream response (HTTP 200, de nem valid JSON): routing_error, nem dob kivételt", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await withMockedFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token in JSON");
      },
    }),
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_error");
  }
  clearEnv();
});

test("a route service auth token SOHA nem kerül a kimenő URL-be (csak headerbe)", async () => {
  setRouteServiceEnv();
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  let capturedUrl: string | undefined;
  await withMockedFetch(
    async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ itineraries: [] }) };
    },
    () => fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" })
  );

  assert.ok(capturedUrl);
  assert.equal(capturedUrl!.includes("test-token-not-a-real-secret"), false);
  assert.equal(capturedUrl!.includes("ROUTE_SERVICE_AUTH_TOKEN"), false);
  clearEnv();
});

test("production módban (NODE_ENV=production) a legacy MOTIS_BASE_URL fallback fail closed — SOHA nem enged közvetlen elérést", async () => {
  clearEnv();
  process.env.NODE_ENV = "production";
  process.env.MOTIS_BASE_URL = "http://leaked-internal-host:8081";
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
  }
  clearEnv();
});

test("ROUTE_SERVICE_URL http:// (nem https, nem localhost) esetén a konfiguráció érvénytelen — fail closed", async () => {
  clearEnv();
  process.env.ROUTE_SERVICE_URL = "http://route.example-vps.hu";
  process.env.ROUTE_SERVICE_AUTH_TOKEN = "test-token-not-a-real-secret";
  const { fetchMotisPlan } = await import("../../lib/vedett-route/motisClient.ts");

  const result = await fetchMotisPlan({ fromPlace: "47.5,19.05", toPlace: "47.49,19.06" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "routing_engine_unavailable");
  }
  clearEnv();
});
