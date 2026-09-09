// Feature flag + API key konfiguráció tesztek (31. pont "Feature flag" és
// "API key" kategóriák). Node beépített test runnerével fut, nincs
// szükség külön test-framework telepítésére:
//   node --test __tests__/vedett-route/config.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

async function freshConfigModule() {
  // A modult minden teszt előtt újra kell importálni egy cache-busting query
  // paraméterrel, mert a process.env-et módosítjuk tesztek között, és a
  // config.ts a modul betöltésekor, nem híváskor olvassa ki azt.
  const url = new URL("../../lib/vedett-route/config.ts", import.meta.url);
  url.searchParams.set("t", String(Math.random()));
  return import(url.href);
}

test("VEDETT_ROUTE_ENABLED=false esetén a feature flag ki van kapcsolva", async () => {
  process.env.VEDETT_ROUTE_ENABLED = "false";
  const { isVedettRouteFeatureEnabled } = await freshConfigModule();
  assert.equal(isVedettRouteFeatureEnabled(), false);
});

test("VEDETT_ROUTE_ENABLED=true esetén a feature flag be van kapcsolva", async () => {
  process.env.VEDETT_ROUTE_ENABLED = "true";
  const { isVedettRouteFeatureEnabled } = await freshConfigModule();
  assert.equal(isVedettRouteFeatureEnabled(), true);
});

test("bármilyen más érték (pl. elgépelés) a flaget kikapcsolt állapotnak tekinti", async () => {
  process.env.VEDETT_ROUTE_ENABLED = "TRUE"; // szándékosan rossz casing
  const { isVedettRouteFeatureEnabled } = await freshConfigModule();
  assert.equal(isVedettRouteFeatureEnabled(), false);
});

test("BKK_API_KEY hiányában isBkkApiKeyConfigured() false", async () => {
  delete process.env.BKK_API_KEY;
  const { isBkkApiKeyConfigured } = await freshConfigModule();
  assert.equal(isBkkApiKeyConfigured(), false);
});

test("üres string BKK_API_KEY esetén isBkkApiKeyConfigured() false", async () => {
  process.env.BKK_API_KEY = "   ";
  const { isBkkApiKeyConfigured } = await freshConfigModule();
  assert.equal(isBkkApiKeyConfigured(), false);
});

test("beállított BKK_API_KEY esetén isBkkApiKeyConfigured() true", async () => {
  process.env.BKK_API_KEY = "test-key-value";
  const { isBkkApiKeyConfigured } = await freshConfigModule();
  assert.equal(isBkkApiKeyConfigured(), true);
  delete process.env.BKK_API_KEY;
});

test("MOTIS_BASE_URL nélkül getMotisBaseUrl() null-t ad vissza", async () => {
  delete process.env.MOTIS_BASE_URL;
  const { getMotisBaseUrl } = await freshConfigModule();
  assert.equal(getMotisBaseUrl(), null);
});

test("A) VEDETT_ROUTE_ACCESS_LEVEL a ZÁRT BÉTA HOZZÁFÉRÉS sprint óta 'beta_testers' (nem admin_only), függetlenül az env-től", async () => {
  // FRISSÍTVE (2026-09-09): a korábbi "Fázis 1" állapotban ez a konstans
  // mindig "admin_only" volt. A "ZÁRT BÉTA HOZZÁFÉRÉS + MENÜRENDSZER"
  // sprint SZÁNDÉKOSAN aktiválta a korábban csak előkészített
  // "beta_testers" szintet (lásd lib/vedett-route/config.ts és
  // access-architecture.test.ts a háromágú útvonalválasztás tesztjéért).
  // Ez a teszt nem regresszió-e, hanem a ténylegesen megvalósított,
  // szándékos architektúrát igazolja.
  const { VEDETT_ROUTE_ACCESS_LEVEL } = await freshConfigModule();
  assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "beta_testers");
});
