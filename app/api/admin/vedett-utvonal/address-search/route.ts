// POST /api/admin/vedett-utvonal/address-search
// Mapbox Search Box /suggest first for interactive autocomplete.
// Geocoding v6 remains as a fail-safe fallback.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import {
  parseStreetAndHouseNumber,
  processMapboxGeocodingFeatures,
  processMapboxSearchBoxSuggestions,
  processStructuredAddressFeatures,
  type MapboxGeocodingFeature,
  type MapboxSearchBoxSuggestion,
} from "@/lib/vedett-route/addressAutocompleteMapbox";
import { findGtfsStationCandidates, mergeAddressAndStationResults } from "@/lib/vedett-route/stationNameSearch";
import { getAccessibilityIndex } from "@/lib/vedett-route/providers/staticFileProvider";

const MAPBOX_SEARCHBOX_SUGGEST_URL = "https://api.mapbox.com/search/searchbox/v1/suggest";
const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6/forward";

function optionalStringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const q = (optionalStringField(body, "q") ?? "").trim();
  const city = optionalStringField(body, "city")?.trim();
  const postalOrDistrict = optionalStringField(body, "postalOrDistrict")?.trim();
  const sessionToken = optionalStringField(body, "sessionToken")?.trim();

  if (q.length < 3) return NextResponse.json([]);

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json([]);

  // ÁLLOMÁS/MEGÁLLÓ NÉV FELISMERÉS (2026-09-24, "állomás- és megállónevek
  // felismerése" sprint) — a MEGLÉVŐ, admin GTFS feltöltésből épülő,
  // helyi accessibility-index cache-t (staticFileProvider.ts
  // getAccessibilityIndex(), lásd stationNameSearch.ts fejléce) használjuk
  // GTFS stop/station NÉV-keresésre. Ez FÜGGETLEN a Mapbox hívásoktól
  // (nincs hálózati kérés, csak helyi fájl-olvasás), ezért a lenti THREE
  // sikeres-találat ágon (strukturált cím / Search Box / Geocoding v6
  // fallback) EGYSÉGESEN összefésüljük a cím/POI találatokkal — SOSEM
  // dob hibát, hiányzó feltöltés esetén egyszerűen üres tömböt ad.
  const stationCandidates = await findGtfsStationCandidates(q, getAccessibilityIndex);

  /*
   * 0) HÁZSZÁMOS CÍM — Geocoding v6 Structured Input
   *
   * Ha a felhasználó egyértelmű házszámot írt a mező végére, nem kezeljük
   * egyszerű street-prefixként. A Mapbox v6 külön address_number/street/place
   * mezőket kap, autocomplete=false beállítással. Ez pontosabb és nem engedi,
   * hogy egy korábban kiválasztott utcaszintű találat elnyelje a házszámot.
   */
  const parsedAddress = parseStreetAndHouseNumber(q);
  if (parsedAddress) {
    const structuredParams = new URLSearchParams();
    structuredParams.set("address_number", parsedAddress.addressNumber);
    structuredParams.set("street", parsedAddress.street);
    if (city) structuredParams.set("place", city);
    if (postalOrDistrict && /^\d{4}$/.test(postalOrDistrict)) {
      structuredParams.set("postcode", postalOrDistrict);
    }
    structuredParams.set("country", "hu");
    structuredParams.set("language", "hu");
    structuredParams.set("autocomplete", "false");
    structuredParams.set("access_token", accessToken);

    try {
      const structuredResponse = await fetch(
        `${MAPBOX_GEOCODING_URL}?${structuredParams.toString()}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (structuredResponse.ok) {
        const structuredData: unknown = await structuredResponse.json().catch(() => null);
        const structuredFeatures =
          (structuredData as { features?: MapboxGeocodingFeature[] } | null)?.features ?? [];
        const structuredSuggestions = processStructuredAddressFeatures(
          structuredFeatures,
          parsedAddress.street,
          parsedAddress.addressNumber,
          city,
          postalOrDistrict,
          5,
        );
        if (structuredSuggestions.length > 0) {
          return NextResponse.json(mergeAddressAndStationResults(structuredSuggestions, stationCandidates));
        }
      }
    } catch {
      // Fail-safe: az interaktív Search Box + normál Geocoding fallback lent
      // továbbra is lefut, tehát a címmező hálózati hibánál sem blokkolódik.
    }
  }

  /*
   * 1) Search Box /suggest
   *
   * FONTOS:
   * - q kizárólag az utca/hely begépelt prefixe.
   * - a kiválasztott település NEM kerül bele a q szövegébe.
   * - a települést a Search Box `near` paramétere adja át mint rangsorolási
   *   kontextust.
   * - a válaszokat ezután strukturált context.place/context.locality alapján
   *   PONTOS településegyezéssel szűrjük.
   *
   * Így például:
   *   city=Budaörs, q=sza
   * nem változik "sza, Budaörs" kereséssé, ami korábban Budaörsi út jellegű
   * fals találatokat hozott.
   */
  if (sessionToken) {
    const searchParams = new URLSearchParams();
    searchParams.set("q", q);
    searchParams.set("access_token", accessToken);
    searchParams.set("session_token", sessionToken);
    searchParams.set("language", "hu");
    searchParams.set("country", "hu");
    searchParams.set("types", "street,address");
    searchParams.set("limit", "10");

    if (city) {
      searchParams.set("near", city);
    }

    let searchBoxResponse: Response | null = null;
    try {
      searchBoxResponse = await fetch(`${MAPBOX_SEARCHBOX_SUGGEST_URL}?${searchParams.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      searchBoxResponse = null;
    }

    if (searchBoxResponse?.ok) {
      const searchBoxData: unknown = await searchBoxResponse.json().catch(() => null);
      const rawSuggestions =
        (searchBoxData as { suggestions?: MapboxSearchBoxSuggestion[] } | null)?.suggestions ?? [];

      const suggestions = processMapboxSearchBoxSuggestions(
        rawSuggestions,
        q,
        city,
        postalOrDistrict,
        5,
      );

      if (suggestions.length > 0) {
        return NextResponse.json(mergeAddressAndStationResults(suggestions, stationCandidates));
      }
    }
  }

  /*
   * 2) Geocoding v6 fallback
   *
   * A fallback továbbra is a korábban működő queryt használja. A
   * processMapboxGeocodingFeatures() itt is:
   * - prefixet ellenőriz,
   * - strukturált település-context alapján pontosan szűr,
   * - 4 jegyű irányítószám esetén hard filtert alkalmaz.
   */
  const params = new URLSearchParams();
  params.set("q", city ? `${q}, ${city}` : q);
  params.set("access_token", accessToken);
  params.set("autocomplete", "true");
  params.set("country", "hu");
  params.set("language", "hu");
  params.set("types", "street,address");
  params.set("limit", "10");

  if (postalOrDistrict && /^\d{4}$/.test(postalOrDistrict)) {
    params.set(
      "q",
      `${q}, ${city ?? ""}, ${postalOrDistrict}`.replace(/,\s*,/g, ",").replace(/,\s*$/, ""),
    );
  }

  let mapboxResponse: Response;
  try {
    mapboxResponse = await fetch(`${MAPBOX_GEOCODING_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return NextResponse.json([]);
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json([]);
  }

  const data: unknown = await mapboxResponse.json().catch(() => null);
  const features = (data as { features?: MapboxGeocodingFeature[] } | null)?.features ?? [];

  return NextResponse.json(
    mergeAddressAndStationResults(processMapboxGeocodingFeatures(features, q, city, postalOrDistrict, 5), stationCandidates),
  );
}
