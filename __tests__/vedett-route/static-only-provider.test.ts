// StaticOnlyGtfsProvider tesztek (MÁV/Volán — Fázis 2). Ellenőrzi, hogy
// feltöltés hiányában őszintén "nincs adat"-ot jelent, és hogy a
// realtime-metódusok sosem adnak kitalált adatot, csak üres tömböt.
//   node --test __tests__/vedett-route/static-only-provider.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { StaticOnlyGtfsProvider } from "../../lib/vedett-route/providers/staticFileProvider.ts";

test("még fel nem töltött MÁV_RAIL provider checkConnection() 'nincs feltöltve' állapotot ad", async () => {
  // Egyedi, garantáltan nem létező cache-alkönyvtár nevet használunk, hogy a
  // teszt ne függjön attól, történt-e korábban valódi feltöltés ezen a gépen.
  const provider = new StaticOnlyGtfsProvider("MAV_RAIL", "__test_never_uploaded__", "MÁV (vasút, teszt)");
  const status = await provider.checkConnection();
  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.realtime, false);
  assert.ok(status.error);
});

test("realtime metódusok mindig üres tömböt adnak, sosem dobnak kivételt", async () => {
  const provider = new StaticOnlyGtfsProvider("MAV_BUS", "__test_never_uploaded__", "MÁV/Volán (teszt)");
  assert.deepEqual(await provider.getServiceAlerts(), []);
  assert.deepEqual(await provider.getTripUpdates(), []);
  assert.deepEqual(await provider.getVehiclePositions(), []);
});

test("refreshStaticData() explicit hibát dob (nincs automatikus letöltés dokumentált API nélkül)", async () => {
  const provider = new StaticOnlyGtfsProvider("MAV_RAIL", "__test_never_uploaded__", "MÁV (vasút, teszt)");
  await assert.rejects(() => provider.refreshStaticData());
});
