// Fióktörlés API v2 — regressziós tesztek a tranzakciós delete_own_account /
// get_account_deletion_state_v2 RPC-integrációhoz (DB nélkül, tiszta leképezés + statikus).
//   node --test --experimental-strip-types __tests__/vedett-route/account-delete-api-v2.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const S: any = await import(pathToFileURL(resolve(ROOT, "lib/account/deletionState.ts")).href);
const DRAFT = "docs/account-deletion/migration/20261020000000_delete_own_account.DRAFT.sql";

describe("GET: get_account_deletion_state_v2 mapping", () => {
  test("ready state passes through", () => {
    const r = S.interpretDeletionStateRpc({ state: "READY", transfer: [], family_deletion: [] }, null);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, state: "READY", transfer: [], family_deletion: [] });
    assert.equal(r.deleted, false);
  });
  test("RECORDS_MANUAL_REVIEW is a known state; reasons are not exposed", () => {
    const r = S.interpretDeletionStateRpc(
      { state: "RECORDS_MANUAL_REVIEW", reasons: ["appeal_open", "legal_hold"], transfer: [], family_deletion: [] }, null);
    assert.equal(r.status, 200);
    assert.equal(r.body.state, "RECORDS_MANUAL_REVIEW");
    assert.equal("reasons" in r.body, false);
    assert.ok(S.MANUAL_REVIEW_STATES.includes("RECORDS_MANUAL_REVIEW"));
    assert.ok(!S.DELETE_ALLOWED_STATES.includes("RECORDS_MANUAL_REVIEW"));
  });
  test("rpc error or unknown state -> 500 generic", () => {
    for (const [d, e] of [[null, { code: "42883" }], [{ state: "READY" }, { code: "P0001" }], [{ state: "NOPE" }, null], [null, null]]) {
      const r = S.interpretDeletionStateRpc(d, e);
      assert.equal(r.status, 500);
      assert.equal(r.body.message, S.ACCOUNT_DELETION_GENERIC_ERROR);
    }
  });
});

describe("POST: delete_own_account mapping (fail closed)", () => {
  test("only strict ok:true is a successful deletion", () => {
    const r = S.interpretDeleteOwnAccountRpc({ ok: true, state: "READY", deleted_families: 0, deleted_children: 0 }, null);
    assert.equal(r.deleted, true);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });
  test("malformed / errored responses are never success", () => {
    const bad: Array<[unknown, unknown]> = [
      [null, null], [[], null], ["ok", null], [{}, null], [{ ok: "true", state: "READY" }, null],
      [{ ok: 1 }, null], [{ ok: true }, { code: "P0001", message: "Bejelentkezés szükséges" }],
      [{ ok: false, state: "NOPE" }, null], [{ ok: false }, null],
    ];
    for (const [d, e] of bad) {
      const r = S.interpretDeleteOwnAccountRpc(d, e);
      assert.equal(r.deleted, false, JSON.stringify(d));
      assert.equal(r.status, 500, JSON.stringify(d));
      assert.equal(r.body.ok, false);
    }
  });
  test("records check (RECORDS_MANUAL_REVIEW) -> 409, not deleted, Hungarian message", () => {
    const r = S.interpretDeleteOwnAccountRpc(
      { ok: false, transfer: [], family_deletion: [], state: "RECORDS_MANUAL_REVIEW", reasons: ["admin_account"] }, null);
    assert.equal(r.status, 409);
    assert.equal(r.deleted, false);
    assert.equal(r.body.code, "RECORDS_MANUAL_REVIEW");
    assert.equal(r.body.message, S.RECORDS_MANUAL_REVIEW_MESSAGE);
    assert.match(r.body.message, /nem törlődött/);
    assert.match(r.body.message, /kapcsolat@vedettsarok\.hu/);
    assert.equal("reasons" in r.body, false);
  });
  test("db_constraint rollback -> 409; blocked_by/sqlstate only in server diagnostics", () => {
    const r = S.interpretDeleteOwnAccountRpc({
      ok: false, state: "RECORDS_MANUAL_REVIEW", reasons: ["db_constraint"],
      blocked_by: "community_report_appeals.community_report_appeals_report_id_fkey", sqlstate: "23503",
      transfer: [], family_deletion: [],
    }, null);
    assert.equal(r.status, 409);
    assert.equal(r.deleted, false);
    assert.deepEqual(r.diagnostics, { blocked_by: "community_report_appeals.community_report_appeals_report_id_fkey", sqlstate: "23503" });
    const json = JSON.stringify(r.body);
    assert.doesNotMatch(json, /blocked_by|sqlstate|23503|community_report_appeals/);
  });
  test("classifier-blocked states -> 409 with the existing Hungarian messages", () => {
    const cases: Record<string, string> = {
      OWNER_TRANSFER_REQUIRED: S.OWNER_TRANSFER_REQUIRED_MESSAGE,
      SOLE_OWNER_FAMILY_DELETE_CONFIRMATION_REQUIRED: S.SOLE_OWNER_CONFIRMATION_REQUIRED_MESSAGE,
      COMPLEX_FAMILY_MANUAL_REVIEW: S.MANUAL_REVIEW_MESSAGE,
      CHILD_ACCOUNT_MANUAL_REVIEW: S.MANUAL_REVIEW_MESSAGE,
      CHILD_ACCOUNT_USER: S.CHILD_ACCOUNT_USER_MESSAGE,
    };
    for (const [state, msg] of Object.entries(cases)) {
      const transfer = state === "OWNER_TRANSFER_REQUIRED" ? [{ family_id: "f", family_name: "F", candidates: [] }] : [];
      const r = S.interpretDeleteOwnAccountRpc({ ok: false, state, transfer, family_deletion: [] }, null);
      assert.equal(r.status, 409, state);
      assert.equal(r.deleted, false, state);
      assert.equal(r.body.code, state);
      assert.equal(r.body.message, msg, state);
      assert.deepEqual(r.body.transfer, transfer);
    }
    assert.equal(S.OWNER_TRANSFER_REQUIRED_MESSAGE,
      "Mielőtt törölheted a fiókodat, át kell adnod a család tulajdonjogát egy másik aktív családtagnak.");
    assert.equal(S.SOLE_OWNER_CONFIRMATION_REQUIRED_MESSAGE,
      "A család és a kizárólagos gyermekadatok törléséhez külön megerősítés szükséges.");
  });
});

describe("route: identity, RPC contract, no admin chain", () => {
  const route = strip(read("app/api/account/delete/route.ts"));
  test("GET uses v2 state RPC after getUser()", () => {
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    assert.ok(get.indexOf("auth.getUser()") >= 0 && get.indexOf("auth.getUser()") < get.indexOf('rpc("get_account_deletion_state_v2")'));
    assert.doesNotMatch(route, /rpc\("get_account_deletion_state"\)/);
  });
  test("POST: getUser -> confirm -> delete_own_account(p_confirm_family_deletion) -> signOut", () => {
    const post = route.slice(route.indexOf("export async function POST"));
    const i = (s: string) => post.indexOf(s);
    assert.ok(i("auth.getUser()") >= 0);
    assert.ok(i("auth.getUser()") < i("body.confirm !== true"));
    assert.ok(i("body.confirm !== true") < i('rpc("delete_own_account"'));
    assert.ok(i('rpc("delete_own_account"') < i("if (!result.deleted)"));
    assert.ok(i("if (!result.deleted)") < i("auth.signOut()"));
    assert.ok(i("auth.signOut()") < i("vu_signed_out"));
    assert.match(post, /const confirmFamilyDeletion = body\.confirmFamilyDeletion === true;/);
    // Az RPC-nek egyetlen paramétere van; user id nem kerül át (auth.uid() a JWT-ből).
    assert.match(post, /rpc\("delete_own_account", \{\s*p_confirm_family_deletion: confirmFamilyDeletion,?\s*\}\)/);
    assert.doesNotMatch(route, /user\.id|body\??\.(user_?id|userId|id)\b|searchParams/);
  });
  test("old two-step chain and service role are gone", () => {
    assert.doesNotMatch(route, /prepare_account_deletion|deleteUser|createAdminClient|auth\.admin|SERVICE_ROLE/);
    assert.doesNotMatch(read("app/api/account/delete/route.ts"), /@\/lib\/supabase\/admin/);
  });
  test("RPC names/params match the SQL contract", () => {
    const sql = read(DRAFT);
    assert.match(sql, /function public\.delete_own_account\(p_confirm_family_deletion boolean default false\)\s*returns jsonb/);
    assert.match(sql, /function public\.get_account_deletion_state_v2\(\)\s*returns jsonb/);
    assert.match(sql, /revoke execute on function public\.delete_own_account\(boolean\) from public, anon;/);
    assert.match(sql, /grant execute on function public\.delete_own_account\(boolean\) to authenticated;/);
    assert.match(sql, /revoke execute on function public\.get_account_deletion_state_v2\(\) from public, anon;/);
    assert.match(sql, /'state', 'RECORDS_MANUAL_REVIEW'/);
    assert.match(sql, /'ok', true,\s*'state', v_state/);
  });
});

describe("UI + iOS account page", () => {
  const ui = read("components/DeleteAccountSection.tsx");
  test("RECORDS_MANUAL_REVIEW shows a message and never a delete button", () => {
    assert.match(ui, /state === "RECORDS_MANUAL_REVIEW" && \(/);
    assert.match(ui, /RECORDS_MANUAL_REVIEW_MESSAGE/);
    const canDelete = ui.slice(ui.indexOf("const canDelete"), ui.indexOf(";", ui.indexOf("const canDelete")));
    assert.doesNotMatch(canDelete, /RECORDS_MANUAL_REVIEW/);
    const btnAt = ui.indexOf("disabled={busy || !canDelete}");
    const btnCond = ui.slice(ui.lastIndexOf("{(state ===", btnAt), btnAt);
    assert.match(btnCond, /READY/);
    assert.doesNotMatch(btnCond, /MANUAL_REVIEW|CHILD_ACCOUNT_USER/);
  });
  test("success only on res.ok && json.ok; navigation after that", () => {
    assert.match(ui, /if \(!res\.ok \|\| !json\?\.ok\) \{/);
    assert.ok(ui.indexOf("if (!res.ok || !json?.ok)") < ui.indexOf("window.location.assign(afterDeleteHref)"));
    assert.match(ui, /fetch\("\/api\/account\/delete", \{\s*method: "POST"/);
    assert.match(ui, /confirm: true,/);
  });
  test("/vedett-utvonal/fiok uses the same DeleteAccountSection/API and stays in the WebView", () => {
    const page = read("app/vedett-utvonal/fiok/page.tsx");
    assert.match(page, /import DeleteAccountSection from "@\/components\/DeleteAccountSection"/);
    assert.match(page, /<DeleteAccountSection afterDeleteHref=\{VEDETT_UTVONAL_AFTER_DELETE_PATH\} \/>/);
    assert.match(read("lib/vedett-route/native/iosAccount.ts"), /VEDETT_UTVONAL_AFTER_DELETE_PATH = "\/vedett-utvonal"/);
  });
});
