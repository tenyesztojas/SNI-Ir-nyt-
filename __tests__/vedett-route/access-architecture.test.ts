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
// ROBUSZTUSSÁG (2026-09-09, integrate/vedett-utvonal-beta cherry-pick
// audit): a korábbi verzió a függvénytest kivágásához egy sor elejére
// (nem beljebb húzva) várt záró kapcsos zárójelre épülő, LF-specifikus
// regexet használt. Ez törékeny: CRLF sorvégek, Prettier-formázás, vagy egy
// szintaktikailag irreleváns beljebb-húzási eltérés is hamis negatívot
// okozhatott, ANÉLKÜL, hogy a mögötte lévő biztonsági logika ténylegesen
// megváltozott volna. Ezért a függvénytest kivágása mostantól egy
// DETERMINISZTIKUS, kapcsos-zárójel-mélység alapú extractFunctionSource()
// helperen keresztül történik, ami sortörés-formátumtól (LF/CRLF),
// whitespace-től és a formázási stílustól függetlenül, kizárólag a
// tényleges nyitó/záró kapcsos zárójelek egyensúlya alapján találja meg a
// függvény végét (string- és kommentliterálokat kihagyva).
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

  // A paraméterlista nyitó '('-je közvetlenül a signature-egyezés végén
  // van — innen, zárójel-mélység számlálással kell megtalálni a
  // paraméterlistát lezáró ')'-t.
  let parenDepth = 1; // a nyitó '(' már elfogyott a signature match-ben
  let i = sigMatch.index + sigMatch[0].length;
  for (; i < src.length && parenDepth > 0; i++) {
    const c = src[i];
    if (c === "(") parenDepth++;
    else if (c === ")") parenDepth--;
  }
  if (parenDepth !== 0) return null; // nem egyensúlyban lévő paraméterlista

  // Innentől (a paraméterlista lezárása után, egy esetleges visszatérési
  // típus-annotáción átugorva) az ELSŐ '{' már a függvénytest nyitó
  // kapcsos zárójele.
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
      if (c === "\\") { j++; continue; } // escapelt karakter — átugorjuk
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
  return null; // nem talált egyensúlyban lévő záró '}'-t (hibás forrás)
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
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAuthenticated");
  assert.ok(fnSrc, "nem található requireVedettRouteAuthenticated függvénytest");
  assert.doesNotMatch(fnSrc!, /profiles|role\s*!==\s*"admin"|createAdminClient/);
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
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAccess");
  assert.ok(fnSrc, "requireVedettRouteAccess() függvénynek léteznie kell");
  assert.match(
    fnSrc!,
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
  const fnSrc = extractFunctionSource(src, "hasVedettRouteBetaAccess");
  assert.ok(fnSrc, "hasVedettRouteBetaAccess() függvénynek léteznie kell");
  assert.match(fnSrc!, /return pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\);\s*\}$/);
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
  const fnSrc = extractFunctionSource(src, "requireVedettRouteAccess");
  assert.ok(fnSrc, "requireVedettRouteAccess() függvénynek léteznie kell");
  assert.match(fnSrc!, /if \(!authCheck\.ok\) return authCheck;/, "az auth/permission check-nek a kill switch check ELŐTT kell lefutnia");
  assert.match(fnSrc!, /if \(!isVedettRouteFeatureEnabled\(\)\)/);
  const killSwitchIdx = fnSrc!.indexOf("if (!isVedettRouteFeatureEnabled())");
  const surrounding = fnSrc!.slice(killSwitchIdx, killSwitchIdx + 300);
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
