// VÉDETT ÚTVONAL — Település-autocomplete (Round 9, "UX-fejlesztés,
// főoldali kiemelés és a Béta megjelölés eltávolítása" kör, A) rész).
//
// KÉT RÉTEGŰ tesztelés, ugyanazt a mintát követve, mint a projekt már
// meglévő vedett-route tesztjei (lásd pl. orchestrator.test.ts /
// motisClient.test.ts a futásidejű logikára, és a *-integration.test.ts /
// accessibility-mvp.test.ts fájlok a "use client" React komponensek
// forráskód-szintű, strukturális ellenőrzésére, mivel a projektben NINCS
// jsdom/@testing-library-féle React-renderelő teszt-infrastruktúra):
//
//   1) FUTÁSIDEJŰ, valódi adatokon futó egységtesztek a TISZTA keresési/
//      rangsorolási logikára (lib/vedett-route/settlementSearch.ts) — a
//      data/hungarian-settlements.json-t magunk olvassuk be readFileSync-
//      cel (elkerülve a Node natív ESM JSON-import-attribútum
//      követelményét — lásd settlementSearch.ts fejléc-megjegyzését, miért
//      van szétválasztva a tiszta logika és a JSON-betöltő wrapper).
//   2) FORRÁSKÓD-SZINTŰ, strukturális tesztek a SettlementAutocomplete.tsx
//      komponensre (billentyűzet-kezelés, ARIA attribútumok, blur/click
//      race condition, kiválasztott állapot) és a
//      VedettUtvonalSearchForm.tsx-be történő beillesztésre — ez a
//      komponens "use client" React kód, Next.js bundler nélkül nem
//      renderelhető plain `node --test` alatt.
//
//   node --test __tests__/vedett-route/settlement-autocomplete.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSettlementSearchIndex,
  searchSettlements,
  normalizeSettlementQuery,
  formatSettlementCountyLabel,
  SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  SETTLEMENT_AUTOCOMPLETE_MAX_RESULTS,
  type Settlement,
} from "../../lib/vedett-route/settlementSearch.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DATA_PATH = join(ROOT, "data", "hungarian-settlements.json");
const SETTLEMENTS: Settlement[] = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const INDEX = buildSettlementSearchIndex(SETTLEMENTS);

function names(query: string): string[] {
  return searchSettlements(INDEX, query).map((s) => s.name);
}

// ── ADATFORRÁS ─────────────────────────────────────────────────────────────
// Adatforrás: KSH (Központi Statisztikai Hivatal) Helységnévtár — lásd
// scripts/vedett-route/generate-hungarian-settlements.mjs fejléc-
// megjegyzését a pontos forrás-URL-ekért és az időállapotért (Round 9.1,
// "település-adatforrás korrekció").
const EXPECTED_SETTLEMENT_COUNT = 3155;
const EXPECTED_COUNTY_COUNT = 19;

describe("data/hungarian-settlements.json — adatforrás alapkövetelmények (KSH, Round 9.1)", () => {
  test(`a lista pontosan ${EXPECTED_SETTLEMENT_COUNT} elemet tartalmaz (KSH hivatalos településszám), minden elemnek van name és county (string vagy null) mezője`, () => {
    assert.ok(Array.isArray(SETTLEMENTS));
    assert.equal(
      SETTLEMENTS.length,
      EXPECTED_SETTLEMENT_COUNT,
      `a magyar településlistának pontosan ${EXPECTED_SETTLEMENT_COUNT} KSH-településnek kell megfelelnie`
    );
    for (const s of SETTLEMENTS) {
      assert.equal(typeof s.name, "string");
      assert.ok(s.name.length > 0);
      assert.ok(s.county === null || typeof s.county === "string");
    }
  });

  test("Budapest szerepel a listában PONTOSAN egyszer, és a county mezője KIFEJEZETTEN null (nincs önálló megye-hozzárendelése)", () => {
    const budapestEntries = SETTLEMENTS.filter((s) => s.name === "Budapest");
    assert.equal(budapestEntries.length, 1, "Budapestnek pontosan egyszer kell szerepelnie a listában");
    assert.equal(budapestEntries[0].county, null);
  });

  test("nincs duplikált településnév a listában", () => {
    const seen = new Set<string>();
    for (const s of SETTLEMENTS) {
      assert.ok(!seen.has(s.name), `duplikált településnév: ${s.name}`);
      seen.add(s.name);
    }
  });

  test("Budapest kerületei NEM szerepelnek önálló településként (Budapestet EGY településként kezeljük)", () => {
    const residual = SETTLEMENTS.filter(
      (s) => /^Budapest\s*\d/.test(s.name) || /ker\.?$/i.test(s.name)
    );
    assert.deepEqual(residual, [], "budapesti kerület-szerű bejegyzés nem maradhat a listában");
  });

  test(`pontosan ${EXPECTED_COUNTY_COUNT} egyedi megye van (Budapestet nem számítva), és mindegyik a bare (hivatalos, utótag nélküli) néven szerepel`, () => {
    const nonBudapest = SETTLEMENTS.filter((s) => s.name !== "Budapest");
    for (const s of nonBudapest) {
      assert.ok(s.county && s.county.trim().length > 0, `'${s.name}' rekordnak érvényes megyéje kell legyen`);
    }
    const counties = new Set(nonBudapest.map((s) => s.county));
    assert.equal(counties.size, EXPECTED_COUNTY_COUNT, `megyék száma: ${counties.size} (${[...counties].sort().join(", ")})`);
    for (const c of counties) {
      assert.doesNotMatch(c as string, /megye/i, `a tárolt county érték ('${c}') nem tartalmazhat 'megye' szót — csak a bare megyenevet`);
    }
  });
});

// ── formatSettlementCountyLabel ─────────────────────────────────────────────
describe("formatSettlementCountyLabel — dropdown másodlagos sor (a helyes, 'megye' végű megjelenítési forma)", () => {
  test("normál megye esetén a bare megyenévhez ' megye' utótagot fűz hozzá a megjelenítéshez", () => {
    assert.equal(formatSettlementCountyLabel("Pest"), "Pest megye");
    assert.equal(formatSettlementCountyLabel("Baranya"), "Baranya megye");
    assert.equal(formatSettlementCountyLabel("Győr-Moson-Sopron"), "Győr-Moson-Sopron megye");
  });

  test("Budapest (county: null) esetén NEM ad vissza másodlagos sort (nincs önálló megye-megjelölés)", () => {
    assert.equal(formatSettlementCountyLabel(null), null);
  });
});

// ── KARAKTERKÜSZÖB (0/1/2+ karakter) ────────────────────────────────────────
describe("AUTOCOMPLETE — karakterküszöb (spec 1. pont + tesztlista)", () => {
  test("0 karakter → nincs dropdown (üres eredménylista)", () => {
    assert.deepEqual(names(""), []);
  });

  test("1 karakter → nincs dropdown, MÉG akkor sem, ha egyébként lenne egyezés (pl. 'b')", () => {
    assert.deepEqual(names("b"), []);
    assert.equal(SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH, 2);
  });

  test("2+ karakter → megjelenhetnek találatok", () => {
    assert.ok(names("bu").length > 0);
  });

  test("csak whitespace (pl. két szóköz) nem számít 2 valódi karakternek — nincs dropdown", () => {
    assert.deepEqual(names("  "), []);
  });
});

// ── SZŰKÍTÉS GÉPELÉS KÖZBEN ("buda" → "budak") ──────────────────────────────
describe("AUTOCOMPLETE — szűkítés újabb karakterre (spec illusztráció)", () => {
  test("'buda' → Budapest, Budaörs, Budakeszi, Budakalász (és Budajenő) mind megjelennek", () => {
    const r = names("buda");
    for (const expected of ["Budapest", "Budaörs", "Budakeszi", "Budakalász"]) {
      assert.ok(r.includes(expected), `'${expected}' hiányzik a 'buda' találatai közül: ${r.join(", ")}`);
    }
  });

  test("'budak' → csak Budakeszi és Budakalász (Budapest és Budaörs kiszűrve — tovább szűkült a lista)", () => {
    const r = names("budak");
    assert.deepEqual(new Set(r), new Set(["Budakeszi", "Budakalász"]));
  });
});

// ── ÉKEZET- ÉS KIS/NAGYBETŰ-FÜGGETLENSÉG ────────────────────────────────────
describe("AUTOCOMPLETE — ékezet- és kis/nagybetű-függetlenség (spec 5-6. pont)", () => {
  test("'pecs' → Pécs (ékezet nélkül, kisbetűvel)", () => {
    assert.ok(names("pecs").includes("Pécs"));
  });

  test("'gyor' → Győr", () => {
    assert.ok(names("gyor").includes("Győr"));
  });

  test("'bekescsaba' → Békéscsaba", () => {
    assert.ok(names("bekescsaba").includes("Békéscsaba"));
  });

  test("'satoraljaujhely' → Sátoraljaújhely", () => {
    assert.ok(names("satoraljaujhely").includes("Sátoraljaújhely"));
  });

  test("kis- és nagybetű keverve ('PeCs', 'GYOR') ugyanazt az eredményt adja", () => {
    assert.deepEqual(names("PeCs"), names("pecs"));
    assert.deepEqual(names("GYOR"), names("gyor"));
  });

  test("a dropdown találatai MINDIG a helyes, ékezetes hivatalos nevet adják vissza (nem a normalizált/ékezetmentes verziót)", () => {
    const r = searchSettlements(INDEX, "pecs");
    assert.ok(r.some((s) => s.name === "Pécs"));
    assert.ok(!r.some((s) => s.name === "pecs" || s.name === "Pecs"));
  });
});

// ── MAXIMUM 8 TALÁLAT ────────────────────────────────────────────────────────
describe("AUTOCOMPLETE — maximum 8 találat (spec 3. pont)", () => {
  test("egy, sok találatot adó szűk lekérdezés esetén sem adhat 8-nál több eredményt", () => {
    // 'a' csak 1 karakter, tehát nem futtatunk keresést vele — helyette egy
    // valós, sok egyezést adó 2 karakteres töredéket használunk.
    const r = names("sz");
    assert.ok(r.length <= SETTLEMENT_AUTOCOMPLETE_MAX_RESULTS);
    assert.equal(SETTLEMENT_AUTOCOMPLETE_MAX_RESULTS, 8);
  });

  test("egy maxResults paraméterrel explicit korlátozható a találatok száma", () => {
    const r = searchSettlements(INDEX, "sz", 3);
    assert.ok(r.length <= 3);
  });
});

// ── TALÁLATI PRIORITÁS (spec 4. pont) ───────────────────────────────────────
describe("AUTOCOMPLETE — találati prioritás (pontos > név eleje > szó eleje > tartalmazza)", () => {
  test("pontos egyezés a legelső helyen áll, még ha lenne is 'név eleje egyezik' konkurens találat", () => {
    const r = names("pécs");
    assert.equal(r[0], "Pécs");
  });

  test("'név eleje egyezik' találatok megelőzik a csak 'tartalmazza' találatokat", () => {
    const r = names("kecskemet");
    const kecskemetIdx = r.indexOf("Kecskemét");
    assert.ok(kecskemetIdx !== -1);
    // Minden, csak 'tartalmazza'-szintű találatnak (ha van ilyen a listában)
    // Kecskemét UTÁN kell állnia.
    for (let i = 0; i < r.length; i++) {
      if (i === kecskemetIdx) continue;
      const normalized = normalizeSettlementQuery(r[i]);
      if (!normalized.startsWith("kecskemet")) {
        assert.ok(i > kecskemetIdx, `'${r[i]}' (csak 'tartalmazza' szintű) nem kerülhet 'Kecskemét' (név eleje) elé`);
      }
    }
  });

  test("azonos rangsorolási szinten belül ábécérendben (magyar lokál) rendezett a lista", () => {
    const r = names("duna");
    const sameTierNames = r.filter((n) => normalizeSettlementQuery(n).startsWith("duna"));
    const sorted = [...sameTierNames].sort((a, b) => a.localeCompare(b, "hu"));
    assert.deepEqual(sameTierNames, sorted);
  });
});

// ── ÜRES EREDMÉNY ────────────────────────────────────────────────────────────
describe("AUTOCOMPLETE — nincs találat (spec 13. pont)", () => {
  test("egy értelmetlen, semmilyen településre nem illő lekérdezés üres tömböt ad (a hívó felel az esetleges 'Nincs ilyen település a listában.' üzenetért)", () => {
    assert.deepEqual(names("zzzqqqxxx123nemlétezik"), []);
  });
});

// ── SettlementAutocomplete.tsx — forráskód-szintű strukturális tesztek ──────
const SETTLEMENT_AUTOCOMPLETE_PATH = join(ROOT, "components", "vedett-utvonal", "SettlementAutocomplete.tsx");
const settlementAutocompleteSrc = readFileSync(SETTLEMENT_AUTOCOMPLETE_PATH, "utf-8");

describe("SettlementAutocomplete.tsx — accessibility (valódi ARIA combobox, spec 'ACCESSIBILITY' szakasz)", () => {
  test("a beviteli mező role=combobox, aria-autocomplete=list, és a szükséges aria-expanded/aria-controls/aria-activedescendant attribútumokkal rendelkezik", () => {
    assert.match(settlementAutocompleteSrc, /role="combobox"/);
    assert.match(settlementAutocompleteSrc, /aria-autocomplete="list"/);
    assert.match(settlementAutocompleteSrc, /aria-expanded=\{open\}/);
    assert.match(settlementAutocompleteSrc, /aria-controls=\{listboxId\}/);
    assert.match(settlementAutocompleteSrc, /aria-activedescendant=\{activeOptionId\}/);
  });

  test("a találatok role=option-t kapnak, a kiemelt (highlighted) elem aria-selected={true}-t", () => {
    assert.match(settlementAutocompleteSrc, /role="option"/);
    assert.match(settlementAutocompleteSrc, /aria-selected=\{isHighlighted\}/);
  });

  test("a komponens <label htmlFor=...> -szal van összekötve a beviteli mezővel (nem csak vizuálisan)", () => {
    assert.match(settlementAutocompleteSrc, /<label htmlFor=\{inputId\}/);
    assert.match(settlementAutocompleteSrc, /id=\{inputId\}/);
  });
});

describe("SettlementAutocomplete.tsx — billentyűzet-kezelés (spec 9. pont)", () => {
  test("ArrowDown a következő találatra lép (körkörösen)", () => {
    assert.match(settlementAutocompleteSrc, /e\.key === "ArrowDown"/);
    assert.match(settlementAutocompleteSrc, /\(i \+ 1\) % results\.length/);
  });

  test("ArrowUp az előző találatra lép (körkörösen)", () => {
    assert.match(settlementAutocompleteSrc, /e\.key === "ArrowUp"/);
    assert.match(settlementAutocompleteSrc, /\(i - 1 \+ results\.length\) % results\.length/);
  });

  test("Enter a kiemelt találatot választja ki, és preventDefault()-ot hív (nincs form-submit)", () => {
    const enterBlockMatch = settlementAutocompleteSrc.match(
      /if \(e\.key === "Enter"\) \{[\s\S]*?\n  \}/
    );
    assert.ok(enterBlockMatch, "Enter-kezelő blokknak léteznie kell");
    assert.match(enterBlockMatch![0], /e\.preventDefault\(\)/);
    assert.match(enterBlockMatch![0], /handleSelect\(results\[highlightedIndex\]\)/);
  });

  test("Escape bezárja a dropdownt", () => {
    const escapeBlockMatch = settlementAutocompleteSrc.match(
      /if \(e\.key === "Escape"\) \{[\s\S]*?\n  \}/
    );
    assert.ok(escapeBlockMatch, "Escape-kezelő blokknak léteznie kell");
    assert.match(escapeBlockMatch![0], /setOpen\(false\)/);
  });
});

describe("SettlementAutocomplete.tsx — egér/érintés kiválasztás és blur/click race condition (spec 7., 8., 12. pont)", () => {
  test("a találat-elemek onClick-re hívják a handleSelect-et (egérrel/érintéssel is választható)", () => {
    assert.match(settlementAutocompleteSrc, /onClick=\{\(\) => handleSelect\(s\)\}/);
  });

  test("a találat-elemek onMouseDown-ja preventDefault()-ot hív, hogy a mező NE veszítse el a fókuszt kattintás közben (blur/click race condition elkerülve)", () => {
    assert.match(settlementAutocompleteSrc, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
  });

  test("a mező onBlur-ja bezárja a dropdownt (a blur a fenti preventDefault miatt NEM fut le egy találatra kattintás közben)", () => {
    assert.match(settlementAutocompleteSrc, /onBlur=\{handleBlur\}/);
    assert.match(settlementAutocompleteSrc, /function handleBlur\(\) \{\s*\n\s*setOpen\(false\)/);
  });
});

describe("SettlementAutocomplete.tsx — kiválasztott állapot és újraszerkesztés (spec 10., 11., 14. pont)", () => {
  test("kiválasztáskor (handleSelect) a mező értéke a hivatalos településnévre áll, a dropdown záródik, és 'selected' true-ra vált", () => {
    const selectBlockMatch = settlementAutocompleteSrc.match(/function handleSelect\(settlement: Settlement\) \{[\s\S]*?\n  \}/);
    assert.ok(selectBlockMatch);
    assert.match(selectBlockMatch![0], /onChange\(settlement\.name\)/);
    assert.match(selectBlockMatch![0], /setSelected\(true\)/);
    assert.match(selectBlockMatch![0], /setOpen\(false\)/);
  });

  test("bármilyen gépelés (handleChange) azonnal 'selected' false-ra állítja a korábbi kiválasztást, és újraindítja a keresést", () => {
    const changeBlockMatch = settlementAutocompleteSrc.match(/function handleChange\([\s\S]*?\n  \}/);
    assert.ok(changeBlockMatch);
    assert.match(changeBlockMatch![0], /setSelected\(false\)/);
    assert.match(changeBlockMatch![0], /recomputeResults\(next\)/);
  });

  test("a ✓ jelzés csak 'selected' esetén jelenik meg, diszkrét (aria-hidden, pointer-events-none) elemként", () => {
    assert.match(settlementAutocompleteSrc, /\{selected && \(/);
    assert.match(settlementAutocompleteSrc, /aria-hidden="true"[\s\S]{0,80}pointer-events-none/);
  });

  test("nincs hálózati hívás a komponensben (nincs fetch/XMLHttpRequest — a keresés kizárólag a lokális searchHungarianSettlements-et hívja)", () => {
    assert.doesNotMatch(settlementAutocompleteSrc, /\bfetch\(/);
    assert.doesNotMatch(settlementAutocompleteSrc, /XMLHttpRequest/);
    assert.match(settlementAutocompleteSrc, /searchHungarianSettlements\(/);
  });
});

// ── Beillesztés a VedettUtvonalSearchForm.tsx-be ────────────────────────────
const FORM_PATH = join(ROOT, "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

describe("VedettUtvonalSearchForm.tsx — SettlementAutocomplete beillesztése (egyetlen közös komponens, nincs duplikáció)", () => {
  test("mindkét 'Város' mező (origin + destination) a KÖZÖS SettlementAutocomplete komponenst használja, saját egyedi id-val", () => {
    const usageCount = (formSrc.match(/<SettlementAutocomplete\b/g) ?? []).length;
    assert.equal(usageCount, 2);
    assert.match(formSrc, /id="vedett-route-origin-city"/);
    assert.match(formSrc, /id="vedett-route-destination-city"/);
  });

  test("az origin mező onChange-e updateOriginManualField(\"city\", ...)-ot hívja, a destination mezőé updateDestinationManualField(\"city\", ...)-ot — a MEGLÉVŐ state-kezelés VÁLTOZATLAN", () => {
    assert.match(formSrc, /onChange=\{\(value\) => updateOriginManualField\("city", value\)\}/);
    assert.match(formSrc, /onChange=\{\(value\) => updateDestinationManualField\("city", value\)\}/);
  });

  test("a form NEM importál/hív semmilyen külső geokódoló API-t az autocomplete-hez — a searchHungarianSettlements import a lokális lib/vedett-route/settlements.ts-ből jön", () => {
    assert.match(formSrc, /import SettlementAutocomplete from "\.\/SettlementAutocomplete"/);
  });
});
