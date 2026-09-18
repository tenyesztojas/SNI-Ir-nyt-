// VÉDETT ÚTVONAL — MOTIS STREET/WALKING ROUTING kliens tesztek (Nearby
// Transit Access Backend sprint, folytatás, 2026-09-17).
// lib/vedett-route/motisClient.ts fetchMotisWalkingRoute() — UGYANAZ a
// mock-fetch minta, mint motisClient.test.ts-ben (env-vezérelt
// MOTIS_BASE_URL, nincs élő MOTIS-függés).
//   node --test __tests__/vedett-route/motis-walking-route-client.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

const START = { lat: 47.5005, lng: 19.0248, level: 0 };
const DESTINATION = { lat: 47.50045, lng: 19.024604, level: 0 };

function validMotisResponse() {
  return {
    type: "FeatureCollection",
    metadata: { duration: 115, distance: 141.0995054244995, uses_elevator: false },
    features: [
      { type: "Feature", properties: { level: 0, way: 0 }, geometry: { type: "LineString", coordinates: [[19.0248, 47.5005], [19.024604, 47.50045]] } },
    ],
  };
}

test("érvénytelen start koordinátára SOSEM küld MOTIS requestet (fetch nem hívódik), reason: invalid_input", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch-nek soha nem kellene meghívódnia");
  };
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisWalkingRoute({ lat: 999, lng: 19.0, level: 0 }, DESTINATION);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("MOTIS_BASE_URL nélkül routing_engine_unavailable-t ad, sosem dob kivételt", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
  const result = await fetchMotisWalkingRoute(START, DESTINATION);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_engine_unavailable");
});

test("helyes POST /api/route hívást indít, pontosan profile:'foot' és direction:'forward' body-val", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => validMotisResponse(),
    };
  };
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    await fetchMotisWalkingRoute(START, DESTINATION);

    assert.equal(capturedUrl, "http://localhost:19999/api/route");
    assert.equal(capturedInit?.method, "POST");
    const body = JSON.parse(String(capturedInit?.body));
    assert.deepEqual(body.start, START);
    assert.deepEqual(body.destination, DESTINATION);
    assert.equal(body.profile, "foot", "a profile PONTOSAN 'foot' kisbetűvel — NEM 'FOOT'");
    assert.equal(body.direction, "forward");
    assert.equal((capturedInit?.headers as Record<string, string>)["Content-Type"], "application/json");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("sikeres FeatureCollection válasz esetén a validált StreetRoute-ot adja vissza", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => validMotisResponse() });
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisWalkingRoute(START, DESTINATION);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.metadata, { duration: 115, distance: 141.0995054244995, usesElevator: false });
      assert.equal(result.data.features.length, 1);
      assert.deepEqual(result.data.features[0].coordinates, [[19.0248, 47.5005], [19.024604, 47.50045]]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("malformed MOTIS válasz (validáció bukik) esetén routing_error-t ad, sosem dob kivételt", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ type: "NotAFeatureCollection" }) });
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisWalkingRoute(START, DESTINATION);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "routing_error");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("HTTP non-2xx válasz esetén routing_error-t ad a státusszal", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisWalkingRoute(START, DESTINATION);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "routing_error");
      assert.equal(result.status, 500);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("timeout (fetch AbortError) esetén reason: timeout, sosem dob kivételt", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => {
    const err = new Error("aborted");
    err.name = "TimeoutError";
    throw err;
  };
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    await assert.doesNotReject(async () => {
      const result = await fetchMotisWalkingRoute(START, DESTINATION);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "timeout");
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("hálózati hiba (fetch reject, nem timeout) esetén routing_engine_unavailable, sosem dob kivételt", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => {
    throw new Error("ECONNRESET");
  };
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    await assert.doesNotReject(async () => {
      const result = await fetchMotisWalkingRoute(START, DESTINATION);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "routing_engine_unavailable");
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});

test("malformed JSON (a .json() dob) esetén routing_error-t ad, nem 'exception'-t", async () => {
  process.env.MOTIS_BASE_URL = "http://localhost:19999";
  const originalFetch = globalThis.fetch;
  // @ts-expect-error — teszt-mock
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });
  try {
    const { fetchMotisWalkingRoute } = await import("../../lib/vedett-route/motisClient.ts");
    const result = await fetchMotisWalkingRoute(START, DESTINATION);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "routing_error");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.MOTIS_BASE_URL;
  }
});
