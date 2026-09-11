// VÉDETT ÚTVONAL — C4.1 korrekciós kör (2026-09-11) determinisztikus
// tesztjei a specifikáció 6. pontjának A-J eseteire, plusz a 3. pont
// ("Astoria és hasonló esetek", generikus RESOLVED/AMBIGUOUS algoritmus)
// explicit bizonyítására.
//
// Ez a fájl NEM helyettesíti, hanem KIEGÉSZÍTI a geocoding-hardening.test.ts,
// geocoding-poi-generalization.test.ts és single-shared-map-and-current-
// location.test.ts meglévő, VÁLTOZATLANUL futó tesztjeit.
//
//   node --test __tests__/vedett-route/c41-ambiguous-and-origin-label.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyNamedPlaceCandidates,
  pickBestNamedPlaceMatch,
  toPlaceCandidate,
  isAmbiguousGeocodeResult,
  AMBIGUOUS_SCORE_GAP_THRESHOLD,
  MAX_AMBIGUOUS_CANDIDATES,
  type NominatimRawResult,
  type GeocodeResult,
  type AmbiguousGeocodeResult,
} from "../../lib/vedett-route/geocode.ts";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

const FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const formSrc = readFileSync(FORM_PATH, "utf-8");

const SCHEMAS_PATH = join(import.meta.dirname, "..", "..", "lib", "vedett-route", "schemas.ts");
const schemasSrc = readFileSync(SCHEMAS_PATH, "utf-8");

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
      country_code: "hu",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A) CURRENT_LOCATION origin -> a válasz neve továbbra is "Jelenlegi hely"
// ---------------------------------------------------------------------------
describe("A) CURRENT_LOCATION origin — a fromCoordinates ág fromName NÉLKÜL a statikus 'Jelenlegi hely' nevet adja", () => {
  test("route.ts: fromCoordinates ág 'fromName ?? \"Jelenlegi hely\"' — fromName hiányában a régi, statikus név marad", () => {
    assert.match(routeSrc, /fromCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: fromName \?\? "Jelenlegi hely"/);
  });

  test("a CURRENT_LOCATION kliens-ág (originFields) NEM küld fromName-et — a szerver ilyenkor a statikus névre esik vissza", () => {
    const originFieldsBlock =
      formSrc.match(
        /origin\.type === "CURRENT_LOCATION"\s*\n\s*\? \{ fromCoordinates:[\s\S]*?\}\s*\n\s*: origin\.type === "MAP_PICKED"/
      )?.[0] ?? "";
    assert.ok(originFieldsBlock.length > 0, "meg kell találni a CURRENT_LOCATION ágat");
    assert.doesNotMatch(originFieldsBlock.split(": origin.type ===")[0], /fromName/);
  });
});

// ---------------------------------------------------------------------------
// B) MAP_PICKED origin -> a label NEM "Jelenlegi hely"
// ---------------------------------------------------------------------------
describe("B) MAP_PICKED origin — a fromName MINDIG küldött, a label SOSEM 'Jelenlegi hely'", () => {
  test("a kliens MAP_PICKED origin ága fromName: origin.name-et küld a fromCoordinates mellé", () => {
    const mapPickedBlock =
      formSrc.match(
        /origin\.type === "MAP_PICKED"\s*\n\s*\? \{ fromCoordinates: \{ latitude: origin\.latitude, longitude: origin\.longitude \}, fromName: origin\.name \}/
      )?.[0] ?? "";
    assert.ok(mapPickedBlock.length > 0, "a MAP_PICKED originFields ágnak fromName: origin.name-et kell küldenie");
  });

  test("a RouteOrigin MAP_PICKED variánsnak van 'name' mezője (nem string-hack — típusszintű megkülönböztetés CURRENT_LOCATION-től)", () => {
    assert.match(formSrc, /\| \{ type: "MAP_PICKED"; name: string; latitude: number; longitude: number \}/);
    // A CURRENT_LOCATION variánsnak NINCS name mezője — a két eset a
    // discriminated union `type` tagján és a MAP_PICKED-only `name` mezőn
    // keresztül különül el, nem egy futásidejű string-összehasonlításon.
    assert.match(formSrc, /\| \{ type: "CURRENT_LOCATION"; latitude: number; longitude: number \}/);
  });

  test("a handleOriginMapPickerConfirm a MAP_PICKED origin 'name' mezőjét NEM 'Jelenlegi hely'-re állítja", () => {
    const block = formSrc.match(/function handleOriginMapPickerConfirm\(lat: number, lon: number\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /name: "Jelenlegi hely"/);
  });

  test("route.ts: a fromCoordinates ág fromName jelenlétében NEM a statikus 'Jelenlegi hely'-et küldi vissza — a régi, feltétlen literál sehol nem szerepel", () => {
    assert.doesNotMatch(routeSrc, /Promise\.resolve\(\{ name: "Jelenlegi hely"/);
  });

  test("a schemas.ts fromName mezője szimmetrikus a meglévő toName mintával (opcionális, kizárólag megjelenítési célú)", () => {
    assert.match(schemasSrc, /fromName: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)\.optional\(\)/);
    assert.match(schemasSrc, /toName: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)\.optional\(\)/);
  });
});

// ---------------------------------------------------------------------------
// C) MAP_PICKED origin koordináta — SOSEM megy új geocode-ra
// ---------------------------------------------------------------------------
describe("C) MAP_PICKED origin — a koordináta autoritatív marad, NINCS buildStructuredAddress/geocodeAddress hívás ezen az ágon", () => {
  test("az originFields MAP_PICKED ága KIZÁRÓLAG fromCoordinates+fromName-et küld, nincs geocodeAddress/buildStructuredAddress hívás benne", () => {
    const originFieldsBlock =
      formSrc.match(
        /origin\.type === "CURRENT_LOCATION"\s*\n\s*\? \{ fromCoordinates:[\s\S]*?\}\s*\n\s*: \{ from: buildStructuredAddress\(origin\) \};/
      )?.[0] ?? "";
    assert.ok(originFieldsBlock.length > 0);
    const beforeFinalElse = originFieldsBlock.split(": { from: buildStructuredAddress(origin) };")[0];
    assert.doesNotMatch(beforeFinalElse, /buildStructuredAddress|geocodeAddress/);
  });

  test("route.ts fromCoordinates ága sosem hívja meg geocodeAddress-t (ternary: fromCoordinates ? Promise.resolve(...) : geocodeAddress(...))", () => {
    assert.match(routeSrc, /fromCoordinates\s*\n\s*\? Promise\.resolve\(\{[\s\S]*?\}\)\s*\n\s*: geocodeAddress\(from as string\),/);
  });
});

// ---------------------------------------------------------------------------
// D) Egyértelmű POI-győztes -> RESOLVED, NINCS candidate UI
// ---------------------------------------------------------------------------
describe("D) egyértelmű győztes (pl. 'Deák tér', egyetlen releváns találat) -> RESOLVED, pickBestNamedPlaceMatch nem null", () => {
  test("classifyNamedPlaceCandidates egyetlen elfogadható találatra RESOLVED-et ad, egy elemű candidates listával", () => {
    const classification = classifyNamedPlaceCandidates([makeNamedPlace()], "Deák tér");
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates.length, 1);
  });

  test("pickBestNamedPlaceMatch egyértelmű győztesre nem null-t ad — a kliens így SOHA nem kap candidate-listát ehhez a lekérdezéshez", () => {
    const best = pickBestNamedPlaceMatch([makeNamedPlace()], "Deák tér");
    assert.ok(best !== null);
  });
});

// ---------------------------------------------------------------------------
// E) két közeli/egyenálló pontszámú találat -> AMBIGUOUS
// ---------------------------------------------------------------------------
describe("E) két, egymáshoz túl közeli pontszámú találat -> AMBIGUOUS, determinisztikus küszöb", () => {
  test("valódi egyenállás (gap == 0) -> AMBIGUOUS, mindkét jelölt a candidates listában", () => {
    const a = makeNamedPlace({ display_name: "Astoria, Budapest, Magyarország", namedetails: { name: "Astoria" } });
    const b = makeNamedPlace({
      display_name: "Astoria, Budapest, Magyarország",
      namedetails: { name: "Astoria" },
      lat: "47.5",
      lon: "19.1",
    });
    const classification = classifyNamedPlaceCandidates([a, b], "Astoria");
    assert.equal(classification.status, "AMBIGUOUS");
    assert.equal(classification.candidates.length, 2);
  });

  test("a küszöb determinisztikus: gap == AMBIGUOUS_SCORE_GAP_THRESHOLD - 1 -> AMBIGUOUS; gap == AMBIGUOUS_SCORE_GAP_THRESHOLD -> RESOLVED", () => {
    // Két, "Deák tér"-rel egyező nevű, de eltérő importance-ú találat — a
    // pontszám-különbséget az `importance * 5` taggal állítjuk elő, hogy a
    // küszöb HATÁRÁN mindkét oldalt determinisztikusan teszteljük.
    const gapJustBelow = (AMBIGUOUS_SCORE_GAP_THRESHOLD - 1) / 5;
    const belowResults = [
      makeNamedPlace({ importance: gapJustBelow }),
      makeNamedPlace({ importance: 0, lat: "47.5", lon: "19.1" }),
    ];
    assert.equal(classifyNamedPlaceCandidates(belowResults, "Deák tér").status, "AMBIGUOUS");

    const gapAtThreshold = AMBIGUOUS_SCORE_GAP_THRESHOLD / 5;
    const atThresholdResults = [
      makeNamedPlace({ importance: gapAtThreshold }),
      makeNamedPlace({ importance: 0, lat: "47.5", lon: "19.1" }),
    ];
    assert.equal(classifyNamedPlaceCandidates(atThresholdResults, "Deák tér").status, "RESOLVED");
  });
});

// ---------------------------------------------------------------------------
// F/G) AMBIGUOUS origin/destination -> szelekciós lista mindkét oldalon
// ---------------------------------------------------------------------------
describe("F) AMBIGUOUS origin — a szerver 'address_ambiguous'-t ad, a kliens ambiguousOriginCandidates-be teszi és listát renderel", () => {
  test("route.ts: isAmbiguousGeocodeResult(fromGeo) -> address_ambiguous, field: 'from', candidates: fromGeo.candidates", () => {
    const block = routeSrc.match(/if \(isAmbiguousGeocodeResult\(fromGeo\)\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0);
    assert.match(block, /reason: "address_ambiguous"/);
    assert.match(block, /field: "from" as const/);
    assert.match(block, /candidates: fromGeo\.candidates/);
  });

  test("a kliens setAmbiguousOriginCandidates-et data.field === 'from' esetén tölti fel", () => {
    assert.match(
      formSrc,
      /data\.reason === "address_ambiguous" && data\.field === "from" && data\.candidates\) \{\s*\n\s*setAmbiguousOriginCandidates\(data\.candidates\);/
    );
  });

  test("a kliens a 'from' candidate-listát külön <ul role=\"listbox\"> blokkban jeleníti meg, minden sor egy kattintható/kezelhető <button role=\"option\">", () => {
    assert.match(formSrc, /result\.field === "from" && ambiguousOriginCandidates &&/);
    assert.match(formSrc, /aria-label="Induló hely jelöltek"/);
    assert.match(formSrc, /onClick=\{\(\) => handleSelectOriginCandidate\(candidate\)\}/);
  });
});

describe("G) AMBIGUOUS destination — ugyanaz a mechanizmus, szimmetrikusan a destination oldalon", () => {
  test("route.ts: isAmbiguousGeocodeResult(toGeo) -> address_ambiguous, field: 'to', candidates: toGeo.candidates", () => {
    const block = routeSrc.match(/if \(isAmbiguousGeocodeResult\(toGeo\)\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    assert.ok(block.length > 0);
    assert.match(block, /reason: "address_ambiguous"/);
    assert.match(block, /field: "to" as const/);
    assert.match(block, /candidates: toGeo\.candidates/);
  });

  test("a kliens setAmbiguousDestinationCandidates-et data.field === 'to' esetén tölti fel", () => {
    assert.match(
      formSrc,
      /data\.reason === "address_ambiguous" && data\.field === "to" && data\.candidates\) \{\s*\n\s*setAmbiguousDestinationCandidates\(data\.candidates\);/
    );
  });

  test("a kliens a 'to' candidate-listát külön blokkban jeleníti meg, ugyanazzal a struktúrával mint origin-nél", () => {
    assert.match(formSrc, /result\.field === "to" && ambiguousDestinationCandidates &&/);
    assert.match(formSrc, /aria-label="Célpont jelöltek"/);
    assert.match(formSrc, /onClick=\{\(\) => handleSelectDestinationCandidate\(candidate\)\}/);
  });

  test("mindkét lista alatt van bezáró/új-keresés lehetőség (handleDismiss*)", () => {
    assert.match(formSrc, /onClick=\{handleDismissOriginCandidates\}/);
    assert.match(formSrc, /onClick=\{handleDismissDestinationCandidates\}/);
  });
});

// ---------------------------------------------------------------------------
// H) candidate kiválasztás -> közvetlen koordináta, NINCS új geocode hívás
// ---------------------------------------------------------------------------
describe("H) candidate kiválasztás — a választott koordináta autoritatív, SOHA nem geokódolódik újra", () => {
  test("handleSelectOriginCandidate KIZÁRÓLAG setOrigin(MAP_PICKED)-et hív a candidate lat/lon/displayName alapján, nincs fetch/geocode hívás", () => {
    const block = formSrc.match(/function handleSelectOriginCandidate\(candidate: GeocodePlaceCandidate\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleSelectOriginCandidate handler");
    assert.match(block, /type: "MAP_PICKED"/);
    assert.match(block, /latitude: candidate\.lat/);
    assert.match(block, /longitude: candidate\.lon/);
    assert.doesNotMatch(block, /fetch\(/);
  });

  test("handleSelectDestinationCandidate szimmetrikusan ugyanígy viselkedik a destination oldalon", () => {
    const block =
      formSrc.match(/function handleSelectDestinationCandidate\(candidate: GeocodePlaceCandidate\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    assert.ok(block.length > 0, "hiányzik a handleSelectDestinationCandidate handler");
    assert.match(block, /type: "MAP_PICKED"/);
    assert.match(block, /latitude: candidate\.lat/);
    assert.match(block, /longitude: candidate\.lon/);
    assert.doesNotMatch(block, /fetch\(/);
  });

  test("mivel a kiválasztott candidate MAP_PICKED-ként kerül be az origin/destination state-be, az újbóli beküldés a MAR ismert MAP_PICKED ágon megy — nincs geocodeAddress hívás", () => {
    // Ugyanaz az invariáns, mint a C) tesztben — itt azt bizonyítjuk, hogy
    // handleSelect*Candidate kimenete (MAP_PICKED state) ugyanazon az ágon
    // fut tovább, ami sosem hív buildStructuredAddress/geocodeAddress-t.
    const originFieldsBlock =
      formSrc.match(
        /origin\.type === "CURRENT_LOCATION"\s*\n\s*\? \{ fromCoordinates:[\s\S]*?\}\s*\n\s*: \{ from: buildStructuredAddress\(origin\) \};/
      )?.[0] ?? "";
    const beforeFinalElse = originFieldsBlock.split(": { from: buildStructuredAddress(origin) };")[0];
    assert.doesNotMatch(beforeFinalElse, /geocodeAddress/);
  });
});

// ---------------------------------------------------------------------------
// I) candidate lista max 5 elemre korlátozva
// ---------------------------------------------------------------------------
describe("I) a candidate lista sosem hosszabb MAX_AMBIGUOUS_CANDIDATES (5) elemnél", () => {
  test("MAX_AMBIGUOUS_CANDIDATES konstans értéke 5", () => {
    assert.equal(MAX_AMBIGUOUS_CANDIDATES, 5);
  });

  test("classifyNamedPlaceCandidates 7 közeli pontszámú találatra is legfeljebb 5 candidate-et ad", () => {
    const results: NominatimRawResult[] = Array.from({ length: 7 }, (_, i) =>
      makeNamedPlace({
        display_name: `Deák tér variáns ${i}, Budapest, Magyarország`,
        lat: String(47.4 + i * 0.001),
        lon: String(19.0 + i * 0.001),
      })
    );
    const classification = classifyNamedPlaceCandidates(results, "Deák tér");
    assert.equal(classification.status, "AMBIGUOUS");
    assert.ok(classification.candidates.length <= MAX_AMBIGUOUS_CANDIDATES);
    assert.equal(classification.candidates.length, 5);
  });

  test("a kliensnek adott GeocodePlaceCandidate alak SOHA nem tartalmaz nyers Nominatim mezőt (osm_id/class/type/address)", () => {
    const candidate = toPlaceCandidate(makeNamedPlace());
    const keys = Object.keys(candidate);
    assert.deepEqual(keys.sort(), ["displayName", "lat", "lon", "secondary"].sort());
  });
});

// ---------------------------------------------------------------------------
// J) road-only fallback SOHA nem válik exact/RESOLVED találattá (regresszió)
// ---------------------------------------------------------------------------
describe("J) 'Rákóczi út 999' — a levágott puszta út SOHA nem válik nevesített hellyé (regresszió a classifyNamedPlaceCandidates alatt is)", () => {
  test("classifyNamedPlaceCandidates egy csak puszta utat tartalmazó listára NOT_FOUND-ot ad (sosem RESOLVED/AMBIGUOUS)", () => {
    const bareRoad: NominatimRawResult = {
      display_name: "Rákóczi út, Budapest, Magyarország",
      lat: "47.4980",
      lon: "19.0710",
      addresstype: "road",
      class: "highway",
      address: { road: "Rákóczi út", city: "Budapest", country_code: "hu" },
    };
    const classification = classifyNamedPlaceCandidates([bareRoad], "Rákóczi út");
    assert.equal(classification.status, "NOT_FOUND");
    assert.equal(classification.candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. pont — "Astoria" generikus algoritmus bizonyítása (RESOLVED ÉS
// AMBIGUOUS ág is a KÖZÖS classifyNamedPlaceCandidates-ből, nincs
// "Astoria"-specifikus hardcode sehol a forrásban)
// ---------------------------------------------------------------------------
describe("Astoria (3. pont) — a generikus classifyNamedPlaceCandidates dönt, NINCS 'Astoria'-specifikus hardcode a geocode.ts-ben", () => {
  test("egy Budapest-kontextusú 'Astoria' egy Budapest-kontextus nélküli, azonos nevű találat ELLEN RESOLVED-et ad (a Budapest-bónusz önmagában elegendő 10-es gap)", () => {
    const budapestAstoria = makeNamedPlace({
      display_name: "Astoria, Erzsébetváros, Budapest, Magyarország",
      namedetails: { name: "Astoria" },
      address: { city: "Budapest", suburb: "Erzsébetváros", country_code: "hu" },
    });
    const noContextAstoria: NominatimRawResult = {
      display_name: "Astoria, Magyarország",
      lat: "47.1",
      lon: "18.9",
      addresstype: "amenity",
      class: "amenity",
      namedetails: { name: "Astoria" },
      address: { country_code: "hu" },
    };
    const classification = classifyNamedPlaceCandidates([noContextAstoria, budapestAstoria], "Astoria");
    assert.equal(classification.status, "RESOLVED");
    assert.equal(classification.candidates[0].address?.suburb, "Erzsébetváros");
  });

  test("két, egyformán Budapest-kontextusú, de eltérő helyen lévő 'Astoria'-szerű találat AMBIGUOUS-t ad — a kliens egy candidate-listát kap, SOHA nem egy találgatott győztest", () => {
    const astoria1 = makeNamedPlace({
      display_name: "Astoria, Erzsébetváros, Budapest, Magyarország",
      namedetails: { name: "Astoria" },
      address: { city: "Budapest", suburb: "Erzsébetváros", country_code: "hu" },
    });
    const astoria2 = makeNamedPlace({
      display_name: "Astoria, Ferencváros, Budapest, Magyarország",
      namedetails: { name: "Astoria" },
      lat: "47.49",
      lon: "19.07",
      address: { city: "Budapest", suburb: "Ferencváros", country_code: "hu" },
    });
    const classification = classifyNamedPlaceCandidates([astoria1, astoria2], "Astoria");
    assert.equal(classification.status, "AMBIGUOUS");
    assert.equal(classification.candidates.length, 2);
    const clientCandidates = classification.candidates.map(toPlaceCandidate);
    assert.ok(clientCandidates.every((c) => c.secondary?.includes("Budapest")));
  });

  test("a geocode.ts forrásában NINCS 'Astoria'-specifikus (vagy bármilyen konkrét helynévre hangolt) ÁGAZÓ LOGIKA — 'Astoria' csak dokumentációs komment-példaként fordulhat elő, SOHA nem egy futásidejű összehasonlítás/feltétel része", () => {
    const geocodeSrc = readFileSync(join(import.meta.dirname, "..", "..", "lib", "vedett-route", "geocode.ts"), "utf-8");
    // Tiltjuk a NÉV konkrét, futásidejű összehasonlítását ("Astoria" mint
    // string-literál egy ===, .includes(), switch/case vagy hasonló
    // feltételben) — a szövegben szabadon szerepelhet dokumentációs
    // komment-példaként (lásd a classifyNamedPlaceCandidates fejlécét).
    assert.doesNotMatch(geocodeSrc, /(===|!==|\.includes\(|\.startsWith\(|\.endsWith\(|case )\s*["']Astoria["']/i);
    assert.match(geocodeSrc, /export function classifyNamedPlaceCandidates\(results: NominatimRawResult\[\], query: string\)/);
  });
});

// ---------------------------------------------------------------------------
// Kiegészítő típus-szintűség check — isAmbiguousGeocodeResult type guard
// ---------------------------------------------------------------------------
describe("isAmbiguousGeocodeResult type guard — helyesen különbözteti meg a GeocodeResult/AmbiguousGeocodeResult uniót", () => {
  test("egy sima GeocodeResult-ra false-t ad, egy AmbiguousGeocodeResult-ra true-t", () => {
    const plain: GeocodeResult = { name: "Deák tér", lat: 47.4979, lon: 19.0538, quality: "EXACT" };
    const ambiguous: AmbiguousGeocodeResult = { ambiguous: true, candidates: [] };
    assert.equal(isAmbiguousGeocodeResult(plain), false);
    assert.equal(isAmbiguousGeocodeResult(ambiguous), true);
  });
});
