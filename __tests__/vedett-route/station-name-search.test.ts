// VÉDETT ÚTVONAL — állomás/megálló név felismerés (2026-09-24, "állomás- és
// megállónevek felismerése" sprint)
//
// A projekt meglévő mintáját követi: a tiszta logikát (stationNameSearch.ts)
// VALÓDI függvényhívással teszteljük, a route.ts-t (next/server importja
// miatt) forráskód-szintű (regex) szerződés-ellenőrzéssel — lásd
// __tests__/vedett-route/address-autocomplete.test.ts.
//
//   node --test __tests__/vedett-route/station-name-search.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STATION_SYNONYM_WORDS,
  normalizeStationQuery,
  matchGtfsStopsByQuery,
  findGtfsStationCandidates,
  mergeAddressAndStationResults,
  type StationProviderConfig,
} from "../../lib/vedett-route/stationNameSearch.ts";
import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "../../lib/vedett-route/accessibilityIndex.ts";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "address-search", "route.ts");
const routeSrc = readFileSync(ROUTE_PATH, "utf-8");

const SEARCH_FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const searchFormSrc = readFileSync(SEARCH_FORM_PATH, "utf-8");

function fixtureIndex(
  provider: AccessibilityIndex["provider"],
  stops: Array<{ id: string; name: string; lat: number; lon: number }>,
): AccessibilityIndex {
  const stopsById: Record<string, StopAccessibilityIndexEntry> = {};
  for (const s of stops) {
    stopsById[s.id] = { stopId: s.id, stopName: s.name, latitude: s.lat, longitude: s.lon };
  }
  return { provider, generation: "test-generation", builtAt: new Date().toISOString(), stopsById, tripsById: {}, pathways: [] };
}

const RAIL_PROVIDER: StationProviderConfig = { id: "MAV_RAIL", dirName: "mav_rail", candidateType: "transit_station" };
const BUS_PROVIDER: StationProviderConfig = { id: "MAV_BUS", dirName: "mav_bus", candidateType: "transit_stop" };

describe("normalizeStationQuery — magyar állomás/megálló szinonima felismerés", () => {
  test("mindegyik spec szerinti szinonima-szó felismert és eltávolított", () => {
    assert.deepEqual(
      [...STATION_SYNONYM_WORDS].sort(),
      [
        "HÉV",
        "buszpályaudvar",
        "buszállomás",
        "megálló",
        "megállóhely",
        "metró",
        "pályaudvar",
        "vasútállomás",
        "vonatállomás",
        "állomás",
      ].sort(),
    );
  });

  for (const word of STATION_SYNONYM_WORDS) {
    test(`"Martonvásár ${word}" -> mag helynév "Martonvásár", hasStationHint=true`, () => {
      const result = normalizeStationQuery(`Martonvásár ${word}`);
      assert.equal(result.coreQuery, "Martonvásár");
      assert.equal(result.hasStationHint, true);
      assert.deepEqual(result.matchedSynonyms, [word]);
    });
  }

  test("ékezet-toleráns: 'Martonvasar vasutallomas' (ékezetek nélkül) is felismeri a szinonimát", () => {
    const result = normalizeStationQuery("Martonvasar vasutallomas");
    assert.equal(result.coreQuery, "Martonvasar");
    assert.equal(result.hasStationHint, true);
  });

  test("case-toleráns: 'MARTONVÁSÁR VASÚTÁLLOMÁS' és 'martonvásár Vasútállomás' is felismeri", () => {
    assert.equal(normalizeStationQuery("MARTONVÁSÁR VASÚTÁLLOMÁS").hasStationHint, true);
    assert.equal(normalizeStationQuery("martonvásár Vasútállomás").hasStationHint, true);
    assert.equal(normalizeStationQuery("Martonvásár VasútÁllomás").coreQuery, "Martonvásár");
  });

  test("'Kossuth Lajos tér metró' -> mag helynév 'Kossuth Lajos tér'", () => {
    const result = normalizeStationQuery("Kossuth Lajos tér metró");
    assert.equal(result.coreQuery, "Kossuth Lajos tér");
    assert.equal(result.hasStationHint, true);
  });

  test("'Népliget buszpályaudvar' -> mag helynév 'Népliget' (nem 'pályaudvar'-ra vágja csak)", () => {
    const result = normalizeStationQuery("Népliget buszpályaudvar");
    assert.equal(result.coreQuery, "Népliget");
  });

  test("szinonima szó nélküli keresés (pl. 'Budapest-Kelenföld', 'Széll Kálmán tér') változatlan marad, hasStationHint=false", () => {
    const noHint1 = normalizeStationQuery("Budapest-Kelenföld");
    assert.equal(noHint1.coreQuery, "Budapest-Kelenföld");
    assert.equal(noHint1.hasStationHint, false);

    const noHint2 = normalizeStationQuery("Széll Kálmán tér");
    assert.equal(noHint2.coreQuery, "Széll Kálmán tér");
    assert.equal(noHint2.hasStationHint, false);
  });

  test("ha a szinonima eltávolítása után semmi nem maradna, az EREDETI szöveg a coreQuery (sosem üres query)", () => {
    const result = normalizeStationQuery("állomás");
    assert.equal(result.coreQuery, "állomás");
    assert.equal(result.hasStationHint, true);
  });
});

describe("matchGtfsStopsByQuery — VALÓDI GTFS stop/station találat, nem csak általános geokódolt pont", () => {
  test("egy egyértelmű helynévre a MEGFELELŐ GTFS stop rekordot adja vissza, a SAJÁT koordinátájával", () => {
    const index = fixtureIndex("MAV_RAIL", [
      { id: "OSM:1", name: "Martonvásár", lat: 47.2967, lon: 18.7864 },
      { id: "OSM:2", name: "Ráckeresztúr", lat: 47.3167, lon: 18.7833 },
    ]);
    const normalization = normalizeStationQuery("Martonvásár vasútállomás");
    const results = matchGtfsStopsByQuery(normalization, index, RAIL_PROVIDER, 8);

    assert.equal(results.length, 1);
    assert.equal(results[0].label, "Martonvásár");
    assert.equal(results[0].lat, 47.2967);
    assert.equal(results[0].lon, 18.7864);
    assert.equal(results[0].type, "transit_station");
    assert.equal(results[0].source, "gtfs");
    assert.equal(results[0].provider, "MAV_RAIL");
    assert.equal(results[0].rank, "exact");
  });

  test("a hivatalos GTFS stop_name MAGA is tartalmazhatja a 'pályaudvar' szót (pl. 'Budapest-Déli pályaudvar') — ilyenkor is megtalálja", () => {
    const index = fixtureIndex("MAV_RAIL", [{ id: "OSM:10", name: "Budapest-Déli pályaudvar", lat: 47.5019, lon: 19.0219 }]);
    const withSynonym = matchGtfsStopsByQuery(normalizeStationQuery("Déli pályaudvar"), index, RAIL_PROVIDER, 8);
    assert.equal(withSynonym.length, 1);
    assert.equal(withSynonym[0].label, "Budapest-Déli pályaudvar");
  });

  test("nincs releváns stop -> üres lista (nem talál ki/nem geokódol semmit)", () => {
    const index = fixtureIndex("MAV_RAIL", [{ id: "OSM:1", name: "Martonvásár", lat: 47.2967, lon: 18.7864 }]);
    const results = matchGtfsStopsByQuery(normalizeStationQuery("Debrecen vasútállomás"), index, RAIL_PROVIDER, 8);
    assert.equal(results.length, 0);
  });

  test("TÖBB releváns stop esetén TÖBB találat jön vissza — nem választ önkényesen egyet", () => {
    const index = fixtureIndex("MAV_RAIL", [
      { id: "OSM:1", name: "Kelenföld", lat: 47.4692, lon: 19.0392 },
      { id: "OSM:2", name: "Kelenföld alsó", lat: 47.47, lon: 19.04 },
      { id: "OSM:3", name: "Kelenföld felső", lat: 47.471, lon: 19.041 },
    ]);
    const results = matchGtfsStopsByQuery(normalizeStationQuery("Kelenföld"), index, RAIL_PROVIDER, 8);
    assert.equal(results.length, 3);
    // Az EXAKT egyezés kerül előre.
    assert.equal(results[0].label, "Kelenföld");
  });

  test("csupasz szinonima-szó (pl. 'állomás' önmagában, mag helynév < 2 karakter után) NEM ad vissza mindent — üres marad", () => {
    const index = fixtureIndex("MAV_RAIL", [
      { id: "OSM:1", name: "Martonvásár", lat: 47.2967, lon: 18.7864 },
      { id: "OSM:2", name: "Ráckeresztúr", lat: 47.3167, lon: 18.7833 },
    ]);
    // "állomás" egyedül -> coreQuery visszaesik az eredeti "állomás" szövegre
    // (lásd normalizeStationQuery fallback), ami egyik fenti stopnak sem
    // része -> nincs találat.
    const results = matchGtfsStopsByQuery(normalizeStationQuery("állomás"), index, RAIL_PROVIDER, 8);
    assert.equal(results.length, 0);
  });

  test("hiányzó lat/lon vagy stopName esetén a stop kimarad (nem ad hasznavehetetlen találatot)", () => {
    const index: AccessibilityIndex = {
      provider: "MAV_RAIL",
      generation: "test",
      builtAt: new Date().toISOString(),
      stopsById: {
        "OSM:1": { stopId: "OSM:1", stopName: "Martonvásár" }, // nincs lat/lon
        "OSM:2": { stopId: "OSM:2", latitude: 47.3, longitude: 18.7 }, // nincs név
      },
      tripsById: {},
      pathways: [],
    };
    const results = matchGtfsStopsByQuery(normalizeStationQuery("Martonvásár vasútállomás"), index, RAIL_PROVIDER, 8);
    assert.equal(results.length, 0);
  });
});

describe("findGtfsStationCandidates — több provider (mav_rail, mav_bus) összefésülése, injektált index-betöltővel", () => {
  test("a megfelelő providerhez tartozó indexet kérdezi le a dirName alapján, és a VALÓDI stop-rekordot adja", async () => {
    const requestedDirs: string[] = [];
    const loader = async (dirName: string): Promise<AccessibilityIndex | null> => {
      requestedDirs.push(dirName);
      if (dirName === "mav_rail") {
        return fixtureIndex("MAV_RAIL", [{ id: "R1", name: "Martonvásár", lat: 47.2967, lon: 18.7864 }]);
      }
      if (dirName === "mav_bus") {
        return fixtureIndex("MAV_BUS", [{ id: "B1", name: "Népliget", lat: 47.478, lon: 19.086 }]);
      }
      return null;
    };

    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", loader);
    assert.deepEqual(requestedDirs.sort(), ["mav_bus", "mav_rail"]);
    assert.equal(results.length, 1);
    assert.equal(results[0].provider, "MAV_RAIL");
    assert.equal(results[0].type, "transit_station");
    assert.equal(results[0].lat, 47.2967);
  });

  test("busz-állomás keresés ('Népliget buszpályaudvar') a mav_bus indexből ad 'transit_stop' találatot", async () => {
    const loader = async (dirName: string): Promise<AccessibilityIndex | null> => {
      if (dirName === "mav_bus") return fixtureIndex("MAV_BUS", [{ id: "B1", name: "Népliget", lat: 47.478, lon: 19.086 }]);
      return null;
    };
    const results = await findGtfsStationCandidates("Népliget buszpályaudvar", loader);
    assert.equal(results.length, 1);
    assert.equal(results[0].type, "transit_stop");
    assert.equal(results[0].provider, "MAV_BUS");
  });

  test("index-betöltő hibája (pl. nincs feltöltött GTFS) SOSEM dob — üres listára esik vissza, fail-safe", async () => {
    const loader = async (): Promise<AccessibilityIndex | null> => {
      throw new Error("nincs feltöltve");
    };
    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", loader);
    assert.deepEqual(results, []);
  });

  test("null index (nincs feltöltött GTFS egyik providerhez sem) -> üres lista, nem hiba", async () => {
    const results = await findGtfsStationCandidates("Martonvásár vasútállomás", async () => null);
    assert.deepEqual(results, []);
  });
});

describe("mergeAddressAndStationResults — cím/POI + állomás/megálló egyesítés, típus-címkézve", () => {
  test("üres állomás-találat esetén a MEGLÉVŐ cím/POI eredmények VÁLTOZATLANOK maradnak (nincs regresszió)", () => {
    const addressResults = [
      { id: "a1", label: "Szabadság út, Budaörs", lat: 47.46, lon: 18.95 },
      { id: "a2", label: "Fő tér, Budaörs", lat: 47.47, lon: 18.96 },
    ];
    const merged = mergeAddressAndStationResults(addressResults, []);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].label, "Szabadság út, Budaörs");
    assert.equal(merged[0].type, "address");
    assert.equal(merged[0].source, "mapbox");
    assert.equal(merged[0].lat, 47.46);
    assert.equal(merged[1].label, "Fő tér, Budaörs");
  });

  test("állomás-találatok ELŐRE kerülnek, típus/forrás-címkével, a cím/POI találatok NEM tűnnek el", () => {
    const addressResults = [{ id: "a1", label: "Martonvásár, valami utca", lat: 47.29, lon: 18.78 }];
    const stationCandidates = [
      {
        type: "transit_station" as const,
        source: "gtfs" as const,
        provider: "MAV_RAIL" as const,
        id: "R1",
        label: "Martonvásár",
        lat: 47.2967,
        lon: 18.7864,
        rank: "exact" as const,
      },
    ];
    const merged = mergeAddressAndStationResults(addressResults, stationCandidates);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].type, "transit_station");
    assert.equal(merged[0].source, "gtfs");
    assert.equal(merged[0].label, "Martonvásár");
    assert.equal(merged[1].type, "address");
  });
});

describe("origin ÉS destination mező kompatibilitás (VedettUtvonalSearchForm.tsx)", () => {
  test("selectOriginSuggestion ÉS selectDestinationSuggestion UGYANAZT a lat/lon-alapú mechanizmust használja — egy GTFS találat (közvetlen lat/lon) mindkét mezőn retrieve-hívás NÉLKÜL azonnal MAP_PICKED-re vált", () => {
    const originMatches = searchFormSrc.match(/async function selectOriginSuggestion\([\s\S]*?\n  \}/);
    const destinationMatches = searchFormSrc.match(/async function selectDestinationSuggestion\([\s\S]*?\n  \}/);
    assert.ok(originMatches, "selectOriginSuggestion nem található");
    assert.ok(destinationMatches, "selectDestinationSuggestion nem található");

    for (const fn of [originMatches![0], destinationMatches![0]]) {
      // A GTFS állomás/megálló találat MÁR tartalmaz konkrét lat/lon-t
      // (lásd mergeAddressAndStationResults) — ez az ág retrieve() hívás
      // NÉLKÜL azonnal a MAP_PICKED (EXACT koordináta) módra vált, PONTOSAN
      // úgy, mint egy Mapbox retrieve-elt cím esetén — közös mechanizmus,
      // nincs külön "állomás-választó" kód.
      assert.match(fn, /typeof s\.lat === "number" && typeof s\.lon === "number"/);
      assert.match(fn, /type: "MAP_PICKED"/);
    }
  });
});

describe("regresszió: az address-search route.ts MEGLÉVŐ cím/POI szerződése változatlan", () => {
  test("a három sikeres cím/POI ág MOST MÁR összefésüli az állomás-találatokat, a MEGLÉVŐ Mapbox hívások/paraméterek változatlanok", () => {
    // Ugyanazok a KRITIKUS, MEGLÉVŐ mintázatok, mint az
    // address-autocomplete.test.ts-ben — bizonyítja, hogy az integráció
    // NEM módosította a Mapbox-hívás felépítését.
    assert.match(routeSrc, /https:\/\/api\.mapbox\.com\/search\/searchbox\/v1\/suggest/);
    assert.match(routeSrc, /https:\/\/api\.mapbox\.com\/search\/geocode\/v6\/forward/);
    assert.match(routeSrc, /if \(q\.length < 3\) return NextResponse\.json\(\[\]\);/);
    assert.match(routeSrc, /if \(!accessToken\) return NextResponse\.json\(\[\]\);/);
    assert.match(
      routeSrc,
      /processMapboxSearchBoxSuggestions\(\s*rawSuggestions,\s*q,\s*city,\s*postalOrDistrict,\s*5,?\s*\)/,
    );
    assert.match(routeSrc, /processMapboxGeocodingFeatures\(features, q, city, postalOrDistrict, 5\)/);
  });

  test("a végpont a MEGLÉVŐ getAccessibilityIndex()-et (staticFileProvider.ts) hívja — NEM épít második GTFS-tárolót", () => {
    assert.match(routeSrc, /import \{ getAccessibilityIndex \} from "@\/lib\/vedett-route\/providers\/staticFileProvider"/);
    assert.match(routeSrc, /findGtfsStationCandidates\(q, getAccessibilityIndex\)/);
  });

  test("MIND a három sikeres cím/POI válaszág át van vezetve a mergeAddressAndStationResults()-on", () => {
    assert.match(routeSrc, /mergeAddressAndStationResults\(structuredSuggestions, stationCandidates\)/);
    assert.match(routeSrc, /mergeAddressAndStationResults\(suggestions, stationCandidates\)/);
    assert.match(
      routeSrc,
      /mergeAddressAndStationResults\(processMapboxGeocodingFeatures\(features, q, city, postalOrDistrict, 5\), stationCandidates\)/,
    );
  });
});
