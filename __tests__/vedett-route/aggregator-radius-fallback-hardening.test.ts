// Sprint E.1 hotfix (2026-09-09) — aggregator.ts konzervatív sugár-
// bővítési regresszió-tesztek, a valódi Vercel Preview 406 incidens root
// cause auditja után.
//
//   node --test --experimental-strip-types __tests__/vedett-route/aggregator-radius-fallback-hardening.test.ts
//
// LEFEDI:
//   C) 406 (errorCode: http_error) után az 1500m-es fallback NEM hívja
//      újra az OSM providert
//   D) 429 (errorCode: rate_limited) után SEM hívja újra ugyanazon
//      felhasználói művelet (discoverRestPoints hívás) alatt
//   F) 800m-en 0 találat + minden provider "ok" esetén az 1500m-es
//      fallback TOVÁBBRA IS működik (nem regresszált a konzervatív javítás
//      miatt)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  discoverRestPoints,
  INITIAL_SEARCH_RADIUS_METERS,
  EXPANDED_SEARCH_RADIUS_METERS,
} from "../../lib/vedett-route/restStopFlow/aggregator.ts";
import type { RestPointProvider, ProviderResult, FindNearbyParams } from "../../lib/vedett-route/restStopFlow/discovery/types.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";

function makeRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "rp-1",
    createdBy: "user-1",
    name: "Teszt pont",
    latitude: 47.5,
    longitude: 19.05,
    source: "USER",
    visibility: "PRIVATE",
    toilet: null,
    seating: null,
    quietSpace: null,
    indoors: null,
    outdoors: null,
    purchaseRequired: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

// Hívás-számláló providerré csomagol egy statikus eredményt — így
// bizonyítható, hogy egy adott provider a bővített körben ténylegesen
// ÚJRA lett-e hívva, vagy sem (nem csak a végeredmény alapján
// következtetünk rá).
function makeCountingProvider(name: RestPointProvider["name"], result: ProviderResult) {
  let callCount = 0;
  const radiiSeen: number[] = [];
  const provider: RestPointProvider = {
    name,
    async findNearby(params: FindNearbyParams) {
      callCount++;
      radiiSeen.push(params.radiusMeters);
      return result;
    },
  };
  return { provider, getCallCount: () => callCount, getRadiiSeen: () => radiiSeen };
}

describe("aggregator.ts — konzervatív sugár-bővítés (Sprint E.1 hotfix, 2026-09-09)", () => {
  test("C) OSM 406 (errorCode: http_error) az első körben -> az 1500m-es fallback NEM hívja újra az OSM providert", async () => {
    const user = makeCountingProvider("user", { status: "ok", points: [] });
    const vedettSarok = makeCountingProvider("vedettSarok", { status: "ok", points: [] });
    const osm = makeCountingProvider("osm", { status: "unavailable", reason: "overpass_http_406", errorCode: "http_error" });

    const result = await discoverRestPoints({
      latitude: 47.5,
      longitude: 19.05,
      userId: "u1",
      providers: [user.provider, vedettSarok.provider, osm.provider],
    });

    assert.equal(osm.getCallCount(), 1, "az OSM providert a 406 (http_error) után NEM szabad újra meghívni ugyanazon user action alatt");
    assert.deepEqual(osm.getRadiiSeen(), [INITIAL_SEARCH_RADIUS_METERS], "az OSM egyetlen hívása is csak az induló 800m-es körben történhet");
    // A "user" és "vedettSarok" ok volt 0 ponttal -> nekik ÉRDEMES újra
    // futniuk a bővített körben (F pont elve).
    assert.equal(user.getCallCount(), 2, "a sikeres 'user' providert a bővített kör ÚJRA hívja (nagyobb sugárral több találat lehet)");
    assert.equal(vedettSarok.getCallCount(), 2);
    assert.deepEqual(user.getRadiiSeen(), [INITIAL_SEARCH_RADIUS_METERS, EXPANDED_SEARCH_RADIUS_METERS]);

    // A diagnosztikai "sources.osm" az ELSŐ kör állapotát őrzi meg —
    // nincs felülírva egy "nem is próbáltuk" default értékkel.
    assert.equal(result.sources.osm.ok, false);
    assert.equal(result.sources.osm.errorCode, "http_error");
    assert.equal(result.sources.osm.reason, "overpass_http_406");
    assert.equal(result.expandedSearch, true, "mivel a user/vedettSarok providerek érdemesek voltak az újrapróbálásra, a bővített kör TÉNYLEGESEN lefutott");
    assert.equal(result.searchRadiusMeters, EXPANDED_SEARCH_RADIUS_METERS);
  });

  test("D) OSM 429 (errorCode: rate_limited) az első körben -> az 1500m-es fallback SEM hívja újra ugyanazon discoverRestPoints() hívás alatt", async () => {
    const user = makeCountingProvider("user", { status: "ok", points: [] });
    const vedettSarok = makeCountingProvider("vedettSarok", { status: "ok", points: [] });
    const osm = makeCountingProvider("osm", { status: "unavailable", reason: "overpass_http_429", errorCode: "rate_limited" });

    await discoverRestPoints({
      latitude: 47.5,
      longitude: 19.05,
      userId: "u1",
      providers: [user.provider, vedettSarok.provider, osm.provider],
    });

    assert.equal(osm.getCallCount(), 1, "429 (rate_limited) után sem szabad ugyanazon user action alatt újra meghívni az OSM-et");
  });

  test("MINDEN provider determinisztikus/nem-tranziens hibával bukik -> a bővített kör TELJESEN kimarad (nincs második hálózati kísérlet), expandedSearch=false", async () => {
    const user = makeCountingProvider("user", { status: "unavailable", reason: "user_query_error", errorCode: "query_error" });
    const vedettSarok = makeCountingProvider("vedettSarok", { status: "unavailable", reason: "vs_error", errorCode: "unknown_error" });
    const osm = makeCountingProvider("osm", { status: "unavailable", reason: "overpass_http_406", errorCode: "http_error" });

    const result = await discoverRestPoints({
      latitude: 47.5,
      longitude: 19.05,
      userId: "u1",
      providers: [user.provider, vedettSarok.provider, osm.provider],
    });

    assert.equal(user.getCallCount(), 1);
    assert.equal(vedettSarok.getCallCount(), 1);
    assert.equal(osm.getCallCount(), 1);
    assert.equal(result.expandedSearch, false, "ha egyetlen provider sem érdemes az újrapróbálásra, a kód ŐSZINTÉN nem állítja, hogy bővített keresés történt");
    assert.equal(result.searchRadiusMeters, INITIAL_SEARCH_RADIUS_METERS);
  });

  test("timeout / endpoint_unavailable (tranziens) hibák UTÁN a bővített kör TOVÁBBRA IS újrahívja az érintett providert", async () => {
    const user = makeCountingProvider("user", { status: "ok", points: [] });
    const vedettSarok = makeCountingProvider("vedettSarok", { status: "ok", points: [] });
    const osm = makeCountingProvider("osm", { status: "unavailable", reason: "overpass_timeout", errorCode: "timeout" });

    await discoverRestPoints({
      latitude: 47.5,
      longitude: 19.05,
      userId: "u1",
      providers: [user.provider, vedettSarok.provider, osm.provider],
    });

    assert.equal(osm.getCallCount(), 2, "timeout esetén a bővített kör indokoltan újrapróbálkozhat (tranziens hiba)");
  });

  test("F) 800m-en 0 találat + minden provider 'ok' -> az 1500m-es fallback TOVÁBBRA IS működik (nem regresszió)", async () => {
    const radiiSeen: number[] = [];
    const providers: RestPointProvider[] = [
      {
        name: "user",
        async findNearby(params) {
          radiiSeen.push(params.radiusMeters);
          return { status: "ok", points: [] };
        },
      },
      { name: "vedettSarok", async findNearby() { return { status: "ok", points: [] }; } },
      {
        name: "osm",
        async findNearby(params) {
          if (params.radiusMeters === EXPANDED_SEARCH_RADIUS_METERS) {
            return { status: "ok", points: [makeRestPoint({ id: "osm-1", source: "OSM" })] };
          }
          return { status: "ok", points: [] };
        },
      },
    ];

    const result = await discoverRestPoints({ latitude: 47.5, longitude: 19.05, userId: "u1", providers });

    assert.deepEqual(radiiSeen, [INITIAL_SEARCH_RADIUS_METERS, EXPANDED_SEARCH_RADIUS_METERS]);
    assert.equal(result.expandedSearch, true);
    assert.equal(result.searchRadiusMeters, EXPANDED_SEARCH_RADIUS_METERS);
    assert.equal(result.points.length, 1);
    assert.equal(result.partial, false, "minden forrás 'ok' volt mindkét körben, tehát ez NEM partial failure");
  });
});
