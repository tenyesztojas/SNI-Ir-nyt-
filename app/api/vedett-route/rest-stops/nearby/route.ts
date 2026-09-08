// POST /api/vedett-route/rest-stops/nearby
//
// Sprint E — "Pihenőre van szükségem" folyamat, B) lépés: a felhasználó
// SAJÁT pihenőpontjainak lekérdezése és determinisztikus rangsorolása az
// aktuális pozíció alapján.
//
// Jogosultság: requireVedettRouteAccess() (admin_only, ugyanaz a kapu, mint
// minden Védett Útvonal funkció — lásd access.ts). A tényleges cross-user
// védelmet az RLS adja (listOwnRestPoints() a hívó session-jéhez kötött
// klienssel dolgozik, lásd lib/rest-points/queries.ts), a
// filterVisibleRestPoints() egy MÁSODIK, alkalmazás-szintű védelmi réteg
// (lásd visibility.ts fejléce) — nem helyettesíti az RLS-t.
//
// PRIVACY: az aktuális pozíció (currentPosition) itt KIZÁRÓLAG a
// rangsoroláshoz kerül felhasználásra — nem kerül DB-be, nem kerül logba
// (lásd vedettRouteLog hívásait lent: sosem tartalmaznak koordinátát).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restStopNearbySchema } from "@/lib/vedett-route/restStopFlow/schemas";
import { listOwnRestPoints } from "@/lib/rest-points/queries";
import { filterVisibleRestPoints } from "@/lib/vedett-route/restStopFlow/visibility";
import { rankRestPoints } from "@/lib/vedett-route/restStopFlow/ranking";
import { vedettRouteLog } from "@/lib/vedett-route/logger";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = restStopNearbySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_LOAD_FAILED", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  try {
    const own = await listOwnRestPoints();
    const visible = filterVisibleRestPoints(own, auth.userId);
    const ranked = rankRestPoints(
      visible,
      { lat: parsed.data.currentPosition.lat, lon: parsed.data.currentPosition.lon },
      undefined,
      parsed.data.preference
    );

    if (ranked.length === 0) {
      // Explicit, dokumentált eset (spec 9. pont) — NEM technikai hiba,
      // csak nincs a felhasználónak még egyetlen saját pihenőpontja sem.
      return NextResponse.json(
        {
          ok: false,
          reason: "NO_REST_POINTS_FOUND",
          message: "Nincs elérhető pihenőpontod. Adj hozzá egyet a térképről indulva.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, restPoints: ranked });
  } catch (err) {
    // Sosem adjuk tovább a nyers hibaüzenetet a kliensnek (lásd
    // errorMapping.ts fejléce a hasonló elvért a routing hibáknál).
    vedettRouteLog("routing_error", "error", {
      phase: "rest_stops_nearby",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_LOAD_FAILED", message: "A pihenőpontok betöltése sikertelen." },
      { status: 500 }
    );
  }
}
