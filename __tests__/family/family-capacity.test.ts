// VÉDETT CSALÁD — létszámkorlátok (20261030000000): értelmezés, megjelenítés,
// migráció-invariánsok. A tényleges kikényszerítést a scratch-DB SQL-teszt
// igazolja (supabase/tests/family_entitlement_limits_test.sql).
//   node --test --experimental-strip-types __tests__/family/family-capacity.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFamilyCapacityView, FAMILY_FREE_LIMITS, FAMILY_PLUS_LIMITS, parseFamilyCapacity } from "../../lib/family/capacity.ts";
import { parseFamilySubscriptionState } from "../../lib/family/entitlements.ts";
import { buildSubscriptionView } from "../../lib/family/subscriptionView.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20261030000000_family_entitlement_enforcement.sql");
const raw = (o: Record<string, unknown> = {}) => ({ children_used: 1, children_limit: 1, adults_used: 2, adults_limit: 2, ...o });

describe("get_family_capacity() értelmezése (fail closed)", () => {
  test("érvényes válasz", () => {
    assert.deepEqual(parseFamilyCapacity(raw()), { childrenUsed: 1, childrenLimit: 1, adultsUsed: 2, adultsLimit: 2 });
  });
  test("hibás vagy hiányos válasz -> null", () => {
    for (const bad of [null, undefined, [], "x", raw({ children_used: -1 }), raw({ adults_limit: 0 }), raw({ children_limit: 1.5 }), raw({ adults_used: "2" })]) {
      assert.equal(parseFamilyCapacity(bad), null, JSON.stringify(bad));
    }
  });
});

describe("létszám-megjelenítés", () => {
  test("ingyenes, teli család: Plusz-tájékoztatás, a meglévő hozzáférés megmarad", () => {
    const v = buildFamilyCapacityView(parseFamilyCapacity(raw())!);
    assert.equal(v.childrenLine, "Gyermekek: 1 / 1");
    assert.match(v.adultsLine, /függő meghívókkal együtt\): 2 \/ 2/);
    assert.ok(v.childrenFull && v.adultsFull);
    assert.match(v.hint ?? "", /Védett Család Plusz szükséges/);
    assert.match(v.hint ?? "", /meglévő családtagok és gyermekek hozzáférése nem változik/);
  });
  test("szabad hely: nincs figyelmeztetés", () => {
    const v = buildFamilyCapacityView(parseFamilyCapacity(raw({ children_used: 0, adults_used: 1 }))!);
    assert.equal(v.hint, null);
  });
  test("Plusz felső korlát", () => {
    const v = buildFamilyCapacityView(parseFamilyCapacity(raw({ children_used: 10, children_limit: 10, adults_used: 3, adults_limit: 10 }))!);
    assert.equal(v.hint, "Elérted a családonként felvehető legnagyobb létszámot.");
  });
  test("lejárat utáni, korlát feletti család (3/1) nem okoz hibát", () => {
    const v = buildFamilyCapacityView(parseFamilyCapacity(raw({ children_used: 3, adults_used: 4 }))!);
    assert.ok(v.childrenFull && v.adultsFull);
    assert.equal(v.childrenLine, "Gyermekek: 3 / 1");
  });
});

describe("előfizetési állapot: pilot és kiadott jogosultságok", () => {
  const base = { status: "free", plan_key: "free", effective_plan_key: "free", paid_access: false, features: [], trial_ends_at: null, current_period_end: null };
  test("régi DB-válasz (új kulcsok nélkül) is érvényes", () => {
    const s = parseFamilySubscriptionState(base)!;
    assert.deepEqual([s.grantedFeatures, s.pilot], [[], false]);
  });
  test("pilot-család", () => {
    const s = parseFamilySubscriptionState({ ...base, granted_features: ["family.children.multiple"], pilot: true })!;
    assert.equal(s.pilot, true);
    const v = buildSubscriptionView(s, new Date("2026-10-30T10:00:00Z"));
    assert.ok(v.available && v.pilot === true && v.planLabel === "Ingyenes");
  });
  test("hibás új kulcsok -> null", () => {
    assert.equal(parseFamilySubscriptionState({ ...base, pilot: "igen" }), null);
    assert.equal(parseFamilySubscriptionState({ ...base, granted_features: [1] }), null);
  });
});

describe("migráció-invariánsok (forrás-szint)", () => {
  test("korlátok: ingyenes 1 gyermek / 2 felnőtt, Plusz 10 / 10", () => {
    assert.match(MIG, /'family\.children\.multiple' then 10 else 1 end/);
    assert.match(MIG, /'family\.guardians\.multiple' then 10 else 2 end/);
    assert.deepEqual([FAMILY_FREE_LIMITS.children, FAMILY_FREE_LIMITS.adults, FAMILY_PLUS_LIMITS.children, FAMILY_PLUS_LIMITS.adults], [1, 2, 10, 10]);
  });
  test("családonkénti advisory lock minden kapacitás-triggerben", () => {
    assert.match(MIG, /pg_advisory_xact_lock\(hashtextextended\('family_capacity:' \|\| p_family_id::text, 0\)\)/);
    const triggers = MIG.match(/create or replace function public\.enforce_family_\w+\(\)[\s\S]*?\n\$\$;/g) ?? [];
    assert.equal(triggers.length, 3);
    for (const t of triggers) assert.match(t, /perform public\._family_capacity_lock\(new\.family_id\)/);
  });
  test("a felnőtt-helyekbe az aktív/függő tagság és a függő, le nem járt meghívó számít", () => {
    assert.match(MIG, /m\.status in \('active', 'pending'\)/);
    assert.match(MIG, /i\.status = 'pending' and i\.expires_at > now\(\)/);
  });
  test("pilot-megőrzés: a migráció előtt létező összes család, lejárat nélkül", () => {
    assert.match(MIG, /select f\.id, k\.feature_key, 'pilot_grandfather'\nfrom public\.families f/);
    assert.doesNotMatch(MIG.split("-- 3.")[0], /expires_at\s*,?\s*\)\s*\nselect/);
  });
  test("közvetlen INSERT/UPDATE lezárva, DELETE megmarad", () => {
    for (const p of ["family_members_insert_owner_or_admin", "family_members_update_owner_or_admin", "family_children_insert_owner_or_admin"]) {
      assert.match(MIG, new RegExp(`drop policy if exists "${p}"`));
    }
    assert.match(MIG, /revoke insert, update on public\.family_members from anon, authenticated;/);
    assert.match(MIG, /revoke insert, update on public\.family_children from anon, authenticated;/);
    assert.doesNotMatch(MIG, /drop policy[^\n]*delete/);
  });
  test("a jogosultság-kiadások táblája nem írható/olvasható közvetlenül", () => {
    assert.match(MIG, /revoke all on public\.family_feature_grants from public, anon, authenticated;/);
  });
  test("az utazási státusz, segítségkérés és napirend függvényeihez a migráció nem nyúl", () => {
    assert.doesNotMatch(MIG, /set_child_travel_status|child_travel_statuses|child_schedule_items|claim_child_travel_notification/);
  });
  test("lejáratkor nincs törlés", () => {
    assert.doesNotMatch(MIG.replace(/^--.*$/gm, ""), /\bdelete\s+from\b/i);
  });
});

describe("felület bekötése", () => {
  const page = read("app/csalad/page.tsx");
  const card = read("components/family/FamilySubscriptionCard.tsx");
  test("a létszám szerveroldalról, családonként jön", () => {
    assert.match(page, /getFamilyCapacity\(f\.id\)/);
    assert.match(page, /capacity=\{capacity\}/);
  });
  test("a kártya magyarul tájékoztat a korlátokról és a minden csomagban elérhető biztonsági funkciókról", () => {
    assert.match(card, /egy gyermek és két felnőtt/);
    assert.match(card, /segítségkérése, napirendje és az alapértesítések minden csomagban elérhetők/);
    assert.match(card, /Pilot-család/);
  });
});
