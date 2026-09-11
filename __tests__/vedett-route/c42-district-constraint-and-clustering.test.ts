// VÉDETT ÚTVONAL — C4.2 korrekciós kör (2026-09-11) determinisztikus
// tesztjei a valós Vercel Preview auditban talált három konkrét hibára:
//   1) "Budapest, V. kerület, Deák tér" -> XXI. kerületi Deák teret
//      választott (a kerület csak scoring-bónusz volt, nem hard
//      constraint).
//   2) "Astoria" -> 4, gyakorlatilag ugyanazt a helyet jelentő OSM
//      objektum -> feleslegesen kényszerített választás.
//   3) "Arena Plaza" (place-only input) -> a kliens validáció a
//      geokódolás ELŐTT elutasította, mert a City mező alapértelmezetten
//      "Budapest", a District pedig üres.
//
// Ez a fájl NEM helyettesíti, hanem KIEGÉSZÍTI a geocoding-hardening.test.ts,
// geocoding-poi-generalization.test.ts, structured-address-and-sensory-ux.test.ts
// és c41-ambiguous-and-origin-label.test.ts meglévő, VÁLTOZATLANUL futó
// tesztjeit.
//
//   node --test __tests__/vedett-route/c42-district-constraint-and-clustering.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyNamedPlaceCandidates,
  pickBestNamedPlaceMatch,
  parseExpectedAddressComponents,
  extractDistrictIdentity,
  extractCandidateDistrictIdentity,
  candidateViolatesGeoContext,
  clusterSamePlaceCandidates,
  haversineDistanceMeters,
  scoreNamedPlaceResult,
  getResultNameCandidates,
  toPlaceCandidate,
  SAME_PLACE_CLUSTER_RADIUS_METERS,
  MAX_AMBIGUOUS_CANDIDATES,
  type NominatimRawResult,
  type GeoContextConstraint,
} from "../../lib/vedett-route/geocode.ts";

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const stripKnownTypeAnnotations = (src: string) =>
  src.replace(/\(addr: \{ city: string; districtOrPostalCode: string; street: string \}\)/, "(addr)").replace(/\): boolean \{/, ") {");

function extractFunctionSource(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`hiányzik a függvény: ${signature}`);
  const sigEnd = start + signature.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = sigEnd; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("nem sikerült megtalálni a függvény végét");
  return src.slice(start, end);
}

const isManualAddressCompleteSig =
  "function isManualAddressComplete(addr: { city: string; districtOrPostalCode: string; street: string }): boolean {";
const isManualAddressCompleteSrc = stripKnownTypeAnnotations(extractFunctionSource(formSrc, isManualAddressCompleteSig));
// eslint-disable-next-line no-new-func
const isManualAddressComplete = new Function(`${isManualAddressCompleteSrc}\nreturn isManualAddressComplete;`)();

function makeNamedPlace(overrides: Partial<NominatimRawResult> = {}): NominatimRawResult {
  return {
    display_name: "Deák tér, Belváros-Lipótváros, Budapest, Magyarország",
    lat: "47.4979",
    lon: "19.0538",
    addresstype: "place",
    class: "place",
    type: "square",
    namedetails: { name: "Deák tér" },
    address: {
      city: "Budapest",
      suburb: "Belváros-Lipótváros",
      city_district: "V. kerület",
      country_code: "hu",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A/B) explicit kerület = HARD CONSTRAINT — "Budapest, V. kerület, Deák tér"
// ---------------------------------------------------------------------------
describe("A) explicit kerület hard constraint — a XXI. kerületi candidate KÖTELEZŐEN kizárva, a V. kerületi elfogadva", () => {
  const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: "V. kerület" };

  test("candidateViolatesGeoContext true-t ad egy explicit XXI. kerületi candidate-re, false-t egy V. kerületire", () => {
    const wrongDistrict = makeNamedPlace({ address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" } });
    const rightDistrict = makeNamedPlace({ address: { city: "Budapest", city_district: "V. kerület", country_code: "hu" } });
    assert.equal(candidateViolatesGeoContext(wrongDistrict, constraint), true);
    assert.equal(candidateViolatesGeoContext(rightDistrict, constraint), false);
  });

  test("classifyNamedPlaceCandidates a constraint mellett KIZÁRÓLAG a V. kerületi candidate-et fogadja el, még akkor is, ha a XXI. kerületi jobb pontszámú lenne", () => {
    const xxiDeakTer: NominatimRawResult = {
      display_name: "Deák tér, XXI. kerület, Budapest, Magyarország",
      lat: "47.43",
      lon: "19.07",
      addresstype: "place",
      class: "place",
      namedetails: { name: "Deák tér" },
      // Magasabb importance -> önmagában, constraint NÉLKÜL ez nyerne.
      importance: 0.9,
      address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" },
    };
    const vDeakFerencTer: NominatimRawResult = {
      display_name: "Deák tér, V. kerület, Budapest, Magyarország",
      lat: "47.4979",
      lon: "19.0538",
      addresstype: "place",
      class: "place",
      namedetails: { name: "Deák tér", official_name: "Deák Ferenc tér" },
      importance: 0.3,
      address: { city: "Budapest", city_district: "V. kerület", country_code: "hu" },
    };
    const classification = classifyNamedPlaceCandidates([xxiDeakTer, vDeakFerencTer], "Deák tér", constraint);
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates.length, 1);
    assert.equal(classification.candidates[0].address?.city_district, "V. kerület");
  });

  test("pickBestNamedPlaceMatch (a constraint NÉLKÜLI, VÁLTOZATLAN külső szerződés) constraint hiányában TOVÁBBRA IS a magasabb pontszámút választja — a hard constraint kizárólag a constraint paraméter átadásakor aktív", () => {
    // Ez bizonyítja, hogy a hard constraint egy KÜLÖN, explicit opt-in
    // mechanizmus (geocodeAddress mindig átadja), NEM egy csendes globális
    // viselkedés-változás, ami a meglévő, constraint nélküli hívókat is
    // érintené.
    const xxi = makeNamedPlace({ importance: 0.9, address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" } });
    const v = makeNamedPlace({ importance: 0.1, address: { city: "Budapest", city_district: "V. kerület", country_code: "hu" } });
    const best = pickBestNamedPlaceMatch([xxi, v], "Deák tér");
    assert.ok(best);
    assert.equal(best!.address?.city_district, "XXI. kerület");
  });
});

describe("B) csak XXI. kerületi explicit candidate van — NEM fogadható el, még akkor sem, ha az egyetlen jelölt", () => {
  test("classifyNamedPlaceCandidates NOT_FOUND-ot ad, ha az egyetlen candidate explicit ellentmond a kért kerületnek", () => {
    const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: "V. kerület" };
    const onlyXxi = makeNamedPlace({ address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" } });
    const classification = classifyNamedPlaceCandidates([onlyXxi], "Deák tér", constraint);
    assert.equal(classification.status, "NOT_FOUND");
    assert.equal(classification.candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// C) explicit irányítószám = HARD CONSTRAINT
// ---------------------------------------------------------------------------
describe("C) explicit irányítószám hard constraint — Budapest + 1051 + named place, egy explicit 1211 postcode candidate kizárva", () => {
  test("candidateViolatesGeoContext true-t ad egy explicit eltérő postcode-ra, false-t egy egyezőre", () => {
    const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: "1051" };
    const wrongPostcode = makeNamedPlace({ address: { city: "Budapest", postcode: "1211", country_code: "hu" } });
    const rightPostcode = makeNamedPlace({ address: { city: "Budapest", postcode: "1051", country_code: "hu" } });
    assert.equal(candidateViolatesGeoContext(wrongPostcode, constraint), true);
    assert.equal(candidateViolatesGeoContext(rightPostcode, constraint), false);
  });

  test("classifyNamedPlaceCandidates a 1211 postcode-ú candidate-et kizárja, a 1051-et elfogadja", () => {
    const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: "1051" };
    const wrong = makeNamedPlace({
      display_name: "Névtelen hely, 1211, Budapest, Magyarország",
      lat: "47.43",
      lon: "19.2",
      address: { city: "Budapest", postcode: "1211", country_code: "hu" },
    });
    const right = makeNamedPlace({ address: { city: "Budapest", postcode: "1051", country_code: "hu" } });
    const classification = classifyNamedPlaceCandidates([wrong, right], "Deák tér", constraint);
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates[0].address?.postcode, "1051");
  });

  test("ha a candidate-ben nincs postcode mező, NEM zárjuk ki csak ezért (nem találunk ki hiányzó adatot)", () => {
    const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: "1051" };
    const noPostcode = makeNamedPlace({ address: { city: "Budapest", country_code: "hu" } });
    assert.equal(candidateViolatesGeoContext(noPostcode, constraint), false);
  });
});

// ---------------------------------------------------------------------------
// D/E) place-only input érvényes a kliens validációban
// ---------------------------------------------------------------------------
describe("D) 'Arena Plaza' place-only input — a kliens validáció átengedi a geokódolóhoz", () => {
  test("isManualAddressComplete true-t ad City='Budapest' (alapérték) + District='' + street='Arena Plaza' esetén — ez volt a valós Preview hiba pontos reprodukciója", () => {
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Arena Plaza" }), true);
  });
});

describe("E) 'Etele Plaza' place-only input — a kliens validáció átengedi", () => {
  test("isManualAddressComplete true-t ad City='Budapest' + District='' + street='Etele Plaza' esetén", () => {
    assert.equal(isManualAddressComplete({ city: "Budapest", districtOrPostalCode: "", street: "Etele Plaza" }), true);
  });
});

// ---------------------------------------------------------------------------
// F/G) same-place klaszterezés
// ---------------------------------------------------------------------------
function makeAstoriaVariant(latOffsetMeters: number, lonOffsetMeters: number, overrides: Partial<NominatimRawResult> = {}): NominatimRawResult {
  // 1 fok szélesség kb. 111 320 m; 1 fok hosszúság Budapest szélességi
  // körén (kb. 47.5°) kb. 111 320 * cos(47.5°) ≈ 75 200 m.
  const lat = 47.4966 + latOffsetMeters / 111320;
  const lon = 19.0614 + lonOffsetMeters / 75200;
  return {
    display_name: "Astoria, Erzsébetváros, Budapest, Magyarország",
    lat: String(lat),
    lon: String(lon),
    addresstype: "public_transport",
    class: "public_transport",
    namedetails: { name: "Astoria" },
    address: { city: "Budapest", suburb: "Erzsébetváros", country_code: "hu" },
    ...overrides,
  };
}

describe("F) 4 Astoria candidate, azonos normalizált név, mind 350 méteren belül -> RESOLVED, NINCS candidate picker", () => {
  test("clusterSamePlaceCandidates egyetlen klasztert ad a 4, egymáshoz 100-200 méteren belüli Astoria candidate-re", () => {
    const scored = [
      { result: makeAstoriaVariant(0, 0), score: 100 },
      { result: makeAstoriaVariant(80, -60), score: 95 },
      { result: makeAstoriaVariant(-100, 50), score: 90 },
      { result: makeAstoriaVariant(150, 100), score: 85 },
    ];
    const clusters = clusterSamePlaceCandidates(scored);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 4);
  });

  test("classifyNamedPlaceCandidates RESOLVED-et ad (nem AMBIGUOUS-t) a 4 közeli Astoria candidate-re", () => {
    const results = [makeAstoriaVariant(0, 0), makeAstoriaVariant(80, -60), makeAstoriaVariant(-100, 50), makeAstoriaVariant(150, 100)];
    const classification = classifyNamedPlaceCandidates(results, "Astoria");
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates.length, 1);
  });

  test("a geocodeAddress szintjén ez azt jelenti, hogy a kliens EGYETLEN geokódolt eredményt kap, SOHA nem egy 4-elemű választólistát", () => {
    const results = [makeAstoriaVariant(0, 0), makeAstoriaVariant(80, -60), makeAstoriaVariant(-100, 50), makeAstoriaVariant(150, 100)];
    const classification = classifyNamedPlaceCandidates(results, "Astoria");
    assert.notEqual(classification.status, "AMBIGUOUS");
  });
});

describe("G) azonos nevű candidate-ek két, több kilométerre lévő clusterben -> valódi AMBIGUOUS", () => {
  test("clusterSamePlaceCandidates KÉT klasztert ad, ha a candidate-ek több km-re vannak egymástól", () => {
    const scored = [
      { result: makeAstoriaVariant(0, 0), score: 70 },
      { result: makeAstoriaVariant(5000, 5000), score: 68 },
    ];
    const clusters = clusterSamePlaceCandidates(scored);
    assert.equal(clusters.length, 2);
  });

  test("két, egyenlő pontszámú, több km-re lévő 'Petőfi tér'-szerű candidate valódi AMBIGUOUS-t ad", () => {
    const petofiA: NominatimRawResult = {
      display_name: "Petőfi tér, Belváros-Lipótváros, Budapest, Magyarország",
      lat: "47.4952",
      lon: "19.0512",
      addresstype: "place",
      class: "place",
      namedetails: { name: "Petőfi tér" },
      address: { city: "Budapest", suburb: "Belváros-Lipótváros", country_code: "hu" },
    };
    const petofiB: NominatimRawResult = {
      display_name: "Petőfi tér, Kőbánya, Budapest, Magyarország",
      lat: "47.48",
      lon: "19.15",
      addresstype: "place",
      class: "place",
      namedetails: { name: "Petőfi tér" },
      address: { city: "Budapest", suburb: "Kőbánya", country_code: "hu" },
    };
    const dist = haversineDistanceMeters(47.4952, 19.0512, 47.48, 19.15);
    assert.ok(dist > SAME_PLACE_CLUSTER_RADIUS_METERS * 10, "a fixture-nek valóban több km-re kell lennie");
    const classification = classifyNamedPlaceCandidates([petofiA, petofiB], "Petőfi tér");
    assert.equal(classification.status, "AMBIGUOUS");
    assert.equal(classification.candidates.length, 2);
  });
});

// ---------------------------------------------------------------------------
// H) a picker már deduplikált — ugyanaz a cluster egyszer jelenik meg
// ---------------------------------------------------------------------------
describe("H) az AMBIGUOUS picker jelöltlistája már klaszterezett/deduplikált — a 4 Astoria candidate a 2 valódi klaszterből fejenként EGY sort ad, nem 6-ot", () => {
  test("4 közeli Astoria candidate + 2 távoli Astoria candidate (2 klaszter) esetén a candidates lista PONTOSAN 2 elemű, nem 6", () => {
    const closeCluster = [makeAstoriaVariant(0, 0, { importance: 0.5 }), makeAstoriaVariant(80, -60), makeAstoriaVariant(-100, 50), makeAstoriaVariant(150, 100)];
    const farOne = makeAstoriaVariant(20000, 20000, { importance: 0.5 });
    const classification = classifyNamedPlaceCandidates([...closeCluster, farOne], "Astoria");
    assert.equal(classification.status, "AMBIGUOUS");
    assert.equal(classification.candidates.length, 2);
    const clientCandidates = classification.candidates.map(toPlaceCandidate);
    assert.equal(clientCandidates.length, 2);
  });
});

// ---------------------------------------------------------------------------
// I/J) namedetails alternatív nevek
// ---------------------------------------------------------------------------
describe("I) namedetails.old_name egyezés — a query megtalálja a current-name POI-t", () => {
  test("getResultNameCandidates tartalmazza az old_name-et is", () => {
    const result = makeNamedPlace({ namedetails: { name: "Arena Mall", old_name: "Arena Plaza" } });
    const names = getResultNameCandidates(result);
    assert.ok(names.includes("Arena Plaza"));
    assert.ok(names.includes("Arena Mall"));
  });

  test("scoreNamedPlaceResult 'Arena Plaza' keresésre pontot ad egy 'Arena Mall' namedetails.name + 'Arena Plaza' old_name candidate-re", () => {
    const result = makeNamedPlace({ namedetails: { name: "Arena Mall", old_name: "Arena Plaza" } });
    const score = scoreNamedPlaceResult(result, "Arena Plaza");
    assert.ok(typeof score === "number" && score! > 0);
  });

  test("classifyNamedPlaceCandidates RESOLVED-et ad, és a visszaadott candidate megőrzi a SAJÁT (namedetails.name szerinti) elsődleges nevét — a kliens a jelenlegi nevet látja, nem a régit", () => {
    const result = makeNamedPlace({ namedetails: { name: "Arena Mall", old_name: "Arena Plaza" } });
    const classification = classifyNamedPlaceCandidates([result], "Arena Plaza");
    assert.equal(classification.status, "RESOLVED");
    assert.equal(toPlaceCandidate(classification.candidates[0]).displayName, "Arena Mall");
  });
});

describe("J) namedetails.alt_name egyezés", () => {
  test("getResultNameCandidates tartalmazza az alt_name-et is, és több, ';'-vel elválasztott alt_name-et is szétválaszt", () => {
    const result = makeNamedPlace({ namedetails: { name: "Etele Plaza", alt_name: "Etele Mall;Etele Center" } });
    const names = getResultNameCandidates(result);
    assert.ok(names.includes("Etele Mall"));
    assert.ok(names.includes("Etele Center"));
  });

  test("scoreNamedPlaceResult 'Etele Center' keresésre is pontot ad, ha az csak az alt_name-ben szerepel", () => {
    const result = makeNamedPlace({ namedetails: { name: "Etele Plaza", alt_name: "Etele Mall;Etele Center" } });
    const score = scoreNamedPlaceResult(result, "Etele Center");
    assert.ok(typeof score === "number" && score! > 0);
  });

  test("ha az OSM/Nominatim válasz EGYÁLTALÁN NEM ad alternatív nevet, a rendszer NEM talál ki kapcsolatot — egy teljesen más nevű keresés NEM kap pontot", () => {
    const result = makeNamedPlace({ namedetails: { name: "Etele Plaza" } });
    const score = scoreNamedPlaceResult(result, "Valami Egészen Más Hely");
    assert.equal(score, null);
  });
});

// ---------------------------------------------------------------------------
// K) district constraint megmarad trailing-number fallback során
// ---------------------------------------------------------------------------
describe("K) 'Budapest, V. kerület, Deák tér 85' — a trailing-number levágás UTÁN a kerület-constraint TOVÁBBRA IS aktív", () => {
  test("parseExpectedAddressComponents a házszámot levágja, de a city/districtOrPostalCode megmarad", () => {
    const expected = parseExpectedAddressComponents("Budapest, V. kerület, Deák tér 85");
    assert.equal(expected.streetName, "Deák tér");
    assert.equal(expected.houseNumber, "85");
    assert.equal(expected.city, "Budapest");
    assert.equal(expected.districtOrPostalCode, "V. kerület");
  });

  test("a házszám-levágás UTÁN is elutasítjuk a XXI. kerületi candidate-et, ugyanazzal a constraint-tel", () => {
    const expected = parseExpectedAddressComponents("Budapest, V. kerület, Deák tér 85");
    const constraint: GeoContextConstraint = { city: expected.city || null, districtOrPostalCode: expected.districtOrPostalCode };
    const xxi = makeNamedPlace({ address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" } });
    const v = makeNamedPlace({ address: { city: "Budapest", city_district: "V. kerület", country_code: "hu" } });
    const classification = classifyNamedPlaceCandidates([xxi, v], expected.streetName, constraint);
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates[0].address?.city_district, "V. kerület");
  });

  test("a geocodeAddress forrása a 4. (egyszerűsített) lépésben is megtartja a kerületet a Nominatim felé küldött szövegben", () => {
    const geocodeSrc = readFileSync(join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts"), "utf-8");
    assert.match(geocodeSrc, /simplifiedDistrictPart/);
    assert.match(
      geocodeSrc,
      /const simplifiedQueryText = \[simplifiedStreet, simplifiedDistrictPart, expected\.city \|\| null, "Hungary"\]/
    );
  });
});

// ---------------------------------------------------------------------------
// L) district nélkül "Deák tér" — ne kérjen kötelező kerületet
// ---------------------------------------------------------------------------
describe("L) district nélkül 'Deák tér' — sem a kliens, sem a szerver nem kényszerít kötelező kerületet", () => {
  test("isManualAddressComplete true-t ad, ha District üres, akár City is üres (bare place-only keresés)", () => {
    assert.equal(isManualAddressComplete({ city: "", districtOrPostalCode: "", street: "Deák tér" }), true);
  });

  test("parseExpectedAddressComponents('Deák tér') districtOrPostalCode-ja null, a constraint emiatt NEM zár ki semmilyen candidate-et kerület alapján", () => {
    const expected = parseExpectedAddressComponents("Deák tér");
    assert.equal(expected.districtOrPostalCode, null);
    const constraint: GeoContextConstraint = { city: expected.city || null, districtOrPostalCode: expected.districtOrPostalCode };
    const anyDistrict = makeNamedPlace({ address: { city: "Budapest", city_district: "XXI. kerület", country_code: "hu" } });
    assert.equal(candidateViolatesGeoContext(anyDistrict, constraint), false);
  });
});

// ---------------------------------------------------------------------------
// M) CURRENT_LOCATION / MAP_PICKED C4.1 regresszió zöld marad
// ---------------------------------------------------------------------------
describe("M) CURRENT_LOCATION / MAP_PICKED (C4.1) — a fromName-alapú label-megkülönböztetés VÁLTOZATLAN a C4.2 után is", () => {
  test("a route.ts fromCoordinates ága továbbra is 'fromName ?? \"Jelenlegi hely\"'-t használ — a C4.2 nem nyúlt ehhez az ághoz", () => {
    const routeSrc = readFileSync(
      join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts"),
      "utf-8"
    );
    assert.match(routeSrc, /fromCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: fromName \?\? "Jelenlegi hely"/);
  });

  test("a RouteOrigin MAP_PICKED variánsa továbbra is 'name' mezőt hordoz — nincs regresszió a típusmodellben", () => {
    assert.match(formSrc, /\| \{ type: "MAP_PICKED"; name: string; latitude: number; longitude: number \}/);
  });
});

// ---------------------------------------------------------------------------
// N) klasszikus cím-biztonság — "Rákóczi út 999" road-only TOVÁBBRA sem exact
// ---------------------------------------------------------------------------
describe("N) 'Rákóczi út 999' — road-only fallback a C4.2 district/clustering változások UTÁN is SOHA nem válik exact/RESOLVED találattá", () => {
  test("classifyNamedPlaceCandidates NOT_FOUND-ot ad egy puszta road/highway candidate-re, MÉG egy (irreleváns) constraint mellett is", () => {
    const bareRoad: NominatimRawResult = {
      display_name: "Rákóczi út, Budapest, Magyarország",
      lat: "47.4980",
      lon: "19.0710",
      addresstype: "road",
      class: "highway",
      address: { road: "Rákóczi út", city: "Budapest", country_code: "hu" },
    };
    const constraint: GeoContextConstraint = { city: "Budapest", districtOrPostalCode: null };
    const classification = classifyNamedPlaceCandidates([bareRoad], "Rákóczi út", constraint);
    assert.equal(classification.status, "NOT_FOUND");
  });

  test("extractDistrictIdentity/extractCandidateDistrictIdentity SOHA nem talál ki kerületet egy felismerhetetlen szövegből (pl. egy puszta szomszédság-névből)", () => {
    assert.equal(extractDistrictIdentity("Belváros-Lipótváros"), null);
    assert.equal(extractCandidateDistrictIdentity({ suburb: "Belváros-Lipótváros" }), null);
    assert.equal(extractCandidateDistrictIdentity(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// Kiegészítő — MAX_AMBIGUOUS_CANDIDATES a klaszterezett listára is érvényes
// ---------------------------------------------------------------------------
describe("kiegészítő — MAX_AMBIGUOUS_CANDIDATES klaszter-szinten is érvényes", () => {
  test("MAX_AMBIGUOUS_CANDIDATES változatlanul 5", () => {
    assert.equal(MAX_AMBIGUOUS_CANDIDATES, 5);
  });
});
