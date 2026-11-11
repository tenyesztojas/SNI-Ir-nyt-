// Családtulajdonosi szerep átadása — jelöltek, láthatóság, bemenet-validálás,
// valamint a server action / UI / migráció bekötése. Az adatbázis-oldali
// viselkedést a supabase/tests/family_ownership_handover_test.sql és a
// family_ownership_handover_concurrency.mjs ellenőrzi (helyi PostgreSQL).
//   node --test --experimental-strip-types __tests__/family/ownership-handover.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canHandOverOwnership, handoverCandidates, parseHandoverInput } from "../../lib/family/ownershipHandover.ts";
import { memberActionNotice, MEMBER_ACTION_NOTICES } from "../../lib/family/memberRemoval.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const G1 = "22222222-2222-4222-8222-222222222222";
const G2 = "33333333-3333-4333-8333-333333333333";
const O2 = "55555555-5555-4555-8555-555555555555";
const FAM = "44444444-4444-4444-8444-444444444444";
const members = [
  { userId: OWNER, role: "owner" as const, displayName: "Owner" },
  { userId: G1, role: "guardian" as const, displayName: "Gondviselő 1" },
  { userId: G2, role: "guardian" as const, displayName: "Gondviselő 2" },
  { userId: O2, role: "owner" as const, displayName: "Másik owner" },
];
const read = (p: string) => readFileSync(p, "utf8");

describe("jelöltek és láthatóság", () => {
  test("owner: csak az aktív gondviselők választhatók, más owner és saját maga nem", () => {
    assert.deepEqual(handoverCandidates({ userId: OWNER, role: "owner" }, members).map((m) => m.userId), [G1, G2]);
    assert.equal(canHandOverOwnership({ userId: OWNER, role: "owner" }, members), true);
  });
  test("gondviselő és ismeretlen néző: nincs átadás", () => {
    assert.deepEqual(handoverCandidates({ userId: G1, role: "guardian" }, members), []);
    assert.equal(canHandOverOwnership(null, members), false);
    assert.equal(canHandOverOwnership({ userId: "nem-uuid", role: "owner" }, members), false);
  });
  test("owner, de nincs gondviselő: nincs átadás", () => {
    assert.equal(canHandOverOwnership({ userId: OWNER, role: "owner" }, [members[0]]), false);
  });
});

describe("bemenet-validálás", () => {
  test("érvényes", () => {
    assert.deepEqual(parseHandoverInput((k) => ({ familyId: FAM, newOwnerUserId: G1 } as Record<string, unknown>)[k]), { familyId: FAM, newOwnerUserId: G1 });
  });
  for (const bad of [{}, { familyId: FAM }, { familyId: FAM, newOwnerUserId: "" }, { familyId: "x", newOwnerUserId: G1 }, { familyId: FAM, newOwnerUserId: "1 or 1=1" }]) {
    test(`hibás: ${JSON.stringify(bad)}`, () => {
      assert.equal(parseHandoverInput((k) => (bad as Record<string, unknown>)[k]), null);
    });
  }
  test("siker-visszajelzés", () => {
    assert.equal(memberActionNotice("atadva"), MEMBER_ACTION_NOTICES.atadva);
  });
});

describe("bekötés (forrás-ellenőrzés)", () => {
  const actions = read("lib/actions/family.ts");
  const card = read("components/family/FamilyCard.tsx");
  const comp = read("components/family/OwnershipHandover.tsx");
  const mig = read("supabase/migrations/20261104000000_family_ownership_handover.sql");
  const migCode = mig.replace(/--.*$/gm, "");

  test("server action: csak az új RPC, közvetlen family_members írás nincs", () => {
    assert.match(actions, /rpc\("handover_family_ownership", \{\s*p_family_id: input\.familyId,\s*p_new_owner_user_id: input\.newOwnerUserId,\s*\}\)/);
    assert.doesNotMatch(actions, /from\("family_members"\)\s*\.(update|delete|upsert|insert)/);
  });
  test("UI: csak jelöltek esetén, megerősítő párbeszéddel, következmények ismertetésével", () => {
    assert.match(card, /handoverCandidates\(viewer, family\.members\)/);
    assert.match(card, /candidates\.length > 0 && \(/);
    assert.match(comp, /role="alertdialog"/);
    assert.match(comp, /<label htmlFor=\{selectId\}/);
    assert.match(comp, /Te aktív gondviselő maradsz/);
    assert.match(comp, /e\.key === "Escape"/);
    assert.match(comp, /min-h-\[44px\]/);
  });
  test("migráció: előbb előléptetés, utána lefokozás; zárak; szűk jogok; a régi transfer érintetlen", () => {
    const promote = migCode.indexOf("set role = 'owner' where id = v_target.id");
    const demote = migCode.indexOf("set role = 'guardian' where id = v_caller.id");
    assert.ok(promote > 0 && demote > promote, "az előléptetés a lefokozás előtt fut");
    assert.match(migCode, /security definer\s+set search_path = public, pg_temp/);
    assert.match(migCode, /pg_advisory_xact_lock\(hashtextextended\('family_capacity:'/);
    assert.match(migCode, /revoke all on function public\.handover_family_ownership\(uuid, uuid\) from public, anon;/);
    assert.match(migCode, /revoke update on public\.family_members from anon, authenticated;/);
    assert.doesNotMatch(migCode, /transfer_family_ownership/);
    assert.doesNotMatch(migCode, /service_role/);
  });
});
