// Előfizetési felület — célzott tesztek.
//   node --test --experimental-strip-types __tests__/family/subscription-view.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSubscriptionView, FAMILY_FEATURE_LABELS, FAMILY_PLUS_PRICES, formatHuf } from "../../lib/family/subscriptionView.ts";
import { FAMILY_FEATURES, FREE_FAMILY_FEATURES, parseFamilySubscriptionState } from "../../lib/family/entitlements.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const NOW = new Date("2026-10-21T10:00:00Z");
const st = (o: Record<string, unknown>) =>
  parseFamilySubscriptionState({ status: "free", plan_key: "free", effective_plan_key: "free", paid_access: false, features: [], trial_ends_at: null, current_period_end: null, ...o });

describe("csomagmegjelenítés", () => {
  test("4 alap + 4 többletfunkció, kulcsok egyeznek a jogosultsági modullal", () => {
    assert.deepEqual(FAMILY_FEATURE_LABELS.map((f) => f.key), [...FAMILY_FEATURES]);
    assert.deepEqual(FAMILY_FEATURE_LABELS.filter((f) => f.plan === "free").map((f) => f.key), [...FREE_FAMILY_FEATURES]);
    assert.equal(FAMILY_FEATURE_LABELS.filter((f) => f.plan === "plus").length, 4);
  });
  test("tervezett árak", () => {
    assert.deepEqual(FAMILY_PLUS_PRICES, { monthlyHuf: 1990, yearlyHuf: 19900, planned: true });
    assert.equal(formatHuf(1990), "1 990 Ft");
    assert.equal(formatHuf(19900), "19 900 Ft");
  });
});

describe("próbaidő-állapot", () => {
  test("még nem használt -> felajánlható", () => {
    const v = buildSubscriptionView(st({}), NOW);
    assert.ok(v.available && v.trial.kind === "eligible" && v.planLabel === "Ingyenes");
  });
  test("aktív próbaidő -> Plusz, lejárati dátummal; nem ajánlható újra", () => {
    const v = buildSubscriptionView(st({ status: "trialing", plan_key: "family_plus", effective_plan_key: "family_plus", paid_access: true, trial_ends_at: "2026-11-04T10:00:00Z" }), NOW);
    assert.ok(v.available && v.trial.kind === "active" && v.planLabel === "Plusz");
    assert.match((v as { trial: { endsAt: string } }).trial.endsAt, /2026\. november 4\./);
  });
  test("lejárt próbaidő -> Ingyenes, felhasználtként; nem ajánlható újra", () => {
    const v = buildSubscriptionView(st({ status: "trialing", plan_key: "family_plus", trial_ends_at: "2026-10-01T10:00:00Z" }), NOW);
    assert.ok(v.available && v.trial.kind === "used" && v.planLabel === "Ingyenes");
  });
  test("fizetős előfizetés lemondva: próbaidő felhasználva, időszak vége látszik", () => {
    const v = buildSubscriptionView(st({ status: "canceled", plan_key: "family_plus", effective_plan_key: "family_plus", paid_access: true, trial_ends_at: "2026-09-01T00:00:00Z", current_period_end: "2026-11-30T00:00:00Z" }), NOW);
    assert.ok(v.available && v.trial.kind === "used" && v.planLabel === "Plusz" && v.statusLabel === "Lemondva" && v.periodEndLabel);
  });
});

describe("jogosultság nélküli hozzáférés / hibás adat", () => {
  test("nincs állapot (nem tag, hiba, hiányzó migráció) -> nem elérhető, nincs próbaidő-ajánlat", () => {
    assert.deepEqual(buildSubscriptionView(null, NOW), { available: false });
    assert.equal(parseFamilySubscriptionState({ status: "active", plan_key: "p", effective_plan_key: "p", paid_access: true, features: [], trial_ends_at: 5 }), null);
  });
  test("adatforrás: session-kliens RPC, nincs service role a felületen", () => {
    const page = read("app/csalad/page.tsx");
    assert.match(page, /buildSubscriptionView\(await getFamilySubscriptionState\(f\.id\), subscriptionNow\)/);
    for (const f of ["components/family/FamilySubscriptionCard.tsx", "lib/family/subscriptionView.ts", "app/csalad/page.tsx", "lib/family/entitlementsServer.ts"]) {
      assert.doesNotMatch(read(f), /createAdminClient|SERVICE_ROLE|service_role/, f);
    }
    // a gyermek-saját ág előbb tér vissza
    assert.ok(page.indexOf("return <ChildTodayView") < page.indexOf("subscriptionViews"));
  });
});

describe("nincs működőnek látszó vásárlás / korlátozás", () => {
  const card = read("components/family/FamilySubscriptionCard.tsx");
  test("minden gomb letiltott és Hamarosan jelölésű; nincs űrlap, link, kliens-JS", () => {
    const buttons = card.match(/<button[\s\S]*?<\/button>/g) ?? [];
    assert.equal(buttons.length, 2);
    for (const b of buttons) {
      assert.match(b, /\sdisabled\s/);
      assert.match(b, /Hamarosan/);
      assert.doesNotMatch(b, /onClick|formAction/);
    }
    assert.doesNotMatch(card, /"use client"|<form|<a |href=|fetch\(/);
    assert.match(card, /Tervezett díj/);
    assert.match(card, /view\.trial\.kind === "eligible" && \(/);
  });
  test("a meglévő családi felület változatlanul renderelődik", () => {
    const page = read("app/csalad/page.tsx");
    assert.match(page, /families\.map\(\(family\) => \(\s*<FamilyCard key=\{family\.id\}/);
    assert.match(page, /<TravelStatusLive childIds=\{visibleChildIds\}/);
  });
});
