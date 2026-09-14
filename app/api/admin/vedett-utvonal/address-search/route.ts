// POST /api/admin/vedett-utvonal/address-search
// Mapbox Search Box /suggest first for interactive autocomplete.
// Mapbox Geocoding v6 remains as a fail-safe fallback.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import {
  processMapboxGeocodingFeatures,
  type MapboxGeocodingFeature,
} from "@/lib/vedett-route/addressAutocompleteMapbox";

const MAPBOX_SEARCHBOX_SUGGEST_URL = "https://api.mapbox.com/search/searchbox/v1/suggest";
const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6/forward";

type SearchBoxContextItem = {
  id?: string;
  name?: string;
};

type SearchBoxSuggestion = {
  name?: string;
  name_preferred?: string;
  mapbox_id?: string;
  feature_type?: string;
  address?: string;
  full_address?: string;
  place_formatted?: string;
  context?: {
    country?: SearchBoxContextItem & { country_code?: string };
    region?: SearchBoxContextItem;
    postcode?: SearchBoxContextItem;
    district?: SearchBoxContextItem;
    place?: SearchBoxContextItem;
    locality?: SearchBoxContextItem;
    neighborhood?: SearchBoxContextItem;
    street?: SearchBoxContextItem;
  };
};

type AddressSuggestion = {
  id: string;
  label: string;
  name: string;
  city?: string;
  postcode?: string;
};

function optionalStringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("hu-HU")
    .trim();
}

function getSuggestionCity(suggestion: SearchBoxSuggestion): string | undefined {
  return suggestion.context?.place?.name ?? suggestion.context?.locality?.name;
}

function getSuggestionPostcode(suggestion: SearchBoxSuggestion): string | undefined {
  return suggestion.context?.postcode?.name;
}

function buildSuggestionLabel(suggestion: SearchBoxSuggestion): string {
  if (suggestion.full_address?.trim()) return suggestion.full_address.trim();

  const name =
    suggestion.name_preferred?.trim() ||
    suggestion.name?.trim() ||
    suggestion.address?.trim() ||
    "";
  const placeFormatted = suggestion.place_formatted?.trim() ?? "";

  if (name && placeFormatted) return `${name}, ${placeFormatted}`;
  return name || placeFormatted;
}

function processSearchBoxSuggestions(
  rawSuggestions: SearchBoxSuggestion[],
  city?: string,
  postalOrDistrict?: string,
  limit = 5,
): AddressSuggestion[] {
  const normalizedCity = normalize(city);
  const normalizedPostcode =
    postalOrDistrict && /^\d{4}$/.test(postalOrDistrict.trim())
      ? postalOrDistrict.trim()
      : undefined;

  const results: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (const suggestion of rawSuggestions) {
    if (results.length >= limit) break;

    if (suggestion.feature_type !== "street" && suggestion.feature_type !== "address") {
      continue;
    }
    if (!suggestion.mapbox_id) continue;

    const suggestionCity = getSuggestionCity(suggestion);

    if (normalizedCity) {
      const contextCandidates = [
        suggestion.context?.place?.name,
        suggestion.context?.locality?.name,
        suggestion.place_formatted,
        suggestion.full_address,
      ]
        .filter((value): value is string => typeof value === "string")
        .map(normalize);

      if (!contextCandidates.some((value) => value.includes(normalizedCity))) {
        continue;
      }
    }

    if (normalizedPostcode) {
      const postcode = getSuggestionPostcode(suggestion);
      if (postcode !== normalizedPostcode) continue;
    }

    const label = buildSuggestionLabel(suggestion);
    const name =
      suggestion.name_preferred?.trim() ||
      suggestion.name?.trim() ||
      suggestion.address?.trim() ||
      label;

    if (!label || !name) continue;

    const dedupeKey = normalize(`${suggestion.mapbox_id}|${label}`);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      id: suggestion.mapbox_id,
      label,
      name,
      city: suggestionCity,
      postcode: getSuggestionPostcode(suggestion),
    });
  }

  return results;
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

  // 1) Search Box /suggest: true type-ahead autocomplete.
  // Keep the city in the query text so generic Hungarian street prefixes are
  // biased toward the explicitly selected settlement without relying on IP proximity.
  if (sessionToken) {
    const searchParams = new URLSearchParams();
    searchParams.set("q", city ? `${q}, ${city}` : q);
    searchParams.set("access_token", accessToken);
    searchParams.set("session_token", sessionToken);
    searchParams.set("language", "hu");
    searchParams.set("country", "hu");
    searchParams.set("types", "street,address");
    searchParams.set("limit", "10");

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
        (searchBoxData as { suggestions?: SearchBoxSuggestion[] } | null)?.suggestions ?? [];
      const suggestions = processSearchBoxSuggestions(
        rawSuggestions,
        city,
        postalOrDistrict,
        5,
      );

      if (suggestions.length > 0) return NextResponse.json(suggestions);
    }
  }

  // 2) Geocoding v6 fallback: preserves the already-working fail-safe path.
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
  return NextResponse.json(processMapboxGeocodingFeatures(features, q, city, postalOrDistrict, 5));
}
