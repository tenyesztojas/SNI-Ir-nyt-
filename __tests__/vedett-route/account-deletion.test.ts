// Fióktörlési lifecycle — statikus/contract tesztek. A DB-viselkedést (Family-törlés,
// trigger, owner transfer) a supabase/tests/account_deletion_lifecycle.sql
// valós Postgres-szel ellenőrzi (scratch DB-n).
//   node --test --experimental-strip-types __tests__/vedett-route/account-deletion.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const states: any = await import(pathToFileURL(resolve(ROOT, "lib/account/deletionState.ts")).href);
const MIG = "supabase/migrations/20261004_account_deletion_lifecycle.sql";

describe("API contract", () => {
  test("state set is stable", () => {
    assert.deepEqual([...states.ACCOUNT_DELETION_STATES], [
      "READY", "GUARDIAN_READY", "OTHER_OWNER_READY", "OWNER_TRANSFER_REQUIRED",
      "SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED", "COMPLEX_FAMILY_MANUAL_REVIEW",
      "CHILD_ACCOUNT_MANUAL_REVIEW", "CHILD_ACCOUNT_USER",
    ]);
    assert.equal(states.parseAccountDeletionStatus({ state: "NOPE" }), null);
    assert.equal(states.parseAccountDeletionStatus(null), null);
    assert.equal(states.parseAccountDeletionStatus({ state: "READY" }).transfer.length, 0);
  });
  test("13. identity only from auth.getUser(); no user id from request", () => {
    for (const f of ["app/api/account/delete/route.ts", "app/api/account/transfer-owner/route.ts"]) {
      const src = strip(read(f));
      assert.match(src, /supabase\.auth\.getUser\(\)/);
      assert.match(src, /status: 401/);
      assert.doesNotMatch(src, /body\??\.(user_?id|userId|id)\b|searchParams/);
    }
    const del = strip(read("app/api/account/delete/route.ts"));
    assert.match(del, /deleteUser\(user\.id\)/);
    assert.ok(del.indexOf("prepare_account_deletion") < del.indexOf("deleteUser("), "RPC runs before auth deletion");
  });
  test("transfer route delegates authz to the RPC (target is a candidate, not identity)", () => {
    const src = strip(read("app/api/account/transfer-owner/route.ts"));
    assert.match(src, /transfer_family_ownership/);
    assert.match(src, /p_target_user_id/);
  });
  test("child-account and manual-review states are distinct, no auto child-account deletion", () => {
    assert.notEqual(states.CHILD_ACCOUNT_USER_MESSAGE, states.MANUAL_REVIEW_MESSAGE);
    const mig = strip(read(MIG));
    assert.doesNotMatch(mig, /delete\s+from\s+public\.child_accounts/i);
  });
});

describe("migration safety", () => {
  const mig = strip(read(MIG));
  test("no general trigger bypass, no FK changes", () => {
    assert.doesNotMatch(mig, /pg_trigger_depth/i);
    assert.doesNotMatch(mig, /alter table[\s\S]*?(drop|add) constraint/i);
    assert.doesNotMatch(mig, /disable trigger|session_replication_role/i);
  });
  test("trigger exception needs the tx-local setting AND a vanished families row", () => {
    assert.match(mig, /current_setting\('vedettsarok\.family_deletion_id', true\)/);
    assert.match(mig, /not exists \(select 1 from public\.families f where f\.id = old\.family_id\)/);
    assert.match(mig, /set_config\('vedettsarok\.family_deletion_id', v_fid::text, true\)/);
  });
  test("RPCs use auth.uid() and are not callable by anon; internal classifier is private", () => {
    for (const fn of ["get_account_deletion_state()", "transfer_family_ownership(uuid, uuid)", "prepare_account_deletion(boolean)"]) {
      assert.match(mig, new RegExp(`revoke execute on function public\\.${fn.replace(/[()]/g, "\\$&")} from public, anon`));
    }
    assert.match(mig, /_account_deletion_classify\(uuid\) from public, anon, authenticated/);
    assert.match(mig, /auth\.uid\(\)/);
  });
  test("deletion order: children data before family_children/child_profiles, families last", () => {
    const i = (s: string) => mig.indexOf(s);
    const seq = [
      "delete from public.child_schedule_items",
      "delete from public.guardian_child_permissions where child_id",
      "delete from public.child_account_invitations",
      "delete from public.family_children",
      "delete from public.child_profiles",
      "delete from public.family_guardian_invitations",
      "delete from public.families",
    ].map(i);
    assert.ok(seq.every((x) => x > 0));
    assert.deepEqual([...seq].sort((a, b) => a - b), seq);
  });
});

describe("public deletion page + UI", () => {
  test("14. /fiok-torles is public and has the login button", () => {
    const page = read("app/fiok-torles/page.tsx");
    assert.match(page, /VédettSarok-fiók törlése/);
    assert.match(page, /Bejelentkezés és fióktörlés/);
    assert.match(page, /\/belepes\?next=%2Ffiok-torles/);
    assert.match(page, /kapcsolat@vedettsarok\.hu/);
    const mw = read("middleware.ts");
    assert.doesNotMatch(mw, /fiok-torles/); // nincs auth-gate / blokkolás
  });
  test("15. no unauthenticated email-only deletion", () => {
    const page = strip(read("app/fiok-torles/page.tsx"));
    assert.doesNotMatch(page, /<form|<input|type="email"|fetch\(|action=/i);
  });
  test("UI covers transfer + destructive confirmation + manual review", () => {
    const ui = read("components/DeleteAccountSection.tsx");
    assert.match(ui, /Új owner kinevezése/);
    assert.match(ui, /type="radio"/);
    assert.match(ui, /type="checkbox"/);
    assert.doesNotMatch(ui, /defaultChecked|useState\(true\)/);
    assert.match(ui, /véglegesen törlődnek/);
    assert.match(ui, /kapcsolat@vedettsarok\.hu/);
    assert.doesNotMatch(ui, /createAdminClient|SERVICE_ROLE/);
    assert.match(ui, /Fiókom végleges törlése/);
  });
  test("privacy notice updated; Google Play TODO removed", () => {
    const pn = read("app/adatkezelesi-tajekoztato/page.tsx");
    assert.match(pn, /VU AT 13\.2\./);
    assert.match(pn, /\/fiok-torles/);
    assert.doesNotMatch(pn, /TODO PRIVACY RELEASE: Google Play/);
  });
});
