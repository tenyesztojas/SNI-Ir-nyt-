// Sprint E.2 hotfix (2026-09-08) — source-aware pihenőpont-feloldás
// regresszió-tesztjei, a valódi Vercel Preview 404 incidens
// ("EXTERNAL REST POINT RESOLUTION MISMATCH") root cause auditja után.
//
//   node --test --experimental-strip-types __tests__/vedett-route/rest-point-resolution-hardening.test.ts
//
// LEFEDI:
//   A) USER rest point -> DB (ownPoints) resolve -> sikeres
//   B) OSM rest point -> NEM kereshető/nem is keresendő a rest_points
//      DB-ben -> a discovery candidate payloadból épül fel, sikeres
//   C) VEDETT_SAROK eligible pont -> places resolve -> sikeres
//   D) VEDETT_SAROK non-eligible -> null (a route.ts ebből
//      REST_POINT_NOT_FOUND-ot csinál)
//   E) ismeretlen USER id -> null (a route.ts ebből
//      REST_POINT_NOT_FOUND-ot csinál)
//   + schemas.ts restPointRefSchema biztonsági validáció: source enum,
//     id formátum forrásonként, lat/lon tartomány, name hossz

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSelectedRestPoint,
  resolveUserRestPoint,
  resolveVedettSarokRestPoint,
  resolveOsmRestPoint,
  type SelectedRestPointRef,
} from "../../lib/vedett-route/restStopFlow/resolveRestPoint.ts";
import type { RestPoint } from "../../lib/rest-points/types.ts";
import type { Place } from "../../lib/types.ts";
import { restStopRouteToRestPointSchema } from "../../lib/vedett-route/restStopFlow/schemas.ts";

function makeOwnRestPoint(overrides: Partial<RestPoint> = {}): RestPoint {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    createdBy: "user-1",
    name: "Saját pad",
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

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "place-1",
    slug: "teszt-hely",
    name: "Teszt hely",
    category: "park",
    city: "Budapest",
    address: "Teszt utca 1.",
    latitude: 47.498,
    longitude: 19.0405,
    description: "",
    whyFriendly: "",
    status: "published",
    restPointEligible: false,
    ...overrides,
  };
}

describe("resolveRestPoint.ts — source-aware feloldás (Sprint E.2 hotfix, 2026-09-08)", () => {
  test("A) USER rest point -> DB (ownPoints) resolve -> sikeres, a saját rest_points sor kerül vissza", () => {
    const own = [makeOwnRestPoint({ id: "own-1", name: "Csendes pad" })];
    const ref: SelectedRestPointRef = { source: "USER", id: "own-1" };

    const result = resolveUserRestPoint(own, ref);
    assert.ok(result);
    assert.equal(result!.id, "own-1");
    assert.equal(result!.name, "Csendes pad");

    // resolveSelectedRestPoint ugyanezt adja vissza (places nem
    // szükséges/nem használt USER esetén).
    const viaDispatcher = resolveSelectedRestPoint(ref, { ownPoints: own, places: [] });
    assert.deepEqual(viaDispatcher, result);
  });

  test("B) OSM rest point -> NEM a rest_points DB-ben keresünk, a validált discovery candidate payloadból épül fel", () => {
    const ref: SelectedRestPointRef = {
      source: "OSM",
      id: "osm:node/123",
      name: "Nyilvános mosdó",
      latitude: 47.501,
      longitude: 19.052,
    };

    // Szándékosan ÜRES ownPoints/places -> bizonyítja, hogy az OSM ág
    // egyáltalán nem függ ezektől (nincs DB-lookup egy OSM candidate-re).
    const result = resolveSelectedRestPoint(ref, { ownPoints: [], places: [] });
    assert.ok(result);
    assert.equal(result!.id, "osm:node/123");
    assert.equal(result!.name, "Nyilvános mosdó");
    assert.equal(result!.latitude, 47.501);
    assert.equal(result!.longitude, 19.052);
    assert.equal(result!.source, "OSM");

    const direct = resolveOsmRestPoint(ref);
    assert.deepEqual(direct, result);
  });

  test("C) VEDETT_SAROK eligible pont -> places resolve -> sikeres, koordináta a places sorból jön", () => {
    const eligiblePlace = makePlace({ id: "park-1", name: "Csendes Park", restPointEligible: true });
    const ref: SelectedRestPointRef = { source: "VEDETT_SAROK", id: "vedett-sarok:park-1" };

    const result = resolveVedettSarokRestPoint([eligiblePlace], ref);
    assert.ok(result);
    assert.equal(result!.id, "vedett-sarok:park-1");
    assert.equal(result!.name, "Csendes Park");
    assert.equal(result!.latitude, eligiblePlace.latitude);
    assert.equal(result!.longitude, eligiblePlace.longitude);
    assert.equal(result!.source, "VEDETT_SAROK");
  });

  test("D) VEDETT_SAROK non-eligible (vagy nem létező) place -> null, tehát a route.ts REST_POINT_NOT_FOUND-ot ad", () => {
    const nonEligiblePlace = makePlace({ id: "coach-1", restPointEligible: false });
    const ref: SelectedRestPointRef = { source: "VEDETT_SAROK", id: "vedett-sarok:coach-1" };
    assert.equal(resolveVedettSarokRestPoint([nonEligiblePlace], ref), null);

    // Nem létező place id.
    const missingRef: SelectedRestPointRef = { source: "VEDETT_SAROK", id: "vedett-sarok:does-not-exist" };
    assert.equal(resolveVedettSarokRestPoint([nonEligiblePlace], missingRef), null);
  });

  test("E) ismeretlen USER id -> null, tehát a route.ts REST_POINT_NOT_FOUND-ot ad (nem szivárogtat 'létezik, de nem a tiéd' infót)", () => {
    const own = [makeOwnRestPoint({ id: "own-1" })];
    const ref: SelectedRestPointRef = { source: "USER", id: "ismeretlen-id" };
    assert.equal(resolveUserRestPoint(own, ref), null);
    assert.equal(resolveSelectedRestPoint(ref, { ownPoints: own, places: [] }), null);
  });
});

describe("schemas.ts — restPointRefSchema biztonsági validáció (Sprint E.2 hotfix)", () => {
  const currentPosition = { lat: 47.5, lon: 19.05 };

  test("elfogadja az érvényes USER referenciát", () => {
    const parsed = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "USER", id: "own-1" },
    });
    assert.equal(parsed.success, true);
  });

  test("elfogadja az érvényes OSM referenciát (helyes id-formátum, tartományban lévő koordináták)", () => {
    const parsed = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "osm:node/123", name: "Nyilvános mosdó", latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(parsed.success, true);
  });

  test("elutasítja az ismeretlen source enum értéket", () => {
    const parsed = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "SOMETHING_ELSE", id: "x" },
    });
    assert.equal(parsed.success, false);
  });

  test("elutasítja a hibás formátumú OSM id-t (nincs 'osm:<type>/<szám>' alakja)", () => {
    const parsed = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "not-an-osm-id", name: "X", latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(parsed.success, false);
  });

  test("elutasítja a hibás formátumú VEDETT_SAROK id-t (hiányzó 'vedett-sarok:' prefix)", () => {
    const parsed = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "VEDETT_SAROK", id: "park-1" },
    });
    assert.equal(parsed.success, false);
  });

  test("elutasítja a tartományon kívüli OSM szélességi/hosszúsági koordinátát", () => {
    const tooFarLat = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "osm:node/1", name: "X", latitude: 95, longitude: 19.05 },
    });
    assert.equal(tooFarLat.success, false);

    const tooFarLon = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "osm:node/1", name: "X", latitude: 47.5, longitude: 185 },
    });
    assert.equal(tooFarLon.success, false);
  });

  test("elutasítja az üres/túl hosszú OSM nevet", () => {
    const empty = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "osm:node/1", name: "", latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(empty.success, false);

    const tooLong = restStopRouteToRestPointSchema.safeParse({
      currentPosition,
      restPoint: { source: "OSM", id: "osm:node/1", name: "x".repeat(201), latitude: 47.5, longitude: 19.05 },
    });
    assert.equal(tooLong.success, false);
  });
});
