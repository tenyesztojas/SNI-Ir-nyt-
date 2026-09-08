// Sprint E — biztonsági/privacy regressziós tesztek, statikus forrás-
// vizsgálattal (ugyanaz a technika, mint
// __tests__/vedett-route/build-time-network-safety.test.ts és
// __tests__/vedett-route/access-architecture.test.ts — a Next.js route
// handlerek "next/server"-t importálnak, ami plain node:test alatt nem
// oldható fel, ezért a VALÓS forrásfájl szövegét vizsgáljuk, nem futtatjuk
// a modult).
//
//   node --test __tests__/vedett-route/rest-stop-security-regression.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

const REST_STOP_API_FILES = [
  "app/api/vedett-route/rest-stops/nearby/route.ts",
  "app/api/vedett-route/rest-stops/route-to-rest-point/route.ts",
  "app/api/vedett-route/rest-stops/resume/route.ts",
];

test("a rest-stop API végpontok egyike sem logolja a nyers GPS koordinátát (vedettRouteLog hívások nem tartalmaznak lat/lon/currentPosition szót)", () => {
  for (const file of REST_STOP_API_FILES) {
    const src = read(file);
    const logCalls = src.match(/vedettRouteLog\([^;]*\)/gs) ?? [];
    for (const call of logCalls) {
      assert.doesNotMatch(call, /\blat\b/i, `${file}: vedettRouteLog hívás nem tartalmazhat lat mezőt`);
      assert.doesNotMatch(call, /\blon\b/i, `${file}: vedettRouteLog hívás nem tartalmazhat lon mezőt`);
      assert.doesNotMatch(call, /currentPosition/, `${file}: vedettRouteLog hívás nem tartalmazhatja a currentPosition objektumot`);
    }
  }
});

test("a rest-stop API végpontok egyike sem használ console.log-ot nyers kérés-body-val (ami tartalmazhatna GPS koordinátát)", () => {
  for (const file of REST_STOP_API_FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /console\.log\([^)]*body/i, `${file}: nem logolhatja a nyers kérés body-t`);
  }
});

test("RestStopFlowPanel.tsx (kliens komponens) nem hivatkozik a ROUTE_SERVICE_AUTH_TOKEN env változóra — a route-service secret kizárólag szerver oldalon él", () => {
  const src = read("components/vedett-utvonal/RestStopFlowPanel.tsx");
  assert.doesNotMatch(src, /ROUTE_SERVICE_AUTH_TOKEN/);
  assert.doesNotMatch(src, /process\.env\.\w*SECRET/i);
});

test("RestStopFlowPanel.tsx sosem hívja közvetlenül a MOTIS-t vagy a route service-t — csak a saját Next.js API végpontjait (/api/vedett-route/rest-stops/...)", () => {
  const src = read("components/vedett-utvonal/RestStopFlowPanel.tsx");
  const apiLiterals = src.match(/"\/api\/[^"]*"/g) ?? [];
  assert.ok(apiLiterals.length > 0, "legalább egy /api/ útvonal literálnak lennie kell");
  for (const literal of apiLiterals) {
    assert.match(literal, /^"\/api\/vedett-route\/rest-stops\//, `${literal}: csak a saját API végpontokat hívhatja`);
  }
  assert.doesNotMatch(src, /motis|8080|8081/i);
});

test("a rest-stop API route-ok mindegyike a requireVedettRouteAccess() jogosultság-ellenőrzésen keresztül fut (nincs védetlen végpont)", () => {
  for (const file of REST_STOP_API_FILES) {
    const src = read(file);
    assert.match(src, /requireVedettRouteAccess\(\)/, `${file}: hiányzik a requireVedettRouteAccess() hívás`);
  }
});

test("a /resume végpont mindig ÚJ fetchMotisPlan() hívást indít (nincs cache-elt/újrafelhasznált korábbi itinerary a pihenőpont előtti keresésből)", () => {
  const src = read("app/api/vedett-route/rest-stops/resume/route.ts");
  assert.match(src, /fetchMotisPlan\(/);
  assert.doesNotMatch(src, /routeCache|getCached|setCached/);
});
