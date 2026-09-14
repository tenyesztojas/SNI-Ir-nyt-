// POST /api/admin/vedett-utvonal/car-route
//
// AUTÓS ÚTVONALTERVEZÉS — BACKGROUND NAVIGATION SPRINT 1.
// A kliens jelenlegi mezői (durationSeconds, distanceMeters, geometry)
// változatlanul megmaradnak. Emellett háttérben felépül:
// - turn-by-turn legs/steps/maneuver modell,
// - magyar voice/banner instruction adat,
// - driving-traffic annotation,
// - kísérleti autós sensory feature/score.
//
// NINCS UI-aktiválás, NINCS GPS tracking, NINCS rerouting.
// A CAR_ROUTING_ENABLED frontend flaghez ez a sprint NEM nyúl.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { geocodeAddress, isAmbiguousGeocodeResult } from "@/lib/vedett-route/geocode";
import {
  normalizeCarRoute as normalizeCarRouteData,
} from "@/lib/vedett-route/car/normalizeDirections";
import type { RawMapboxRoute } from "@/lib/vedett-route/car/types";

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

// A régi függvénynév szándékosan megmarad a regressziós kompatibilitás miatt.
function normalizeCarRoute(route: RawMapboxRoute) {
  return normalizeCarRouteData(route);
}

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = carRouteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_request",
        message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés.",
      },
      { status: 400 },
    );
  }

  const [origin, destination] = await Promise.all([
    geocodeToCoordinates(parsed.data.originAddress),
    geocodeToCoordinates(parsed.data.destinationAddress),
  ]);

  if (!origin || !destination) {
    return NextResponse.json(
      {
        ok: false,
        reason: "geocoding_failed",
        message: "Nem sikerült beazonosítani a megadott cím(ek)et.",
      },
      { status: 400 },
    );
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        reason: "car_routing_unavailable",
        message: "Az autós útvonaltervezés jelenleg nem elérhető.",
      },
      { status: 503 },
    );
  }

  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

  const params = new URLSearchParams();
  params.set("alternatives", "true");
  params.set("steps", "true");
  params.set("overview", "full");
  params.set("geometries", "geojson");

  // Turn-by-turn: háttérben már teljes guidance adatot kérünk.
  params.set("language", "hu");
  params.set("voice_instructions", "true");
  params.set("banner_instructions", "true");
  params.set("roundabout_exits", "true");
  params.set("voice_units", "metric");

  // Sensory feature extraction alapadatai.
  params.set(
    "annotations",
    "distance,duration,speed,congestion,congestion_numeric,maxspeed",
  );

  params.set("access_token", accessToken);

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}` +
    `?${params.toString()}`;

  let mapboxResponse: Response;
  try {
    mapboxResponse = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        reason: "car_routing_error",
        message: "Az autós útvonaltervező szolgáltatás nem érhető el.",
      },
      { status: 502 },
    );
  }

  if (!mapboxResponse.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: "car_routing_error",
        message: "Az autós útvonaltervező szolgáltatás hibát adott.",
      },
      { status: 502 },
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
      {
        ok: false,
        reason: "no_route",
        message: "Nem található autós útvonal a megadott címek között.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, routes });
}
