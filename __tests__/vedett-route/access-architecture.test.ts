// lib/vedett-route/config.ts + access.ts — E. pont: "Auth architektúra".
//
// FRISSÍTVE (2026-09-09, ZÁRT BÉTA HOZZÁFÉRÉS): ez a fájl korábban azt
// várta, hogy VEDETT_ROUTE_ACCESS_LEVEL mindig "admin_only" legyen, és
// hogy access.ts csak KÉTÁGÚ (authenticated_users / admin_only)
// logika alapján döntsön. Ez a feltevés SZÁNDÉKOSAN elavulttá vált: a
// "ZÁRT BÉTA HOZZÁFÉRÉS + MENÜRENDSZER" sprint aktiválta a korábban csak
// előkészített "beta_testers" szintet (lásd lib/vedett-route/config.ts),
// és access.ts requireVedettRouteAccess()-e mostantól HÁROMÁGÚ:
//   authenticated_users -> requireVedettRouteAuthenticated()
//   beta_testers         -> requireVedettRouteBetaAccess()
//   egyéb (pl. admin_only) -> requireVedettRouteAdmin()  [fallback]
// A jelen fájl ezt az ÚJ, szándékos architektúrát ellenőrzi — NEM állítja
// vissza a production kódot admin_only-ra, csak a regressziós tesztet
// igazítja a már megvalósított, szándékos állapothoz.
//
// FONTOS: ez STATIKUS regressziós teszt. A VEDETT_ROUTE_ACCESS_LEVEL és
// VEDETT_ROUTE_BETA_FEATURE_KEY konstansokat valóban futásidőben
// importáljuk (config.ts nem függ semmilyen szerver-only modultól, pl.
// next/server-től, tehát biztonságosan importálható plain node --test
// alatt).
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
//   node --test --experimental-strip-types __tests__/vedett-route/access-architecture.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VEDETT_ROUTE_ACCESS_LEVEL, VEDETT_ROUTE_BETA_FEATURE_KEY } from "../../lib/vedett-route/config.ts";

function readAccessSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "vedett-route", "access.ts"), "utf-8");
}

// ── A) ────────────────────────────────────────────────────────────────────
test("A) VEDETT_ROUTE_ACCESS_LEVEL jelenleg 'beta_testers' (a ZÁRT BÉTA szint aktív — SZÁNDÉKOS, nem admin_only)", () => {
  assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "beta_testers");
});

test("access.ts exportálja a requireVedettRouteAdmin függvényt", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAdmin\s*\(/);
});

test("access.ts exportálja a requireVedettRouteAuthenticated függvényt (előkészítve, jelenleg nem aktív hívási útvonal)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAuthenticated\s*\(/);
});

// ── B) ────────────────────────────────────────────────────────────────────
test("B) access.ts exportálja a requireVedettRouteBetaAccess függvényt (a beta_testers szint tényleges implementációja)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteBetaAccess\s*\(/);
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

// ── B/C/D) HÁROMÁGÚ útvonalválasztás ────────────────────────────────────────
test("B/C/D) access.ts forráskódja ténylegesen HÁROMÁGÚAN dönt VEDETT_ROUTE_ACCESS_LEVEL alapján: authenticated_users -> requireVedettRouteAuthenticated, beta_testers -> requireVedettRouteBetaAccess, egyéb -> requireVedettRouteAdmin (fallback)", () => {
  const src = readAccessSource();
  assert.match(
    src,
    /VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"authenticated_users"\s*\?\s*await requireVedettRouteAuthenticated\(\)\s*:\s*VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"beta_testers"\s*\?\s*await requireVedettRouteBetaAccess\(\)\s*:\s*await requireVedettRouteAdmin\(\)/,
    "a requireVedettRouteAccess()-nek a régi kétágú (authenticated/admin) helyett HÁROMÁGÚ elágazást kell tartalmaznia, a beta_testers ággal requireVedettRouteBetaAccess()-re mutatva"
  );
});

test("C) az 'authenticated_users' ág VÁLTOZATLANUL megmaradt — a háromágú kifejezésben szó szerint jelen van", () => {
  const src = readAccessSource();
  assert.match(src, /VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"authenticated_users"/);
});

test("D) az 'admin_only' (és minden más, nem authenticated_users/beta_testers) eset a requireVedettRouteAdmin() FALLBACK ágra esik — nincs elveszett admin-only védelem", () => {
  const src = readAccessSource();
  const fnMatch = src.match(/export\s+async\s+function\s+requireVedettRouteAccess[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "requireVedettRouteAccess() függvénynek léteznie kell");
  assert.match(
    fnMatch![0],
    /:\s*await requireVedettRouteAdmin\(\);/,
    "a ternary utolsó ágának requireVedettRouteAdmin()-nek kell lennie — ez az admin_only fallback"
  );
});

// ── E/F/G/H) hasVedettRouteBetaAccess() döntési logika ─────────────────────
test("E) admin ág feltétel nélkül, a grant-ellenőrzés ELŐTT igazat ad — admin grant nélkül is hozzáfér", () => {
  const src = readAccessSource();
  assert.match(src, /if \(profile\.role === "admin"\) return true;/);
});

test("F) a 'vedett_route_beta' pilot_access grantet hordozó felhasználó (nem admin) hozzáfér — a nem-admin ág pontosan VEDETT_ROUTE_BETA_FEATURE_KEY-t nézi", () => {
  const src = readAccessSource();
  assert.equal(VEDETT_ROUTE_BETA_FEATURE_KEY, "vedett_route_beta");
  assert.match(src, /pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\)/);
});

test("G) normál, bejelentkezett (nem admin, nincs grant) felhasználó TILTOTT — nincs implicit 'true' fallback, a függvény false-ra fut ki", () => {
  const src = readAccessSource();
  assert.match(src, /if \(!profile\) return false;/);
  // A nem-admin ág visszatérési értéke maga a pilotAccess.includes(...)
  // logikai kifejezés eredménye — nincs utána feltétlen `return true`.
  const fnMatch = src.match(/export function hasVedettRouteBetaAccess[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  assert.match(fnMatch![0], /return pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\);\s*\n}/);
});

test("H) egy MÁSIK pilot_access modul grantje (pl. 'vedettmunka') nem ad Védett Útvonal jogot — a kulcs-összehasonlítás EXAKT, nem 'bármilyen grant elég'", () => {
  const src = readAccessSource();
  assert.ok(
    !/pilotAccess\.length\s*>\s*0/.test(src),
    "nem szabad 'bármilyen pilot modul grantje elég' típusú logikának lennie"
  );
  assert.ok(
    !/pilotAccess\.includes\(["'`](?!vedett_route_beta)/.test(src) ||
      /pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\)/.test(src),
    "a hozzáférési döntésnek a VEDETT_ROUTE_BETA_FEATURE_KEY konstansra kell szűkülnie, nem egy másik/hardcode-olt kulcsra"
  );
});

// ── I) globális kill switch — admin/tester sem bypassolja ──────────────────
test("I) VEDETT_ROUTE_ENABLED=false esetén MÉG admin/tester hozzáférés-check sikere UTÁN is Forbidden a válasz — nincs admin/tester-specifikus bypass a kill switch körül", () => {
  const src = readAccessSource();
  const fnMatch = src.match(/export\s+async\s+function\s+requireVedettRouteAccess[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch![0];
  assert.match(fnBody, /if \(!authCheck\.ok\) return authCheck;/, "az auth/permission check-nek a kill switch check ELŐTT kell lefutnia");
  assert.match(fnBody, /if \(!isVedettRouteFeatureEnabled\(\)\)/);
  const killSwitchIdx = fnBody.indexOf("if (!isVedettRouteFeatureEnabled())");
  const surrounding = fnBody.slice(killSwitchIdx, killSwitchIdx + 300);
  assert.ok(
    !/role === "admin"/.test(surrounding) && !/isAdmin/.test(surrounding),
    "a kill switch ellenőrzés közelében nem szabad admin/tester-bypass feltételnek lennie — a flag mindenkit kizár, ha ki van kapcsolva"
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
