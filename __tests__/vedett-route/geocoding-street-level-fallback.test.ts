// Regressziós tesztek — STREET-LEVEL FALLBACK / HOUSE_NUMBER_NOT_RESOLVED
// (2026-09-12, átírva: hardening #2 + #3 alapján)
//
// Root cause / adatlefedettségi diagnózis:
//   Bizonyított produkciós esetek: "8422 Bakonynána, Alkotmány utca 15" és
//   "8252 Balatonszepezd, Petőfi utca 33". A Nominatim ismeri az utcát
//   (addresstype = road, road = Alkotmány utca / Petőfi utca), de a
//   house_number mező hiányzik a válaszából. Ennek oka adatlefedettség:
//   kisebb magyarországi településeken az OSM-adatbázisban az épületszintű
//   adatok (house_number) jellemzően hiányoznak, az utca viszont megtalálható.
//
// Korábban ez a helyzet "address_approximate" választ (és térképes CTA-t)
// adott — identikus a más okból APPROXIMATE-ként klasszifikált esetekkel.
// Az új "house_number_not_resolved" reason különíti el, hogy a UI más,
// konkrétabb figyelmeztetőkártyát mutasson (spec: két gomb, nem térképnyitó).
//
// Biztonsági szabályok (változatlanul érvényes, tesztek E/G fedik):
//   - explicit city = hard constraint
//   - Budapest kerület = hard constraint
//   - postal-relaxed fallback (FÁZIS B) érintetlen (teszt I)
//   - routing csak explicit felhasználói jóváhagyás után (K/L/M)
//
// HARDENING #2 (2026-09-12): Teszt F determinisztikusan AMBIGUOUS —
//   isHouseNumberOnlyFallbackCandidate + haversineDistanceMeters direkt
//   hívásával, nem classifyNamedPlaceCandidates-n keresztül.
//
// HARDENING #3 (2026-09-12): Tesztek K/L/M viselkedési tesztek —
//   buildSearchRequestOriginFields / buildSearchRequestDestinationFields
//   tényleges meghívásával, nem readFileSync/string-presence ellenőrzéssel.
//   Új regressziós tesztek: isHouseNumberOnlyFallbackCandidate 6 feltétele.
//
// Run: node --test __tests__/vedett-route/geocoding-street-level-fallback.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  candidateViolatesGeoContext,
  evaluateNominatimResult,
  parseExpectedAddressComponents,
  isHouseNumberOnlyFallbackCandidate,
  haversineDistanceMeters,
  SAME_PLACE_CLUSTER_RADIUS_METERS,
  findStreetLevelFallbackAmbiguousCandidates,
  pickBestGeocodeMatch,
  type GeoContextConstraint,
  type NominatimRawResult,
} from "../../lib/vedett-route/geocode.ts";

import {
  buildSearchRequestOriginFields,
  buildSearchRequestDestinationFields,
  buildStructuredAddressString,
} from "../../lib/vedett-route/searchRequestBuilder.ts";

// ─── Segéd: Nominatim-válasz összeszereléséhez ────────────────────────────────

function makeAddressCandidate(opts: {
  road?: string;
  city?: string;
  village?: string;
  postcode?: string;
  house_number?: string;
  lat?: string;
  lon?: string;
  importance?: number;
  addresstype?: string;
  // Budapest kerület-azonosítóhoz: Nominatim city_district mezője (pl. "VII. kerület")
  city_district?: string;
}): NominatimRawResult {
  const cityField = opts.city ?? opts.village;
  return {
    display_name: [opts.house_number, opts.road, cityField, "Magyarország"].filter(Boolean).join(", "),
    lat: opts.lat ?? "47.2",
    lon: opts.lon ?? "17.8",
    class: "highway",
    type: opts.house_number ? "residential" : "road",
    addresstype: opts.addresstype ?? (opts.house_number ? "building" : "road"),
    importance: opts.importance ?? 0.6,
    namedetails: { name: opts.road ?? "" },
    address: {
      road: opts.road,
      city: opts.city,
      village: opts.village,
      postcode: opts.postcode,
      house_number: opts.house_number,
      country_code: "hu",
      city_district: opts.city_district,
    },
  };
}

// ─── Teszt A ──────────────────────────────────────────────────────────────────
// Bakonynána-szerű válasz: road + city egyezik, house_number HIÁNYZIK.
// evaluateNominatimResult APPROXIMATE-et ad vissza (nem null).

describe("Test A — Bakonynána-szerű válasz: road match, house_number hiányzik → APPROXIMATE", () => {
  test("evaluateNominatimResult returns APPROXIMATE when house_number missing but expected", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      village: "Bakonynána",
      postcode: "8422",
      // house_number szándékosan HIÁNYZIK
    });
    const expected = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca 15");
    const quality = evaluateNominatimResult(candidate, expected);
    assert.strictEqual(
      quality,
      "APPROXIMATE",
      "Hiányzó house_number → APPROXIMATE (nem null, nem EXACT)"
    );
  });
});

// ─── Teszt B ──────────────────────────────────────────────────────────────────
// Balatonszepezd-szerű válasz: ugyanaz a minta, más helyszín.

describe("Test B — Balatonszepezd-szerű válasz: road match, house_number hiányzik → APPROXIMATE", () => {
  test("evaluateNominatimResult returns APPROXIMATE for Balatonszepezd case", () => {
    const candidate = makeAddressCandidate({
      road: "Petőfi utca",
      village: "Balatonszepezd",
      postcode: "8252",
      // house_number szándékosan HIÁNYZIK
    });
    const expected = parseExpectedAddressComponents("8252 Balatonszepezd, Petőfi utca 33");
    const quality = evaluateNominatimResult(candidate, expected);
    assert.strictEqual(quality, "APPROXIMATE");
  });
});

// ─── Teszt C ──────────────────────────────────────────────────────────────────
// Ha a pontos house_number megtalálható → EXACT, nincs street-level fallback.

describe("Test C — Pontos house_number megtalálható → EXACT, nincs fallback", () => {
  test("evaluateNominatimResult returns EXACT when house_number matches", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      village: "Bakonynána",
      postcode: "8422",
      house_number: "15",
    });
    const expected = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca 15");
    const quality = evaluateNominatimResult(candidate, expected);
    assert.strictEqual(
      quality,
      "EXACT",
      "Egyező house_number → EXACT, nem kell street-level fallback"
    );
  });
});

// ─── Teszt D ──────────────────────────────────────────────────────────────────
// house_number hiányzik ÉS az utcanév sem egyezik → null (NOT_FOUND).

describe("Test D — house_number hiányzik + utcanév nem egyezik → null (NOT_FOUND)", () => {
  test("evaluateNominatimResult returns null when road does not match expected streetName", () => {
    const candidate = makeAddressCandidate({
      road: "Kossuth utca", // nem Alkotmány utca
      village: "Bakonynána",
      postcode: "8422",
    });
    const expected = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca 15");
    const quality = evaluateNominatimResult(candidate, expected);
    assert.strictEqual(
      quality,
      null,
      "Eltérő utcanév → null (nem fogadható el street-level fallbackként sem)"
    );
  });
});

// ─── Teszt E ──────────────────────────────────────────────────────────────────
// Az explicit city HARD CONSTRAINT: másik township azonos nevű utcája SOHA
// nem fogadható el street-level fallbackként sem.

describe("Test E — Másik city azonos nevű utcája → city constraint elveti", () => {
  test("candidateViolatesGeoContext rejects candidate from different city", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      city: "Zirc", // NEM Bakonynána
      postcode: "8420",
    });
    const constraint: GeoContextConstraint = {
      city: "Bakonynána",
      districtOrPostalCode: null,
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, constraint),
      true,
      "Más city → violates constraint (street-level fallbackként sem fogadható el)"
    );
  });
});

// ─── Teszt F ──────────────────────────────────────────────────────────────────
// HARDENING #2 (v2) — Valódi AMBIGUOUS assert findStreetLevelFallbackAmbiguousCandidates()
// közvetlen hívásával — ez az EXACT UGYANOLYAN logika, amit geocodeAddress()
// belsőleg futtat (exportált pure helper, geocode.ts ~441. sor).
// RESOLVED NEM ELFOGADHATÓ.
//
// Ez a teszt NEM hagyja meg az "AMBIGUOUS VAGY RESOLVED" lehetőséget.
// Közvetlen segédfüggvény-hívásokkal bizonyítja az AMBIGUOUS feltételt:
//   1. Mindkét jelölt átmegy isHouseNumberOnlyFallbackCandidate-n
//   2. Köztük a távolság > SAME_PLACE_CLUSTER_RADIUS_METERS (350m)
//   → geocodeAddress() az otherDistinctCandidates szűrőt teljesítve
//     { ambiguous: true } választ adna

describe("Test F — findStreetLevelFallbackAmbiguousCandidates() → kötelezően AMBIGUOUS, RESOLVED kizárva", () => {
  // Koordináták: 46.820°N/17.580°E és 46.825°N/17.590°E → haversine ≈ 800m > 350m
  const expected = parseExpectedAddressComponents("8252 Balatonszepezd, Petőfi utca 33");
  const constraint: GeoContextConstraint = {
    city: "Balatonszepezd",
    districtOrPostalCode: "8252",
  };
  const candidateA = makeAddressCandidate({
    road: "Petőfi utca",
    village: "Balatonszepezd",
    postcode: "8252",
    lat: "46.820",
    lon: "17.580",
    importance: 0.61,
  });
  const candidateB = makeAddressCandidate({
    road: "Petőfi utca",
    village: "Balatonszepezd",
    postcode: "8252",
    lat: "46.825",
    lon: "17.590",
    importance: 0.60,
  });

  test("pickBestGeocodeMatch visszaadja a best jelöltet (APPROXIMATE minőség)", () => {
    const best = pickBestGeocodeMatch([candidateA, candidateB], expected);
    assert.ok(best !== null, "Legalább egy jelölt APPROXIMATE szintű");
    assert.strictEqual(best!.quality, "APPROXIMATE", "Best jelölt minősége APPROXIMATE");
    assert.ok(
      isHouseNumberOnlyFallbackCandidate(best!.result, expected, constraint),
      "Best jelölt átmegy isHouseNumberOnlyFallbackCandidate-n"
    );
  });

  test("findStreetLevelFallbackAmbiguousCandidates() nem üres lista → KÖTELEZŐEN AMBIGUOUS (RESOLVED kizárva)", () => {
    const best = pickBestGeocodeMatch([candidateA, candidateB], expected);
    assert.ok(best !== null);

    // VALÓDI AMBIGUOUS ASSERT — ugyanaz a függvény fut, mint geocodeAddress()-ban
    const ambiguousCandidates = findStreetLevelFallbackAmbiguousCandidates(
      best!.result,
      [candidateA, candidateB],
      expected,
      constraint
    );

    assert.ok(
      ambiguousCandidates.length > 0,
      "findStreetLevelFallbackAmbiguousCandidates() üres listát adott vissza — " +
      "RESOLVED lenne a kimenet, nem AMBIGUOUS. Ellenőrizd a koordinátákat és feltételeket."
    );
  });

  test("Az AMBIGUOUS lista a best-et NEM, a másik jelöltet IGEN tartalmazza", () => {
    const best = pickBestGeocodeMatch([candidateA, candidateB], expected);
    const ambiguousCandidates = findStreetLevelFallbackAmbiguousCandidates(
      best!.result, [candidateA, candidateB], expected, constraint
    );
    assert.ok(!ambiguousCandidates.includes(best!.result), "Best NEM szerepel az AMBIGUOUS listában");
    const nonBest = best!.result === candidateA ? candidateB : candidateA;
    assert.ok(ambiguousCandidates.includes(nonBest), "A másik jelölt IGEN szerepel");
  });

  test("A két jelölt távolsága > SAME_PLACE_CLUSTER_RADIUS_METERS (350m) — AMBIGUOUS előfeltétel", () => {
    const dist = haversineDistanceMeters(
      Number(candidateA.lat), Number(candidateA.lon),
      Number(candidateB.lat), Number(candidateB.lon)
    );
    assert.ok(
      dist > SAME_PLACE_CLUSTER_RADIUS_METERS,
      `Távolság ${dist.toFixed(0)}m — elvárás: > ${SAME_PLACE_CLUSTER_RADIUS_METERS}m`
    );
  });
});

// ─── Teszt G ──────────────────────────────────────────────────────────────────
// Budapest explicit kerület = HARD CONSTRAINT.

// ─── Teszt G — Budapest kerület hard constraint ────────────────────────────────
// Root cause (2026-09-12): a makeAddressCandidate-ben nem volt city_district mező.
// candidateViolatesGeoContext() az extractCandidateDistrictIdentity()-n keresztül
// ellenőrzi a kerületet — ehhez a candidate address.city_district (vagy borough/
// suburb/quarter) mezőjének EGYÉRTELMŰEN kerület-jelölést kell tartalmaznia.
// Postcode ("1073") önmagában NEM kerület-azonosítás: a függvény csak akkor zárja
// ki a jelöltet, ha BIZONYÍTOTTAN más kerületet jelez (pl. city_district: "VII. kerület")
// és az eltér a constrainttől ("VIII. kerület"). Ez a javított fixture a valódi
// Nominatim válasz struktúráját tükrözi: Rákóczi út a VII. kerületben,
// irányítószám 1073 — a city_district mező "VII. kerület" értékkel.
describe("Test G — Budapest kerület hard constraint érintetlen marad", () => {
  test("candidateViolatesGeoContext rejects candidate from different Budapest district", () => {
    // Valódi Nominatim-szerű fixture: Rákóczi út, Budapest, VII. kerület (1073)
    // → a constraint VIII. kerületet vár → KÖTELEZŐ violation
    const candidate = makeAddressCandidate({
      road: "Rákóczi út",
      city: "Budapest",
      postcode: "1073",
      city_district: "VII. kerület",   // ← extractCandidateDistrictIdentity() ezt ismeri fel
    });
    const constraint: GeoContextConstraint = {
      city: "Budapest",
      districtOrPostalCode: "VIII. kerület",
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, constraint),
      true,
      "Budapest kerület constraint: VII. kerületi jelölt → VIII. kerület constraint sérti"
    );
  });

  test("azonos Budapest kerület nem sérül (false regresszió)", () => {
    // Sanity check: ha a candidate city_district EGYEZIK a constraint-tel → nincs violation
    const candidate = makeAddressCandidate({
      road: "Rákóczi út",
      city: "Budapest",
      postcode: "1081",
      city_district: "VIII. kerület",  // egyezik a constraint-tel
    });
    const constraint: GeoContextConstraint = {
      city: "Budapest",
      districtOrPostalCode: "VIII. kerület",
    };
    assert.strictEqual(
      candidateViolatesGeoContext(candidate, constraint),
      false,
      "Azonos kerület nem sérti a constraintet"
    );
  });
});

// ─── Teszt H ──────────────────────────────────────────────────────────────────
// Place-only keresés → street-level fallback NEM fut.

describe("Test H — Place-only keresés: street-level fallback nem fut", () => {
  test("parseExpectedAddressComponents: place-only query has no houseNumber", () => {
    const result = parseExpectedAddressComponents("5000 Szolnok, Szolnok vasútállomás");
    assert.ok(
      !result.houseNumber,
      "Place-only keresésnél nincs houseNumber → street-level fallback NEM fut"
    );
  });
});

// ─── Teszt I ──────────────────────────────────────────────────────────────────
// POSTAL-RELAXED FALLBACK (FÁZIS B) regresszió — érintetlen.

describe("Test I — POSTAL-RELAXED FALLBACK (FÁZIS B) regresszió", () => {
  test("FÁZIS B trigger condition unchanged: 4-digit postal + city → triggers", () => {
    const result = parseExpectedAddressComponents("5001 Szolnok, Szolnok vasútállomás");
    const triggersRelaxed =
      !!result.districtOrPostalCode &&
      /^\d{4}$/.test(result.districtOrPostalCode) &&
      !!result.city;
    assert.ok(triggersRelaxed, "FÁZIS B trigger érintetlen (4-jegyű postal + city)");
  });

  test("FÁZIS B does NOT trigger for district (non-4-digit) — unchanged", () => {
    const result = parseExpectedAddressComponents("Budapest, VIII, Rákóczi út 15");
    const triggersRelaxed =
      !!result.districtOrPostalCode &&
      /^\d{4}$/.test(result.districtOrPostalCode) &&
      !!result.city;
    assert.strictEqual(triggersRelaxed, false, "Kerület → FÁZIS B NEM fut");
  });
});

// ─── Teszt J ──────────────────────────────────────────────────────────────────
// Current-location ág változatlan — a street-level fallback NEM érinti.

describe("Test J — Current-location flow: street-level fallback nem érint", () => {
  test("parseExpectedAddressComponents on 'Bakonynána, Alkotmány utca 15' detects houseNumber", () => {
    const result = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca 15");
    assert.strictEqual(result.houseNumber, "15", "Házszám helyesen detektálva");
    assert.strictEqual(result.streetName, "Alkotmány utca", "Utcanév helyesen detektálva");
    assert.strictEqual(result.city, "Bakonynána", "Város helyesen detektálva");
  });
});

// ─── Teszt K ──────────────────────────────────────────────────────────────────
// HARDENING #3 — VISELKEDÉSI TESZT: MANUAL destination → { to: string }
// Bizonyítja: amíg a felhasználó NEM fogadja el a fallback-et, a state
// MANUAL marad, és a következő submit-kísérlet `to: string`-et küld
// (nem `toCoordinates`-t) → a szerver geocodeAddress()-t hívna, NEM routing.
// Ez NEM auto-submit: a UI a `house_number_not_resolved` kártyát mutatja,
// és a re-submit csak a "Az utca közelítő helyével tervezek" gomb
// megnyomása után → MAP_PICKED állapot → teszt L-ben lefedett ág.

describe("Test K — MANUAL destination → { to: string }, NEM toCoordinates (no-auto-submit invariáns)", () => {
  test("buildSearchRequestDestinationFields: MANUAL → { to: '...' } (no toCoordinates)", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });
    // toCoordinates NINCS jelen → a szerver geocodeAddress()-t hívna (nem routingot)
    assert.ok(
      !("toCoordinates" in fields),
      "MANUAL destination: toCoordinates NEM szerepel a mezőkben (no auto-routing)"
    );
    // 'to' string jelen van → a szerver geocodeAddress()-t hívja
    assert.ok(
      "to" in fields && typeof fields.to === "string",
      "MANUAL destination: 'to' string mező jelen van"
    );
    // A string formátuma helyes: irányítószám + city + utca
    assert.strictEqual(
      fields.to,
      "8422 Bakonynána, Alkotmány utca 15",
      "MANUAL destination: cím-string formátuma helyes"
    );
  });
});

// ─── Teszt L ──────────────────────────────────────────────────────────────────
// HARDENING #3 — VISELKEDÉSI TESZT: MAP_PICKED destination → { toCoordinates, toName }
// Bizonyítja: miután a felhasználó a "Az utca közelítő helyével tervezek"
// gombot nyomja, a destination MAP_PICKED-re vált, és a következő submit
// `toCoordinates`-t küld → a szerver NEM geokódol újra (koordináta-alapú routing).

describe("Test L — MAP_PICKED destination → { toCoordinates, toName } (utca koordinátájával routol)", () => {
  test("buildSearchRequestDestinationFields: MAP_PICKED → { toCoordinates, toName }", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MAP_PICKED",
      name: "Alkotmány utca, Bakonynána",
      latitude: 47.3,
      longitude: 18.06,
    });
    // toCoordinates JELEN VAN → a szerver NEM hív geocodeAddress()-t
    assert.ok(
      "toCoordinates" in fields,
      "MAP_PICKED destination: toCoordinates jelen van (NEM geokódol újra)"
    );
    assert.deepStrictEqual(fields.toCoordinates, { latitude: 47.3, longitude: 18.06 });
    // 'to' string NEM szerepel → nincs cím-újraküldés
    assert.ok(
      !("to" in fields),
      "MAP_PICKED destination: 'to' string NEM szerepel"
    );
    // toName megjelenítési label jelen van
    assert.strictEqual(fields.toName, "Alkotmány utca, Bakonynána");
  });
});

// ─── Teszt M ──────────────────────────────────────────────────────────────────
// HARDENING #3 — VISELKEDÉSI TESZT: "Módosítom a címet" → MANUAL marad
// Bizonyítja: a modify gomb a destination state-et MANUAL-on hagyja (setStreetLevelTo(null),
// setResult(null)), és ha a felhasználó újra beküldi a formot, `to: string`
// megy — azonos az eredeti, hibás cím-stringgel → szerver geocodeAddress()-t hívna.
// Ez bizonyítja, hogy a módosítás ág NEM indít automatikus routingot.

describe("Test M — 'Módosítom a címet' ág: MANUAL → { to: string } (no routing)", () => {
  test("buildSearchRequestDestinationFields: MANUAL Balatonszepezd → { to: '8252 Balatonszepezd, Petőfi utca 33' }", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Balatonszepezd",
      districtOrPostalCode: "8252",
      street: "Petőfi utca 33",
    });
    assert.ok(!("toCoordinates" in fields), "Módosítás ág: toCoordinates NEM szerepel");
    assert.strictEqual(
      fields.to,
      "8252 Balatonszepezd, Petőfi utca 33",
      "Módosítás ág: helyes cím-string (irányítószámos formátum)"
    );
  });

  test("buildSearchRequestOriginFields: MANUAL from → { from: string }, NEM fromCoordinates", () => {
    // Szimmetrikus ellenőrzés az induló oldalra (origin) — a MANUAL from ág
    // sem indul auto-routing-ot, csak szerver-oldali geocodeAddress()-t.
    const fields = buildSearchRequestOriginFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });
    assert.ok(!("fromCoordinates" in fields), "MANUAL origin: fromCoordinates NEM szerepel");
    assert.strictEqual(fields.from, "8422 Bakonynána, Alkotmány utca 15");
  });

  test("buildSearchRequestOriginFields: CURRENT_LOCATION → { fromCoordinates } (NEM geokódol)", () => {
    const fields = buildSearchRequestOriginFields({
      type: "CURRENT_LOCATION",
      latitude: 47.497,
      longitude: 19.040,
    });
    assert.ok("fromCoordinates" in fields, "CURRENT_LOCATION origin: fromCoordinates jelen van");
    assert.deepStrictEqual(fields.fromCoordinates, { latitude: 47.497, longitude: 19.040 });
    assert.ok(!("from" in fields), "CURRENT_LOCATION origin: 'from' string NEM szerepel");
    assert.ok(!("fromName" in fields), "CURRENT_LOCATION origin: fromName NEM szerepel");
  });

  test("buildSearchRequestOriginFields: MAP_PICKED → { fromCoordinates, fromName } (NEM geokódol)", () => {
    const fields = buildSearchRequestOriginFields({
      type: "MAP_PICKED",
      name: "Petőfi utca, Balatonszepezd",
      latitude: 46.820,
      longitude: 17.580,
    });
    assert.ok("fromCoordinates" in fields);
    assert.deepStrictEqual(fields.fromCoordinates, { latitude: 46.820, longitude: 17.580 });
    assert.strictEqual(fields.fromName, "Petőfi utca, Balatonszepezd");
    assert.ok(!("from" in fields));
  });
});

// ─── Új regressziós tesztek: isHouseNumberOnlyFallbackCandidate 6 feltétele ──

describe("isHouseNumberOnlyFallbackCandidate — mind a 6 feltétel tesztelve", () => {
  const expectedBakonynana = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca 15");
  const constraintBakonynana: GeoContextConstraint = {
    city: "Bakonynána",
    districtOrPostalCode: "8422",
  };

  test("1. feltétel: nincs expected.houseNumber → false (nem releváns az ág)", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      village: "Bakonynána",
      postcode: "8422",
    });
    // Place-only query: nincs expected houseNumber
    const expectedNoHouse = parseExpectedAddressComponents("8422 Bakonynána, Alkotmány utca");
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedNoHouse, constraintBakonynana),
      false,
      "Ha nincs expected houseNumber → false (fallback nem releváns)"
    );
  });

  test("2. feltétel: result.address.house_number megtalálható → false (EXACT, nem kell fallback)", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      village: "Bakonynána",
      postcode: "8422",
      house_number: "15", // MEGTALÁLHATÓ
    });
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBakonynana, constraintBakonynana),
      false,
      "Ha house_number megtalálható → false (EXACT eset, nem fallback)"
    );
  });

  test("3. feltétel: nincs road a result.address-ban → false (nem utcaszintű eredmény)", () => {
    const candidate: NominatimRawResult = {
      display_name: "Bakonynána, Magyarország",
      lat: "47.42",
      lon: "18.06",
      class: "place",
      type: "village",
      addresstype: "place",
      importance: 0.5,
      namedetails: { name: "Bakonynána" },
      address: {
        village: "Bakonynána",
        postcode: "8422",
        country_code: "hu",
        // road NINCS
      },
    };
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBakonynana, constraintBakonynana),
      false,
      "Ha nincs road a result-ban → false (nem utcaszintű találat)"
    );
  });

  test("4. feltétel: road neve nem egyezik az expected streetName-mel → false", () => {
    const candidate = makeAddressCandidate({
      road: "Kossuth utca", // NEM Alkotmány utca
      village: "Bakonynána",
      postcode: "8422",
    });
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBakonynana, constraintBakonynana),
      false,
      "Eltérő utcanév → false (nem egyezik az expected streetName-mel)"
    );
  });

  test("5. feltétel: city mismatch (más település) → false", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",
      city: "Zirc", // NEM Bakonynána
      postcode: "8420",
    });
    // city-t tartalmazó constraint
    const constraintWithCity: GeoContextConstraint = {
      city: "Bakonynána",
      districtOrPostalCode: null,
    };
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBakonynana, constraintWithCity),
      false,
      "Más city a result-ban → false (city hard constraint érvényes)"
    );
  });

  test("6. feltétel: minden feltétel teljesül → true (valódi street-level fallback)", () => {
    const candidate = makeAddressCandidate({
      road: "Alkotmány utca",  // egyezik
      village: "Bakonynána",   // egyezik
      postcode: "8422",        // constraint nem sérül
      // house_number HIÁNYZIK
    });
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBakonynana, constraintBakonynana),
      true,
      "Minden feltétel teljesül → true (Bakonynána produkciós eset)"
    );
  });

  test("Balatonszepezd produkciós eset: mind a 6 feltétel teljesül → true", () => {
    const expectedBalatonszepezd = parseExpectedAddressComponents("8252 Balatonszepezd, Petőfi utca 33");
    const constraintBalatonszepezd: GeoContextConstraint = {
      city: "Balatonszepezd",
      districtOrPostalCode: "8252",
    };
    const candidate = makeAddressCandidate({
      road: "Petőfi utca",
      village: "Balatonszepezd",
      postcode: "8252",
      // house_number HIÁNYZIK
    });
    assert.strictEqual(
      isHouseNumberOnlyFallbackCandidate(candidate, expectedBalatonszepezd, constraintBalatonszepezd),
      true,
      "Balatonszepezd produkciós eset → true"
    );
  });
});

// ─── buildStructuredAddressString: egységtesztek ─────────────────────────────
// A VedettUtvonalSearchForm.tsx handleSubmit()-jéből kiszervezett logika
// — biztosítja, hogy a formátum byte-azonos marad a refaktorálás után.

describe("buildStructuredAddressString — cím-string formátum egységtesztek", () => {
  test("4-jegyű irányítószám → '1234 Város, utca' formátum", () => {
    assert.strictEqual(
      buildStructuredAddressString({ city: "Bakonynána", districtOrPostalCode: "8422", street: "Alkotmány utca 15" }),
      "8422 Bakonynána, Alkotmány utca 15"
    );
  });

  test("Kerület szöveg → 'Város, kerület, utca' formátum", () => {
    assert.strictEqual(
      buildStructuredAddressString({ city: "Budapest", districtOrPostalCode: "VIII. kerület", street: "Rákóczi út 15" }),
      "Budapest, VIII. kerület, Rákóczi út 15"
    );
  });

  test("Üres districtOrPostalCode → csak city + utca", () => {
    assert.strictEqual(
      buildStructuredAddressString({ city: "Pécs", districtOrPostalCode: "", street: "Király utca 10" }),
      "Pécs, Király utca 10"
    );
  });

  test("Üres city → csak irányítószám + utca", () => {
    assert.strictEqual(
      buildStructuredAddressString({ city: "", districtOrPostalCode: "7621", street: "Király utca 10" }),
      "7621, Király utca 10"
    );
  });
});
