// GET /api/admin/vedett-utvonal/status
//
// Kizárólag admin diagnosztikai státuszt ad vissza — SOHA nem magát az
// API-kulcsot (9. pont). Szándékosan csak admin-gated (nem feature-flag
// gated is), hogy a flag kikapcsolt állapotában is diagnosztizálható legyen
// a konfiguráció.

import { NextResponse } from "next/server";
import { requireVedettRouteAdmin } from "@/lib/vedett-route/access";
import { getVedettRouteStatus } from "@/lib/vedett-route/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireVedettRouteAdmin();
  if (!auth.ok) return auth.response;

  const status = await getVedettRouteStatus();
  return NextResponse.json(status);
}
