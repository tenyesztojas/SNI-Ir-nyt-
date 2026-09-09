// lib/vedett-route/config.ts + access.ts — E. pont: "Auth architektúra".
//
// FRISSÍTVE (2026-09-09, "Zárt béta → nyilvános, regisztrált felhasználói
// béta" release): ez a fájl korábban azt várta, hogy VEDETT_ROUTE_ACCESS_LEVEL
// "beta_testers" legyen (admin VAGY explicit `vedett_route_beta` pilot_access
// grant szükséges). Ez a feltevés SZÁNDÉKOSAN elavulttá vált: a Védett
// Útvonal a jelen release-től BÁRMELY bejelentkezett, regisztrált
// felhasználó számára elérhető — a "authenticated_users" szint, ami korábban
// csak előkészítve, de nem aktívan volt jelen access.ts-ben, most VÁLIK
// AKTÍVVÁ. access.ts requireVedettRouteAccess() HÁROMÁGÚ döntése (és a
// beta_testers/admin_only ágak) NEM változott — csak a config.ts konstans.
// A jelen fájl ezt az ÚJ, szándékos állapotot ellenőrzi — NEM állítja vissza
// a production kódot beta_testers-re vagy admin_only-ra, csak a regressziós
// tesztet igazítja a már megvalósított, szándékos architektúrához.
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
// ROBUSZTUSSÁG (2026-09-09, integrate/vedett-utvonal-beta cherry-pick
// audit): a függvénytest kivágása egy DETERMINISZTIKUS, kapcsos-zárójel-
// mélység alapú extractFunctionSource() helperen keresztül történik, ami
// sortörés-formátumtól (LF/CRLF), whitespace-től és a formázási stílustól
// függetlenül, kizárólag a tényleges nyitó/záró kapcsos zárójelek egyensúlya
// alapján találja meg a függvény végét (string- és kommentliterálokat
// kihagyva).
//
//   node --test __tests__/vedett-route/access-architecture.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VEDETT_ROUTE_ACCESS_LEVEL, VEDETT_ROUTE_BETA_FEATURE_KEY } from "../../lib/vedett-route/config.ts";

function readAccessSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "vedett-route", "access.ts"), "utf-8");
}

/**
 * Determinisztikus, kapcsos-zárójel-mélység alapú függvénytest-kivágó.
 *
 * Megkeresi a "function <name>(" szignatúrát (opcionális export/async
 * előtaggal), majd a paraméterlistát ZÁRÓJEL-MÉLYSÉG SZERINT átugorja
 * (fontos, mert egy paraméter TÍPUSA, pl. "profile: { role?: string | null }",
 * saját nyitó/záró kapcsos zárójel-párt tartalmazhat, amit a függvénytest
 * keresésekor félre kell tudni tenni), majd a paraméterlista lezárása utáni
 * ELSŐ nyitó kapcsos zárójeltől indulva, karakterenkénti mélységszámlálással
 * megkeresi a függvénytestet lezáró kapcsos zárójelet — string-literálokat
 * és kommenteket kihagyva, hogy egy string/komment tartalmában szereplő
 * zárójel-karakter ne torzítsa a számlálást.
 *
 * Sortörés-formátumtól (LF/CRLF), whitespace-től és a konkrét Prettier-
 * formázástól TELJESEN FÜGGETLEN — csak a tényleges kód-struktúrán alapul.
 *
 * Visszaadja a teljes függvényforrást (a szignatúra elejétől a lezáró
 * kapcsos zárójelig), vagy null-t, ha a függvény nem található.
 */
function extractFunctionSource(src: string, name: string): string | null {
  const sigRe = new RegExp("(export\\s+)?(async\\s+)?function\\s+" + name + "\\s*\\(");
  const sigMatch = sigRe.exec(src);
  if (!sigMatch) return null;

  const start = sigMatch.index;

  let parenDepth = 1;
  let i = sigMatch.index + sigMatch[0].length;
  for (; i < src.length && parenDepth > 0; i++) {
    const c = src[i];
    if (c === "(") parenDepth++;
    else if (c === ")") parenDepth--;
  }
  if (parenDepth !== 0) return null;

  const braceStart = src.indexOf("{", i);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let j = braceStart; j < src.length; j++) {
    const c = src[j];
    const prev = src[j - 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === "*" && c === "/") inBlockComment = false;
      continue;
    }
    if (inString) {
      if (c === "\\") { j++; continue; }
      if (c === inString) inString = null;
      continue;
    }

    if (c === "/" && src[j + 1] === "/") { inLineComment = true; continue; }
    if (c === "/" && src[j + 1] === "*") { inBlockComment = true; continue; }
    if (c === "\"" || c === "'" || c === "`") { inString = c; continue; }

    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return src.slice(start, j + 1);
      }
    }
  }
  return null;
}

// ── config szint ────────────────────────────────────────────────────────
test("A) VEDETT_ROUTE_ACCESS_LEVEL jelenleg 'authenticated_users' (a PUBLIKUS, REGISZTRÁLT FELHASZNÁLÓI BÉTA szint aktív — SZÁNDÉKOS, nem beta_testers/admin_only)", () => {
  assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "authenticated_users");
});

test("access.ts exportálja a requireVedettRouteAdmin függvényt (admin_only fallback, megmarad)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAdmin\s*\(/);
});

test("access.ts exportálja a requireVedettRouteAuthenticated függvényt (az AKTÍV hívási útvonal az authenticated_users szinten)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAuthenticated\s*\(/);
});

test("access.ts exportálja a requireVedettRouteBetaAccess függvényt (a korábbi beta_testers szint implementációja — megmarad backwards compatibility / rollback miatt, jelenleg nem aktív ág)", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteBetaAccess\s*\(/);
});

test("access.ts exportálja a requireVedettRouteAccess függvényt", () => {
  const src = readAccessSource();
  assert.match(src, /export\s+async\s+function\s+requireVedettRouteAccess\s*\(/);
});

// ── C/D/E/F/G) requireVedettRouteAuthenticated() — az aktív ág ─────────────
test("C) requireVedettRouteAuthenticated(): kijelentkezett/nincs user -> 401 Unauthorized", () => {
  const src = readAccessSource();
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAuthenticated");
  assert.ok(fnSrc, "requireVedettRouteAuthenticated() függvénynek léteznie kell");
  assert.match(fnSrc!, /if \(!user\)/);
  assert.match(fnSrc!, /status:\s*401/);
});

test("D/E/F/G) requireVedettRouteAuthenticated() NEM végez admin/role/pilot_access ellenőrzést — MINDEN bejelentkezett felhasználó (normál user, admin, üres pilot_access, más modul grantje) egyformán PASS-ol, kizárólag a bejelentkezés ténye dönt", () => {
  const src = readAccessSource();
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAuthenticated");
  assert.ok(fnSrc, "requireVedettRouteAuthenticated() függvénynek léteznie kell");
  // Nincs profil-lekérdezés, admin client, role vagy pilot_access hivatkozás
  // — a döntés kizárólag a supabase.auth.getUser() eredményén alapul.
  assert.doesNotMatch(
    fnSrc!,
    /profiles|pilot_access|pilotAccess|role\s*!==\s*"admin"|role\s*===\s*"admin"|createAdminClient/,
    "requireVedettRouteAuthenticated() nem hivatkozhat role/pilot_access/profiles adatra — minden bejelentkezett usernek egyformán PASS-olnia kell"
  );
  // Bejelentkezett user esetén feltétel nélkül { ok: true, userId } jön
  // vissza — nincs második, szűkítő feltétel a !user ág után.
  assert.match(fnSrc!, /return\s*\{\s*ok:\s*true,\s*userId:\s*user\.id\s*\};/);
});

// ── B/C/D) HÁROMÁGÚ útvonalválasztás ────────────────────────────────────────
test("B/C/D) access.ts forráskódja ténylegesen HÁROMÁGÚAN dönt VEDETT_ROUTE_ACCESS_LEVEL alapján: authenticated_users -> requireVedettRouteAuthenticated, beta_testers -> requireVedettRouteBetaAccess, egyéb -> requireVedettRouteAdmin (fallback) — ez a switch NEM változott, csak a config.ts konstans", () => {
  const src = readAccessSource();
  assert.match(
    src,
    /VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"authenticated_users"\s*\?\s*await requireVedettRouteAuthenticated\(\)\s*:\s*VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"beta_testers"\s*\?\s*await requireVedettRouteBetaAccess\(\)\s*:\s*await requireVedettRouteAdmin\(\)/,
    "a requireVedettRouteAccess()-nek HÁROMÁGÚ elágazást kell tartalmaznia, az authenticated_users ággal requireVedettRouteAuthenticated()-re mutatva"
  );
});

test("az 'authenticated_users' ág szó szerint jelen van a háromágú kifejezésben", () => {
  const src = readAccessSource();
  assert.match(src, /VEDETT_ROUTE_ACCESS_LEVEL\s*===\s*"authenticated_users"/);
});

test("az 'admin_only' (és minden más, nem authenticated_users/beta_testers) eset a requireVedettRouteAdmin() FALLBACK ágra esik — nincs elveszett admin-only védelem", () => {
  const src = readAccessSource();
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAccess");
  assert.ok(fnSrc, "requireVedettRouteAccess() függvénynek léteznie kell");
  assert.match(
    fnSrc!,
    /:\s*await requireVedettRouteAdmin\(\);/,
    "a ternary utolsó ágának requireVedettRouteAdmin()-nek kell lennie — ez az admin_only fallback"
  );
});

// ── hasVedettRouteBetaAccess() — megmaradó, jelenleg nem aktív logika ──────
test("hasVedettRouteBetaAccess(): admin ág feltétel nélkül, a grant-ellenőrzés ELŐTT igazat ad (a beta_testers ág logikája, backwards-compat, jelenleg nem az aktív útvonal)", () => {
  const src = readAccessSource();
  assert.match(src, /if \(profile\.role === "admin"\) return true;/);
});

test("hasVedettRouteBetaAccess(): a 'vedett_route_beta' pilot_access kulcs-összehasonlítás EXAKT maradt", () => {
  const src = readAccessSource();
  assert.equal(VEDETT_ROUTE_BETA_FEATURE_KEY, "vedett_route_beta");
  assert.match(src, /pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\)/);
});

test("hasVedettRouteBetaAccess(): nincs profil esetén false, nincs implicit 'true' fallback", () => {
  const src = readAccessSource();
  assert.match(src, /if \(!profile\) return false;/);
  const fnSrc = extractFunctionSource(src, "hasVedettRouteBetaAccess");
  assert.ok(fnSrc, "hasVedettRouteBetaAccess() függvénynek léteznie kell");
  assert.match(fnSrc!, /return pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\);\s*\}$/);
});

// ── A/B) globális kill switch — admin/user sem bypassolja ──────────────────
test("A/B) VEDETT_ROUTE_ENABLED=false esetén MÉG a sikeres auth/permission check UTÁN is Forbidden a válasz — nincs admin- vagy user-specifikus bypass a kill switch körül, ez MINDEN ágra (authenticated_users, beta_testers, admin_only) egyformán vonatkozik", () => {
  const src = readAccessSource();
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAccess");
  assert.ok(fnSrc, "requireVedettRouteAccess() függvénynek léteznie kell");
  assert.match(fnSrc!, /if \(!authCheck\.ok\) return authCheck;/, "az auth/permission check-nek a kill switch check ELŐTT kell lefutnia");
  assert.match(fnSrc!, /if \(!isVedettRouteFeatureEnabled\(\)\)/);
  const killSwitchIdx = fnSrc!.indexOf("if (!isVedettRouteFeatureEnabled())");
  const surrounding = fnSrc!.slice(killSwitchIdx, killSwitchIdx + 300);
  assert.ok(
    !/role === "admin"/.test(surrounding) && !/isAdmin/.test(surrounding),
    "a kill switch ellenőrzés közelében nem szabad admin/user-bypass feltételnek lennie — a flag mindenkit kizár, ha ki van kapcsolva"
  );
});

// ── K) közös access guard minden route-on ──────────────────────────────────
test("K) rest-points API route-ok requireVedettRouteAccess()-t hívnak (list/create)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "rest-points", "route.ts"),
    "utf-8"
  );
  assert.match(src, /requireVedettRouteAccess\s*\(/);
});

test("K) rest-points/[id] API route-ok requireVedettRouteAccess()-t hívnak (update/delete)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "rest-points", "[id]", "route.ts"),
    "utf-8"
  );
  assert.match(src, /requireVedettRouteAccess\s*\(/);
});
