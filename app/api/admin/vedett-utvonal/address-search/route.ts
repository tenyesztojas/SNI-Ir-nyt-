// POST /api/admin/vedett-utvonal/address-search
// Mapbox Geocoding v6 autocomplete. This endpoint intentionally returns
// coordinates directly, so selecting a suggestion can bypass a second geocode.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import {
  processMapboxGeocodingFeatures,
  type MapboxGeocodingFeature,
} from "@/lib/vedett-route/addressAutocompleteMapbox";

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

  if (q.length < 3) return NextResponse.json([]);

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json([]);

  const params = new URLSearchParams();
  params.set("q", city ? `${q}, ${city}` : q);
  params.set("access_token", accessToken);
  params.set("autocomplete", "true");
  params.set("country", "hu");
  params.set("language", "hu");
  params.set("types", "street,address");
  params.set("limit", "10");

  // A 4-digit postcode is useful as hard-ish query context. District text is
  // kept for local filtering/ranking rather than appended to the street prefix.
  if (postalOrDistrict && /^\d{4}$/.test(postalOrDistrict)) {
    params.set("q", `${q}, ${city ?? ""}, ${postalOrDistrict}`.replace(/,\s*,/g, ",").replace(/,\s*$/, ""));
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
