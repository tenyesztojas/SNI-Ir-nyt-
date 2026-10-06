// Védett Útvonal — HOZZÁFÉRÉSI MÁTRIX (2026-10-03, "public read-only routing +
// admin endpoint hardening").
//
// KÉT RÉTEG:
//  1) A TISZTA döntési modell (lib/vedett-route/accessPolicy.ts) teljes
//     (anonim / bejelentkezett nem-admin / admin) x (public_read / user /
//     admin) mátrixa — DB és HTTP nélkül, determinisztikusan.
//  2) STATIKUS végpont→guard leltár: MINDEN route.ts a vizsgált
//     könyvtárakban pontosan a neki szánt guardot hívja, handlerenként, és
//     nincs védetlen végpont. Ez fogja meg, ha valaki egy admin végpontra
//     public/user guardot, vagy egy írás végpontra public guardot tenne.
//
// Nincs Docker/lokális Supabase: ugyanaz a gyakorlati teszt-stílus, mint a
// többi __tests__/vedett-route fájl (node --test, statikus + tiszta egység).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  decideVedettRouteAccess,
  vedettRouteDecisionNeedsProfile,
  type VedettRouteActor,
  type VedettRouteRequirement,
} from "../../lib/vedett-route/accessPolicy.ts";
import { VEDETT_ROUTE_ACCESS_LEVEL, type VedettRouteAccessLevel } from "../../lib/vedett-route/config.ts";

const ROOT = join(import.meta.dirname, "..", "..");

const ANON = null;
const USER: VedettRouteActor = { userId: "user-1", role: "user", pilotAccess: [] };
const ADMIN: VedettRouteActor = { userId: "admin-1", role: "admin", pilotAccess: [] };
const BETA_USER: VedettRouteActor = { userId: "beta-1", role: "user", pilotAccess: ["vedett_route_beta"] };

function decide(
  level: VedettRouteAccessLevel,
  actor: VedettRouteActor | null,
  requirement: VedettRouteRequirement,
  featureEnabled = true
) {
  return decideVedettRouteAccess({ level, featureEnabled, actor, requirement });
}

describe('az aktív szint: "public"', () => {
  test("config: VEDETT_ROUTE_ACCESS_LEVEL === 'public'", () => {
    assert.equal(VEDETT_ROUTE_ACCESS_LEVEL, "public");
  });

  describe("ANONIM", () => {
    test("alap útvonalkeresés / nyilvános olvasás (public_read): ENGEDÉLYEZVE, userId === null (nincs kitalált azonosító)", () => {
      const d = decide("public", ANON, "public_read");
      assert.deepEqual(d, { allow: true, userId: null });
    });
    test("kedvencek / felhasználói írás (user): 401", () => {
      const d = decide("public", ANON, "user");
      assert.equal(d.allow, false);
      assert.equal(!d.allow && d.status, 401);
    });
    test("saját pihenőpont írás (user): 401", () => {
      const d = decide("public", ANON, "user");
      assert.equal(!d.allow && d.status, 401);
    });
    test("GTFS feltöltés / frissítés (admin): 401 (NEM 200, NEM 403-szivárgás)", () => {
      const d = decide("public", ANON, "admin");
      assert.equal(d.allow, false);
      assert.equal(!d.allow && d.status, 401);
    });
    test("kill switch kikapcsolva: még az anonim public_read is 403 'Feature disabled'", () => {
      const d = decide("public", ANON, "public_read", false);
      assert.equal(!d.allow && d.status, 403);
      assert.equal(!d.allow && d.body.error, "Feature disabled");
    });
  });

  describe("BEJELENTKEZETT NEM-ADMIN", () => {
    test("alap útvonalkeresés (public_read): ENGEDÉLYEZVE, a saját userId-vel", () => {
      assert.deepEqual(decide("public", USER, "public_read"), { allow: true, userId: "user-1" });
    });
    test("saját felhasználói funkciók (user): ENGEDÉLYEZVE — VÁLTOZATLAN", () => {
      assert.deepEqual(decide("public", USER, "user"), { allow: true, userId: "user-1" });
    });
    test("GTFS feltöltés / frissítés (admin): 403 — a VULNERABILITÁS fix", () => {
      const d = decide("public", USER, "admin");
      assert.equal(d.allow, false);
      assert.equal(!d.allow && d.status, 403);
    });
    test("beta-grant NEM ad admin jogot", () => {
      const d = decide("public", BETA_USER, "admin");
      assert.equal(!d.allow && d.status, 403);
    });
  });

  describe("ADMIN", () => {
    test("meglévő útvonaltervezés (public_read): ENGEDÉLYEZVE", () => {
      assert.deepEqual(decide("public", ADMIN, "public_read"), { allow: true, userId: "admin-1" });
    });
    test("user-tier: ENGEDÉLYEZVE", () => {
      assert.deepEqual(decide("public", ADMIN, "user"), { allow: true, userId: "admin-1" });
    });
    test("GTFS feltöltés / frissítés (admin): ENGEDÉLYEZVE", () => {
      assert.deepEqual(decide("public", ADMIN, "admin"), { allow: true, userId: "admin-1" });
    });
    test("kill switch az admin műveletet is tiltja (nincs bypass)", () => {
      const d = decide("public", ADMIN, "admin", false);
      assert.equal(!d.allow && d.body.error, "Feature disabled");
    });
  });
});

describe("a szint-váltás NEM nyithat anonim hozzáférést máshol", () => {
  const closedLevels: VedettRouteAccessLevel[] = ["authenticated_users", "beta_testers", "admin_only"];
  for (const level of closedLevels) {
    test(`${level}: anonim public_read -> 401 (csak a "public" szint nyit anonimnak)`, () => {
      const d = decide(level, ANON, "public_read");
      assert.equal(!d.allow && d.status, 401);
    });
  }
  for (const level of ["public", ...closedLevels] as VedettRouteAccessLevel[]) {
    test(`${level}: az admin követelmény a szinttől FÜGGETLENÜL admin-szerepet kér`, () => {
      assert.equal(!decide(level, USER, "admin").allow, true);
      assert.equal(!decide(level, ANON, "admin").allow, true);
      assert.equal(decide(level, ADMIN, "admin").allow, true);
    });
    test(`${level}: a user-tier SOSEM enged anonimot`, () => {
      assert.equal(decide(level, ANON, "user").allow, false);
    });
  }
  test("beta_testers: nem-grant user 403, grant user és admin engedett", () => {
    assert.equal(!decide("beta_testers", USER, "public_read").allow, true);
    assert.equal(decide("beta_testers", BETA_USER, "public_read").allow, true);
    assert.equal(decide("beta_testers", ADMIN, "public_read").allow, true);
  });
  test("admin_only: nem-admin 403, admin engedett", () => {
    assert.equal(!decide("admin_only", USER, "user").allow, true);
    assert.equal(decide("admin_only", ADMIN, "user").allow, true);
  });
});

test("profil-betöltés csak akkor kell, ha a döntés role/grantre támaszkodik", () => {
  assert.equal(vedettRouteDecisionNeedsProfile("public", "public_read"), false);
  assert.equal(vedettRouteDecisionNeedsProfile("public", "user"), false);
  assert.equal(vedettRouteDecisionNeedsProfile("public", "admin"), true);
  assert.equal(vedettRouteDecisionNeedsProfile("beta_testers", "public_read"), true);
});

// ── 2) STATIKUS végpont→guard leltár ─────────────────────────────────────────

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

type Guard = "public_read" | "user" | "admin_operation" | "admin_diagnostic";
const GUARD_CALL: Record<Guard, RegExp> = {
  public_read: /const auth = await requireVedettRoutePublicRead\(/g,
  user: /const auth = await requireVedettRouteAccess\(\);/g,
  admin_operation: /const auth = await requireVedettRouteAdminOperation\(\);/g,
  admin_diagnostic: /const auth = await requireVedettRouteAdmin\(\);/g,
};

// A TELJES osztályozás — explicit, nem útvonal-név alapú.
const EXPECTED: Record<string, Guard> = {
  // A) biztonságos anonim olvasás (rate limit-tel)
  "app/api/admin/vedett-utvonal/search/route.ts": "public_read",
  "app/api/admin/vedett-utvonal/address-search/route.ts": "public_read",
  "app/api/admin/vedett-utvonal/address-retrieve/route.ts": "public_read",
  "app/api/admin/vedett-utvonal/car-route/route.ts": "public_read",
  "app/api/vedett-route/realtime-refresh/route.ts": "public_read",
  "app/api/vedett-route/rest-stops/nearby/route.ts": "public_read",
  "app/api/vedett-route/rest-stops/resume/route.ts": "public_read",
  "app/api/vedett-route/rest-stops/route-to-rest-point/route.ts": "public_read",
  // Community Reports v1: anonim is küldhet; user_id nélküli, insert-only,
  // szerver-oldali (service-role) írás saját, szigorúbb rate limittel.
  "app/api/vedett-route/community-reports/route.ts": "public_read",
  // Realtime community state: csak aggregált állapot, saját rate limittel.
  "app/api/vedett-route/community-state/route.ts": "public_read",
  // Expected community load: csak aggregált, batch, saját rate limittel.
  "app/api/vedett-route/community-load/route.ts": "public_read",
  // B) csak bejelentkezett felhasználó (perzisztencia / írás / saját adat)
  "app/api/vedett-route/favorites/route.ts": "user",
  "app/api/vedett-route/favorites/[id]/route.ts": "user",
  "app/api/vedett-route/saved-places/route.ts": "user",
  "app/api/vedett-route/saved-places/[id]/route.ts": "user",
  "app/api/rest-points/route.ts": "user",
  "app/api/rest-points/[id]/route.ts": "user",
  // C) csak admin
  "app/api/admin/vedett-utvonal/gtfs-upload/route.ts": "admin_operation",
  "app/api/admin/vedett-utvonal/gtfs-refresh/route.ts": "admin_operation",
  "app/api/admin/vedett-utvonal/status/route.ts": "admin_diagnostic",
};

describe("végpont → guard leltár (nincs védetlen vagy rossz guardú végpont)", () => {
  const scanned = [
    ...routeFiles(join(ROOT, "app/api/admin/vedett-utvonal")),
    ...routeFiles(join(ROOT, "app/api/vedett-route")),
    ...routeFiles(join(ROOT, "app/api/rest-points")),
  ].map((p) => p.slice(ROOT.length + 1).replaceAll("\\", "/"));

  test("minden vizsgált route.ts szerepel az explicit osztályozásban (új végpontot kötelező besorolni)", () => {
    assert.deepEqual([...scanned].sort(), Object.keys(EXPECTED).sort());
  });

  for (const [file, guard] of Object.entries(EXPECTED)) {
    test(`${file} -> ${guard}: minden exportált HTTP handler pontosan ezt a guardot hívja, és használja az eredményét`, () => {
      const src = readFileSync(join(ROOT, file), "utf-8");
      const handlers = (src.match(/^export async function (GET|POST|PATCH|PUT|DELETE)\b/gm) ?? []).length;
      assert.ok(handlers > 0, "legalább egy handler");
      const own = (src.match(GUARD_CALL[guard]) ?? []).length;
      assert.equal(own, handlers, `${file}: handlerenként egy ${guard} guard hívás kell`);
      // semelyik MÁS guard nem szerepelhet ugyanebben a fájlban
      for (const [other, re] of Object.entries(GUARD_CALL)) {
        if (other === guard) continue;
        assert.equal((src.match(re) ?? []).length, 0, `${file}: tiltott ${other} guard`);
      }
      const checks = (src.match(/if \(!auth\.ok\) return auth\.response;/g) ?? []).length;
      assert.equal(checks, handlers, `${file}: minden guard eredményét ellenőrizni kell`);
    });
  }

  test("a handlerek az auth ELŐTT nem olvasnak body-t / nem hívnak adatot (a guard az első művelet)", () => {
    for (const file of Object.keys(EXPECTED)) {
      const src = readFileSync(join(ROOT, file), "utf-8");
      const re = /export async function (?:GET|POST|PATCH|PUT|DELETE)\([^)]*\)[^{]*\{\s*\n\s*const auth = await /g;
      const handlers = (src.match(/^export async function (GET|POST|PATCH|PUT|DELETE)\b/gm) ?? []).length;
      assert.equal((src.match(re) ?? []).length, handlers, `${file}: a guard legyen a handler ELSŐ utasítása`);
    }
  });

  test("GTFS feltöltés/frissítés: SEMMILYEN user/public guard (a vulnerabilitás nem térhet vissza)", () => {
    for (const f of ["gtfs-upload", "gtfs-refresh"]) {
      const src = readFileSync(join(ROOT, `app/api/admin/vedett-utvonal/${f}/route.ts`), "utf-8");
      assert.doesNotMatch(src, /requireVedettRouteAccess|requireVedettRoutePublicRead|requireVedettRouteAuthenticated/);
      assert.match(src, /requireVedettRouteAdminOperation/);
    }
  });

  test("írás/perzisztencia route-ok (kedvenc, saját pihenőpont) SOSEM public guardot használnak", () => {
    for (const f of [
      "app/api/vedett-route/favorites/route.ts",
      "app/api/vedett-route/favorites/[id]/route.ts",
      "app/api/vedett-route/saved-places/route.ts",
      "app/api/vedett-route/saved-places/[id]/route.ts",
      "app/api/rest-points/route.ts",
      "app/api/rest-points/[id]/route.ts",
    ]) {
      assert.doesNotMatch(readFileSync(join(ROOT, f), "utf-8"), /requireVedettRoutePublicRead/);
    }
  });
});

// ── access.ts szerződés ──────────────────────────────────────────────────────

describe("access.ts szerződés", () => {
  const accessSrc = readFileSync(join(ROOT, "lib/vedett-route/access.ts"), "utf-8");

  test('user-tier guard: "public" szint a sima bejelentkezésre (authenticated) esik — SOSEM admin fallbackre, SOSEM anonim átengedésre', () => {
    assert.match(
      accessSrc,
      /VEDETT_ROUTE_ACCESS_LEVEL === "public" \|\| VEDETT_ROUTE_ACCESS_LEVEL === "authenticated_users"\s*\?\s*await requireVedettRouteAuthenticated\(\)/
    );
  });

  test("public guard: anonim (userId === null) hívónál per-IP rate limit, a meglévő rateLimiter-rel; nincs kitalált userId", () => {
    assert.match(accessSrc, /import \{ rateLimiter \} from "@\/lib\/rate-limit";/);
    assert.match(accessSrc, /decision\.userId === null && anonymousRateLimit/);
    assert.match(accessSrc, /rl:vedett-route-anon:\$\{anonymousRateLimit\.label\}:\$\{getVedettRouteClientIp\(request\)\}/);
    assert.doesNotMatch(accessSrc, /userId:\s*["'`](anonymous|anon|guest)/i);
  });

  test("minden anonim-elérhető, költséges végpont explicit per-IP limitet kap (kivéve realtime-refresh: saját, soft-limit válasz-formával)", () => {
    const limited = [
      "app/api/admin/vedett-utvonal/search/route.ts",
      "app/api/admin/vedett-utvonal/address-search/route.ts",
      "app/api/admin/vedett-utvonal/address-retrieve/route.ts",
      "app/api/admin/vedett-utvonal/car-route/route.ts",
      "app/api/vedett-route/rest-stops/nearby/route.ts",
      "app/api/vedett-route/rest-stops/resume/route.ts",
      "app/api/vedett-route/rest-stops/route-to-rest-point/route.ts",
    ];
    for (const f of limited) {
      assert.match(readFileSync(join(ROOT, f), "utf-8"), /requireVedettRoutePublicRead\(request, \{ label: "[a-z-]+", limit: \d+, windowMs: 60_000 \}\)/, f);
    }
    const rt = readFileSync(join(ROOT, "app/api/vedett-route/realtime-refresh/route.ts"), "utf-8");
    assert.match(rt, /anon-ip:\$\{getVedettRouteClientIp\(request\)\}/);
    assert.match(rt, /`vedett-route:realtime-refresh:\$\{auth\.userId\}`/, "a bejelentkezett per-user limit VÁLTOZATLAN");
  });

  test("rest-point KERESÉS anonimnak: a saját-pihenőpont provider null userId-nál üres, SIKERES eredményt ad (nem DB-hívás, nem 'unavailable')", () => {
    const up = readFileSync(join(ROOT, "lib/vedett-route/restStopFlow/discovery/userProvider.ts"), "utf-8");
    assert.match(up, /if \(params\.userId === null\) return \{ status: "ok", points: \[\] \};/);
    const r2p = readFileSync(join(ROOT, "app/api/vedett-route/rest-stops/route-to-rest-point/route.ts"), "utf-8");
    assert.match(r2p, /ref\.source === "USER" && auth\.userId !== null \? await listOwnRestPoints\(\) : \[\]/);
  });
});

// ── UI: anonim nem kap perzisztencia-felületet ──────────────────────────────

describe("UI: anonim (public read-only) mód", () => {
  const page = readFileSync(join(ROOT, "app/vedett-utvonal/page.tsx"), "utf-8");
  const workspace = readFileSync(join(ROOT, "components/vedett-utvonal/VedettUtvonalWorkspace.tsx"), "utf-8");
  const form = readFileSync(join(ROOT, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf-8");

  test("az oldal public szinten az anonimnak is a workspace-t adja, isAuthenticated={Boolean(user)}-tel", () => {
    assert.match(page, /if \(!user && VEDETT_ROUTE_ACCESS_LEVEL !== "public"\) \{/);
    assert.match(page, /isAuthenticated=\{Boolean\(user\)\}/);
  });
  test("a Workspace anonimnak nem rendereli a kedvenc-panelt, és továbbadja a flaget", () => {
    assert.match(workspace, /\{isAuthenticated && <FavoriteRoutesPanel /);
    assert.match(workspace, /isAuthenticated=\{isAuthenticated\}/);
  });
  test("a keresőforma anonimnak elrejti a kedvenc-mentést és a saját pihenőpont-hozzáadást", () => {
    assert.match(form, /\{isAuthenticated && \(\s*\n\s*<div className="rounded border border-dashed border-gray-300 p-3">/);
    assert.match(form, /\{isAuthenticated && \(\s*\n\s*<>\s*\n\s*\{restPanelMode === "ADD" && \(/);
  });
});
