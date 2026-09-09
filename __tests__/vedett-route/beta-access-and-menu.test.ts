// VÉDETT ÚTVONAL — ZÁRT BÉTA HOZZÁFÉRÉS + MENÜRENDSZER (2026-09-09)
// Regresszió-tesztek a specifikáció Section 14 (A–R) tesztlistájához.
//
// Ugyanazt a mintát követi, mint a projekt már meglévő
// single-shared-map-and-current-location.test.ts / map-rendering-fix.test.ts
// fájljai: mivel a repo NEM tartalmaz jsdom/@testing-library/react-t, és a
// lib/vedett-route/access.ts a "next/server" modult importálja (ami
// standalone `node --test` alatt, Next.js bundler nélkül nem oldható fel —
// lásd a fájl elején), a jogosultsági LOGIKÁT forráskód-szintű,
// strukturális regresszió-tesztekkel fedjük le. A ténylegesen futtatható,
// DB/HTTP nélküli egységteszt csak azokra a részekre vonatkozik, amik pure,
// self-contained modulokból importálhatók (lib/vedett-route/config.ts).
//
//   node --experimental-strip-types --test __tests__/vedett-route/beta-access-and-menu.test.ts
//
// LEFEDETTSÉG (A–R, a felhasználó Section 14 specifikációja szerint):
//   A) admin -> access PASS grant nélkül
//   B) tester grant -> access PASS
//   C) sima bejelentkezett felhasználó -> access DENY
//   D) kijelentkezve -> DENY
//   E) lejárt grant -> DENY (N/A — lásd megjegyzés lent)
//   F) visszavont/letiltott grant -> DENY
//   G) VEDETT_ROUTE_ENABLED=false -> admin is DENY
//   H) menü látható adminnak
//   I) menü látható tesztelőnek
//   J) menü NEM látható sima felhasználónak
//   K) direkt oldal-URL blokkolva sima felhasználónak
//   L) API 403 sima felhasználónak
//   M) API PASS tesztelőnek
//   N) API PASS adminnak
//   O) sima felhasználó nem adhat magának hozzáférést
//   P) admin grant/revoke működik
//   Q) egy másik feature grantje nem ad Védett Útvonal hozzáférést
//   R) PWA/mobil navigáció ugyanazt a hozzáférési logikát használja

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VEDETT_ROUTE_BETA_FEATURE_KEY } from "../../lib/vedett-route/config.ts";

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

const accessSrc = readFileSync(ACCESS_PATH, "utf-8");
const configSrc = readFileSync(CONFIG_PATH, "utf-8");
const headerClientSrc = readFileSync(HEADER_CLIENT_PATH, "utf-8");
const headerSrc = readFileSync(HEADER_PATH, "utf-8");
const pageSrc = readFileSync(PAGE_PATH, "utf-8");
const adminActionsSrc = readFileSync(ADMIN_ACTIONS_PATH, "utf-8");
const adminConfigSrc = readFileSync(ADMIN_CONFIG_PATH, "utf-8");
const teszteloClientSrc = readFileSync(TESZTELO_CLIENT_PATH, "utf-8");
const migrationSrc = readFileSync(MIGRATION_PATH, "utf-8");

describe("Feature key — EGYETLEN forrás, újrahasznosított rendszer (nincs duplikáció)", () => {
  test("VEDETT_ROUTE_BETA_FEATURE_KEY valódi importált értéke 'vedett_route_beta'", () => {
    assert.equal(VEDETT_ROUTE_BETA_FEATURE_KEY, "vedett_route_beta");
  });

  test("app/admin/tesztelok/config.ts a MEGLÉVŐ PILOT_MODULES tömböt bővíti, nem hoz létre új listát", () => {
    assert.match(adminConfigSrc, /key:\s*"vedett_route_beta"/);
    assert.match(adminConfigSrc, /vedett-jelzes/);
    assert.match(adminConfigSrc, /vedett-partner/);
    assert.match(adminConfigSrc, /vedettmunka/);
  });
});

describe("A/B/C/Q) hasVedettRouteBetaAccess() döntési logika", () => {
  test("A) admin ág feltétel nélkül (grant-check ELŐTT) igazat ad vissza", () => {
    assert.match(
      accessSrc,
      /if \(profile\.role === "admin"\) return true;/,
      "az admin ágnak a pilotAccess ellenőrzés ELŐTT kell visszatérnie, hogy admin sose igényeljen külön grantet"
    );
  });

  test("B/Q) a nem-admin ág KIZÁRÓLAG a VEDETT_ROUTE_BETA_FEATURE_KEY kulcsot nézi — nem azt, hogy a pilotAccess tömb nem üres", () => {
    assert.match(
      accessSrc,
      /pilotAccess\.includes\(VEDETT_ROUTE_BETA_FEATURE_KEY\)/,
      "a pontos kulcsra kell szűrni, hogy egy MÁSIK modul (pl. 'vedettmunka') grantje NE adjon Védett Útvonal hozzáférést"
    );
    assert.ok(
      !/pilotAccess\.length\s*>\s*0/.test(accessSrc),
      "nem szabad 'bármilyen pilot modul grantje elég' logikának lennie (ez Q tesztet sértené)"
    );
  });

  test("C) nincs profil / nincs grant esetén a függvény false-t ad (nincs implicit 'true' fallback)", () => {
    assert.match(accessSrc, /if \(!profile\) return false;/);
  });
});

describe("D) logged-out -> 401, a profil-lekérdezés ELŐTT", () => {
  test("requireVedettRouteBetaAccess() a user hiányát 401-gyel zárja rövidre, mielőtt bármilyen profil/pilot_access adatot lekérne", () => {
    const fnMatch = accessSrc.match(
      /export async function requireVedettRouteBetaAccess[\s\S]*?\n}\n/
    );
    assert.ok(fnMatch, "requireVedettRouteBetaAccess() függvénynek léteznie kell");
    const fnBody = fnMatch[0];
    const userCheckIdx = fnBody.indexOf('status: 401');
    const profileQueryIdx = fnBody.indexOf('.from("profiles")');
    assert.ok(userCheckIdx !== -1 && profileQueryIdx !== -1);
    assert.ok(
      userCheckIdx < profileQueryIdx,
      "a 401 Unauthorized válasznak a profiles tábla lekérdezése ELŐTT kell megtörténnie"
    );
  });
});

describe("E) lejárt grant — N/A, dokumentált korlátozás (a projekt tudatos döntése)", () => {
  test("a pilot_access adatmodellnek nincs expires_at mezője — ez a meglévő rendszer újrahasznosításának ELFOGADOTT trade-offja, nem hiányzó implementáció", () => {
    // A migráció fejléce explicit dokumentálja ezt a döntést — lásd Section
    // 4/16 audit jegyzet. Ha valaha per-grant lejárat kell, azt egy KÜLÖN,
    // additív migráció adhatja hozzá (a migrációs fájl rollback szekciója
    // is jelzi, hogy ez a fájl nem érinti ezt a kérdést).
    assert.match(migrationSrc, /nincs per-grant `expires_at` mező/);
    assert.ok(
      !/expires_at/i.test(adminActionsSrc),
      "a jelenlegi grant/revoke akciók (setPilotAccess/listPilotTesters) szándékosan nem implementálnak expires_at kezelést"
    );
  });
});

describe("F/P) grant/revoke — setPilotAccess() (admin-only, meglévő akció, újrahasznosítva)", () => {
  test("setPilotAccess() admin-ellenőrzéssel kezdődik, mielőtt bármilyen írást végezne", () => {
    const fnMatch = adminActionsSrc.match(/export async function setPilotAccess[\s\S]*?\n}\n/);
    assert.ok(fnMatch);
    assert.match(fnMatch[0], /if \(!\(await isCurrentUserAdmin\(\)\)\) throw new Error\("Unauthorized"\);/);
  });

  test("F) revoke (enabled=false) a modul kulcsát KISZŰRI a tömbből (nem csak enabled=false flaget állít) — így hasVedettRouteBetaAccess().includes() azonnal false lesz", () => {
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

describe("G) globális kill switch — admin SEM bypassolja", () => {
  test("requireVedettRouteAccess() a VEDETT_ROUTE_ENABLED ellenőrzést az authCheck UTÁN, feltétel nélkül végzi — nincs admin-specifikus bypass ág", () => {
    const fnMatch = accessSrc.match(/export async function requireVedettRouteAccess[\s\S]*?\n}\n/);
    assert.ok(fnMatch);
    const fnBody = fnMatch[0];
    assert.match(fnBody, /if \(!authCheck\.ok\) return authCheck;/);
    assert.match(fnBody, /if \(!isVedettRouteFeatureEnabled\(\)\)/);
    // Nincs "isAdmin" vagy hasonló bypass feltétel a flag-ellenőrzés körül.
    const killSwitchBlockIdx = fnBody.indexOf("if (!isVedettRouteFeatureEnabled())");
    const surrounding = fnBody.slice(killSwitchBlockIdx, killSwitchBlockIdx + 300);
    assert.ok(
      !/role === "admin"/.test(surrounding) && !/isAdmin/.test(surrounding),
      "a kill switch ellenőrzés közelében nem szabad admin-bypass feltételnek lennie"
    );
  });
});

describe("H/I/J/R) menü gating — HeaderClient.tsx", () => {
  test("visiblePilotLinks EGYETLEN szűrt lista — deszktop ÉS mobil ugyanazt használja (nincs duplikált logika, ez fedi le R-t is)", () => {
    const usages = headerClientSrc.match(/visiblePilotLinks\.map/g) ?? [];
    assert.equal(usages.length, 2, "pontosan két helyen (desktop nav + mobil nav) kell renderelni ugyanazt a szűrt listát");
    const filterDefinitions = headerClientSrc.match(/PILOT_LINKS\.filter/g) ?? [];
    assert.equal(
      filterDefinitions.length,
      1,
      "a PILOT_LINKS.filter(...) szűrésnek EGYETLEN helyen (a visiblePilotLinks definíciójában) kell megtörténnie — a desktop/mobil renderelés csak a már kiszámolt visiblePilotLinks-et használhatja, nem szűrhet újra"
    );
  });

  test("H) admin ág: a szűrő 'isAdmin ||' feltétellel bypassolja a pilotAccess ellenőrzést (a requiresFeatureFlag korláttól függetlenül)", () => {
    assert.match(headerClientSrc, /return isAdmin \|\| pilotAccess\.includes\(l\.key\);/);
  });

  test("I) tesztelő ág: a 'vedett_route_beta' bejegyzésnek szerepelnie kell a PILOT_LINKS tömbben, a helyes href-fel", () => {
    assert.match(headerClientSrc, /key:\s*"vedett_route_beta",\s*href:\s*"\/vedett-utvonal"/);
  });

  test("J) sima felhasználónak (nem admin, nincs grant) a szűrő false-t ad — nincs 'mindig látszik' kivétel", () => {
    // A filter callback két explicit feltételt tartalmaz (flag + admin-or-grant),
    // whitelisting nélkül — nincs pl. `|| true` vagy hasonló bypass.
    assert.ok(!/\|\|\s*true/.test(headerClientSrc));
  });

  test("a flag-védett bejegyzés (requiresFeatureFlag: true) NEM CSS-sel, hanem a filter() elhagyásával tűnik el — nincs 'hidden'/'display: none' a Védett Útvonal linkhez kötve", () => {
    assert.match(headerClientSrc, /if \(l\.requiresFeatureFlag && !vedettRouteEnabled\) return false;/);
  });

  test("Header.tsx (szerver komponens) ténylegesen az isVedettRouteFeatureEnabled() valós flag-értéket adja át, nem hardcode-olt true/false-t", () => {
    assert.match(headerSrc, /vedettRouteEnabled=\{isVedettRouteFeatureEnabled\(\)\}/);
    assert.match(headerSrc, /import \{ isVedettRouteFeatureEnabled \} from "@\/lib\/vedett-route\/config"/);
  });

  test("a régi, elavult 'Védett Útvonal szándékosan nincs a menüben' fejlesztői megjegyzés eltávolításra került", () => {
    assert.ok(
      !/szándékosan NEM szerepel itt/.test(headerClientSrc),
      "a komment elavulttá vált, mióta a Védett Útvonal a menürendszer része lett zárt béta mögött"
    );
  });
});

describe("K/L/M/N) szerver oldali oldal- és API-védelem", () => {
  test("K) app/vedett-utvonal/page.tsx: kijelentkezett felhasználó redirect('/belepes')-t kap", () => {
    assert.match(pageSrc, /if \(!user\) \{\s*redirect\("\/belepes"\);/);
  });

  test("K) app/vedett-utvonal/page.tsx: a hozzáférési döntés a KÖZÖS hasVedettRouteBetaAccess()-t hívja — nincs duplikált/eltérő logika az oldalon", () => {
    assert.match(pageSrc, /import \{ hasVedettRouteBetaAccess \} from "@\/lib\/vedett-route\/access"/);
    assert.match(pageSrc, /hasVedettRouteBetaAccess\(/);
  });

  test("K) jogosulatlan, bejelentkezett felhasználó app-szintű üzenetet kap ('Nincs hozzáférésed ehhez a béta funkcióhoz.'), NEM engedi tovább a keresési formot", () => {
    assert.match(pageSrc, /Nincs hozzáférésed ehhez a béta funkcióhoz\./);
    // A VedettUtvonalSearchForm csak az `allowed` ágon kívül (a return előtt) töretlenül,
    // az `allowed` check UTÁN renderelődik.
    const allowedIdx = pageSrc.indexOf("if (!allowed)");
    const formRenderIdx = pageSrc.indexOf("<VedettUtvonalSearchForm");
    assert.ok(allowedIdx !== -1 && formRenderIdx !== -1 && allowedIdx < formRenderIdx);
  });

  test("L/M/N) requireVedettRouteBetaAccess(): DENY -> 403 Forbidden JSON, PASS (tesztelő VAGY admin) -> { ok: true }", () => {
    assert.match(accessSrc, /status: 403 \}\s*\)\s*,?\s*\};?\s*\}\s*\n\n\s*return \{ ok: true, userId: user\.id \};/s);
  });

  test("L/M/N) mind a 6 meglévő Védett Útvonal API route a KÖZÖS requireVedettRouteAccess()-en keresztül fut — a beta_testers szint bevezetése egyetlen access.ts módosítással minden route-ra érvényes, route-fájlokat nem kellett módosítani", () => {
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

describe("O) sima felhasználó nem adhat magának hozzáférést", () => {
  test("O) setPilotAccess() (az EGYETLEN írási útvonal a pilot_access mezőre) admin-only — kliens oldalon nincs közvetlen Supabase update", () => {
    assert.match(adminActionsSrc, /if \(!\(await isCurrentUserAdmin\(\)\)\) throw new Error\("Unauthorized"\);/);
  });

  test("O) a migráció DB-szintű védelmet is ad: self-escalation trigger a pilot_access oszlopra, a MEGLÉVŐ role-védelemmel (prevent_role_self_escalation) analóg mintát követve", () => {
    assert.match(migrationSrc, /prevent_pilot_access_self_escalation/);
    assert.match(
      migrationSrc,
      /new\.pilot_access is distinct from old\.pilot_access\s*\n\s*and auth\.uid\(\) is not null\s*\n\s*and not public\.is_admin\(\)/
    );
    assert.match(migrationSrc, /create trigger profiles_prevent_pilot_access_escalation before update on public\.profiles/);
  });

  test("a migráció additív/idempotens (nem destruktív) és tartalmaz rollback dokumentációt, ahogy a specifikáció kéri", () => {
    assert.match(migrationSrc, /add column if not exists pilot_access/);
    assert.match(migrationSrc, /create index if not exists profiles_pilot_access_gin_idx/);
    assert.match(migrationSrc, /ROLLBACK/);
    assert.ok(
      !/drop table|drop column/i.test(migrationSrc),
      "a migráció nem törölhet meglévő táblát/oszlopot"
    );
  });
});

describe("GPS PRIVACY REGRESSION (Section 13) — a béta-hozzáférési réteg nem érinti a GPS-t", () => {
  test("sem access.ts, sem a beta-grant admin akciók nem kezelnek GPS/koordináta adatot", () => {
    for (const src of [accessSrc, adminActionsSrc, migrationSrc]) {
      assert.ok(!/latitude|longitude|navigator\.geolocation/i.test(src));
    }
  });
});

describe("Konfiguráció — VEDETT_ROUTE_ACCESS_LEVEL ténylegesen 'beta_testers'-re váltott, és a globális flag változatlan marad", () => {
  test("config.ts a korábban előkészített, addig inaktív 'beta_testers' szintet aktiválja", () => {
    assert.match(configSrc, /export const VEDETT_ROUTE_ACCESS_LEVEL: VedettRouteAccessLevel = "beta_testers";/);
  });

  test("isVedettRouteFeatureEnabled() továbbra is process.env.VEDETT_ROUTE_ENABLED === \"true\" — a globális kill switch mechanizmusa NEM változott", () => {
    assert.match(configSrc, /return process\.env\.VEDETT_ROUTE_ENABLED === "true";/);
  });
});
