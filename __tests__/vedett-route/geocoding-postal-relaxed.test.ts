// Regressziós tesztek — POSTAL-RELAXED FALLBACK (2026-09-12)
//
// Root cause: egy explicit 4-jegyű irányítószám a STRICT fázisban hard
// constraintként él minden fallback kísérletben. Ha a felhasználó HIBÁS
// irányítószámot adott meg (pl. "5001 Szolnok, Szolnok vasútállomás",
// ahol a vasútállomás tényleges postcódja "5000"), az összes Nominatim
// találat elutasításra kerül → null ("Nem találtuk ezt a címet.").
// Ugyanez az input ÜRES irányítószámmal sikeresen megtalálta az állomást.
//
// Fix: FÁZIS B — POSTAL-RELAXED FALLBACK: ha a STRICT fázis nem
// talált semmit, ÉS volt 4-jegyű irányítószám, ÉS van explicit city,
// AKKOR a city-only constrainttel még 2 kísérletet teszünk —
// az eredmény minősége MINDIG APPROXIMATE.
//
// Tesztek: pure function tesztek (nincs hálózati hívás, nincs mock).
// Run: node --test __tests__/vedett-route/geocoding-postal-relaxed.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  candidateViolatesGeoContext,
  classifyNamedPlaceCandidates,
  parseExpectedAddressComponents,
  type GeoContextConstraint,
  type NominatimRawResult,
} from "../../lib/vedett-route/geocode.ts";

// ─── Segéd: minimális Nominatim találat összeszereléséhez ─────────────────

function makeCandidate(opts: {
  name: string;
  city?: string;
  postcode?: string;
  lat?: string;
  lon?: string;
  klass?: string;
  addresstype?: string;
  importance?: number;
}): NominatimRawResult {
  return {
    display_name: opts.name,
    lat: opts.lat ?? "47.0",
    lon: opts.lon ?? "20.0",
    class: opts.klass ?? "railway",
    type: "station",
    addresstype: opts.addresstype ?? "railway",
    importance: opts.importance ?? 0.7,
    namedetails: { name: opts.name },
    address: {
      city: opts.city,
      postcode: opts.postcode,
      country_code: "hu",
    },
  };
}

// ─── Test 1 ───────────────────────────────────────────────────────────────
// STRICT postal constraint ELVETI a jelöltet, ha a postcode eltér.
// Ez a root cause maga: a "5001" constraint kizárja a "5000"-es postcódú
// Szolnok vasútállomást.

describe("Test 1 — STRICT postal constraint rejects candidate with different postcode", () => {
  test("should return true (violates) when candidate postcode ≠ constraint postcode", () => {
    const candidate = makeCandidate({ name: "Szolnok vasútállomás", city: "Szolnok", postcode: "5000" });
    const strictConstraint: GeoContextConstraint = {
      city: "Szolnok",
      districtOrPostalCode: "5001", // hibás/eltérő irányítószám
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, strictConstraint),
      true,
      "Candidate with postcode '5000' should violate constraint '5001'"
    );
  });
});

// ─── Test 2 ───────────────────────────────────────────────────────────────
// RELAXED constraint (districtOrPostalCode: null) ELFOGADJA ugyanazt a
// jelöltet — ez a FÁZIS B működésének kulcsa.

describe("Test 2 — RELAXED constraint (null postal) accepts same candidate", () => {
  test("should return false (does not violate) when postal constraint is null", () => {
    const candidate = makeCandidate({ name: "Szolnok vasútállomás", city: "Szolnok", postcode: "5000" });
    const relaxedConstraint: GeoContextConstraint = {
      city: "Szolnok",
      districtOrPostalCode: null, // FÁZIS B: irányítószám elhagyva
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, relaxedConstraint),
      false,
      "Candidate should NOT violate when postal constraint is null"
    );
  });
});

// ─── Test 3 ───────────────────────────────────────────────────────────────
// STRICT postal constraint ELFOGADJA azt a jelöltet, akinek postcódja
// egyezik — a happy path nem regresszál.

describe("Test 3 — STRICT postal constraint accepts candidate with matching postcode", () => {
  test("should return false (does not violate) when postcodes match", () => {
    const candidate = makeCandidate({ name: "Szolnok vasútállomás", city: "Szolnok", postcode: "5000" });
    const strictConstraint: GeoContextConstraint = {
      city: "Szolnok",
      districtOrPostalCode: "5000", // helyes irányítószám
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, strictConstraint),
      false,
      "Candidate with matching postcode should NOT violate constraint"
    );
  });
});

// ─── Test 4 ───────────────────────────────────────────────────────────────
// classifyNamedPlaceCandidates STRICT constrainttel → NOT_FOUND, ha a
// jelölt postcódja eltér — ugyanaz a szituáció, mint a production hibánál.

describe("Test 4 — classifyNamedPlaceCandidates with STRICT postal → NOT_FOUND", () => {
  test("should return NOT_FOUND when candidate violates strict postal constraint", () => {
    const candidate = makeCandidate({
      name: "Szolnok vasútállomás",
      city: "Szolnok",
      postcode: "5000",
      importance: 0.7,
    });
    const strictConstraint: GeoContextConstraint = {
      city: "Szolnok",
      districtOrPostalCode: "5001",
    };
    const result = classifyNamedPlaceCandidates([candidate], "Szolnok vasútállomás", strictConstraint);
    assert.strictEqual(
      result.status,
      "NOT_FOUND",
      "STRICT postal constraint should filter out the candidate → NOT_FOUND"
    );
    assert.strictEqual(result.candidates.length, 0);
  });
});

// ─── Test 5 ───────────────────────────────────────────────────────────────
// classifyNamedPlaceCandidates RELAXED constrainttel (city-only) → RESOLVED,
// ha a jelölt neve egyezik — ez a FÁZIS B sikerágja.

describe("Test 5 — classifyNamedPlaceCandidates with RELAXED constraint → RESOLVED", () => {
  test("should return RESOLVED when only city constraint is applied", () => {
    const candidate = makeCandidate({
      name: "Szolnok vasútállomás",
      city: "Szolnok",
      postcode: "5000",
      importance: 0.7,
    });
    const relaxedConstraint: GeoContextConstraint = {
      city: "Szolnok",
      districtOrPostalCode: null,
    };
    const result = classifyNamedPlaceCandidates([candidate], "Szolnok vasútállomás", relaxedConstraint);
    assert.strictEqual(
      result.status,
      "RESOLVED",
      "RELAXED constraint should accept candidate → RESOLVED"
    );
    assert.ok(result.candidates.length > 0);
  });
});

// ─── Test 6 ───────────────────────────────────────────────────────────────
// parseExpectedAddressComponents helyesen azonosítja a 4-jegyű irányítószám +
// city kombinációt — ez a FÁZIS B trigger condition bemenete.

describe("Test 6 — parseExpectedAddressComponents detects 4-digit postal + city", () => {
  test("should parse '5001 Szolnok, Szolnok vasútállomás' correctly", () => {
    const result = parseExpectedAddressComponents("5001 Szolnok, Szolnok vasútállomás");
    // districtOrPostalCode = "5001" → /^\d{4}$/ teszt igaz
    assert.strictEqual(result.districtOrPostalCode, "5001");
    // city = "Szolnok" → expected.city truthy
    assert.strictEqual(result.city, "Szolnok");
    // A FÁZIS B condition: districtOrPostalCode && /^\d{4}$/.test(...) && city
    const triggersRelaxed =
      !!result.districtOrPostalCode &&
      /^\d{4}$/.test(result.districtOrPostalCode) &&
      !!result.city;
    assert.ok(triggersRelaxed, "FÁZIS B should trigger for this input");
  });
});

// ─── Test 7 ───────────────────────────────────────────────────────────────
// FÁZIS B NEM fut le, ha a districtOrPostalCode kerület (nem 4 jegyű szám).
// Biztosítja, hogy a Budapest kerület-constraintet NEM lazítja a fix.

describe("Test 7 — FÁZIS B does NOT trigger for district (non-4-digit) input", () => {
  test("should not trigger relaxed fallback when district identifier is used", () => {
    const result = parseExpectedAddressComponents("Budapest, VIII, Rákóczi út 15");
    // districtOrPostalCode = "VIII. kerület" (normalizeDistrictOrPostalCode eredménye)
    // → /^\d{4}$/.test("VIII. kerület") = false → FÁZIS B NEM fut
    const triggersRelaxed =
      !!result.districtOrPostalCode &&
      /^\d{4}$/.test(result.districtOrPostalCode) &&
      !!result.city;
    assert.strictEqual(
      triggersRelaxed,
      false,
      "FÁZIS B must NOT trigger for district identifiers — only for 4-digit postal codes"
    );
    // Bonus: ellenőrizzük, hogy a city is helyes
    assert.strictEqual(result.city, "Budapest");
  });
});

// ─── Test 8 ───────────────────────────────────────────────────────────────
// Forráskód-struktúra ellenőrzés: a geocode.ts tartalmazza a FÁZIS B
// kulcsszavait — biztosítja, hogy a fix ténylegesen be van vezetve.

describe("Test 8 — Source code contains POSTAL-RELAXED FALLBACK implementation", () => {
  test("should have the relaxed fallback code in geocode.ts", () => {
    const geocodePath = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts");
    const src = readFileSync(geocodePath, "utf-8");

    // A FÁZIS B comment megléte
    assert.ok(
      src.includes("FÁZIS B — POSTAL-RELAXED FALLBACK"),
      "geocode.ts must contain the FÁZIS B comment"
    );

    // A trigger condition: /^\d{4}$/.test és expected.city együtt
    assert.ok(
      src.includes(`/^\\d{4}$/.test(expected.districtOrPostalCode)`) &&
        src.includes("expected.city"),
      "geocode.ts must contain the 4-digit postal + city trigger condition"
    );

    // A relaxedConstraint districtOrPostalCode: null sorának megléte
    assert.ok(
      src.includes("districtOrPostalCode: null"),
      "geocode.ts must set districtOrPostalCode: null in relaxedConstraint"
    );

    // A visszaadott minőség kötelezően APPROXIMATE
    assert.ok(
      src.includes(`quality: "APPROXIMATE"`),
      "geocode.ts must return APPROXIMATE quality from the relaxed fallback"
    );

    // A city constraint megmarad (relaxedConstraint.city = expected.city)
    assert.ok(
      src.includes("city: expected.city"),
      "geocode.ts must keep city as hard constraint in relaxedConstraint"
    );
  });
});
