// Családi előfizetés alapjai — célzott tesztek (DB-viselkedés: supabase/tests/
// family_subscriptions_test.sql, scratch Postgresen).
//   node --test --experimental-strip-types __tests__/family/family-subscriptions.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideFamilyFeatureAccess,
  parseFamilySubscriptionState,
  PAYWALLED_FEATURES,
  FAMILY_FEATURES,
  FREE_FAMILY_FEATURES,
  ALWAYS_FREE_FEATURES,
  FAMILY_TRIAL_DAYS,
  type FamilyFeature,
} from "../../lib/family/entitlements.ts";
import { hasFamilyBetaAccess } from "../../lib/family/config.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const SQL = read("supabase/migrations/20261021_family_subscriptions_foundation.sql");
const TRIAL = read("supabase/migrations/20261022_family_trial_protection.sql");
const PW = new Set<FamilyFeature>(["family.notification.advanced"]);
const st = (o: Partial<Record<string, unknown>> = {}) =>
  parseFamilySubscriptionState({ status: "active", plan_key: "family_plus", effective_plan_key: "family_plus", paid_access: true, features: ["family.notification.advanced"], ...o });

describe("meglévő működés és béta-hozzáférés megőrzése", () => {
  test("jelenleg egyetlen funkció sincs fizetési kapu mögött", () => {
    assert.equal(PAYWALLED_FEATURES.size, 0);
    for (const f of FAMILY_FEATURES) {
      assert.equal(decideFamilyFeatureAccess({ feature: f, state: null, betaAccess: false }).allowed, true, f);
    }
  });
  test("béta/admin felhasználó fizetős funkciót is megtart, előfizetés nélkül is", () => {
    assert.equal(hasFamilyBetaAccess({ role: "user", pilotAccess: ["family_db_beta"] }), true);
    assert.equal(hasFamilyBetaAccess({ role: "admin", pilotAccess: [] }), true);
    const d = decideFamilyFeatureAccess({ feature: "family.notification.advanced", state: st({ status: "expired", paid_access: false, effective_plan_key: "free", features: [] }), betaAccess: true, paywalled: PW });
    assert.deepEqual(d, { allowed: true, reason: "beta" });
  });
  test("a migráció nem nyúl meglévő policy-hoz / pilot_access-hez", () => {
    for (const t of ["families", "family_members", "child_profiles", "family_children", "child_schedule_items", "child_accounts", "profiles"]) {
      assert.doesNotMatch(SQL, new RegExp(`(alter|drop)\\s+(table|policy)[^;]*\\bon\\s+public\\.${t}\\b`, "i"), t);
      assert.doesNotMatch(SQL, new RegExp(`alter table public\\.${t}\\b`, "i"), t);
    }
    assert.doesNotMatch(SQL, /update\s+public\.profiles|pilot_access\s*=/i);
  });
});

describe("lejárt / érvénytelen előfizetés (fizetési kapu bekapcsolva)", () => {
  test("hatályos fizetős állapot -> entitled; lejárt -> not_entitled", () => {
    assert.deepEqual(decideFamilyFeatureAccess({ feature: "family.notification.advanced", state: st(), betaAccess: false, paywalled: PW }), { allowed: true, reason: "entitled" });
    for (const status of ["expired", "canceled", "past_due", "trialing", "active"]) {
      const s = st({ status, paid_access: false, effective_plan_key: "free", features: [] });
      assert.equal(decideFamilyFeatureAccess({ feature: "family.notification.advanced", state: s, betaAccess: false, paywalled: PW }).allowed, false, status);
    }
  });
  test("hiányzó / hibás állapot -> zárva (fail closed)", () => {
    assert.deepEqual(decideFamilyFeatureAccess({ feature: "family.notification.advanced", state: null, betaAccess: false, paywalled: PW }), { allowed: false, reason: "no_state" });
    for (const bad of [null, [], "x", {}, { status: "gold", plan_key: "p", effective_plan_key: "p", paid_access: true, features: [] },
      { status: "active", plan_key: "p", effective_plan_key: "p", paid_access: "true", features: [] },
      { status: "active", plan_key: "p", effective_plan_key: "p", paid_access: true, features: [1] }]) {
      assert.equal(parseFamilySubscriptionState(bad), null, JSON.stringify(bad));
    }
  });
  test("más csomag funkciója nem ad jogot", () => {
    const s = st({ features: ["family.schedule"] });
    assert.equal(decideFamilyFeatureAccess({ feature: "family.notification.advanced", state: s, betaAccess: false, paywalled: PW }).allowed, false);
  });
});

describe("migráció: jogosulatlan módosítás és családok közötti hozzáférés (statikus)", () => {
  test("írás csak service_role; authenticated/anon semmit", () => {
    assert.match(SQL, /revoke all on public\.subscription_plans, public\.subscription_plan_features,\s*public\.family_subscriptions, public\.family_subscription_events\s*from public, anon, authenticated;/);
    assert.match(SQL, /grant select on public\.family_subscriptions to authenticated;/);
    assert.doesNotMatch(SQL, /grant (insert|update|delete)[^;]*to authenticated/i);
    assert.doesNotMatch(SQL, /create policy[^;]*for (insert|update|delete|all)\b/i);
    assert.match(SQL, /grant execute on function public\.set_family_subscription_state\([^)]*\) to service_role;/);
    assert.match(SQL, /revoke all on function public\.set_family_subscription_state\([^)]*\) from public, anon, authenticated;/);
    assert.match(SQL, /revoke all on function public\._family_subscription_effective\(uuid\) from public, anon, authenticated;/);
  });
  test("olvasás csak a saját család aktív tagjának", () => {
    assert.match(SQL, /for select to authenticated using \(public\.is_family_member\(family_id\) or public\.is_admin\(\)\)/);
    assert.match(SQL, /if not \(public\.is_family_member\(p_family_id\) or public\.is_admin\(\)\) then\s*return null;/);
  });
  test("állapotok, idempotencia, család-kötés", () => {
    assert.match(SQL, /check \(status in \('free', 'trialing', 'active', 'past_due', 'canceled', 'expired'\)\)/);
    assert.match(SQL, /family_id\s+uuid not null unique references public\.families \(id\) on delete cascade/);
    assert.match(SQL, /family_subscription_events_provider_event_uniq/);
    assert.match(SQL, /'duplicate', true/);
  });
  test("szerveroldali belépési pont: session-kliens, nincs service role, kliensállapot nem bemenet", () => {
    const s = read("lib/family/entitlementsServer.ts");
    assert.match(s, /supabase\.rpc\("get_family_subscription_state", \{ p_family_id: familyId \}\)/);
    assert.doesNotMatch(s, /createAdminClient|SERVICE_ROLE/);
    assert.match(s, /if \(error\) return null;/);
    assert.match(s, /hasFamilyBetaAccess\(profile\)/);
  });
});

describe("jogosultság-kulcsok és próbaidő (20261022)", () => {
  test("kulcsok egyeznek a teszt-DB-vel; 4 ingyenes + 8 Plusz a migrációban", () => {
    assert.deepEqual([...FAMILY_FEATURES], [
      "family.child_profile.basic", "family.schedule.basic", "family.safety.basic", "family.notification.basic",
      "family.children.multiple", "family.schedule.advanced", "family.guardians.multiple", "family.notification.advanced",
    ]);
    assert.equal((TRIAL.match(/\('free', 'family\./g) ?? []).length, 4);
    assert.equal((TRIAL.match(/\('family_plus', 'family\./g) ?? []).length, 8);
    for (const f of FAMILY_FEATURES) assert.ok(TRIAL.includes(`'${f}'`), f);
  });
  test("alapfunkciók (biztonság is) fizetési kapuval sem zárhatók", () => {
    const all = new Set<FamilyFeature>(FAMILY_FEATURES);
    for (const f of FREE_FAMILY_FEATURES) {
      assert.deepEqual(decideFamilyFeatureAccess({ feature: f, state: null, betaAccess: false, paywalled: all }), { allowed: true, reason: "always_free" });
    }
    assert.ok(ALWAYS_FREE_FEATURES.has("family.safety.basic"));
    for (const f of PAYWALLED_FEATURES) assert.ok(!ALWAYS_FREE_FEATURES.has(f));
  });
  test("lejárt próbaidő: Plusz-funkció zárva, ha egyszer kapu mögé kerül", () => {
    const s = parseFamilySubscriptionState({ status: "trialing", plan_key: "family_plus", effective_plan_key: "free", paid_access: false, features: [...FREE_FAMILY_FEATURES] });
    assert.equal(decideFamilyFeatureAccess({ feature: "family.schedule.advanced", state: s, betaAccess: false, paywalled: new Set(["family.schedule.advanced"]) }).allowed, false);
  });
  test("próbaidő-szabályok a migrációban", () => {
    assert.equal(FAMILY_TRIAL_DAYS, 14);
    assert.match(TRIAL, /new\.trial_ends_at <> new\.trial_started_at \+ interval '14 days'/);
    assert.match(TRIAL, /raise exception 'trial_already_used'/);
    assert.match(TRIAL, /raise exception 'trial_end_is_server_defined'/);
    assert.match(TRIAL, /create trigger protect_family_trial_history_trigger\s+before update or delete on public\.family_subscriptions/);
    assert.match(TRIAL, /create trigger prevent_family_trial_restart_trigger\s+before insert or update on public\.family_subscriptions/);
    assert.match(TRIAL, /pg_advisory_xact_lock/);
    assert.match(TRIAL, /on conflict \(source, provider_event_id\) where provider_event_id is not null do nothing/);
    assert.match(TRIAL, /grant execute on function public\.set_family_subscription_state\([^)]*\) to service_role;/);
    assert.doesNotMatch(TRIAL, /grant [^;]*to authenticated/);
  });
});
