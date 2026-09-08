// Sprint E.1 hotfix (2026-09-09) — Overpass request hardening regresszió-
// tesztek, a valódi Vercel Preview incidens ("errorCode: http_error,
// reason: overpass_http_406, httpStatus: 406") root cause auditja után.
//
// Ez a fájl a lib/vedett-route/restStopFlow/discovery/osmProvider.ts-t
// KÖZVETLENÜL, valódi fetch()-mockkal teszteli (a fájl SOSEM importál
// "@/lib/..." aliason keresztül, csak relatív útvonalakat — lásd a fejléce
// —, ezért node --test alól közvetlenül futtatható).
//
//   node --test --experimental-strip-types __tests__/vedett-route/overpass-request-hardening.test.ts
//
// LEFEDI:
//   A) a kimenő request tartalmazza a User-Agent-et, a Referer-t, és a
//      helyes (charset-tel kiegészített) Content-Type-ot, URLSearchParams
//      body-kódolással
//   B) 406 után NINCS low-level (fetchOverpassWithRetry) azonnali retry —
//      egyetlen findNearby() hívás pontosan egyetlen fetch()-et indít
//   E) egy normál 200 OK, valid JSON válasz továbbra is helyesen
//      parse-olódik RestPoint[]-re

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { osmRestPointProvider } from "../../lib/vedett-route/restStopFlow/discovery/osmProvider.ts";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(handler: (input: unknown, init?: RequestInit) => { status: number; json?: unknown; ok?: boolean }) {
  let callCount = 0;
  const calls: Array<{ url: unknown; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    callCount++;
    calls.push({ url, init });
    const result = handler(url, init);
    const ok = result.ok ?? (result.status >= 200 && result.status < 300);
    return {
      ok,
      status: result.status,
      statusText: "",
      json: async () => result.json ?? {},
      headers: new Headers(),
    } as unknown as Response;
  }) as typeof fetch;
  return { calls, getCallCount: () => callCount };
}

describe("osmProvider.ts — Overpass request hardening (Sprint E.1 hotfix, 2026-09-09)", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test("A) a kimenő request User-Agent-et, Referer-t és charset-es Content-Type-ot küld, URLSearchParams body-val", async () => {
    const mock = mockFetchOnce(() => ({ status: 200, json: { elements: [] } }));
    await osmRestPointProvider.findNearby({ latitude: 47.5, longitude: 19.05, radiusMeters: 800, userId: "u1" });

    assert.equal(mock.calls.length, 1);
    const [{ init }] = mock.calls;
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["User-Agent"], "VedettSarok-VedettUtvonal/1.0 (+https://vedettsarok.hu)");
    assert.equal(headers["Referer"], "https://vedettsarok.hu/");
    assert.equal(headers["Content-Type"], "application/x-www-form-urlencoded;charset=UTF-8");

    // A body-nak egy URLSearchParams.toString() kimenetnek kell lennie —
    // "data=<url-encoded query>" alakban, "+" -szal a szóközökért (NEM
    // "%20"-zal, ami a manuális encodeURIComponent()-re utalna).
    const body = init?.body as string;
    assert.ok(body.startsWith("data="), "a body-nak 'data=' prefixűnek kell lennie");
    assert.ok(body.includes("+"), "URLSearchParams kódolásnál a query szóközei '+' -ként jelennek meg");
  });

  test("B) 406 után NINCS low-level azonnali retry — egyetlen findNearby() hívás pontosan 1 fetch()-et indít", async () => {
    const mock = mockFetchOnce(() => ({ status: 406, ok: false, json: {} }));
    const result = await osmRestPointProvider.findNearby({ latitude: 47.5, longitude: 19.05, radiusMeters: 800, userId: "u1" });

    assert.equal(mock.getCallCount(), 1, "406 (http_error) esetén a fetchOverpassWithRetry-nak NEM szabad újrapróbálkoznia");
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.errorCode, "http_error");
      assert.equal(result.reason, "overpass_http_406");
    }
  });

  test("429 után SEM low-level retry — egyetlen fetch() hívás, errorCode: rate_limited", async () => {
    const mock = mockFetchOnce(() => ({ status: 429, ok: false, json: {} }));
    const result = await osmRestPointProvider.findNearby({ latitude: 47.5, longitude: 19.05, radiusMeters: 800, userId: "u1" });

    assert.equal(mock.getCallCount(), 1, "429 (rate_limited) esetén sem szabad azonnali retry-nak lennie");
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.errorCode, "rate_limited");
    }
  });

  test("E) normál 200 OK, valid JSON válasz továbbra is helyesen parse-olódik RestPoint[]-re", async () => {
    mockFetchOnce(() => ({
      status: 200,
      json: {
        elements: [
          {
            type: "node",
            id: 123,
            lat: 47.501,
            lon: 19.051,
            tags: { amenity: "bench" },
          },
        ],
      },
    }));
    const result = await osmRestPointProvider.findNearby({ latitude: 47.5, longitude: 19.05, radiusMeters: 800, userId: "u1" });

    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.equal(result.points.length, 1);
      assert.equal(result.points[0].source, "OSM");
      assert.equal(result.points[0].category, "BENCH");
      assert.equal(result.points[0].id, "osm:node/123");
    }
  });
});
