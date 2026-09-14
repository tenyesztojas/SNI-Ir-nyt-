// POST /api/admin/vedett-utvonal/address-search
// TEMPORARY DIAGNOSTIC VERSION.
// IMPORTANT: never exposes MAPBOX_ACCESS_TOKEN itself.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import {
  processMapboxGeocodingFeatures,
  type MapboxGeocodingFeature,
} from "@/lib/vedett-route/addressAutocompleteMapbox";

const MAPBOX_GEOCODING_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";

function optionalStringField(
  body: unknown,
  field: string,
): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);

  const q = (optionalStringField(body, "q") ?? "").trim();
  const city = optionalStringField(body, "city")?.trim();
  const postalOrDistrict =
    optionalStringField(body, "postalOrDistrict")?.trim();

  if (q.length < 3) {
    return NextResponse.json({
      diagnostic: true,
      stage: "validation",
      reason: "query_too_short",
      queryLength: q.length,
      suggestions: [],
    });
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json({
      diagnostic: true,
      stage: "configuration",
      reason: "missing_mapbox_access_token",
      tokenPresent: false,
      suggestions: [],
    });
  }

  const params = new URLSearchParams();

  params.set("q", city ? `${q}, ${city}` : q);
  params.set("access_token", accessToken);
  params.set("autocomplete", "true");
  params.set("country", "hu");
  params.set("language", "hu");
  params.set("types", "street,address");
  params.set("limit", "10");

  if (
    postalOrDistrict &&
    /^\d{4}$/.test(postalOrDistrict)
  ) {
    params.set(
      "q",
      `${q}, ${city ?? ""}, ${postalOrDistrict}`
        .replace(/,\s*,/g, ",")
        .replace(/,\s*$/, ""),
    );
  }

  const safeQuery = {
    q: params.get("q"),
    autocomplete: params.get("autocomplete"),
    country: params.get("country"),
    language: params.get("language"),
    types: params.get("types"),
    limit: params.get("limit"),
  };

  let mapboxResponse: Response;

  try {
    mapboxResponse = await fetch(
      `${MAPBOX_GEOCODING_URL}?${params.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch (error) {
    return NextResponse.json({
      diagnostic: true,
      stage: "mapbox_fetch",
      reason: "fetch_failed",
      tokenPresent: true,
      query: safeQuery,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      suggestions: [],
    });
  }

  if (!mapboxResponse.ok) {
    const errorBody = await mapboxResponse
      .text()
      .catch(() => "");

    return NextResponse.json({
      diagnostic: true,
      stage: "mapbox_response",
      reason: "mapbox_http_error",
      tokenPresent: true,
      mapboxStatus: mapboxResponse.status,
      mapboxStatusText: mapboxResponse.statusText,
      query: safeQuery,
      mapboxErrorBody: errorBody.slice(0, 1000),
      suggestions: [],
    });
  }

  const data: unknown = await mapboxResponse
    .json()
    .catch(() => null);

  if (!data) {
    return NextResponse.json({
      diagnostic: true,
      stage: "mapbox_parse",
      reason: "invalid_json",
      tokenPresent: true,
      mapboxStatus: mapboxResponse.status,
      query: safeQuery,
      suggestions: [],
    });
  }

  const features =
    (
      data as {
        features?: MapboxGeocodingFeature[];
      } | null
    )?.features ?? [];

  const suggestions =
    processMapboxGeocodingFeatures(
      features,
      q,
      city,
      postalOrDistrict,
      5,
    );

  return NextResponse.json({
    diagnostic: true,
    stage: "complete",
    reason:
      suggestions.length > 0
        ? "suggestions_found"
        : features.length > 0
          ? "features_filtered_out"
          : "mapbox_returned_zero_features",
    tokenPresent: true,
    mapboxStatus: mapboxResponse.status,
    query: safeQuery,
    rawFeatureCount: features.length,
    filteredSuggestionCount: suggestions.length,
    rawFeatures: features.slice(0, 5).map((feature) => {
      const f = feature as unknown as Record<string, unknown>;

      return {
        type: f.type,
        id: f.id,
        name: f.name,
        name_preferred: f.name_preferred,
        place_name: f.place_name,
        full_address: f.full_address,
        feature_type: f.feature_type,
        properties: f.properties,
      };
    }),
    suggestions,
  });
}