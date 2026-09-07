// lib/vedett-route/config.ts + access.ts — E. pont: "Auth architektúra".
//
// FONTOS: ez STATIKUS regressziós teszt. A VEDETT_ROUTE_ACCESS_LEVEL
// konstanst valóban futásidőben importáljuk (config.ts nem függ semmilyen
// szerver-only modultól, pl. next/server-től, tehát biztonságosan
// importálható plain node --test alatt).
//
// access.ts-t VISZONT SZÁNDÉKOSAN NEM importáljuk futásidőben — az a
// modul a "next/server" NextResponse-t használja, aminek a modulfeloldása
// Next.js saját build/runtime kontextusán kívül (plain node ESM loader
// alatt) ERR_MODULE_NOT_FOUND-dal elhasal ("next/server" vs "next/server.js"
// export-map eltérés). Ezért — a projekt már meglévő mintáját követve
// (lásd rls-policy.test.ts), ahol élő DB/infra nélkül szöveg-alapú
// "policy shape" ellenőrzést végzünk — az access.ts helyességét STATIKUS,
// forráskód-szintű ellenőrzésekkel igazoljuk: létezik-e az export, és a
// forráskód ténylegesen a VEDETT_ROUTE_ACCESS_LEVEL alapján ágazik-e.
//
//   node --test __tests__/vedett-route/access-architecture.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VEDETT_ROUTE_ACCESS_LEVEL } from "../../lib/vedett-route/config.ts";

function readAccessSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "vedett-route", "access.ts"), "utf-8");
}

test("VEDETT_ROUTE_ACCESS_LEVEL jelenleg 'admin_only' (nincs aktiválva a publikus/authenticated szint)", () => {
  assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "admin_only");
});

test("access.ts exportálja a requireVedettRouteAdmin függvényt", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAdmin\s*\(/);
});

test("access.ts exportálja a requireVedettRouteAuthenticated függvényt (előkészítve, jelenleg nem aktív hívási útvonal)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAuthenticated\s*\(/);
});

test("access.ts exportálja a requireVedettRouteAccess függvényt", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAccess\s*\(/);
});

test("requireVedettRouteAuthenticated NEM végez admin/role ellenőrzést — csak bejelentkezést", () => {
  const src = readAccessSource();
  const match = src.match(/export\s+async\s+function\s+requireVedettRouteAuthenticated[\s\S]*?\n}/);
  assert.ok(match, "nem található requireVedettRouteAuthenticated függvénytest");
  assert.doesNotMatch(match![0], /profiles|role\s*!==\s*"admin"|createAdminClient/);
});

test("access.ts forráskódja ténylegesen VEDETT_ROUTE_ACCESS_LEVEL alapján ágazik admin/authenticated között", () => {
  const src = readAccessSource();
  assert.match(
    src,
    /VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"authenticated_users"\s*\?\s*await requireVedettRouteAuthenticated\(\)\s*:\s*await requireVedettRouteAdmin\(\)/
  );
});

test("rest-points API route-ok requireVedettRouteAccess()-t hívnak (list/create)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "rest-points", "route.ts"),
    "utf-8"
  );
  assert.match(src, /requireVedettRouteAccess\s*\(/);
});

test("rest-points/[id] API route-ok requireVedettRouteAccess()-t hívnak (update/delete)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "rest-points", "[id]", "route.ts"),
    "utf-8"
  );
  assert.match(src, /requireVedettRouteAccess\s*\(/);
});
