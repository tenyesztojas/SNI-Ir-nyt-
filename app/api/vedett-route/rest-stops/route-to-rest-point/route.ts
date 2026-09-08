// POST /api/vedett-route/rest-stops/route-to-rest-point
//
// Sprint E — "Pihenőre van szükségem" folyamat, G) lépés: útvonaltervezés
// a jelenlegi pozíciótól a kiválasztott pihenőpontig.
//
// LÁNC (lásd rerouteRequest.ts fejléce):
//   böngésző (aktuális pozíció) -> EZ A VÉGPONT -> fetchMotisPlan()
//   -> HTTPS route service (VPS) -> MOTIS realtime (/api/v6/plan)
//
// A böngésző SOHA nem hívja közvetlenül a MOTIS-t vagy a route service-t —
// ez a szabály változatlan (lásd motisClient.ts fejléce,
// ROUTE_SERVICE_AUTH_TOKEN kizárólag itt, szerver oldalon kerül
// felhasználásra).
//
// Jogosultság: requireVedettRouteAccess(). A célpihenőpontot a hívó SAJÁT
// pihenőpontjai közül kell kiválasztani (listOwnRestPoints(), RLS-scoped)
// — más felhasználó pihenőpontjára soha nem tervezhető útvonal ezen a
// végponton keresztül.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restStopRouteToRestPointSchema } from "@/lib/vedett-route/restStopFlow/schemas";
import { listOwnRestPoints } from "@/lib/rest-points/queries";
import { buildRouteToRestPointRequest } from "@/lib/vedett-route/restStopFlow/rerouteRequest";
import { pickBestItinerary } from "@/lib/vedett-route/restStopFlow/pickBestItinerary";
import { mapMotisPlanFailureToRestStopError } from "@/lib/vedett-route/restStopFlow/errorMapping";
import { fetchMotisPlan } from "@/lib/vedett-route/motisClient";
import { mapMotisItineraryToJourney } from "@/lib/vedett-route/orchestrator";

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = restStopRouteToRestPointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_NO_ROUTE", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  const own = await listOwnRestPoints();
  const restPoint = own.find((rp) => rp.id === parsed.data.restPointId);
  if (!restPoint) {
    // Vagy nem létezik, vagy nem a hívóé — az RLS miatt a listOwnRestPoints()
    // eleve csak a sajátjait adja vissza, tehát ez a két eset innen nem
    // különböztethető meg (és nem is kell — egyik esetben sem szivárogtatunk
    // információt más felhasználó pontjának létezéséről).
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_NO_ROUTE", message: "A kiválasztott pihenőpont nem található." },
      { status: 404 }
    );
  }

  const planParams = buildRouteToRestPointRequest(
    { lat: parsed.data.currentPosition.lat, lon: parsed.data.currentPosition.lon },
    restPoint,
    parsed.data.departAt
  );
  const planResult = await fetchMotisPlan(planParams);

  if (!planResult.ok) {
    const mapped = mapMotisPlanFailureToRestStopError(planResult);
    return NextResponse.json({ ok: false, reason: mapped.reason, message: mapped.message }, { status: 200 });
  }

  const itineraries = [...(planResult.data.itineraries ?? []), ...(planResult.data.direct ?? [])];
  const best = pickBestItinerary(itineraries);
  if (!best) {
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_NO_ROUTE", message: "Nem található útvonal a kiválasztott pihenőponthoz." },
      { status: 200 }
    );
  }

  const journey = mapMotisItineraryToJourney(best, { from: "Jelenlegi hely", to: restPoint.name });
  return NextResponse.json({ ok: true, journey });
}
