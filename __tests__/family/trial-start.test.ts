// Próbaidő-indítás (szerveroldali mag + bekötés) — célzott tesztek. A DB-oldali
// jogosultság/zárolás: supabase/tests/start_family_trial_test.sql (scratch PG).
//   node --test --experimental-strip-types __tests__/family/trial-start.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFamilyTrialStartEnabled, mapTrialStartRpc, startFamilyTrialCore, trialStartEventId, type TrialStartDeps } from "../../lib/family/trialStart.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const F = "11111111-2222-4333-8444-555555555555";

function deps(rpc: (id: string) => Promise<unknown>, over: Partial<TrialStartDeps> = {}) {
  const calls: string[] = [];
  const d: TrialStartDeps = {
    enabled: () => true,
    getUserId: async () => "u1",
    startTrialRpc: async (id) => { calls.push(id); return rpc(id); },
    ...over,
  };
  return { d, calls };
}

describe("RPC-válaszok leképezése", () => {
  test("tulajdonos / ismételt / gondviselő / idegen / korábbi próbaidő / aktív előfizetés", () => {
    assert.deepEqual(mapTrialStartRpc({ ok: true, started: true }), { ok: true, started: true });
    assert.deepEqual(mapTrialStartRpc({ ok: true, started: false }), { ok: true, started: false });
    assert.deepEqual(mapTrialStartRpc({ ok: false, error: "not_owner" }), { ok: false, error: "not_owner" });
    assert.deepEqual(mapTrialStartRpc({ ok: false, error: "not_eligible" }), { ok: false, error: "not_eligible" });
    assert.deepEqual(mapTrialStartRpc({ ok: false, error: "not_authenticated" }), { ok: false, error: "not_authenticated" });
  });
  test("ismeretlen / hibás válasz sosem siker, belső hibaszöveg nem jut ki", () => {
    for (const bad of [null, [], "ok", {}, { ok: true }, { ok: "true", started: true }, { ok: false, error: "permission denied for table x" }, { ok: false }]) {
      assert.deepEqual(mapTrialStartRpc(bad), { ok: false, error: "unavailable" }, JSON.stringify(bad));
    }
  });
});

describe("szerveroldali mag", () => {
  test("kikapcsolva: nincs adatbázis-hívás", async () => {
    const x = deps(async () => ({ ok: true, started: true }), { enabled: () => false });
    assert.deepEqual(await startFamilyTrialCore(x.d, F), { ok: false, error: "disabled" });
    assert.equal(x.calls.length, 0);
  });
  test("hibás azonosító / bejelentkezés nélkül: nincs hívás", async () => {
    for (const bad of [null, 1, "x", `${F}' or 1=1`]) {
      const x = deps(async () => ({ ok: true, started: true }));
      assert.deepEqual(await startFamilyTrialCore(x.d, bad), { ok: false, error: "invalid_family" });
      assert.equal(x.calls.length, 0);
    }
    const y = deps(async () => ({ ok: true, started: true }), { getUserId: async () => null });
    assert.deepEqual(await startFamilyTrialCore(y.d, F), { ok: false, error: "not_authenticated" });
    assert.equal(y.calls.length, 0);
  });
  test("a jogosultságot az RPC dönti el (idegen család -> not_owner)", async () => {
    const x = deps(async () => ({ ok: false, error: "not_owner" }));
    assert.deepEqual(await startFamilyTrialCore(x.d, F.toUpperCase()), { ok: false, error: "not_owner" });
    assert.deepEqual(x.calls, [F]);
  });
  test("RPC-hiba -> unavailable, sosem dob", async () => {
    const x = deps(async () => { throw new Error("relation does not exist"); });
    assert.deepEqual(await startFamilyTrialCore(x.d, F), { ok: false, error: "unavailable" });
  });
});

describe("bekötés és migráció (statikus)", () => {
  const a = read("lib/actions/familyTrial.ts");
  const sql = read("supabase/migrations/20261023_start_family_trial_rpc.sql");
  test("alapértelmezetten kikapcsolva, a kapcsoló a kliens létrehozása előtt", () => {
    assert.equal(isFamilyTrialStartEnabled({}), false);
    assert.equal(isFamilyTrialStartEnabled({ FAMILY_TRIAL_START_ENABLED: "1" }), false);
    assert.ok(a.indexOf("isFamilyTrialStartEnabled(process.env)) return") < a.indexOf("createClient()"));
  });
  test("session-kliens RPC, nincs service_role, nincs kliensdátum", () => {
    assert.match(a, /supabase\.rpc\("start_family_trial", \{ p_family_id: id \}\)/);
    assert.doesNotMatch(a, /createAdminClient|SERVICE_ROLE|set_family_subscription_state|p_trial_ends_at/);
  });
  test("RPC: definer, rögzített search_path, auth.uid(), minimális EXECUTE, közös zár, csak trialing", () => {
    assert.match(sql, /security definer\s+set search_path = public, pg_temp/);
    assert.match(sql, /v_uid uuid := auth\.uid\(\);/);
    assert.match(sql, /revoke all on function public\.start_family_trial\(uuid\) from public, anon;/);
    assert.match(sql, /grant execute on function public\.start_family_trial\(uuid\) to authenticated;/);
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('family_subscription:' \|\| p_family_id::text, 0\)\)/);
    assert.match(sql, /role = 'owner' and status = 'active'\s+for share;/);
    assert.match(sql, /p_status => 'trialing'/);
    assert.match(sql, /p_provider_event_id => 'trial_start:' \|\| p_family_id::text/);
    assert.doesNotMatch(sql, /p_trial_ends_at|p_current_period/);
    assert.equal(trialStartEventId(F.toUpperCase()), `trial_start:${F}`);
  });
  test("a /csalad gomb még nincs bekötve", () => {
    assert.doesNotMatch(read("components/family/FamilySubscriptionCard.tsx"), /startFamilyTrialAction|familyTrial/);
    assert.doesNotMatch(read("app/csalad/page.tsx"), /startFamilyTrialAction/);
  });
});
