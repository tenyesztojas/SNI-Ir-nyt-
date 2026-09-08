// Sprint E.2 hotfix (2026-09-08) — a pihenőponthoz vezető MOTIS routing
// regresszió-tesztjei, a valódi Vercel Preview 404 incidens root cause
// auditja után (a resolution-lánc ezután a MOTIS-ig ér).
//
//   node --test --experimental-strip-types __tests__/vedett-route/route-to-rest-point-motis-hardening.test.ts
//
// LEFEDI:
//   F) a pont sikeresen feloldódik, de a MOTIS 0 itineraryt ad ->
//      pickBestItinerary() null-t ad (a route.ts ebből REST_POINT_NO_ROUTE-ot csinál)
//   G) egy WALK-only (nincs semmilyen tranzit láb, transfers=0) itinerary
//      elfogadott — nincs mode-alapú kizárás pickBestItinerary()-ban vagy
//      mapMotisItineraryToJourney()-ban
//   H) buildRouteToRestPointRequest() nem cseréli fel a lat/lont — a
//      "fromPlace"/"toPlace" mindig "lat,lon" sorrendben épül

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pickBestItinerary } from "../../lib/vedett-route/restStopFlow/pickBestItinerary.ts";
import { buildRouteToRestPointRequest } from "../../lib/vedett-route/restStopFlow/rerouteRequest.ts";
import { mapMotisItineraryToJourney } from "../../lib/vedett-route/orchestrator.ts";
import type { MotisItinerary } from "../../lib/vedett-route/motisTypes.ts";

function makeWalkOnlyItinerary(overrides: Partial<MotisItinerary> = {}): MotisItinerary {
  return {
    duration: 300,
    startTime: "2026-09-08T10:00:00.000Z",
    endTime: "2026-09-08T10:05:00.000Z",
    transfers: 0,
    legs: [
      {
        mode: "WALK",
        from: { name: "Jelenlegi hely", lat: 47.5, lon: 19.05 },
        to: { name: "Nyilvános mosdó", lat: 47.5003, lon: 19.0503 },
        duration: 300,
        distance: 34,
      },
    ],
    ...overrides,
  };
}

describe("route-to-rest-point MOTIS lánc (Sprint E.2 hotfix, 2026-09-08)", () => {
  test("F) sikeres feloldás után 0 MOTIS itinerary -> pickBestItinerary() null-t ad (a route.ts innen REST_POINT_NO_ROUTE-ot jelez)", () => {
    const best = pickBestItinerary([]);
    assert.equal(best, null);
  });

  test("G) egyetlen, WALK-only (transfers=0, nincs tranzit láb) itinerary NEM esik ki — pickBestItinerary() és mapMotisItineraryToJourney() is elfogadja", () => {
    const walkOnly = makeWalkOnlyItinerary();
    const best = pickBestItinerary([walkOnly]);
    assert.ok(best, "egy egyetlen, kizárólag gyaloglásból álló itinerary-t is el kell fogadni, nem szabad mode alapján kiszűrni");
    assert.equal(best, walkOnly);

    const journey = mapMotisItineraryToJourney(best!, { from: "Jelenlegi hely", to: "Nyilvános mosdó" });
    assert.equal(journey.transfers, 0);
    assert.ok(journey.legs.length > 0);
    assert.equal(journey.legs[0].mode, "WALK");
    // A teljes utazási idő gyaloglásból áll — ez a "34 m-re lévő
    // pihenőpont, tisztán gyalogos itinerary" valós Preview esetet
    // reprodukálja.
    assert.equal(journey.walkingMinutes, journey.totalDurationMinutes);
  });

  test("G/2) egy MOTIS 'direct' (nem 'itineraries') tömbben érkező walk-only itinerary ugyanúgy választható, mint egy 'itineraries'-beli", () => {
    const direct = [makeWalkOnlyItinerary({ duration: 120 })];
    const itineraries: MotisItinerary[] = [];
    // A route.ts pontosan így egyesíti a két tömböt MOTIS válaszból,
    // MIELŐTT pickBestItinerary()-t hívja — itt ugyanazt a lépést
    // reprodukáljuk.
    const merged = [...itineraries, ...direct];
    const best = pickBestItinerary(merged);
    assert.ok(best);
    assert.equal(best!.duration, 120);
  });

  test("H) buildRouteToRestPointRequest() nem cseréli fel a lat/lont — a from és a pihenőpont koordinátája is 'lat,lon' sorrendben kerül a fromPlace/toPlace mezőkbe", () => {
    const from = { lat: 47.1111, lon: 19.2222 };
    const restPoint = { latitude: 47.3333, longitude: 19.4444 };

    const params = buildRouteToRestPointRequest(from, restPoint, "2026-09-08T10:00:00.000Z");

    assert.equal(params.fromPlace, "47.1111,19.2222", "fromPlace-nek 'lat,lon' sorrendben kell lennie, nem 'lon,lat'-ként");
    assert.equal(params.toPlace, "47.3333,19.4444", "toPlace-nek (a pihenőpont célja) is 'lat,lon' sorrendben kell lennie");
    assert.notEqual(params.fromPlace, "19.2222,47.1111", "nem szabad, hogy a lat/lon fel legyen cserélve");
    assert.notEqual(params.toPlace, "19.4444,47.3333", "nem szabad, hogy a lat/lon fel legyen cserélve");
  });
});
