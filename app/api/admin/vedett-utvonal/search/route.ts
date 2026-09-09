// POST /api/admin/vedett-utvonal/search
//
// Admin ÉS feature flag védett (requireVedettRouteAccess). Bemenet: from/to
// cím vagy koordináta + indulási időpont + opcionális személyre szabási
// súlyok. Geokódolás után a Védett Route Orchestratoron (lásd
// lib/vedett-route/orchestrator.ts) keresztül valós MOTIS lekérdezéseket
// futtat, rangsorol, és Sensory Engine V1 pontszámmal tér vissza.
//
// FONTOS: amíg a MOTIS instance nincs elérhető, ez a végpont
// { ok: false, reason: "routing_engine_unavailable" }-t ad vissza. Sosem
// generálunk kitalált/AI-becsült útvonalat.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { journeySearchSchema } from "@/lib/vedett-route/schemas";
import { geocodeAddress } from "@/lib/vedett-route/geocode";
import { searchVedettRoutes } from "@/lib/vedett-route/orchestrator";
import { buildRouteCacheKey, getCached, setCached } from "@/lib/vedett-route/routeCache";
import type { OrchestratedSearchResult } from "@/lib/vedett-route/types";
import type { OrchestratorErrorResult } from "@/lib/vedett-route/orchestrator";
import { vedettRouteLog } from "@/lib/vedett-route/logger";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = journeySearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  const { from, fromCoordinates, to, weights } = parsed.data;
  const departAt = parsed.data.departAt ?? new Date().toISOString();

  // Múltbeli időpont ellenőrzése (31. pont: routing tesztek).
  if (new Date(departAt).getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: "Az indulási időpont nem lehet a múltban." },
      { status: 400 }
    );
  }

  // „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09),
  // TASK B — ha a kliens STRUKTURÁLT fromCoordinates-t küldött (a
  // felhasználó a böngésző GPS-ét választotta indulási pontnak), a
  // geocodeAddress()-t EZ A MEZŐ TELJESEN KIHAGYJA — nincs Nominatim-hívás
  // egy "Aktuális helyzetem"-féle string miatt, és nincs "hely nem
  // található" hiba sem, hiszen a koordináta már eleve validált (zod
  // latitudeSchema/longitudeSchema, lásd schemas.ts). A "Jelenlegi hely"
  // egy statikus, nem geokódolt megjelenítési név — SOSEM kerül vissza
  // Nominatim-lekérdezésbe.
  const [fromGeo, toGeo] = await Promise.all([
    fromCoordinates
      ? Promise.resolve({ name: "Jelenlegi hely", lat: fromCoordinates.latitude, lon: fromCoordinates.longitude })
      : geocodeAddress(from as string),
    geocodeAddress(to),
  ]);

  if (!fromGeo || !toGeo) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_request",
        message: !fromGeo ? "Az indulási hely nem található." : "A célhely nem található.",
      },
      { status: 400 }
    );
  }

  vedettRouteLog("routing_error", "info", { from: fromGeo.name, to: toGeo.name, phase: "search_requested" });

  // Rövid TTL-ű, csak folyamaton belüli cache (lásd routeCache.ts fejléce a
  // korlátairól) — a percre kerekített indulási idő + a súlyok is a kulcs
  // része, hogy sosem adjon vissza más paraméterekkel kért választ.
  const cacheKey = buildRouteCacheKey({
    fromLat: fromGeo.lat,
    fromLon: fromGeo.lon,
    toLat: toGeo.lat,
    toLon: toGeo.lon,
    departAtMinute: departAt.slice(0, 16),
    weights: weights ?? null,
  });

  const cached = getCached<OrchestratedSearchResult | OrchestratorErrorResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const result = await searchVedettRoutes(
    {
      from: { name: fromGeo.name, lat: fromGeo.lat, lon: fromGeo.lon },
      to: { name: toGeo.name, lat: toGeo.lat, lon: toGeo.lon },
      departAt,
    },
    weights
  );

  setCached(cacheKey, result);

  return NextResponse.json(result);
}
