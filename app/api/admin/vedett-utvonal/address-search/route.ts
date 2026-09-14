// POST /api/admin/vedett-utvonal/address-search
// Mapbox Geocoding v6 autocomplete. This endpoint intentionally returns
// coordinates directly, so selecting a suggestion can bypass a second geocode.

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

  if (q.length < 3) return NextResponse.json([]);

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json([]);

  /*
   * 1. ELSŐDLEGES KERESÉS
   *
   * Először a várost is hozzáadjuk a Mapbox queryhez:
   *
   *   kőszik, Sóskút
   *
   * Ha van 4 jegyű irányítószám, azt is hozzáadjuk.
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
      `${q}, ${city ?? ""}, ${postalOrDistrict}`
        .replace(/,\s*,/g, ",")
        .replace(/,\s*$/, ""),
    );
  }

  let mapboxResponse: Response;

  try {
    mapboxResponse = await fetch(
      `${MAPBOX_GEOCODING_URL}?${params.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    return NextResponse.json([]);
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json([]);
  }

  const primaryData: unknown = await mapboxResponse
    .json()
    .catch(() => null);

  let features =
    (primaryData as { features?: MapboxGeocodingFeature[] } | null)
      ?.features ?? [];

  let suggestions =
    processMapboxGeocodingFeatures(features, q, city, postalOrDistrict, 5);

  /*
   * Ha az elsődleges, várossal szűkített keresésből már kaptunk
   * használható találatot, nincs szükség második Mapbox-hívásra.
   */
  if (suggestions.length > 0) {
    return NextResponse.json(suggestions);
  }

  /*
   * 2. FALLBACK KERESÉS
   *
   * Rövid prefixnél a Mapbox néha nem ad megfelelő találatot az ilyen
   * összetett queryre:
   *
   *   kőszik, Sóskút
   *
   * ezért ha az első körből nincs suggestion, megpróbáljuk csak:
   *
   *   kőszik
   *
   * A találatokat EZUTÁN ugyanaz a processMapboxGeocodingFeatures()
   * szűri a megadott city/postalOrDistrict alapján, tehát a település
   * szerinti ellenőrzés nem kerül megkerülésre.
   */
  const fallbackParams = new URLSearchParams();

  fallbackParams.set("q", q);
  fallbackParams.set("access_token", accessToken);
  fallbackParams.set("autocomplete", "true");
  fallbackParams.set("country", "hu");
  fallbackParams.set("language", "hu");
  fallbackParams.set("types", "street,address");
  fallbackParams.set("limit", "10");

  let fallbackResponse: Response;

  try {
    fallbackResponse = await fetch(
      `${MAPBOX_GEOCODING_URL}?${fallbackParams.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    return NextResponse.json([]);
  }

  if (!fallbackResponse.ok) {
    return NextResponse.json([]);
  }

  const fallbackData: unknown = await fallbackResponse
    .json()
    .catch(() => null);

  features =
    (fallbackData as { features?: MapboxGeocodingFeature[] } | null)
      ?.features ?? [];

  suggestions =
    processMapboxGeocodingFeatures(features, q, city, postalOrDistrict, 5);

  return NextResponse.json(suggestions);
}