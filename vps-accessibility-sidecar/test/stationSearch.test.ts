// VPS ACCESSIBILITY SIDECAR — NÉV ALAPÚ ÁLLOMÁS/MEGÁLLÓ KERESÉS unit
// tesztek (Station Name Search backend sprint, 2026-09-24).
//
// Szándékosan generikus fixture-ök — a "Martonvásár" nevű valós stopId=829
// GTFS-rekord a KÜLÖN, realisztikus fájlrendszer-integrációs tesztben
// szerepel (test/stationSearchIntegration.test.ts), itt csak semleges
// fixture-nevek.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATION_SEARCH_LIMIT,
  MAX_STATION_SEARCH_LIMIT,
  MIN_STATION_SEARCH_QUERY_LENGTH,
  findStationsByName,
  foldHungarianDiacritics,
  normalizeStationSearchText,
  parseStationSearchRequest,
} from "../dist/stationSearch.js";
import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "../dist/lib/accessibilityIndex.js";

function stop(overrides: Partial<StopAccessibilityIndexEntry> & { stopId: string }): StopAccessibilityIndexEntry {
  return { ...overrides };
}

function indexFrom(stops: StopAccessibilityIndexEntry[]): AccessibilityIndex {
  const stopsById: Record<string, StopAccessibilityIndexEntry> = {};
  for (const s of stops) stopsById[s.stopId] = s;
  return { provider: "BKK", generation: "g1", builtAt: "2026-09-24T00:00:00Z", stopsById, tripsById: {}, pathways: [] };
}

describe("foldHungarianDiacritics / normalizeStationSearchText", () => {
  test("generikusan lecseréli az összes magyar ékezetes karaktert (nem helynév-specifikus)", () => {
    assert.equal(foldHungarianDiacritics("áéíóöőúüű"), "aeiooouuu");
    assert.equal(foldHungarianDiacritics("ÁÉÍÓÖŐÚÜŰ"), "aeiooouuu");
  });

  test("nem ékezetes karaktereket változatlanul hagyja", () => {
    assert.equal(foldHungarianDiacritics("Xylofon 123"), "Xylofon 123");
  });

  test("normalizeStationSearchText: ékezet + kis/nagybetű + whitespace toleráns", () => {
    assert.equal(normalizeStationSearchText("  Székesfehérvár   Állomás  "), "szekesfehervar allomas");
    assert.equal(normalizeStationSearchText("székesfehérvár állomás"), "szekesfehervar allomas");
  });
});

describe("parseStationSearchRequest — validáció", () => {
  test("hiányzó dataset -> MISSING_DATASET", () => {
    assert.deepEqual(parseStationSearchRequest({ query: "Teszt" }), { error: "MISSING_DATASET" });
  });

  test("nem-objektum body -> MALFORMED_BODY", () => {
    assert.deepEqual(parseStationSearchRequest(null), { error: "MALFORMED_BODY" });
    assert.deepEqual(parseStationSearchRequest("string"), { error: "MALFORMED_BODY" });
  });

  test("túl rövid query -> INVALID_QUERY", () => {
    assert.deepEqual(parseStationSearchRequest({ dataset: "bkkgtfs", query: "a" }), { error: "INVALID_QUERY" });
  });

  test("hiányzó query -> INVALID_QUERY", () => {
    assert.deepEqual(parseStationSearchRequest({ dataset: "bkkgtfs" }), { error: "INVALID_QUERY" });
  });

  test("hiányzó limit esetén a dokumentált default értéket kapja", () => {
    const result = parseStationSearchRequest({ dataset: "bkkgtfs", query: "Teszt" });
    assert.ok(!("error" in result));
    if (!("error" in result)) assert.equal(result.limit, DEFAULT_STATION_SEARCH_LIMIT);
  });

  test("a max limitnél nagyobb -> INVALID_LIMIT", () => {
    const result = parseStationSearchRequest({ dataset: "bkkgtfs", query: "Teszt", limit: MAX_STATION_SEARCH_LIMIT + 1 });
    assert.deepEqual(result, { error: "INVALID_LIMIT" });
  });

  test("nem-egész limit -> INVALID_LIMIT", () => {
    assert.deepEqual(parseStationSearchRequest({ dataset: "bkkgtfs", query: "Teszt", limit: 2.5 }), { error: "INVALID_LIMIT" });
  });

  test("query körüli whitespace trim-elve kerül vissza", () => {
    const result = parseStationSearchRequest({ dataset: "bkkgtfs", query: "  Teszt Falu  " });
    assert.ok(!("error" in result));
    if (!("error" in result)) assert.equal(result.query, "Teszt Falu");
  });

  test(`MIN_STATION_SEARCH_QUERY_LENGTH = ${MIN_STATION_SEARCH_QUERY_LENGTH}`, () => {
    assert.equal(MIN_STATION_SEARCH_QUERY_LENGTH, 2);
  });
});

describe("findStationsByName — illesztés", () => {
  test("ékezet- és kis-/nagybetű-toleráns exact match", () => {
    const index = indexFrom([stop({ stopId: "S1", stopName: "Fehérvár", latitude: 47.1, longitude: 18.4 })]);
    const result = findStationsByName(index, "mavgtfs", "fehervar", 8);
    assert.equal(result.length, 1);
    assert.equal(result[0].stopId, "S1");
    assert.equal(result[0].dataset, "mavgtfs");
  });

  test("exact match megelőzi a partial (substring) találatot", () => {
    const index = indexFrom([
      stop({ stopId: "PARTIAL", stopName: "Faluhely Állomás", latitude: 47.1, longitude: 18.4 }),
      stop({ stopId: "EXACT", stopName: "Faluhely", latitude: 47.2, longitude: 18.5 }),
    ]);
    const result = findStationsByName(index, "bkkgtfs", "Faluhely", 8);
    assert.equal(result.length, 2);
    assert.equal(result[0].stopId, "EXACT", "az exact találatnak kell elöl állnia");
    assert.equal(result[1].stopId, "PARTIAL");
  });

  test("substring (contains) találatot is visszaad, ha nincs exact", () => {
    const index = indexFrom([stop({ stopId: "S1", stopName: "Nagy Falu Központ", latitude: 47.1, longitude: 18.4 })]);
    const result = findStationsByName(index, "bkkgtfs", "Falu", 8);
    assert.equal(result.length, 1);
    assert.equal(result[0].stopId, "S1");
  });

  test("nem egyező nevű stopot nem ad vissza", () => {
    const index = indexFrom([stop({ stopId: "S1", stopName: "Teljesen Más Hely", latitude: 47.1, longitude: 18.4 })]);
    const result = findStationsByName(index, "bkkgtfs", "Faluhely", 8);
    assert.equal(result.length, 0);
  });

  test("hiányzó koordinátájú stopot kihagyja, sosem dob hibát", () => {
    const index = indexFrom([stop({ stopId: "S1", stopName: "Faluhely" })]);
    const result = findStationsByName(index, "bkkgtfs", "Faluhely", 8);
    assert.equal(result.length, 0);
  });

  test("station-szintű dedup: parent_station alatti több platform egy candidate-re csökken, a station-szintű (locationType=1) rekord a reprezentáns", () => {
    const index = indexFrom([
      stop({ stopId: "PLATFORM_A", parentStation: "STATION_X", stopName: "Faluhely", latitude: 47.1001, longitude: 18.4, locationType: 0 }),
      stop({ stopId: "PLATFORM_B", parentStation: "STATION_X", stopName: "Faluhely", latitude: 47.1002, longitude: 18.4, locationType: 0 }),
      stop({ stopId: "STATION_X", stopName: "Faluhely", latitude: 47.1, longitude: 18.4, locationType: 1 }),
    ]);
    const result = findStationsByName(index, "mavgtfs", "Faluhely", 8);
    assert.equal(result.length, 1, "PLATFORM_A/PLATFORM_B/STATION_X mind a STATION_X klaszterbe (parent_station fallback stopId) tartozik");
    assert.equal(result[0].stopId, "STATION_X", "a station-szintű (locationType=1) rekordnak kell reprezentánsnak lennie a bare platformokkal szemben");
  });

  test("dedup nélkül eltérő parent_station -> külön klaszter, külön candidate", () => {
    const index = indexFrom([
      stop({ stopId: "P1", parentStation: "STATION_A", stopName: "Közös Név", latitude: 47.1, longitude: 18.4 }),
      stop({ stopId: "P2", parentStation: "STATION_B", stopName: "Közös Név", latitude: 47.2, longitude: 18.5 }),
    ]);
    const result = findStationsByName(index, "bkkgtfs", "Közös Név", 8);
    assert.equal(result.length, 2);
  });

  test("determinisztikus sorrend: nem az object insertion order dönt, hanem exact/partial rang, majd név/stopId", () => {
    const index = indexFrom([
      stop({ stopId: "Z_STOP", stopName: "Zeta Falu", latitude: 47.1, longitude: 18.4 }),
      stop({ stopId: "A_STOP", stopName: "Alfa Falu", latitude: 47.2, longitude: 18.5 }),
    ]);
    const result = findStationsByName(index, "bkkgtfs", "Falu", 8);
    assert.equal(result.length, 2);
    assert.equal(result[0].stopId, "A_STOP", "rövidebb/lexikografikusan korábbi név kerül előre determinisztikusan");
    assert.equal(result[1].stopId, "Z_STOP");
  });

  test("limit-re vágja a találatokat", () => {
    const stops = Array.from({ length: 5 }, (_, i) => stop({ stopId: `S${i}`, stopName: `Falu ${i}`, latitude: 47.1 + i * 0.01, longitude: 18.4 }));
    const index = indexFrom(stops);
    const result = findStationsByName(index, "bkkgtfs", "Falu", 3);
    assert.equal(result.length, 3);
  });

  test("üres/csak whitespace query esetén üres listát ad, sosem dob", () => {
    const index = indexFrom([stop({ stopId: "S1", stopName: "Faluhely", latitude: 47.1, longitude: 18.4 })]);
    assert.deepEqual(findStationsByName(index, "bkkgtfs", "   ", 8), []);
  });

  test("LOCATION_TYPE regresszió: egy location_type=2 (bejárat/kijárat) rekord, HIÁNYZÓ parent_station-nal (hibás/hiányos GTFS adat), NEM jelenhet meg önálló utazási célként egy valódi állomás mellett", () => {
    // Ez a GTFS spec szerint hibás bemenet (a location_type=2 sornak
    // KÖTELEZŐ lenne parent_station-t hordoznia), de a parser (lásd
    // accessibilityIndex.ts buildAccessibilityIndexFromGtfsZip()) ezt nem
    // kényszeríti ki -- egy ilyen hiányos feed-sor simán bekerül a
    // stopsById-be. Cél: findStationsByName ekkor is CSAK a valódi
    // station-szintű (locationType=1) rekordot adja vissza, a bejárat/
    // kijárat rekordot SOSEM önálló, külön candidate-ként.
    const index = indexFrom([
      stop({ stopId: "STATION_X", stopName: "Deák Ferenc tér", latitude: 47.4979, longitude: 19.0546, locationType: 1 }),
      stop({ stopId: "EXIT_Y", stopName: "Deák Ferenc tér", latitude: 47.4981, longitude: 19.0549, locationType: 2 }),
    ]);
    const result = findStationsByName(index, "bkkgtfs", "Deák Ferenc tér", 8);
    assert.equal(result.length, 1, "a bejárat/kijárat rekord nem hozhat létre külön candidate-et a valódi állomás mellett");
    assert.equal(result[0].stopId, "STATION_X");
    assert.notEqual(result[0].locationType, 2, "location_type=2 rekord sosem lehet önálló utazási cél");
  });

  test("a válasz mezői a dokumentált alakot követik (stopId/name/lat/lon/dataset/parentStation/locationType)", () => {
    const index = indexFrom([
      stop({ stopId: "S1", parentStation: "PARENT1", stopName: "Faluhely", latitude: 47.1, longitude: 18.4, locationType: 0 }),
    ]);
    const result = findStationsByName(index, "volangtfs", "Faluhely", 8);
    assert.deepEqual(result[0], {
      stopId: "S1",
      name: "Faluhely",
      lat: 47.1,
      lon: 18.4,
      dataset: "volangtfs",
      parentStation: "PARENT1",
      locationType: 0,
    });
  });
});
