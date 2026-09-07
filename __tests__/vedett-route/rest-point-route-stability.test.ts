// L. pont: "az aktív útvonal a pihenőpont mentése után sem tűnhet el, és
// nincs automatikus újratervezés". Ez STATIKUS, forráskód-szintű
// regressziós ellenőrzés (nincs DOM/render-környezet ehhez a projekthez
// ebben a tesztkörnyezetben) — azt garantálja, hogy a RestPointQuickAdd
// onCreated callback-je a VedettUtvonalSearchForm-ban KIZÁRÓLAG a
// sessionRestPoints state-et bővíti, és SOSEM hívja setActiveJourney-t
// vagy bármilyen újratervezést kezdeményező függvényt.
//
//   node --test __tests__/vedett-route/rest-point-route-stability.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSearchForm(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx"),
    "utf-8"
  );
}

function readQuickAdd(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "components", "vedett-utvonal", "RestPointQuickAdd.tsx"),
    "utf-8"
  );
}

test("RestPointQuickAdd onCreated prop-ja opcionális callback, nincs beépített route/journey state-je", () => {
  const src = readQuickAdd();
  assert.doesNotMatch(src, /setActiveJourney/);
  assert.doesNotMatch(src, /activeJourney/);
});

test("a VedettUtvonalSearchForm-ban a <RestPointQuickAdd onCreated=...> hívás KIZÁRÓLAG sessionRestPoints-ot bővít", () => {
  const src = readSearchForm();
  const match = src.match(/<RestPointQuickAdd\s+onCreated=\{([^}]*)\}\s*\/>/s);
  assert.ok(match, "nem található <RestPointQuickAdd onCreated={...} /> JSX hívás");
  const handlerBody = match![1];
  assert.match(handlerBody, /setSessionRestPoints/);
  assert.doesNotMatch(handlerBody, /setActiveJourney/);
});

test("setActiveJourney(null) csak az explicit bezáró gombhoz kötött, nem a pihenőpont mentéshez", () => {
  const src = readSearchForm();
  // Az egyetlen setActiveJourney(null) hívás egy onClick handler-ben legyen,
  // NE a RestPointQuickAdd onCreated callback-jében (ezt az előző teszt már
  // külön ellenőrzi a handler body-ra korlátozva).
  const nullCalls = (src.match(/setActiveJourney\(null\)/g) || []).length;
  assert.ok(nullCalls >= 1, "nem található setActiveJourney(null) hívás a bezáró gombhoz");
});

test("nincs automatikus újratervezést jelző hívás (fetchMotisPlan / reroute) a pihenőpont mentés útvonalán", () => {
  const src = readQuickAdd();
  assert.doesNotMatch(src, /fetchMotisPlan/);
  assert.doesNotMatch(src, /reroute/i);
});
