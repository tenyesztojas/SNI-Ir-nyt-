// Sprint E Preparation Gate — a jövőbeli rerouting request-építő tesztjei.
// FONTOS: ez a modul NEM hív hálózatot (lásd rerouteRequest.ts fejléce) —
// ezek a tesztek kizárólag a paraméter-összeállítás helyességét
// ellenőrzik.
//   node --test __tests__/vedett-route/rest-stop-reroute-request.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRerouteToOriginalDestinationRequest } from "../../lib/vedett-route/restStopFlow/rerouteRequest.ts";

const ORIGINAL_DESTINATION = { name: "Astoria", lat: 47.4952, lon: 19.0616 };

test("a fromPlace a pihenőpont/aktuális pozíció koordinátáiból épül, a toPlace az EREDETI célból, sosem a pihenőpontból", () => {
  const params = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION, "2026-09-07T12:00:00.000Z");
  assert.equal(params.fromPlace, "47.5,19.05");
  assert.equal(params.toPlace, `${ORIGINAL_DESTINATION.lat},${ORIGINAL_DESTINATION.lon}`);
});

test("departAt megadása esetén pontosan azt használja (determinisztikus, tesztelhető)", () => {
  const params = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION, "2026-09-07T12:00:00.000Z");
  assert.equal(params.time, "2026-09-07T12:00:00.000Z");
});

test("departAt hiányában 'most'-ot használ (valós ISO timestampet ad, nem üres/undefined)", () => {
  const before = Date.now();
  const params = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION);
  const after = Date.now();
  assert.ok(params.time);
  const parsed = new Date(params.time as string).getTime();
  assert.ok(parsed >= before && parsed <= after);
});

test("numItineraries alapértelmezett értéke 4, de felülírható", () => {
  const defaultParams = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION);
  assert.equal(defaultParams.numItineraries, 4);
  const customParams = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION, undefined, 6);
  assert.equal(customParams.numItineraries, 6);
});

test("a visszaadott objektum kizárólag a hivatalos, dokumentált MOTIS /api/v6/plan mezőket tartalmazza (fromPlace/toPlace/time/numItineraries)", () => {
  const params = buildRerouteToOriginalDestinationRequest({ lat: 47.5, lon: 19.05 }, ORIGINAL_DESTINATION, "2026-09-07T12:00:00.000Z");
  assert.deepEqual(Object.keys(params).sort(), ["fromPlace", "numItineraries", "time", "toPlace"]);
});
