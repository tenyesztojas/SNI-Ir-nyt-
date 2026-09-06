import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRouteCacheKey, getCached, setCached, clearRouteCache } from "../../lib/vedett-route/routeCache.ts";

test("ugyanazokból a paraméterekből ugyanaz a cache kulcs jön ki, kulcs-sorrendtől függetlenül", () => {
  const a = buildRouteCacheKey({ b: 1, a: 2 });
  const b = buildRouteCacheKey({ a: 2, b: 1 });
  assert.equal(a, b);
});

test("eltérő paraméterek eltérő kulcsot adnak", () => {
  const a = buildRouteCacheKey({ from: "X", to: "Y" });
  const b = buildRouteCacheKey({ from: "X", to: "Z" });
  assert.notEqual(a, b);
});

test("setCached után getCached visszaadja az értéket, lejárat után nem", async () => {
  clearRouteCache();
  const key = buildRouteCacheKey({ test: "route-cache" });
  setCached(key, { ok: true }, 20);
  assert.deepEqual(getCached(key), { ok: true });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(getCached(key), null);
});

test("nem létező kulcsra null-t ad, sosem dob kivételt", () => {
  clearRouteCache();
  assert.equal(getCached("soha-nem-letezo-kulcs"), null);
});
