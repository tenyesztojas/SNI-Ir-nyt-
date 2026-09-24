// VÉDETT ÚTVONAL — állomás/megálló név felismerés a SUBMIT-PATH-on
// (2026-09-24, "Martonvásár + vasútállomás split mezős submit" production
// hiba javítása)
//
// ROOT CAUSE: a korábbi (2026-09-24, autocomplete) sprint a GTFS
// állomás-keresést kizárólag a /api/admin/vedett-utvonal/address-search
// (autocomplete/suggest) végpontra kötötte be. A TÉNYLEGES routing-submit
// ("Útvonal keresése" gomb) egy MÁSIK végpontot
// (/api/admin/vedett-utvonal/search) és egy MÁSIK feloldási ágat hív: ha a
// user nem választott autocomplete-javaslatot, a kliens a Város+Cím-vagy-
// hely mezőket egy vesszővel elválasztott string-gé fűzi össze (lásd
// searchRequestBuilder.ts buildStructuredAddressString(), pl. "Martonvásár,
// vasútállomás") és ezt KÖZVETLENÜL a Nominatim-alapú geocodeAddress()-nek
// adta — ami nem ismeri a GTFS stop-adatot, ezért "address_not_found"-ra
// futott. Ez a teszt PONTOSAN ezt a rétegett fedi le — a route.ts által
// TÉNYLEGESEN hívott resolveManualFieldOrStation() függvényt, valódi
// függvényhívással, next/server és éles Nominatim-hívás nélkül (injektált
// loader + injektált geocode-fallback).
//
// A route.ts-t (next/server importja miatt) a projekt meglévő mintáját
// követve forráskód-szintű (regex) szerződés-ellenőrzéssel fedjük le — lásd
// __tests__/vedett-route/address-autocomplete.test.ts és
// station-name-search.test.ts.
//
//   node --test __tests__/vedett-route/station-name-search-submit.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveManualFieldOrStation,
  type ManualFieldGeocodeResult,
  type ManualFieldAmbiguousResult,
} from "../../lib/vedett-route/stationNameSearch.ts";
import { buildStructuredAddressString } from "../../lib/vedett-route/searchRequestBuilder.ts";
import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "../../lib/vedett-route/accessibilityIndex.ts";

const ROUTE_PATH = join(import.meta.dirname, "..", "..", "app", "api", "admin", "vedett-utvonal", "search", "route.ts");
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

function martonvasarLoader(dirName: string): Promise<AccessibilityIndex | null> {
  if (dirName === "mav_rail") {
    return Promise.resolve(fixtureIndex("MAV_RAIL", [{ id: "R1", name: "Martonvásár", lat: 47.2967, lon: 18.7864 }]));
  }
  return Promise.resolve(null);
}

function neverCalledGeocode(): (query: string) => Promise<ManualFieldGeocodeResult | ManualFieldAmbiguousResult | null> {
  return async (query: string) => {
    throw new Error(`geocodeFallback SOSEM hívódhat itt (kapott query: "${query}") — ez a production hiba pontos oka volna`);
  };
}

describe("resolveManualFieldOrStation — a PONTOS production repro: split city+place mezők, NINCS autocomplete-választás, submit", () => {
  test('city="Martonvásár" + place="vasútállomás" -> buildStructuredAddressString "Martonvásár, vasútállomás" -> VALÓS GTFS EXACT találat, geocodeFallback SOSEM hívódik', async () => {
    const combined = buildStructuredAddressString({ city: "Martonvásár", districtOrPostalCode: "", street: "vasútállomás" });
    assert.equal(combined, "Martonvásár, vasútállomás");

    const result = await resolveManualFieldOrStation(combined, martonvasarLoader, neverCalledGeocode());
    assert.ok(result, "a resolveManualFieldOrStation nem adhat null-t egy valódi GTFS állomásra");
    assert.equal((result as ManualFieldGeocodeResult).quality, "EXACT");
    assert.equal((result as ManualFieldGeocodeResult).name, "Martonvásár");
    assert.equal((result as ManualFieldGeocodeResult).lat, 47.2967);
    assert.equal((result as ManualFieldGeocodeResult).lon, 18.7864);
    // NEM "address_not_found" — a hívó (route.ts) ebből épít sikeres routing-kérést.
    assert.notEqual(result, null);
  });

  test('city="Martonvásár" + place="vonatállomás" -> ugyanaz a VALÓS GTFS EXACT találat', async () => {
    const combined = buildStructuredAddressString({ city: "Martonvásár", districtOrPostalCode: "", street: "vonatállomás" });
    const result = (await resolveManualFieldOrStation(combined, martonvasarLoader, neverCalledGeocode())) as ManualFieldGeocodeResult;
    assert.equal(result.quality, "EXACT");
    assert.equal(result.name, "Martonvásár");
  });

  test('city="Martonvásár" + place="állomás" -> ugyanaz a VALÓS GTFS EXACT találat', async () => {
    const combined = buildStructuredAddressString({ city: "Martonvásár", districtOrPostalCode: "", street: "állomás" });
    const result = (await resolveManualFieldOrStation(combined, martonvasarLoader, neverCalledGeocode())) as ManualFieldGeocodeResult;
    assert.equal(result.quality, "EXACT");
    assert.equal(result.name, "Martonvásár");
  });

  test('EGYMEZŐS "Martonvásár vasútállomás" (nincs külön Város mező kitöltve, city marad "Budapest" default) -> a "Budapest" prefix ELLENÉRE megtalálja a VALÓS Martonvásár GTFS találatot', async () => {
    // Ez a "Cím vagy hely" mezőbe gépelt, EGYETLEN mezős eset — a Város
    // mező a komponens defaultja szerint "Budapest" marad kitöltve, lásd
    // VedettUtvonalSearchForm.tsx updateDestinationManualField() default
    // { city: "Budapest", ... }. A submit ekkor "Budapest, Martonvásár
    // vasútállomás"-t küld — a station-illesztésnek EZT is fel kell
    // oldania, nem csak a tisztán 2-szavas esetet.
    const combined = buildStructuredAddressString({ city: "Budapest", districtOrPostalCode: "", street: "Martonvásár vasútállomás" });
    assert.equal(combined, "Budapest, Martonvásár vasútállomás");
    const result = (await resolveManualFieldOrStation(combined, martonvasarLoader, neverCalledGeocode())) as ManualFieldGeocodeResult;
    assert.equal(result.quality, "EXACT");
    assert.equal(result.name, "Martonvásár");
  });

  test("nincs GTFS találat esetén a MEGLÉVŐ geocodeFallback fut (a normál cím-keresés NEM sérül)", async () => {
    let fallbackCalledWith: string | null = null;
    const fallback = async (query: string): Promise<ManualFieldGeocodeResult | null> => {
      fallbackCalledWith = query;
      return { name: "Szabadság út 5, Budaörs", lat: 47.46, lon: 18.95, quality: "EXACT" };
    };
    const result = await resolveManualFieldOrStation("Szabadság út 5, Budaörs", async () => null, fallback);
    assert.equal(fallbackCalledWith, "Szabadság út 5, Budaörs");
    assert.equal((result as ManualFieldGeocodeResult).name, "Szabadság út 5, Budaörs");
  });

  test("szinonima NÉLKÜLI (hasStationHint=false) lekérdezés SOSEM futtatja a GTFS-illesztést — egyenesen a geocodeFallback-ra megy (regresszió: sima cím-keresés viselkedése garantáltan változatlan)", async () => {
    let fallbackCallCount = 0;
    const fallback = async (): Promise<ManualFieldGeocodeResult | null> => {
      fallbackCallCount++;
      return { name: "Budapest-Kelenföld", lat: 47.4692, lon: 19.0392, quality: "EXACT" };
    };
    // Ugyanaz a fixtureIndex EGYÉBKÉNT tartalmazna egy "Martonvásár" stopot,
    // de itt egy TELJESEN MÁS, szinonima nélküli szöveget adunk — a
    // loadIndex-nek SOSEM kellene meghívódnia.
    let loaderCalled = false;
    const trackedLoader = async (dirName: string) => {
      loaderCalled = true;
      return martonvasarLoader(dirName);
    };
    await resolveManualFieldOrStation("Budapest-Kelenföld", trackedLoader, fallback);
    assert.equal(loaderCalled, false, "szinonima nélküli query esetén a GTFS-index betöltése SOSEM indulhat el");
    assert.equal(fallbackCallCount, 1);
  });

  test("TÖBB releváns GTFS találat esetén 'ambiguous' eredmény jön — NEM választ önkényesen egyet, a geocodeFallback SOSEM hívódik", async () => {
    const multiLoader = async (dirName: string): Promise<AccessibilityIndex | null> => {
      if (dirName === "mav_rail") {
        return fixtureIndex("MAV_RAIL", [
          { id: "R1", name: "Kelenföld", lat: 47.4692, lon: 19.0392 },
          { id: "R2", name: "Kelenföld alsó", lat: 47.47, lon: 19.04 },
        ]);
      }
      return null;
    };
    const result = (await resolveManualFieldOrStation("Kelenföld vasútállomás", multiLoader, neverCalledGeocode())) as ManualFieldAmbiguousResult;
    assert.equal((result as { ambiguous?: true }).ambiguous, true);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every((c) => typeof c.lat === "number" && typeof c.lon === "number"));
  });

  test("busz-állomás (mav_bus) split mezős submit is feloldódik: city='Népliget' + place='buszpályaudvar'", async () => {
    const busLoader = async (dirName: string): Promise<AccessibilityIndex | null> => {
      if (dirName === "mav_bus") return fixtureIndex("MAV_BUS", [{ id: "B1", name: "Népliget", lat: 47.478, lon: 19.086 }]);
      return null;
    };
    const combined = buildStructuredAddressString({ city: "Népliget", districtOrPostalCode: "", street: "buszpályaudvar" });
    const result = (await resolveManualFieldOrStation(combined, busLoader, neverCalledGeocode())) as ManualFieldGeocodeResult;
    assert.equal(result.quality, "EXACT");
    assert.equal(result.name, "Népliget");
  });
});

describe("regresszió: az /api/admin/vedett-utvonal/search route.ts a MEGLÉVŐ resolveManualFieldOrStation()-t hívja, origin ÉS destination oldalon szimmetrikusan", () => {
  test("a route.ts a stationNameSearch.ts MEGLÉVŐ resolveManualFieldOrStation()-jét importálja — NEM ír második, submit-specifikus GTFS-lookupot", () => {
    assert.match(routeSrc, /import \{ resolveManualFieldOrStation \} from "@\/lib\/vedett-route\/stationNameSearch"/);
    assert.match(routeSrc, /import \{ getAccessibilityIndex \} from "@\/lib\/vedett-route\/providers\/staticFileProvider"/);
    assert.doesNotMatch(routeSrc, /findGtfsStationCandidates/, "a route.ts NE hívja közvetlenül a findGtfsStationCandidates-t — a resolveManualFieldOrStation-on keresztül megy");
  });

  test("MIND a from, MIND a to MANUAL ág UGYANAZT a resolveManualFieldOrStation()-t hívja (nincs Martonvásár-/útvonal-specifikus külön logika)", () => {
    assert.match(routeSrc, /resolveManualFieldOrStation\(from as string, getAccessibilityIndex, geocodeAddress\)/);
    assert.match(routeSrc, /resolveManualFieldOrStation\(to as string, getAccessibilityIndex, geocodeAddress\)/);
    assert.doesNotMatch(routeSrc, /Martonvásár/i);
  });

  test("a MEGLÉVŐ address_ambiguous/address_not_found válaszágak (isAmbiguousGeocodeResult, address_not_found) VÁLTOZATLANOK — a station-felbontás ugyanazt a szerződést adja vissza", () => {
    assert.match(routeSrc, /if \(isAmbiguousGeocodeResult\(fromGeo\)\)/);
    assert.match(routeSrc, /if \(isAmbiguousGeocodeResult\(toGeo\)\)/);
    assert.match(routeSrc, /reason: "address_not_found"/);
  });

  test("a fromCoordinates/toCoordinates (autocomplete-retrieve VAGY GPS/térkép) MEGLÉVŐ EXACT-koordináta ág VÁLTOZATLAN — csak a MANUAL string-ág bővült", () => {
    assert.match(routeSrc, /fromCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: fromName \?\? "Jelenlegi hely"/);
    assert.match(routeSrc, /toCoordinates\s*\n\s*\? Promise\.resolve\(\{ name: toName \?\? "Kiválasztott cél"/);
  });
});

describe("regresszió: a kliens (VedettUtvonalSearchForm.tsx) split-mezős MANUAL submit-je változatlanul a Város+Cím-vagy-hely mezőket fűzi össze — a fix a szerver oldalon, nem a kliensen történt", () => {
  test("isManualAddressComplete csak a Cím-vagy-hely (street) mezőt követeli meg — a production repro (kitöltött Város, ÜRES kerület/irányítószám) NEM akad el a kliens-oldali validáción", () => {
    assert.match(searchFormSrc, /function isManualAddressComplete\(addr: \{ city: string; districtOrPostalCode: string; street: string \}\): boolean \{\s*return Boolean\(addr\.street\.trim\(\)\);\s*\}/);
  });

  test("a handleSubmit MANUAL destination esetén a searchRequestBuilder.ts buildSearchRequestDestinationFields()-én keresztül `to: string`-et küld — ez pontosan a resolveManualFieldOrStation() bemenete", () => {
    assert.match(searchFormSrc, /const destinationFields = buildSearchRequestDestinationFields\(destination\);/);
  });
});
