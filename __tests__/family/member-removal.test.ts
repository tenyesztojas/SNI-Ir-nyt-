// Családtag eltávolítása és önkéntes kilépés — felületi döntések, bemenet-
// validálás, visszajelzés, valamint a server action / UI / migráció bekötése.
// Az adatbázis-oldali viselkedést a supabase/tests/family_member_removal_test.sql
// ellenőrzi (helyi, eldobható PostgreSQL).
//   node --test --experimental-strip-types __tests__/family/member-removal.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canLeaveFamily,
  canRemoveMember,
  memberActionNotice,
  MEMBER_ACTION_NOTICES,
  parseLeaveFamilyInput,
  parseRemoveMemberInput,
} from "../../lib/family/memberRemoval.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const G1 = "22222222-2222-4222-8222-222222222222";
const G2 = "33333333-3333-4333-8333-333333333333";
const FAM = "44444444-4444-4444-8444-444444444444";
const read = (p: string) => readFileSync(p, "utf8");
const form = (o: Record<string, unknown>) => (k: string) => o[k];

describe("ki lát eltávolító gombot", () => {
  test("owner másik gondviselőnél: igen", () => {
    assert.equal(canRemoveMember({ userId: OWNER, role: "owner" }, { userId: G1, role: "guardian" }), true);
  });
  test("owner másik ownernél és saját magánál: nem", () => {
    assert.equal(canRemoveMember({ userId: OWNER, role: "owner" }, { userId: G2, role: "owner" }), false);
    assert.equal(canRemoveMember({ userId: OWNER, role: "owner" }, { userId: OWNER, role: "guardian" }), false);
  });
  test("gondviselő senkinél: nem", () => {
    assert.equal(canRemoveMember({ userId: G1, role: "guardian" }, { userId: G2, role: "guardian" }), false);
  });
  test("ismeretlen néző: nem", () => {
    assert.equal(canRemoveMember(null, { userId: G1, role: "guardian" }), false);
    assert.equal(canRemoveMember({ userId: "nem-uuid", role: "owner" }, { userId: G1, role: "guardian" }), false);
  });
});

describe("ki léphet ki", () => {
  test("gondviselő igen, owner és ismeretlen nem", () => {
    assert.equal(canLeaveFamily({ userId: G1, role: "guardian" }), true);
    assert.equal(canLeaveFamily({ userId: OWNER, role: "owner" }), false);
    assert.equal(canLeaveFamily(null), false);
  });
});

describe("bemenet-validálás", () => {
  test("érvényes azonosítók", () => {
    assert.deepEqual(parseRemoveMemberInput(form({ familyId: FAM, userId: G1 })), { familyId: FAM, userId: G1 });
    assert.deepEqual(parseLeaveFamilyInput(form({ familyId: ` ${FAM} ` })), { familyId: FAM });
  });
  for (const bad of [{}, { familyId: FAM }, { familyId: "x", userId: G1 }, { familyId: FAM, userId: "'; drop table x; --" }, { familyId: null, userId: null }]) {
    test(`hibás eltávolítási bemenet: ${JSON.stringify(bad)}`, () => {
      assert.equal(parseRemoveMemberInput(form(bad)), null);
    });
  }
  test("hibás kilépési bemenet", () => {
    assert.equal(parseLeaveFamilyInput(form({})), null);
    assert.equal(parseLeaveFamilyInput(form({ familyId: "abc" })), null);
  });
});

describe("visszajelzés", () => {
  test("ismert kódok", () => {
    assert.equal(memberActionNotice("eltavolitva"), MEMBER_ACTION_NOTICES.eltavolitva);
    assert.equal(memberActionNotice(["kilepve"]), MEMBER_ACTION_NOTICES.kilepve);
  });
  test("ismeretlen vagy hiányzó érték: nincs üzenet (nincs visszatükrözött szöveg)", () => {
    for (const v of [undefined, null, "", "<script>", "toString", "__proto__", 1]) assert.equal(memberActionNotice(v), null);
  });
});

describe("bekötés (forrás-ellenőrzés)", () => {
  const actions = read("lib/actions/family.ts");
  const card = read("components/family/FamilyCard.tsx");
  const comp = read("components/family/FamilyMemberActions.tsx");
  const page = read("app/csalad/page.tsx");
  const mig = read("supabase/migrations/20261103000000_family_member_removal.sql");

  test("server actionök: csak RPC, a kilépésnek nincs felhasználó-paramétere", () => {
    assert.match(actions, /rpc\("remove_family_member", \{\s*p_family_id: input\.familyId,\s*p_user_id: input\.userId,\s*\}\)/);
    assert.match(actions, /rpc\("leave_family", \{ p_family_id: input\.familyId \}\)/);
    assert.doesNotMatch(actions, /from\("family_members"\)\s*\.(delete|update)/);
    const leave = actions.slice(actions.indexOf("export async function leaveFamilyAction"));
    assert.doesNotMatch(leave.slice(0, leave.indexOf("\n}\n") + 3), /userId/);
  });
  test("UI: jogosultság szerinti megjelenítés és megerősítő párbeszéd", () => {
    assert.match(card, /canRemoveMember\(viewer, member\)/);
    assert.match(card, /canLeaveFamily\(viewer\)/);
    assert.match(comp, /role="alertdialog"/);
    assert.match(comp, /aria-labelledby=\{titleId\}/);
    assert.match(comp, /Mégse/);
    assert.match(comp, /e\.key === "Escape"/);
    assert.match(comp, /min-h-\[44px\]/);
    assert.match(page, /currentUserId=\{user\.id\}/);
    assert.match(page, /role="status"/);
  });
  test("migráció: SECURITY DEFINER, rögzített search_path, szűk EXECUTE, DELETE lezárva", () => {
    for (const fn of ["remove_family_member(p_family_id uuid, p_user_id uuid)", "leave_family(p_family_id uuid)"]) {
      const body = mig.slice(mig.indexOf(`function public.${fn}`));
      assert.match(body.slice(0, 300), /security definer\s+set search_path = public, pg_temp/);
    }
    assert.match(mig, /revoke all on function public\.remove_family_member\(uuid, uuid\) from public, anon;/);
    assert.match(mig, /revoke all on function public\.leave_family\(uuid\) from public, anon;/);
    assert.match(mig, /revoke all on function public\._family_member_revoke\(uuid, uuid\) from public, anon, authenticated;/);
    assert.match(mig, /drop policy if exists "family_members_delete_owner_or_admin" on public\.family_members;/);
    assert.match(mig, /revoke delete on public\.family_members from anon, authenticated;/);
    assert.doesNotMatch(mig, /grant [^;]* to [^;]*anon/);
    assert.doesNotMatch(mig.replace(/--.*$/gm, ""), /revoke [^;]*service_role/, "a service_role jogai nem csökkenhetnek");
  });
});
