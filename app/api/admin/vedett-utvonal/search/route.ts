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

  const { from, to, weights } = parsed.data;
  const departAt = parsed.data.departAt ?? new Date().toISOString();

  // Múltbeli időpont ellenőrzése (31. pont: routing tesztek).
  if (new Date(departAt).getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", message: "Az indulási időpont nem lehet a múltban." },
      { status: 400 }
    );
  }

  const [fromGeo, toGeo] = await Promise.all([geocodeAddress(from), geocodeAddress(to)]);

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

  const result = await searchVedettRoutes(
    {
      from: { name: fromGeo.name, lat: fromGeo.lat, lon: fromGeo.lon },
      to: { name: toGeo.name, lat: toGeo.lat, lon: toGeo.lon },
      departAt,
    },
    weights
  );

  return NextResponse.json(result);
}
