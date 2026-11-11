// Tulajdonosváltás utáni hozzáférés: meglévő család kezelése a családon belüli
// szerep alapján (pilotjog nélkül), új család létrehozása béta-kapus marad.
// Az adatbázis-oldali viselkedést a supabase/tests/family_owner_access_test.sql ellenőrzi.
//   node --test --experimental-strip-types __tests__/family/family-access.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideFamilyRoleAccess,
  familyAccessDeniedMessage,
  FAMILY_ACCESS_DENIED_MEMBER,
  FAMILY_ACCESS_DENIED_OWNER,
} from "../../lib/family/familyAccess.ts";

const read = (p: string) => readFileSync(p, "utf8");

describe("szerep szerinti döntés", () => {
  const owner = ["owner"] as const;
  const both = ["owner", "guardian"] as const;
  test("owner-művelet: csak aktív owner vagy admin", () => {
    assert.equal(decideFamilyRoleAccess({ isAdmin: false, role: "owner", allowed: owner }), true);
    assert.equal(decideFamilyRoleAccess({ isAdmin: false, role: "guardian", allowed: owner }), false);
    assert.equal(decideFamilyRoleAccess({ isAdmin: false, role: null, allowed: owner }), false);
    assert.equal(decideFamilyRoleAccess({ isAdmin: true, role: null, allowed: owner }), true);
  });
  test("napirend: owner és gondviselő is (a kezelési jogot az RPC ellenőrzi)", () => {
    assert.equal(decideFamilyRoleAccess({ isAdmin: false, role: "guardian", allowed: both }), true);
    assert.equal(decideFamilyRoleAccess({ isAdmin: false, role: null, allowed: both }), false);
  });
  test("hibaüzenetek", () => {
    assert.equal(familyAccessDeniedMessage(["owner"]), FAMILY_ACCESS_DENIED_OWNER);
    assert.equal(familyAccessDeniedMessage(["owner", "guardian"]), FAMILY_ACCESS_DENIED_MEMBER);
  });
});

describe("server actionök (forrás-ellenőrzés)", () => {
  const src = read("lib/actions/family.ts").replace(/^\s*\/\/.*$/gm, "");
  const fn = (name: string) => {
    const start = src.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, name);
    const next = src.indexOf("\nexport async function ", start + 10);
    return src.slice(start, next < 0 ? undefined : next);
  };
  test("béta-kapu csak az új család létrehozásán maradt", () => {
    assert.equal((src.match(/hasFamilyBetaAccess\(profile\)/g) ?? []).length, 1);
    assert.match(fn("createFamilyAction"), /hasFamilyBetaAccess\(profile\)/);
  });
  const ownerOnly = [
    "addChildAction", "updateChildAction", "inviteGuardianAction", "revokeGuardianInvitationAction",
    "updateGuardianChildScheduleAccessAction", "createChildAccountInvitationAction",
    "revokeChildAccountInvitationAction", "revokeChildAccountAction",
  ];
  for (const name of ownerOnly) {
    test(`${name}: családhoz kötött owner-ellenőrzés`, () => {
      assert.match(fn(name), /checkFamilyRole\(supabase, user\.id, profile, [^;]+, \["owner"\]\);/);
      assert.doesNotMatch(fn(name), /hasFamilyBetaAccess/);
    });
  }
  for (const name of ["createChildScheduleItemAction", "updateChildScheduleItemAction", "deleteChildScheduleItemAction"]) {
    test(`${name}: owner vagy gondviselő (RPC/RLS dönti el a kezelési jogot)`, () => {
      assert.match(fn(name), /checkFamilyRole\(supabase, user\.id, profile, [^;]+, \["owner", "guardian"\]\);/);
    });
  }
  test("a szerepet a felhasználó saját munkamenete olvassa, csak aktív tagságból", () => {
    assert.match(src, /from\("family_members"\)\s*\.select\("role"\)\s*\.eq\("family_id", familyId\)\s*\.eq\("user_id", userId\)\s*\.eq\("status", "active"\)/);
    assert.doesNotMatch(src, /createAdminClient/);
  });
});

describe("migráció (forrás-ellenőrzés)", () => {
  const mig = read("supabase/migrations/20261105000000_family_owner_access_and_ownership_log.sql");
  const code = mig.replace(/--.*$/gm, "");
  test("a gyermekprofil-RPC-ből kikerült a pilot-kapu, az owner/admin ellenőrzés maradt", () => {
    const ccp = code.slice(code.indexOf("function public.create_child_profile_for_family"), code.indexOf("create table if not exists public.family_ownership_events"));
    assert.doesNotMatch(ccp, /has_pilot_access/);
    assert.match(ccp, /is_family_owner\(p_family_id\)/);
    assert.doesNotMatch(code, /create_family_with_owner/, "az új család létrehozása érintetlen (béta-kapus)");
  });
  test("napló: RLS, csak olvasás owner/admin számára, írás csak az átadó függvényekből", () => {
    assert.match(code, /alter table public\.family_ownership_events enable row level security;/);
    assert.match(code, /revoke all on public\.family_ownership_events from public, anon, authenticated;/);
    assert.match(code, /grant select on public\.family_ownership_events to authenticated;/);
    assert.match(code, /using \(public\.is_family_owner\(family_id\) or public\.is_admin\(\)\)/);
    assert.equal((code.match(/insert into public\.family_ownership_events/g) ?? []).length, 2);
    const table = code.slice(code.indexOf("create table if not exists public.family_ownership_events"), code.indexOf("create index if not exists idx_family_ownership_events"));
    assert.doesNotMatch(table, /child|first_name|birth_year/);
  });
  test("a fióktörlési transfer hibaüzenetei változatlanok", () => {
    for (const m of ["Önmagadnak nem adhatod át a tulajdonjogot", "Csak a család aktív ownerje adhat át tulajdonjogot", "A kijelölt személy nem a család aktív guardian tagja"]) {
      assert.ok(code.includes(m), m);
    }
  });
});

describe("pilotjog-szabály dokumentálva és gyermekfiók/gondviselő szétválasztás (forrás-ellenőrzés)", () => {
  test("a béta-flag helyén rögzítve: a pilotjog csak új család létrehozására vonatkozik", () => {
    const cfg = read("lib/family/config.ts");
    assert.match(cfg, /KIZÁRÓLAG az ÚJ család létrehozását engedélyezi/);
    assert.match(cfg, /Családszintű felfüggesztés nincs\./);
  });
  test("20261106: mindkét irányú adatbázis-trigger, felhasználónkénti zár, csak élő kapcsolatokra", () => {
    const code = read("supabase/migrations/20261106000000_family_child_account_role_separation.sql").replace(/--.*$/gm, "");
    assert.match(code, /before insert or update of status, user_id on public\.family_members/);
    assert.match(code, /before insert or update of status, auth_user_id on public\.child_accounts/);
    assert.equal((code.match(/pg_advisory_xact_lock\(hashtextextended\('family_role_user:'/g) ?? []).length, 2);
    assert.match(code, /ca\.status <> 'revoked'/);
    assert.match(code, /fm\.status in \('active', 'pending'\)/);
    assert.equal((code.match(/hint = 'family_child_account_conflict'/g) ?? []).length, 2);
    assert.doesNotMatch(code, /\b(update|delete from) public\.(family_members|child_accounts)\b/, "meglévő adatot nem módosít");
  });
});
