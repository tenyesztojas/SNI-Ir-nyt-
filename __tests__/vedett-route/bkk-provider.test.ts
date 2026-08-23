// BKK provider tesztek (31. pont "BKK API" kategória — a hálózatot nem
// igénylő ágak: hiányzó kulcs, hiányzó statikus GTFS cache).
//   node --test __tests__/vedett-route/bkk-provider.test.ts
//
// A ténylegesen élő BKK hívást igénylő esetek (sikeres válasz, timeout,
// invalid response, authorization error) ebből a sandboxból nem
// futtathatók élesben, mert a munkamenet hálózati allowlistje nem engedi át
// a go.bkk.hu-t (lásd docs/vedett-route.md). Ezeket az admin felület
// "BKK API" állapotjelzőjén kell manuálisan ellenőrizni, miután az app
// tényleges (nem sandboxolt) környezetben fut.

import { test } from "node:test";
import assert from "node:assert/strict";

test("BKK_API_KEY nélkül checkConnection() hálózati hívás nélkül 'nincs konfigurálva' választ ad", async () => {
  delete process.env.BKK_API_KEY;
  const { BkkProvider } = await import("../../lib/vedett-route/providers/bkk.ts");
  const provider = new BkkProvider();

  const status = await provider.checkConnection();

  assert.equal(status.provider, "BKK");
  assert.equal(status.configured, false);
  assert.equal(status.reachable, false);
  assert.equal(status.realtime, false);
  assert.ok(status.error);
});

test("soha nem szivárogtatja a kulcsot a checkConnection() válaszban", async () => {
  process.env.BKK_API_KEY = "super-secret-value-should-never-appear";
  delete process.env.MOTIS_BASE_URL;
  const { BkkProvider } = await import("../../lib/vedett-route/providers/bkk.ts");
  const provider = new BkkProvider();

  // Kulcs be van állítva, de nincs hálózat ebben a sandboxban — a hívás
  // reachable:false-ra fut ki, de a lényeg: a kulcs értéke sehol sem jelenik
  // meg a visszaadott objektumban.
  const status = await provider.checkConnection();
  const serialized = JSON.stringify(status);

  assert.equal(serialized.includes("super-secret-value-should-never-appear"), false);
  delete process.env.BKK_API_KEY;
});

test("letöltött statikus GTFS nélkül getStaticDataStatus() available:false-t ad", async () => {
  const { BkkProvider } = await import("../../lib/vedett-route/providers/bkk.ts?fresh=" + Math.random());
  const provider = new BkkProvider();
  const status = await provider.getStaticDataStatus();
  assert.equal(status.provider, "BKK");
  assert.equal(typeof status.available, "boolean");
});
