// VédettSarok — „vármegye” → „megye” terminológia: normalizálás, megjelenítés,
// keresési kompatibilitás és bekötés.
//   node --test --experimental-strip-types __tests__/geo/county-name.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUDAPEST,
  HUNGARIAN_COUNTY_NAMES,
  countiesEqual,
  countyQueryVariants,
  formatCountyLabel,
  isKnownCounty,
  normalizeCountyName,
  replaceVarmegyeInText,
} from "../../lib/geo/countyName.ts";
import { HUNGARIAN_COUNTIES } from "../../lib/vedettmunka/categories.ts";
import { MEGYEK } from "../../lib/vedettmunka/telepulesek.ts";
import settlements from "../../data/hungarian-settlements.json" with { type: "json" };

const read = (p: string) => readFileSync(p, "utf8");

describe("megyelista és megjelenítés", () => {
  test("19 megye + Budapest; a meglévő listák (állás, CV) ugyanezt a 20 nevet tartalmazzák", () => {
    assert.equal(HUNGARIAN_COUNTY_NAMES.length, 19);
    const all = new Set([...HUNGARIAN_COUNTY_NAMES, BUDAPEST]);
    assert.deepEqual(new Set(HUNGARIAN_COUNTIES), all);
    assert.deepEqual(new Set(MEGYEK), all);
  });

  test("minden megye címkéje „X megye”, sehol nincs „vármegye”", () => {
    for (const n of HUNGARIAN_COUNTY_NAMES) {
      assert.equal(formatCountyLabel(n), `${n} megye`);
      assert.equal(formatCountyLabel(`${n} vármegye`), `${n} megye`);
      assert.doesNotMatch(formatCountyLabel(n)!, /vármegye/i);
    }
  });

  test("Budapest önálló egység: címke „Budapest”, nem Pest megye", () => {
    assert.equal(formatCountyLabel("Budapest"), "Budapest");
    assert.equal(normalizeCountyName("Budapest főváros"), "Budapest");
    assert.equal(normalizeCountyName("Budapest vármegye"), "Budapest");
    assert.equal(countiesEqual("Budapest", "Pest"), false);
    assert.equal(countiesEqual("Budapest", "Pest megye"), false);
    assert.ok(!countyQueryVariants("Budapest").some((v) => /^Pest/.test(v)));
    assert.ok(!countyQueryVariants("Pest").includes("Budapest"));
  });

  test("a településadat megyeértékei változatlanul feldolgozhatók (Budapest: nincs megye)", () => {
    const list = settlements as Array<{ name: string; county: string | null }>;
    for (const s of list) {
      if (s.county === null) continue;
      assert.equal(isKnownCounty(s.county), true, s.county);
      assert.equal(normalizeCountyName(s.county), s.county);
    }
    assert.ok(list.some((s) => s.name === "Budapest" && s.county === null));
  });
});

describe("keresési kompatibilitás (régi és új kifejezés)", () => {
  test("„Pest megye”, „Pest vármegye”, ékezet nélkül, kisbetűvel → „Pest”", () => {
    for (const q of ["Pest", "Pest megye", "Pest vármegye", "pest varmegye", "PEST VÁRMEGYE", "Pest megyei", "  Pest   megye "]) {
      assert.equal(normalizeCountyName(q), "Pest", q);
      assert.equal(countiesEqual(q, "Pest"), true, q);
    }
    assert.equal(normalizeCountyName("Győr - Moson - Sopron vármegye"), "Győr-Moson-Sopron");
    assert.equal(normalizeCountyName("szabolcs-szatmar-bereg megye"), "Szabolcs-Szatmár-Bereg");
  });

  test("adatbázis-szűrő: a régi tárolt alakok is a változatok között vannak", () => {
    const v = countyQueryVariants("Pest megye");
    for (const stored of ["Pest", "Pest megye", "Pest vármegye", "Pest Vármegye"]) assert.ok(v.includes(stored), stored);
    assert.deepEqual(countyQueryVariants("Pest vármegye").slice(0, 1), ["Pest"]);
    assert.deepEqual(countyQueryVariants(""), []);
    assert.deepEqual(countyQueryVariants(null), []);
  });

  test("a keresési eredmény változatlan: régi és új kifejezés ugyanazt a halmazt szűri", () => {
    const rows = [
      { id: 1, county: "Pest" },
      { id: 2, county: "Pest vármegye" },
      { id: 3, county: "Budapest" },
      { id: 4, county: "Fejér" },
      { id: 5, county: "Pest megye" },
    ];
    const filterDb = (q: string) => rows.filter((r) => countyQueryVariants(q).includes(r.county)).map((r) => r.id);
    const filterMem = (q: string) => rows.filter((r) => countiesEqual(r.county, q)).map((r) => r.id);
    for (const q of ["Pest", "Pest megye", "Pest vármegye"]) {
      assert.deepEqual(filterDb(q), [1, 2, 5]);
      assert.deepEqual(filterMem(q), [1, 2, 5]);
    }
    assert.deepEqual(filterDb("Budapest"), [3]);
    assert.deepEqual(filterMem("Fejér vármegye"), [4]);
  });

  test("ismeretlen szabad szöveg nem vész el (csak a végződés kerül le)", () => {
    assert.equal(normalizeCountyName("Kolozs vármegye"), "Kolozs");
    assert.equal(normalizeCountyName("Ismeretlen hely"), "Ismeretlen hely");
    assert.equal(normalizeCountyName(null), null);
    assert.equal(normalizeCountyName("   "), null);
  });
});

describe("külső (Mapbox) szöveg megjelenítése", () => {
  test("„vármegye” szóalakok → „megye”, összetett tulajdonnév érintetlen", () => {
    assert.equal(replaceVarmegyeInText("Szabadság út, Budaörs, 2040, Pest vármegye, Magyarország"),
      "Szabadság út, Budaörs, 2040, Pest megye, Magyarország");
    assert.equal(replaceVarmegyeInText("Vármegyék listája, vármegyében, VÁRMEGYE"), "Megyék listája, megyében, MEGYE");
    assert.equal(replaceVarmegyeInText("Pest Vármegyeháza"), "Pest Vármegyeháza");
    assert.equal(replaceVarmegyeInText(undefined), undefined);
  });
});

describe("bekötés (forráskód)", () => {
  test("felhasználói felületen nincs „vármegye” felirat", () => {
    for (const f of [
      "app/kozosseg/bekapcsolas/CommunityOnboardingForm.tsx",
      "app/kozosseg/profilom/ProfileEditForm.tsx",
      "app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx",
    ]) {
      const visible = read(f).replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(visible, /[Vv]ármegy/, f);
    }
    assert.match(read("app/kozosseg/bekapcsolas/CommunityOnboardingForm.tsx"), /<label className="label-field">Megye<\/label>/);
    assert.match(read("app/kozosseg/profilom/ProfileEditForm.tsx"), /<label className="label-field">Megye<\/label>/);
  });

  test("felhasználói és admin szűrők a központi normalizálót használják", () => {
    assert.match(read("lib/vedettmunka/data.ts"), /query\.in\("county", countyQueryVariants\(filters\.county\)\)/);
    assert.match(read("lib/community/data.ts"), /query\.in\("county", countyQueryVariants\(filters\.county\)\)/);
    assert.match(read("app/vedettmunka/allasok/page.tsx"), /normalizeCountyName\(searchParams\.county\)/);
    assert.match(read("app/vedettmunka/allasok/AllasokFilterClient.tsx"), /countiesEqual\(l\.county, selectedCounty\)/);
    assert.match(read("app/vedettmunka/actions.ts"), /countiesEqual\(job\.county, alert\.county\)/);
    assert.match(read("app/api/cron/send-weekly-job-alerts/route.ts"), /!countiesEqual\(job\.county, alert\.county\)/);
    assert.match(read("app/kozosseg/actions.ts"), /normalizeCountyName\(formData\.county\)/);
  });

  test("a belső azonosítók változatlanok (county, lakhely_megye mezők, select name)", () => {
    assert.match(read("app/vedettmunka/hirdetes-feladas/HirdetesForm.tsx"), /<select name="county"/);
    assert.match(read("app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx"), /lakhely_megye: e\.target\.value/);
    assert.match(read("app/vedettmunka/allasok/AllasokFilterClient.tsx"), /name="county"/);
  });

  test("Mapbox-címek megjelenítése normalizált (a külső kérés változatlan)", () => {
    assert.match(read("lib/vedett-route/car/restStops/mapboxSearchAlongRoute.ts"), /const address = replaceVarmegyeInText\(/);
    assert.match(read("app/api/admin/vedett-utvonal/address-retrieve/route.ts"), /const label = replaceVarmegyeInText\(/);
  });
});
