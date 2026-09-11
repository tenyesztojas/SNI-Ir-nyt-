// VÉDETT ÚTVONAL — MOTIS LAST-MILE OFFSET FALLBACK HOTFIX (2026-09-11) +
// VÉGSŐ SZŰKÍTÉS (2026-09-11, második kör)
//
// A felhasználó saját, éles VPS MOTIS (pinned v2.11.2) ellen futtatott
// diagnosztikája bizonyította, hogy egy konkrét, valós MAP_PICKED
// koordinátapárra az alapértelmezett kérés/radius=250/radius=1000 mind 0
// itineraryt ad, radius=1500 viszont 6-ot — azaz a MAP_PICKED/geokódolás/
// lat-lon lánc (lásd egy KORÁBBI, külön audit) hibátlan, a valódi ok a
// MOTIS last-mile (gyalogos megálló-hozzáférési) keresési sugara. Ez a
// teszt-suite a kontrollált, EGYETLEN radius=1500 fallback-kísérletet fedi
// le, orchestrator.ts searchVedettRoutes()-ön keresztül, mockolt global
// fetch-csel (nincs valódi hálózati hívás).
//
// VÉGSŐ SZŰKÍTÉS: a puszta "0 itinerary" ÖNMAGÁBAN túl tág trigger volt —
// legitim, valós okból (nincs járat az adott időpontban, nincs menetrendi
// kapcsolat) is lehet 0 itinerary, és ezt NEM szabad automatikusan last-mile
// fallbackre váltani. A bizonyítottan helyes feltétel (lásd
// orchestrator.ts shouldAttemptLastMileFallback()/hasExplicitZeroEndpointOffset()
// kommentjei): 0 együttes itinerary ÉS legalább az egyik sikeres válasz
// debugOutput mezőjében EXPLICIT, numerikus 0 az n_start_offsets VAGY
// n_dest_offsets mezőn. undefined debugOutput/mező NEM egyenlő 0-val —
// ilyenkor a fallback NEM indulhat automatikusan.
//
// MEGJEGYZÉS a "legfeljebb két MOTIS kérés" követelményről: az orchestrator
// MÁR A HOTFIX ELŐTT is két, valóban eltérő stratégiával (alap + metrómentes)
// futtatja párhuzamosan a normál keresést (lásd searchVedettRoutes() Promise.all
// hívása) — ez a MEGLÉVŐ, ebben a hotfixben SZÁNDÉKOSAN nem érintett
// architektúra (lásd a specifikáció 2. pontja: "a jelenlegi normál MOTIS
// kérés változatlan marad"). A hotfix specifikáció "legfeljebb két MOTIS
// kérés" / "nincs retry-hurok" követelményét ezért ÚGY értelmezzük, hogy a
// ÚJ FALLBACK MECHANIZMUS önmagában legfeljebb EGY további (radius=1500)
// kérést indíthat a normál keresési fázison felül — ezt "legfeljebb 1
// fallback-kérés, sosem retry-hurok" néven teszteljük lent, és a pontos
// összesített hívásszámot (max 3: 2 normál + legfeljebb 1 fallback) is
// explicit ellenőrizzük.
//
//   node --test __tests__/vedett-route/motis-last-mile-fallback.test.ts

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  searchVedettRoutes,
  shouldAttemptLastMileFallback,
  LAST_MILE_FALLBACK_RADIUS_METERS,
} from "../../lib/vedett-route/orchestrator.ts";
import type { MotisPlanResult } from "../../lib/vedett-route/motisTypes.ts";

const originalFetch = globalThis.fetch;
const originalMotisBaseUrl = process.env.MOTIS_BASE_URL;
const originalRouteServiceUrl = process.env.ROUTE_SERVICE_URL;
const originalRouteServiceToken = process.env.ROUTE_SERVICE_AUTH_TOKEN;

beforeEach(() => {
  // Legacy/fejlesztői közvetlen MOTIS elérés — a route service NINCS
  // konfigurálva ezekben a tesztekben, így a motisClient.ts resolveRouteTarget()
  // determinisztikusan a "legacy_direct" ágra esik (nincs auth header, nincs
  // hálózati-hiba-retry logika, ami zavarná a hívásszám-számolást).
  delete process.env.ROUTE_SERVICE_URL;
  delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  process.env.MOTIS_BASE_URL = "http://localhost:8080";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalMotisBaseUrl === undefined) delete process.env.MOTIS_BASE_URL;
  else process.env.MOTIS_BASE_URL = originalMotisBaseUrl;
  if (originalRouteServiceUrl === undefined) delete process.env.ROUTE_SERVICE_URL;
  else process.env.ROUTE_SERVICE_URL = originalRouteServiceUrl;
  if (originalRouteServiceToken === undefined) delete process.env.ROUTE_SERVICE_AUTH_TOKEN;
  else process.env.ROUTE_SERVICE_AUTH_TOKEN = originalRouteServiceToken;
});

function itinerary(id: string) {
  return {
    duration: 900,
    startTime: "2026-09-11T10:00:00+02:00",
    endTime: "2026-09-11T10:15:00+02:00",
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        from: { name: `from-${id}`, lat: 47.5, lon: 19.05 },
        to: { name: `to-${id}`, lat: 47.51, lon: 19.06 },
        duration: 900,
        startTime: "2026-09-11T10:00:00+02:00",
        endTime: "2026-09-11T10:15:00+02:00",
      },
    ],
  };
}

// A hasExplicitZeroEndpointOffset() feltételt kiváltó, ténylegesen 0
// n_dest_offsets-et hordozó debugOutput fixture.
const ZERO_DEST_OFFSETS = { debugOutput: { n_dest_offsets: 0, n_start_offsets: 12 } };
const ZERO_START_OFFSETS = { debugOutput: { n_start_offsets: 0, n_dest_offsets: 9 } };
const NONZERO_OFFSETS = { debugOutput: { n_start_offsets: 4, n_dest_offsets: 6 } };
const UNDEFINED_FIELDS_DEBUG = { debugOutput: { n_start_offsets: undefined, n_dest_offsets: undefined } };

interface MockCall {
  url: string;
  isRadius: boolean;
  isCalmer: boolean;
}

// Egyszerű, forgatókönyv-vezérelt fetch mock: `responder(call)` dönti el,
// mit adjon vissza egy adott hívásra (URL alapján felismerve, hogy az
// alap/normál, a metrómentes/"calmer", vagy a radius=1500 fallback hívásról
// van-e szó) — így minden teszteset a saját, önálló forgatókönyvét írhatja
// le anélkül, hogy a hívások SORRENDJÉRE kellene támaszkodnia (a normál két
// kérés Promise.all-lal párhuzamosan indul, a sorrend nem garantált).
function installMockFetch(
  responder: (call: MockCall) => { ok: true; json: unknown } | { ok: false; status?: number; networkError?: boolean; timeoutError?: boolean }
): MockCall[] {
  const calls: MockCall[] = [];
  globalThis.fetch = (async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);
    const call: MockCall = { url, isRadius: url.includes("radius="), isCalmer: url.includes("transitModes=") };
    calls.push(call);
    const outcome = responder(call);
    if (!outcome.ok) {
      if (outcome.timeoutError) {
        const err = new Error("The operation was aborted");
        err.name = "TimeoutError";
        throw err;
      }
      if (outcome.networkError) {
        throw new Error("network error (mock)");
      }
      return {
        ok: false,
        status: outcome.status ?? 500,
        json: async () => ({}),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (outcome.json === "MALFORMED") throw new Error("invalid json (mock)");
        return outcome.json;
      },
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

const baseRequest = {
  from: { name: "kiindulópont", lat: 47.4813, lon: 19.0559 },
  to: { name: "célpont", lat: 47.4389, lon: 19.1706 },
  departAt: "2026-09-11T10:00:00+02:00",
};

describe("shouldAttemptLastMileFallback — tiszta trigger-logika (VÉGSŐ SZŰKÍTÉS: explicit 0 endpoint offset kell)", () => {
  test("mindkét elsődleges kérés sikeres, 0 együttes találat, DE nincs debugOutput -> false", () => {
    assert.equal(
      shouldAttemptLastMileFallback({ ok: true, data: {} } as MotisPlanResult, { ok: true, data: {} } as MotisPlanResult, 0),
      false
    );
  });

  test("mindkét elsődleges kérés sikeres, van találat -> false (nincs szükség fallbackre), még explicit 0 offset esetén is", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult,
        { ok: true, data: {} } as MotisPlanResult,
        3
      ),
      false
    );
  });

  test("6) timeout az egyik elsődleges kérésen -> SOHA false, még 0 találat + explicit 0 offset esetén is", () => {
    const timeoutResult: MotisPlanResult = { ok: false, reason: "timeout", message: "x" };
    assert.equal(
      shouldAttemptLastMileFallback(timeoutResult, { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult, 0),
      false
    );
  });

  test("7) auth hiba (routing_error) az egyik elsődleges kérésen -> SOHA false", () => {
    const authFailResult: MotisPlanResult = { ok: false, reason: "routing_error", message: "x", status: 401 };
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult,
        authFailResult,
        0
      ),
      false
    );
  });

  test("8) hibás/malformed válasz (routing_error) -> SOHA false", () => {
    const malformedResult: MotisPlanResult = { ok: false, reason: "routing_error", message: "x" };
    assert.equal(
      shouldAttemptLastMileFallback(
        malformedResult,
        { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult,
        0
      ),
      false
    );
  });

  test("routing_engine_unavailable -> SOHA false", () => {
    const unavailable: MotisPlanResult = { ok: false, reason: "routing_engine_unavailable", message: "x" };
    assert.equal(shouldAttemptLastMileFallback(unavailable, unavailable, 0), false);
  });

  test("A) 0 itinerary + n_dest_offsets=0 -> true", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult,
        { ok: true, data: {} } as MotisPlanResult,
        0
      ),
      true
    );
  });

  test("B) 0 itinerary + n_start_offsets=0 -> true", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: {} } as MotisPlanResult,
        { ok: true, data: ZERO_START_OFFSETS } as unknown as MotisPlanResult,
        0
      ),
      true
    );
  });

  test("C) 0 itinerary + mindkét endpoint offset > 0 (mindkét válaszban) -> false", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: NONZERO_OFFSETS } as unknown as MotisPlanResult,
        { ok: true, data: NONZERO_OFFSETS } as unknown as MotisPlanResult,
        0
      ),
      false
    );
  });

  test("D) 0 itinerary + debugOutput undefined (egyik válaszban sincs) -> false", () => {
    assert.equal(
      shouldAttemptLastMileFallback({ ok: true, data: {} } as MotisPlanResult, { ok: true, data: {} } as MotisPlanResult, 0),
      false
    );
  });

  test("E) 0 itinerary + n_start_offsets undefined + n_dest_offsets undefined (debugOutput jelen van, de a mezők üresek) -> false", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: UNDEFINED_FIELDS_DEBUG } as unknown as MotisPlanResult,
        { ok: true, data: {} } as MotisPlanResult,
        0
      ),
      false
    );
  });

  test("F) van itinerary + endpoint offset 0 -> false (a 0-itinerary feltétel elsődleges, offset önmagában nem elég)", () => {
    assert.equal(
      shouldAttemptLastMileFallback(
        { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult,
        { ok: true, data: {} } as MotisPlanResult,
        5
      ),
      false
    );
  });

  test("G) bármelyik normál MOTIS request !ok -> false, még explicit 0 offset esetén is", () => {
    const failed: MotisPlanResult = { ok: false, reason: "routing_error", message: "x" };
    assert.equal(
      shouldAttemptLastMileFallback(failed, { ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult, 0),
      false
    );
    assert.equal(
      shouldAttemptLastMileFallback({ ok: true, data: ZERO_DEST_OFFSETS } as unknown as MotisPlanResult, failed, 0),
      false
    );
  });

  test("a fallback keresési sugár pontosan 1500 méter, és NINCS 2000 m-es lépcső ebben a körben", () => {
    assert.equal(LAST_MILE_FALLBACK_RADIUS_METERS, 1500);
  });
});

describe("searchVedettRoutes — MOTIS last-mile offset fallback, integrációs szint (mockolt fetch)", () => {
  test("1) normál kérés talál útvonalat -> NINCS fallback-hívás, expandedAccessSearch hiányzik", async () => {
    const calls = installMockFetch(() => ({ ok: true, json: { itineraries: [itinerary("a")] } }));
    const result = await searchVedettRoutes(baseRequest);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.journeys.length > 0, true);
      assert.equal(result.expandedAccessSearch, undefined);
      assert.equal(result.accessWarning, undefined);
    }
    assert.equal(calls.length, 2, "csak a két normál (alap + metrómentes) kérésnek szabad elindulnia");
    assert.ok(calls.every((c) => !c.isRadius), "a normál kérésekben SOHA nem szabad radius paraméternek szerepelnie");
  });

  test("1b) normál kérés 0 itineraryt ad, DE nincs debugOutput a válaszban -> NINCS fallback (legitim 'nincs útvonal' eset, VÉGSŐ SZŰKÍTÉS)", async () => {
    const calls = installMockFetch(() => ({ ok: true, json: { itineraries: [] } }));
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route_found");
    assert.equal(calls.length, 2, "debugOutput hiányában NEM indulhat radius=1500 fallback");
    assert.ok(calls.every((c) => !c.isRadius));
  });

  test("2) normál kérés 0 itineraryt ad + explicit n_dest_offsets=0 (mindkét ág sikeres) -> pontosan EGY radius=1500 retry indul", async () => {
    let radiusCallCount = 0;
    const calls = installMockFetch((call) => {
      if (call.isRadius) {
        radiusCallCount++;
        return { ok: true, json: { itineraries: [] } };
      }
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(radiusCallCount, 1, "pontosan egy radius=1500 fallback-hívásnak kell elindulnia");
    assert.equal(calls.length, 3, "2 normál + 1 fallback = 3 hívás");
    assert.ok(calls.find((c) => c.isRadius)?.url.includes(`radius=${LAST_MILE_FALLBACK_RADIUS_METERS}`));
    assert.equal(result.ok, false);
  });

  test("3) a fallback talál útvonalat (a trigger n_start_offsets=0 volt) -> az eredmény visszakerül a hívóhoz, expandedAccessSearch=true, accessWarning jelen van", async () => {
    installMockFetch((call) => {
      if (call.isRadius) return { ok: true, json: { itineraries: [itinerary("fallback")] } };
      return { ok: true, json: { itineraries: [], ...ZERO_START_OFFSETS } };
    });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.journeys.length, 1);
      assert.equal(result.expandedAccessSearch, true);
      assert.equal(result.accessWarning, "Ehhez az útvonalhoz hosszabb gyalogos megközelítésre lehet szükség.");
      // 7. pont: a figyelmeztetés SOHA nem tartalmazhat konkrét métert/sugarat.
      assert.doesNotMatch(result.accessWarning ?? "", /1500|méter/i);
      // 6. pont: SOHA nem nevezhető "1500 méteres gyaloglásnak".
      assert.doesNotMatch(result.accessWarning ?? "", /gyaloglás/i);
    }
  });

  test("4) a fallback is 0 találatot ad -> végeredmény no_route_found, nincs második fallback-kísérlet", async () => {
    let radiusCallCount = 0;
    installMockFetch((call) => {
      if (call.isRadius) {
        radiusCallCount++;
        return { ok: true, json: { itineraries: [] } };
      }
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route_found");
    assert.equal(radiusCallCount, 1, "a sikertelen fallback UTÁN sem indulhat egy újabb (pl. 2000 m-es) kísérlet");
  });

  test("5) a TELJES folyamatban legfeljebb 3 nyers MOTIS kérés történhet (2 normál + legfeljebb 1 fallback) — nincs retry-hurok", async () => {
    const calls = installMockFetch(() => ({ ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } }));
    await searchVedettRoutes(baseRequest);
    assert.ok(calls.length <= 3, `túl sok MOTIS hívás történt (${calls.length}) — retry-hurokra utal`);
    const radiusCalls = calls.filter((c) => c.isRadius);
    assert.ok(radiusCalls.length <= 1, "legfeljebb egy radius-alapú fallback-hívás lehet");
  });

  test("6) timeout az egyik normál kérésen -> NINCS radius retry", async () => {
    const calls = installMockFetch((call) => {
      if (call.isCalmer) return { ok: false, timeoutError: true };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    await searchVedettRoutes(baseRequest);
    assert.ok(calls.every((c) => !c.isRadius), "timeout esetén SOHA nem indulhat radius=1500 fallback");
  });

  test("7) auth hiba (401) az egyik normál kérésen -> NINCS radius retry", async () => {
    const calls = installMockFetch((call) => {
      if (call.isCalmer) return { ok: false, status: 401 };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    await searchVedettRoutes(baseRequest);
    assert.ok(calls.every((c) => !c.isRadius), "auth hiba esetén SOHA nem indulhat radius=1500 fallback");
  });

  test("8) malformed válasz (érvénytelen JSON) az egyik normál kérésen -> NINCS radius retry", async () => {
    const calls = installMockFetch((call) => {
      if (call.isCalmer) return { ok: true, json: "MALFORMED" };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    await searchVedettRoutes(baseRequest);
    assert.ok(calls.every((c) => !c.isRadius), "malformed válasz esetén SOHA nem indulhat radius=1500 fallback");
  });

  test("9) a `radius` paraméter SOHA nem jelenik meg a normál/elsődleges kérés(ek) query paramétereiben, még akkor sem, ha a fallback ténylegesen lefut", async () => {
    const calls = installMockFetch((call) => {
      if (call.isRadius) return { ok: true, json: { itineraries: [itinerary("fb")] } };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    await searchVedettRoutes(baseRequest);
    const nonRadiusCalls = calls.filter((c) => !c.isRadius);
    assert.equal(nonRadiusCalls.length, 2, "pontosan két normál hívásnak kell lennie");
    for (const c of nonRadiusCalls) {
      assert.doesNotMatch(c.url, /[?&]radius=/);
    }
  });

  test("10) expandedAccessSearch KIZÁRÓLAG akkor true, ha a fallback ténylegesen sikerrel talált útvonalat", async () => {
    // Normál siker esetén undefined (lásd 1. teszt), no_route_found esetén a
    // mező nem is létezik az OrchestratorErrorResult típuson (lásd 4. teszt).
    installMockFetch((call) => {
      if (call.isRadius) return { ok: true, json: { itineraries: [] } };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, false);
    assert.ok(!("expandedAccessSearch" in result));
  });

  test("11) a felhasználói figyelmeztető szöveg KIZÁRÓLAG akkor jelenik meg, ha a fallback sikeres volt", async () => {
    installMockFetch((call) => {
      if (call.isRadius) return { ok: true, json: { itineraries: [] } };
      return { ok: true, json: { itineraries: [], ...ZERO_DEST_OFFSETS } };
    });
    const result = await searchVedettRoutes(baseRequest);
    assert.equal(result.ok, false);
    assert.ok(!("accessWarning" in result));
  });
});

describe("12. eset — Sensory Engine walking-faktor VÁLTOZATLAN (audit, nem módosítottuk)", () => {
  const SENSORY_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "sensoryEngine.ts");
  const sensorySrc = readFileSync(SENSORY_PATH, "utf-8");

  test("a walking súly alapértéke (0.75) és a walkingMin alapú normalizált terhelés-számítás érintetlen", () => {
    assert.match(sensorySrc, /walking: 0\.75,/);
    assert.match(sensorySrc, /const walkingMin = journey\.walkingMinutes;/);
    assert.match(
      sensorySrc,
      /\{ key: "walking", available: true, rawValue: walkingMin, normalizedLoad: clamp100\(walkingMin \* 5\) \}/
    );
  });

  test("a Sensory Engine forrásában NINCS utalás az expandedAccessSearch/last-mile fallback fogalmára — a hotfix nem nyúlt bele a pontszámításba", () => {
    assert.doesNotMatch(sensorySrc, /expandedAccessSearch/i);
    assert.doesNotMatch(sensorySrc, /radius/i);
    assert.doesNotMatch(sensorySrc, /last.?mile/i);
  });
});
