// POST /api/admin/vedett-utvonal/car-route
//
// AUTÓS ÚTVONALTERVEZÉS MVP (2026-09-14, "VédettÚtvonal autós ág" sprint).
// Admin ÉS feature flag védett (requireVedettRouteAccess — UGYANAZ a gate,
// mint a meglévő /search végponton). Bemenet: indulási cím és célcím
// (szöveg) — a cím -> koordináta geokódolást a MEGLÉVŐ geocodeAddress()-
// szel végezzük (lib/vedett-route/geocode.ts), NEM duplikáljuk. A
// koordinátákkal ezután a Mapbox Directions API-t hívjuk (mapbox/driving-
// traffic profil, steps=false — NINCS turn-by-turn). GEOMETRIA (2026-09-14):
// overview=full + geometries=geojson, hogy a meglévő térkép ki tudja
// rajzolni az útvonalat. ALTERNATÍVÁK (2026-09-14, "választható autós
// útvonalak" sprint): alternatives=true — a Mapbox akár 3 útvonalat adhat
// vissza, ezeket a `routes` tömbben normalizáljuk, MAX 3 elemre vágva (ha a
// Mapbox kevesebbet ad, az rendben van).
//
// A Mapbox access tokent a MAPBOX_ACCESS_TOKEN szerveroldali env
// variable-ből olvassuk — SOSEM küldjük vissza a kliensnek, SOSEM
// hardcode-oljuk. A válaszban route-onként KIZÁRÓLAG a menetidő
// (durationSeconds), a távolság (distanceMeters) és a GeoJSON LineString
// geometria megy vissza — a teljes Mapbox response NEM.
//
// KÖRÖN KÍVÜL (szándékosan nem része ennek a sprintnek): VédettScore,
// sensory routing, turn-by-turn, GPS, rerouting, közösségi jelentések,
// saját újrarendezés/elnevezés ("leggyorsabb"/"legnyugodtabb") — a routes
// tömb sorrendje PONTOSAN a Mapbox válaszának sorrendje.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { geocodeAddress, isAmbiguousGeocodeResult } from "@/lib/vedett-route/geocode";

const MAX_CAR_ROUTES = 3;

const carRouteRequestSchema = z.object({
  originAddress: z.string().trim().min(1, "Az indulási cím megadása kötelező."),
  destinationAddress: z.string().trim().min(1, "A célcím megadása kötelező."),
});

async function geocodeToCoordinates(address: string): Promise<{ lat: number; lon: number } | null> {
  const result = await geocodeAddress(address).catch(() => null);
  if (!result || isAmbiguousGeocodeResult(result)) return null;
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return null;
  return { lat: result.lat, lon: result.lon };
}

type RawMapboxRoute = { duration?: unknown; distance?: unknown; geometry?: { type?: unknown; coordinates?: unknown } };

// EGY Mapbox route normalizálása — null, ha a route hiányos/hibás (nincs
// duration/distance, vagy a geometry nem valódi LineString+coordinates).
function normalizeCarRoute(route: RawMapboxRoute) {
  const geometry = route.geometry;
  if (
    typeof route.duration !== "number" ||
    typeof route.distance !== "number" ||
    !geometry ||
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null;
  }
  return {
    durationSeconds: Math.round(route.duration),
    distanceMeters: Math.round(route.distance),
    geometry: { type: "LineString" as const, coordinates: geometry.coordinates as [number, number][] },
  };
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = carRouteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  const [origin, destination] = await Promise.all([
    geocodeToCoordinates(parsed.data.originAddress),
    geocodeToCoordinates(parsed.data.destinationAddress),
  ]);

  if (!origin || !destination) {
    return NextResponse.json(
      { ok: false, reason: "geocoding_failed", message: "Nem sikerült beazonosítani a megadott cím(ek)et." },
      { status: 400 }
    );
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, reason: "car_routing_unavailable", message: "Az autós útvonaltervezés jelenleg nem elérhető." },
      { status: 503 }
    );
  }

  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  // GEOMETRIA (2026-09-14, "autós útvonal a térképen" sprint) — overview=full
  // + geometries=geojson kéri a teljes útvonal-geometriát, közvetlenül
  // GeoJSON LineString formátumban (nincs szerveroldali polyline-dekódolás/
  // konverzió, a MapLibre GeoJSON forrás ezt közvetlenül elfogadja).
  // ALTERNATÍVÁK — alternatives=true, hogy a Mapbox (legfeljebb 3) útvonalat
  // adjon vissza.
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}` +
    `?alternatives=true&steps=false&overview=full&geometries=geojson&access_token=${accessToken}`;

  let mapboxResponse: Response;
  try {
    mapboxResponse = await fetch(url);
  } catch {
    return NextResponse.json(
      { ok: false, reason: "car_routing_error", message: "Az autós útvonaltervező szolgáltatás nem érhető el." },
      { status: 502 }
    );
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json(
      { ok: false, reason: "car_routing_error", message: "Az autós útvonaltervező szolgáltatás hibát adott." },
      { status: 502 }
    );
  }

  const data: unknown = await mapboxResponse.json().catch(() => null);
  const rawRoutes = (data as { routes?: RawMapboxRoute[] } | null)?.routes ?? [];
  const routes = rawRoutes
    .slice(0, MAX_CAR_ROUTES)
    .map(normalizeCarRoute)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (routes.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "no_route", message: "Nem található autós útvonal a megadott címek között." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, routes });
}
