// Közösségi bejelentések megőrzése — tiszta logika + forrásszintű ellenőrzések.
//   node --test __tests__/vedett-route/community-report-retention.test.ts
// Az FK/trigger viselkedést az izolált SQL-teszt fedi:
//   docs/account-deletion/tests/community_retention_test.sql

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPEAL_RETENTION_MONTHS,
  addMonths,
  hasOpenAppeal,
  isAppealRetained,
  selectDeletableReportIds,
} from "../../lib/community/retention.ts";

const read = (p: string) => readFileSync(p, "utf8");
const NOW = new Date("2030-06-15T12:00:00Z");
const ago = (months: number, days = 0) => {
  const d = addMonths(NOW, -months);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

describe("fellebbezés 3 éves megőrzése (lezárástól)", () => {
  test("3 év a lezárástól", () => assert.equal(APPEAL_RETENTION_MONTHS, 36));
  test("nyitott fellebbezés mindig megőrzendő", () => {
    for (const status of ["pending", "under_review", "ismeretlen"]) {
      assert.equal(isAppealRetained({ report_id: "r", status, closed_at: ago(100) }, NOW), true, status);
    }
  });
  test("lezárt, de ismeretlen lezárási idő (NULL / hibás) → megőrzendő", () => {
    assert.equal(isAppealRetained({ report_id: "r", status: "rejected", closed_at: null }, NOW), true);
    assert.equal(isAppealRetained({ report_id: "r", status: "upheld" }, NOW), true);
    assert.equal(isAppealRetained({ report_id: "r", status: "upheld", closed_at: "nem-datum" }, NOW), true);
  });
  test("határ: 3 év mínusz 1 nap → megőrzendő; 3 év + 1 nap → nem", () => {
    const justInside = addMonths(NOW, -36); justInside.setUTCDate(justInside.getUTCDate() + 1);
    assert.equal(isAppealRetained({ report_id: "r", status: "rejected", closed_at: justInside.toISOString() }, NOW), true);
    assert.equal(isAppealRetained({ report_id: "r", status: "rejected", closed_at: ago(36, 1) }, NOW), false);
  });
});

describe("törölhető bejelentések kiválasztása", () => {
  test("csak a megőrzendő fellebbezés nélküli bejelentés törölhető", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const appeals = [
      { report_id: "b", status: "pending", closed_at: null },
      { report_id: "c", status: "rejected", closed_at: ago(12) },
      { report_id: "d", status: "upheld", closed_at: ago(40) },
      { report_id: "e", status: "upheld", closed_at: null },
    ];
    assert.deepEqual(selectDeletableReportIds(ids, appeals, NOW), ["a", "d"]);
  });
  test("ha egy bejelentésnek bármely fellebbezése megőrzendő, nem törölhető", () => {
    const appeals = [
      { report_id: "x", status: "upheld", closed_at: ago(40) },
      { report_id: "x", status: "rejected", closed_at: ago(2) },
    ];
    assert.deepEqual(selectDeletableReportIds(["x"], appeals, NOW), []);
  });
  test("nyitott fellebbezés felismerése (anonimizálás tiltása)", () => {
    const appeals = [{ report_id: "x", status: "under_review" }, { report_id: "y", status: "rejected" }];
    assert.equal(hasOpenAppeal("x", appeals), true);
    assert.equal(hasOpenAppeal("y", appeals), false);
    assert.equal(hasOpenAppeal("z", appeals), false);
  });
});

describe("cleanup cron (forrásszint)", () => {
  const cron = read("app/api/cron/community-report-cleanup/route.ts");
  test("nincs csupa nulla UUID; anonimizáláskor NULL", () => {
    assert.ok(!cron.includes("00000000-0000-0000-0000-000000000000"));
    assert.match(cron, /reporter_user_id: null,/);
  });
  test("anonimizálás: nyitott fellebbezés esetén kimarad, legal_hold nélkül", () => {
    assert.match(cron, /hasOpenAppeal\(id, appeals\)/);
    assert.match(cron, /\.update\(\{[\s\S]*?\}\)\s*\.in\("id", ids\)\s*\.eq\("legal_hold", false\)/);
  });
  test("törlés: csak a megőrzési szűrőn átment azonosítók, hibánál semmi", () => {
    assert.match(cron, /selectDeletableReportIds\(delCandidateIds/);
    assert.match(cron, /\.delete\(\{ count: "exact" \}\)\s*\.in\("id", deletableIds\)/);
    assert.match(cron, /appeal fetch error \(no deletion\)/);
    assert.match(cron, /select\("report_id, status, closed_at"\)/);
    // a törlés előtt nincs feltétel nélküli delete a bejelentésekre
    assert.equal((cron.match(/from\("community_user_reports"\)\s*\.delete/g) ?? []).length, 1);
  });
});

describe("admin felület NULL-kezelése (forrásszint)", () => {
  test("bejelentő/bejelentett NULL esetén nincs .slice hívás NULL-on", () => {
    const page = read("app/admin/kozosseg/felhasznaloi-jelentesek/page.tsx");
    assert.match(page, /r\.reporter_user_id \? `\$\{r\.reporter_user_id\.slice\(0, 8\)\}…` : r\.anonymized_at \? "Anonimizálva" : "Törölt felhasználó"/);
    assert.match(page, /r\.reported_user_id \? `\$\{r\.reported_user_id\.slice\(0, 8\)\}…` : "Törölt felhasználó"/);
  });
  test("szankció csak létező bejelentett felhasználóra", () => {
    const actions = read("app/admin/kozosseg/felhasznaloi-jelentesek/AdminUserReportActions.tsx");
    assert.match(actions, /reportedUserId: string \| null;/);
    assert.match(actions, /status === "resolved_help_disabled" && reportedUserId\)/);
  });
  test("típusok: a bejelentés felhasználói hivatkozásai nullable-ek", () => {
    const types = read("lib/community/types.ts");
    assert.match(types, /reporter_user_id: string \| null;\r?\n\s*reported_user_id: string \| null;/);
    assert.match(types, /closed_at\?: string \| null;/);
  });
});
