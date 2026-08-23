// POST /api/admin/vedett-utvonal/gtfs-refresh
//
// Admin által indított manuális statikus GTFS frissítés (10. pont: az MVP
// során ez elfogadható, az architektúra a későbbi automatikus frissítésre
// felkészítve — lásd lib/vedett-route/providers/bkk.ts refreshStaticData()).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { getTransitProvider } from "@/lib/vedett-route/providers/registry";

export async function POST() {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const bkk = getTransitProvider("BKK");
  if (!bkk) {
    return NextResponse.json({ error: "Provider not available" }, { status: 500 });
  }

  try {
    const status = await bkk.refreshStaticData();
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ismeretlen hiba.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
