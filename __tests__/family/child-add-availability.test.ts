// Gyermekfelvételi UX (154. lépés): betelt gyermekkorlátnál az űrlap helyett
// tájékoztató jelenik meg. Az állapot KIZÁRÓLAG a szerveroldali
// get_family_capacity() eredményéből származik; a DB-trigger és a szerverakció
// változatlan. Statikus/tiszta teszt: nem kapcsolódik Supabase-hez, nem ír adatot.
//   node --test --experimental-strip-types __tests__/family/child-add-availability.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHILD_LIMIT_FREE_NOTICE,
  childAddAvailability,
  FAMILY_FREE_LIMITS,
  FAMILY_PLUS_LIMITS,
  parseFamilyCapacity,
} from "../../lib/family/capacity.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// A get_family_capacity() nyers válaszán keresztül, ahogy a szerver kapja.
const cap = (children_used: number, children_limit: number) =>
  parseFamilyCapacity({ children_used, children_limit, adults_used: 1, adults_limit: children_limit === 1 ? 2 : 10 });

describe("childAddAvailability — csomagkorlát alapján", () => {
  test("Free 0/1: gyermekfelvétel elérhető", () => {
    assert.deepEqual(childAddAvailability(cap(0, FAMILY_FREE_LIMITS.children)), { canAdd: true, notice: null });
  });

  test("Free 1/1: nem érhető el, Plusz-tájékoztató jelenik meg", () => {
    const a = childAddAvailability(cap(1, FAMILY_FREE_LIMITS.children));
    assert.equal(a.canAdd, false);
    assert.equal(a.notice, CHILD_LIMIT_FREE_NOTICE);
    assert.match(a.notice!, /Védett Család Plusz/);
    assert.match(a.notice!, /hamarosan/);
  });

  test("Plusz: a tényleges (10-es) korlát dönt", () => {
    assert.equal(childAddAvailability(cap(1, FAMILY_PLUS_LIMITS.children)).canAdd, true);
    assert.equal(childAddAvailability(cap(9, FAMILY_PLUS_LIMITS.children)).canAdd, true);
    const full = childAddAvailability(cap(10, FAMILY_PLUS_LIMITS.children));
    assert.equal(full.canAdd, false);
    assert.match(full.notice!, /legnagyobb gyermekszámot \(10\)/);
    assert.doesNotMatch(full.notice!, /Plusz szükséges/);
  });

  test("korlátváltozás után az új szerveroldali állapot számít", () => {
    // Free 1/1 -> Plusz-ra váltás után ugyanannyi gyermekkel: újra elérhető.
    assert.equal(childAddAvailability(cap(1, 1)).canAdd, false);
    assert.equal(childAddAvailability(cap(1, 10)).canAdd, true);
    // Plusz lejárta után (10 -> 1) a meglévő 2 gyermek mellett: nem elérhető.
    assert.equal(childAddAvailability(cap(2, 1)).canAdd, false);
    // Gyermek eltávolítása után (0/1): újra elérhető.
    assert.equal(childAddAvailability(cap(0, 1)).canAdd, true);
  });

  test("ismeretlen létszám (hibás/hiányzó RPC-válasz): az űrlap marad, a DB véd", () => {
    assert.deepEqual(childAddAvailability(null), { canAdd: true, notice: null });
    assert.deepEqual(childAddAvailability(parseFamilyCapacity({ children_used: "1" })), { canAdd: true, notice: null });
  });
});

describe("bekötés: szerveroldali forrás, nincs kliensoldali megkerülés", () => {
  const page = read("app/csalad/page.tsx");
  const card = read("components/family/FamilyCard.tsx");
  const form = read("components/family/AddChildForm.tsx");
  const actions = read("lib/actions/family.ts");
  const mig = read("supabase/migrations/20261030000000_family_entitlement_enforcement.sql");

  test("a /csalad szerverkomponens a get_family_capacity() eredményéből számol", () => {
    assert.doesNotMatch(page, /^["']use client["']/m);
    assert.match(page, /getFamilyCapacity\(f\.id\)/);
    assert.match(page, /childAdd: childAddAvailability\(capacity\)/);
    assert.match(page, /childAdd=\{subscriptionViews\.find\(\(v\) => v\.family\.id === family\.id\)\?\.childAdd\}/);
  });

  test("FamilyCard: betelt korlátnál nincs űrlap és nincs gomb/link, csak tájékoztató", () => {
    assert.doesNotMatch(card, /^["']use client["']/m);
    const block = card.slice(card.indexOf('family.myRole === "owner" &&\n          (childAdd'), card.indexOf("<AddChildForm familyId"));
    assert.ok(block.length > 0, "a feltételes blokk nem található");
    assert.match(block, /childAdd && !childAdd\.canAdd/);
    assert.match(block, /data-testid="child-limit-notice"/);
    assert.doesNotMatch(block, /<button|<a\s|<Link|href=|onClick/);
  });

  test("az űrlap nem kap csomag-/korlátállapotot a klienstől", () => {
    assert.doesNotMatch(form, /childrenLimit|canAdd|plan|subscription/i);
  });

  test("a szerverakció és a DB-trigger változatlanul kikényszeríti a korlátot", () => {
    const add = actions.slice(actions.indexOf("export async function addChildAction"), actions.indexOf("export async function updateChildAction"));
    assert.match(add, /rpc\(\s*"create_child_profile_for_family"/);
    assert.match(add, /revalidatePath\("\/csalad"\)/);
    assert.doesNotMatch(add, /childAddAvailability|canAdd/);
    assert.match(mig, /create trigger enforce_family_child_limit_trigger/);
    assert.match(mig, /if v_used \+ 1 > v_limit then/);
  });
});
