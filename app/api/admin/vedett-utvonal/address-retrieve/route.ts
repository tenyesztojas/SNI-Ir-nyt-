// POST /api/admin/vedett-utvonal/address-retrieve
//
// MAPBOX SEARCH BOX RETRIEVE (2026-09-14, "kredittakarékos sprint —
// Mapbox Search Box autocomplete"). Egy KIVÁLASZTOTT /suggest javaslat
// pontos koordinátáját adja vissza a Mapbox Search Box
// `/retrieve/{mapbox_id}` végpontjáról, UGYANAZZAL a `session_token`-nel,
// mint amivel a /suggest hívás (lásd /api/admin/vedett-utvonal/
// address-search/route.ts) történt — a Mapbox Search Box API ezt a
// session-összefüggést előírja.
//
// KÖRÖN KÍVÜL EBBEN A SPRINTBEN: a visszaadott koordináta a transit MOTIS
// routingba még NINCS bekötve (a MEGLÉVŐ routing a kiválasztott javaslat
// LABEL-jét, egy cím-szöveget kap — updateOriginManualField/
// updateDestinationManualField("street", ...), lásd
// VedettUtvonalSearchForm.tsx — ehhez a koordináta bekötéséhez nagy
// routing-refaktor kellene, amit ez a kredittakarékos sprint NEM indokol).
// Ez a végpont ÖNMAGÁBAN kész és tesztelt (autocomplete + retrieve) — a
// koordináta routingba kötését KÜLÖN kell megrendelni.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";

function optionalStringField(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : undefined;
}

type MapboxRetrieveFeature = {
  geometry?: { coordinates?: unknown };
  properties?: { full_address?: unknown; name?: unknown };
};

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const id = optionalStringField(body, "id")?.trim();
  const sessionToken = optionalStringField(body, "sessionToken")?.trim();

  if (!id || !sessionToken) {
    return NextResponse.json(null);
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(null);
  }

  const params = new URLSearchParams();
  params.set("session_token", sessionToken);
  params.set("access_token", accessToken);

  let mapboxResponse: Response;
  try {
    mapboxResponse = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}?${params.toString()}`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch {
    return NextResponse.json(null);
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json(null);
  }

  const data: unknown = await mapboxResponse.json().catch(() => null);
  const feature = (data as { features?: MapboxRetrieveFeature[] } | null)?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return NextResponse.json(null);
  }
  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") {
    return NextResponse.json(null);
  }

  const label =
    (typeof feature?.properties?.full_address === "string" && feature.properties.full_address) ||
    (typeof feature?.properties?.name === "string" && feature.properties.name) ||
    "";

  return NextResponse.json({ lat, lon, label });
}
