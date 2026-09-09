// VÉDETT ÚTVONAL — ZÁRT BÉTA → NYILVÁNOS, REGISZTRÁLT FELHASZNÁLÓI BÉTA
// (2026-09-09 release)
//
// FRISSÍTVE: ez a fájl korábban a "beta_testers" szintet (admin VAGY
// explicit `vedett_route_beta` pilot_access grant) ellenőrizte. A jelen
// release SZÁNDÉKOSAN aktiválta az "authenticated_users" szintet: a Védett
// Útvonal mostantól BÁRMELY bejelentkezett, regisztrált felhasználó számára
// elérhető, kijelentkezett/anonim látogató számára NEM. A grant-alapú
// `hasVedettRouteBetaAccess()` logika és a hozzá tartozó admin/tesztelő
// infrastruktúra (app/admin/tesztelok, setPilotAccess, migráció) VÁLTOZATLAN
// marad — csak a Védett Útvonal menü/oldal/API hozzáférése nem függ tőle
// többé. Ez a fájl az ÚJ, szándékos állapotot ellenőrzi.
//
// Ugyanazt a mintát követi, mint korábban: mivel a repo NEM tartalmaz
// jsdom/@testing-library/react-t, és a lib/vedett-route/access.ts a
// "next/server" modult importálja (ami standalone `node --test` alatt,
// Next.js bundler nélkül nem oldható fel), a jogosultsági LOGIKÁT
// forráskód-szintű, strukturális regresszió-tesztekkel fedjük le.
//
//   node --experimental-strip-types --test __tests__/vedett-route/beta-access-and-menu.test.ts
//
// LEFEDETTSÉG (a felhasználó minimum tesztlistája szerint):
//   A) flag=false + admin -> DENY
//   B) flag=false + user -> DENY
//   C) logged-out -> 401 / redirect /belepes
//   D) logged-in normal user -> PASS
//   E) logged-in admin -> PASS
//   F) user pilot_access üres -> PASS
//   G) usernek csak más pilot grantje van -> PASS
//   H) menü belépett normál usernek látszik
//   I) menü kijelentkezett usernek nem látszik
//   J) desktop/mobile ugyanaz
//   K) minden route API közös access guardot használ
//   L) GPS privacy regresszió változatlan
//
// A korábbi grant-specifikus tesztek (setPilotAccess admin-check, revoke,
// self-escalation trigger, feature-key reuse) MEGMARADNAK, mert az a
// infrastruktúra változatlan — csak "backwards-compat, jelenleg nem az
// aktív hozzáférési útvonal" címkével.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VEDETT_ROUTE_BETA_FEATURE_KEY, VEDETT_ROUTE_ACCESS_LEVEL } from "../../lib/vedett-route/config.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const ACCESS_PATH = join(ROOT, "lib", "vedett-route", "access.ts");
const CONFIG_PATH = join(ROOT, "lib", "vedett-route", "config.ts");
const HEADER_CLIENT_PATH = join(ROOT, "components", "HeaderClient.tsx");
const HEADER_PATH = join(ROOT, "components", "Header.tsx");
const PAGE_PATH = join(ROOT, "app", "vedett-utvonal", "page.tsx");
const ADMIN_ACTIONS_PATH = join(ROOT, "app", "admin", "tesztelok", "actions.ts");
const ADMIN_CONFIG_PATH = join(ROOT, "app", "admin", "tesztelok", "config.ts");
const TESZTELO_CLIENT_PATH = join(ROOT, "app", "admin", "tesztelok", "TeszteloClient.tsx");
const MIGRATION_PATH = join(ROOT, "supabase", "migrations", "20260909_vedett_route_beta_access.sql");

/**
 * ROBUSZTUSSÁG (2026-09-09, integrate/vedett-utvonal-beta cherry-pick
 * audit): determinisztikus, kapcsos-zárójel-mélység alapú függvénytest-
 * kivágó — lásd __tests__/vedett-route/access-architecture.test.ts azonos
 * nevű helperének fejlécét a teljes indoklásért (LF/CRLF, whitespace és
 * Prettier-formázás független; egy paraméter-típus saját zárójel-párját is
 * helyesen átugorja, mielőtt a függvénytest nyitó zárójelét keresné).
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

const accessSrc = readFileSync(ACCESS_PATH, "utf-8");
const configSrc = readFileSync(CONFIG_PATH, "utf-8");
const headerClientSrc = readFileSync(HEADER_CLIENT_PATH, "utf-8");
const headerSrc = readFileSync(HEADER_PATH, "utf-8");
const pageSrc = readFileSync(PAGE_PATH, "utf-8");
const adminActionsSrc = readFileSync(ADMIN_ACTIONS_PATH, "utf-8");
const adminConfigSrc = readFileSync(ADMIN_CONFIG_PATH, "utf-8");
const teszteloClientSrc = readFileSync(TESZTELO_CLIENT_PATH, "utf-8");
const migrationSrc = readFileSync(MIGRATION_PATH, "utf-8");

describe("Feature key — EGYETLEN forrás, újrahasznosított rendszer (nincs duplikáció, backwards-compat)", () => {
  test("VEDETT_ROUTE_BETA_FEATURE_KEY valódi importált értéke 'vedett_route_beta' (a grant-infrastruktúra megmarad, csak nem az aktív hozzáférési útvonal)", () => {
    assert.equal(VEDETT_ROUTE_BETA_FEATURE_KEY, "vedett_route_beta");
  });

  test("app/admin/tesztelok/config.ts a MEGLÉVŐ PILOT_MODULES tömböt bővíti, nem hoz létre új listát", () => {
    assert.match(adminConfigSrc, /key:\s*"vedett_route_beta"/);
    assert.match(adminConfigSrc, /vedett-jelzes/);
    assert.match(adminConfigSrc, /vedett-partner/);
    assert.match(adminConfigSrc, /vedettmunka/);
  });
});

describe("hasVedettRouteBetaAccess() döntési logika — MEGMARAD, de már NEM az aktív hozzáférési útvonal a Védett Útvonalhoz", () => {
  test("admin ág feltétel nélkül (grant-check ELŐTT) igazat ad vissza", () => {
    assert.match(
      accessSrc,
      /if \(profile\.role === "admin"\) return true;/,
      "az admin ágnak a pilotAccess ellenőrzés ELŐTT kell visszatérnie"
    );
  });

  test("a nem-admin ág KIZÁRÓLAG a VEDETT_ROUTE_BETA_FEATURE_KEY kulcsot nézi — egy MÁSIK modul (pl. 'vedettmunka') grantje NEM ad Védett Útvonal hozzáférést, ha ez az ág valaha ismét aktívvá válna", () => {
    assert.match(
      accessSrc,
      /pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\)/,
      "a pontos kulcsra kell szűrni"
    );
    assert.ok(
      !/pilotAccess\.length\s*>\s*0/.test(accessSrc),
      "nem szabad 'bármilyen pilot modul grantje elég' logikának lennie"
    );
  });

  test("nincs profil / nincs grant esetén a függvény false-t ad (nincs implicit 'true' fallback)", () => {
    assert.match(accessSrc, /if \(!profile\) return false;/);
  });
});

describe("C/D/E/F/G) requireVedettRouteAuthenticated() — az AKTÍV hozzáférési útvonal", () => {
  test("C) logged-out -> 401 Unauthorized, mielőtt bármilyen profil/pilot_access adatot lekérne (nincs is profil-lekérdezés a függvényben)", () => {
    const fnBody = extractFunctionSource(accessSrc, "requireVedettRouteAuthenticated");
    assert.ok(fnBody, "requireVedettRouteAuthenticated() függvénynek léteznie kell");
    assert.match(fnBody!, /if \(!user\)/);
    assert.match(fnBody!, /status:\s*401/);
    assert.doesNotMatch(fnBody!, /\.from\("profiles"\)/, "az authenticated_users ág nem kérdez le profilt — nincs mit 'előtte' futtatni");
  });

  test("D/E/F/G) bejelentkezett felhasználó (normál user, admin, üres pilot_access, VAGY csak más modul grantje) EGYFORMÁN PASS-ol — a döntés kizárólag a bejelentkezés tényén alapul, nincs role/pilot_access szűrés", () => {
    const fnBody = extractFunctionSource(accessSrc, "requireVedettRouteAuthenticated");
    assert.ok(fnBody, "requireVedettRouteAuthenticated() függvénynek léteznie kell");
    assert.doesNotMatch(
      fnBody!,
      /profiles|pilot_access|pilotAccess|role\s*!==\s*"admin"|role\s*===\s*"admin"|createAdminClient/,
      "D/E/F/G mind ugyanarra az invariánsra vezet vissza: nincs role/pilot_access alapú szűrés"
    );
    assert.match(fnBody!, /return\s*\{\s*ok:\s*true,\s*userId:\s*user\.id\s*\};/);
  });
});

describe("F/P) grant/revoke — setPilotAccess() (admin-only, meglévő akció, backwards-compat infrastruktúra, változatlan)", () => {
  test("setPilotAccess() admin-ellenőrzéssel kezdődik, mielőtt bármilyen írást végezne", () => {
    const fnBody = extractFunctionSource(adminActionsSrc, "setPilotAccess");
    assert.ok(fnBody, "setPilotAccess() függvénynek léteznie kell");
    assert.match(fnBody!, /if \(!\(await isCurrentUserAdmin\(\)\)\) throw new Error\("Unauthorized"\);/);
  });

  test("revoke (enabled=false) a modul kulcsát KISZŰRI a tömbből (nem csak enabled=false flaget állít)", () => {
    assert.match(
      adminActionsSrc,
      /current\.filter\(\(m\) => m !== module\)/,
      "revoke esetén a kulcsnak ténylegesen el kell tűnnie a pilot_access tömbből"
    );
  });

  test("P) az admin UI (TeszteloClient) a revoke gombot a MEGLÉVŐ setPilotAccess(id, module, false) akcióhoz köti — nincs párhuzamos revoke logika", () => {
    assert.match(teszteloClientSrc, /await setPilotAccess\(testerId, moduleKey, false\)/);
    assert.match(teszteloClientSrc, /Visszavonás/);
  });
});

describe("A/B) globális kill switch — admin/user SEM bypassolja, az authenticated_users ágon sem", () => {
  test("A/B) requireVedettRouteAccess() a VEDETT_ROUTE_ENABLED ellenőrzést az authCheck UTÁN, feltétel nélkül végzi — nincs admin- vagy user-specifikus bypass ág, flag=false esetén MINDENKI (admin is, sima user is) DENY-t kap", () => {
    const fnBody = extractFunctionSource(accessSrc, "requireVedettRouteAccess");
    assert.ok(fnBody, "requireVedettRouteAccess() függvénynek léteznie kell");
    assert.match(fnBody!, /if \(!authCheck\.ok\) return authCheck;/);
    assert.match(fnBody!, /if \(!isVedettRouteFeatureEnabled\(\)\)/);
    const killSwitchBlockIdx = fnBody!.indexOf("if (!isVedettRouteFeatureEnabled())");
    const surrounding = fnBody!.slice(killSwitchBlockIdx, killSwitchBlockIdx + 300);
    assert.ok(
      !/role === "admin"/.test(surrounding) && !/isAdmin/.test(surrounding),
      "a kill switch ellenőrzés közelében nem szabad admin-bypass feltételnek lennie"
    );
  });
});

describe("H/I/J) menü gating — HeaderClient.tsx", () => {
  test("visiblePilotLinks EGYETLEN szűrt lista — deszktop ÉS mobil ugyanazt használja (J: nincs duplikált logika)", () => {
    const usages = headerClientSrc.match(/visiblePilotLinks\.map/g) ?? [];
    assert.equal(usages.length, 2, "pontosan két helyen (desktop nav + mobil nav) kell renderelni ugyanazt a szűrt listát");
    const filterDefinitions = headerClientSrc.match(/PILOT_LINKS\.filter/g) ?? [];
    assert.equal(
      filterDefinitions.length,
      1,
      "a PILOT_LINKS.filter(...) szűrésnek EGYETLEN helyen kell megtörténnie — a desktop/mobil renderelés csak a már kiszámolt visiblePilotLinks-et használja"
    );
  });

  test("H/I) a 'vedett_route_beta' bejegyzés saját, admin/grant-független szabályt kap: LÁTHATÓ minden bejelentkezett felhasználónak, ha a flag be van kapcsolva; NEM látható kijelentkezett usernek, MÉG akkor sem, ha a flag be van kapcsolva", () => {
    // A filter callback nem külön named function — magát a speciális ágat
    // vizsgáljuk a teljes forrásban szöveg-mintaként, mert ez egy inline
    // arrow function egy .filter() hívásban, nem egy `function` deklaráció
    // (amit extractFunctionSource() tudna kapcsos-zárójel-mélységgel kivágni).
    const specialCaseMatch = headerClientSrc.match(
      /if \(l\.key === "vedett_route_beta"\) \{[\s\S]*?return vedettRouteEnabled && isLoggedIn;/
    );
    assert.ok(
      specialCaseMatch,
      "a 'vedett_route_beta' kulcsnak külön, 'vedettRouteEnabled && isLoggedIn' feltételt kell visszaadnia — NEM admin/pilotAccess alapút"
    );
  });

  test("H/I) a 'vedett_route_beta' különleges ág explicit a többi (isAdmin || pilotAccess.includes(...)) ág ELŐTT szerepel a filter()-ben, így az nem éri el/nem írja felül", () => {
    const specialIdx = headerClientSrc.indexOf('if (l.key === "vedett_route_beta")');
    const genericIdx = headerClientSrc.indexOf("return isAdmin || pilotAccess.includes(l.key);");
    assert.ok(specialIdx !== -1 && genericIdx !== -1 && specialIdx < genericIdx);
  });

  test("a MÁSIK három pilot modul (vedett-jelzes, vedett-partner, vedettmunka) láthatósági szabálya VÁLTOZATLAN maradt: isAdmin || pilotAccess.includes(l.key)", () => {
    assert.match(headerClientSrc, /return isAdmin \|\| pilotAccess\.includes\(l\.key\);/);
  });

  test("a 'vedett_route_beta' bejegyzésnek szerepelnie kell a PILOT_LINKS tömbben, a helyes href-fel, és BÉTA badge-dzsel", () => {
    assert.match(headerClientSrc, /key:\s*"vedett_route_beta",\s*href:\s*"\/vedett-utvonal"/);
    assert.match(headerClientSrc, /key:\s*"vedett_route_beta"[^\n]*badge:\s*"BÉTA"/);
  });

  test("a BÉTA badge mindkét (desktop + mobil) renderelési helyen megjelenik, ha a link objektumnak van badge mezője — nem sugall kész/garantált szolgáltatást, csak jelöl", () => {
    const badgeRenders = headerClientSrc.match(/\{link\.badge && \(/g) ?? [];
    assert.equal(badgeRenders.length, 2, "a badge-nek desktop és mobil nézetben is meg kell jelennie");
  });

  test("I) a flag-védett bejegyzés (requiresFeatureFlag: true) a MÁSIK három linkre NEM CSS-sel, hanem a filter() elhagyásával tűnik el", () => {
    assert.match(headerClientSrc, /if \(l\.requiresFeatureFlag && !vedettRouteEnabled\) return false;/);
  });

  test("Header.tsx (szerver komponens) ténylegesen az isVedettRouteFeatureEnabled() valós flag-értéket ÉS a valódi bejelentkezési állapotot adja át, nem hardcode-olt értéket", () => {
    assert.match(headerSrc, /vedettRouteEnabled=\{isVedettRouteFeatureEnabled\(\)\}/);
    assert.match(headerSrc, /isLoggedIn=\{!!user\}/);
    assert.match(headerSrc, /import \{ isVedettRouteFeatureEnabled \} from "@\/lib\/vedett-route\/config"/);
  });
});

describe("K) szerver oldali oldal- és API-védelem — közös access guard", () => {
  test("app/vedett-utvonal/page.tsx: kijelentkezett felhasználó redirect('/belepes')-t kap", () => {
    assert.match(pageSrc, /if \(!user\) \{\s*redirect\("\/belepes"\);/);
  });

  test("app/vedett-utvonal/page.tsx: a hozzáférési döntés a KÖZÖS VEDETT_ROUTE_ACCESS_LEVEL háromágú modellt követi (nem egy hardcode-olt, csak-grant-alapú logikát) — a döntés jelenleg (authenticated_users) minden bejelentkezett usert átenged", () => {
    assert.match(pageSrc, /import \{ isVedettRouteFeatureEnabled, VEDETT_ROUTE_ACCESS_LEVEL \} from "@\/lib\/vedett-route\/config"/);
    assert.match(pageSrc, /VEDETT_ROUTE_ACCESS_LEVEL === "authenticated_users"\s*\n\s*\? true/);
  });

  test("app/vedett-utvonal/page.tsx: a form csak az enabled+access ellenőrzés UTÁN (az `allowed` ágon kívül) renderelődik", () => {
    const allowedIdx = pageSrc.indexOf("if (!allowed)");
    const formRenderIdx = pageSrc.indexOf("<VedettUtvonalSearchForm");
    assert.ok(allowedIdx !== -1 && formRenderIdx !== -1 && allowedIdx < formRenderIdx);
  });

  test("A/B) flag=false esetén a bejelentkezett (akár admin) felhasználó is a 'funkció ki van kapcsolva' üzenetet kapja, NEM a régi 'zárt béta, csak meghívott tesztelőknek' szöveget", () => {
    assert.match(pageSrc, /A Védett Útvonal funkció jelenleg ki van kapcsolva\./);
    assert.ok(
      !/csak meghívott\s*\n?\s*tesztelők számára érhető el/.test(pageSrc),
      "a régi, zárt béta szövegnek el kellett tűnnie, mert félrevezető lenne a publikus bétában"
    );
  });

  test("K) mind a Védett Útvonal API route-ok a KÖZÖS requireVedettRouteAccess()-en keresztül futnak — a szint-váltás egyetlen access.ts/config.ts módosítással minden route-ra érvényes, route-fájlokat nem kellett módosítani", () => {
    const apiRoutePaths = [
      join(ROOT, "app", "api", "rest-points", "route.ts"),
      join(ROOT, "app", "api", "rest-points", "[id]", "route.ts"),
      join(ROOT, "app", "api", "vedett-route", "rest-stops", "nearby", "route.ts"),
      join(ROOT, "app", "api", "vedett-route", "rest-stops", "resume", "route.ts"),
    ];
    for (const p of apiRoutePaths) {
      const src = readFileSync(p, "utf-8");
      assert.match(
        src,
        /requireVedettRouteAccess\(/,
        `${p} -nak a közös requireVedettRouteAccess()-t kell hívnia`
      );
    }
  });
});

describe("O) sima felhasználó nem adhat magának hozzáférést (backwards-compat infrastruktúra, változatlan)", () => {
  test("setPilotAccess() (az EGYETLEN írási útvonal a pilot_access mezőre) admin-only — kliens oldalon nincs közvetlen Supabase update", () => {
    assert.match(adminActionsSrc, /if \(!\(await isCurrentUserAdmin\(\)\)\) throw new Error\("Unauthorized"\);/);
  });

  test("a migráció DB-szintű védelmet is ad: self-escalation trigger a pilot_access oszlopra", () => {
    assert.match(migrationSrc, /prevent_pilot_access_self_escalation/);
    assert.match(
      migrationSrc,
      /new\.pilot_access is distinct from old\.pilot_access\s*\n\s*and auth\.uid\(\) is not null\s*\n\s*and not public\.is_admin\(\)/
    );
    assert.match(migrationSrc, /create trigger profiles_prevent_pilot_access_escalation before update on public\.profiles/);
  });

  test("a migráció additív/idempotens (nem destruktív) és tartalmaz rollback dokumentációt", () => {
    assert.match(migrationSrc, /add column if not exists pilot_access/);
    assert.match(migrationSrc, /create index if not exists profiles_pilot_access_gin_idx/);
    assert.match(migrationSrc, /ROLLBACK/);
    assert.ok(
      !/drop table|drop column/i.test(migrationSrc),
      "a migráció nem törölhet meglévő táblát/oszlopot"
    );
  });
});

describe("L) GPS PRIVACY REGRESSION — a hozzáférési modell váltása nem érinti a GPS-t", () => {
  test("sem access.ts, sem a beta-grant admin akciók, sem a migráció nem kezel GPS/koordináta adatot", () => {
    for (const src of [accessSrc, adminActionsSrc, migrationSrc]) {
      assert.ok(!/latitude|longitude|navigator\.geolocation/i.test(src));
    }
  });

  // FRISSÍTVE (Védett Hely "Navigálj oda" integráció, 2026-09-09): a
  // page.tsx mostantól LEGITIM MÓDON kezel latitude/longitude értéket — a
  // deep linkből érkező, MÁR ISMERT Védett Hely koordinátáját (nem a
  // felhasználó GPS-ét). Ez NEM GPS-privacy regresszió: a valódi
  // invariáns az, hogy a page.tsx SOHA nem hívja a böngésző
  // navigator.geolocation API-ját (az kizárólag a kliens oldali
  // VedettUtvonalSearchForm useGeolocation() hookjában, explicit user
  // action mögött történhet) — lásd a navigate-button-integration.test.ts
  // J/K teszteit a teljes lefedettségért.
  test("app/vedett-utvonal/page.tsx SOHA nem hívja a navigator.geolocation API-t — a deep linkből érkező koordináta a Védett Helyé, nem GPS-adat", () => {
    assert.doesNotMatch(pageSrc, /navigator\.geolocation/i);
  });
});

describe("Konfiguráció — VEDETT_ROUTE_ACCESS_LEVEL ténylegesen 'authenticated_users'-re váltott, és a globális flag változatlan marad", () => {
  test("config.ts a korábban előkészített, addig inaktív 'authenticated_users' szintet aktiválja", () => {
    assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "authenticated_users");
    assert.match(configSrc, /export const VEDETT_ROUTE_ACCESS_LEVEL: VedettRouteAccessLevel = "authenticated_users";/);
  });

  test("isVedettRouteFeatureEnabled() továbbra is process.env.VEDETT_ROUTE_ENABLED === \"true\" — a globális kill switch mechanizmusa NEM változott", () => {
    assert.match(configSrc, /return process\.env\.VEDETT_ROUTE_ENABLED === "true";/);
  });
});
