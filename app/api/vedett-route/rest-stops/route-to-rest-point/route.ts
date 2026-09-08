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
// Jogosultság: requireVedettRouteAccess().
//
// Sprint E.2 hotfix (2026-09-08, valódi Vercel Preview 404 root cause
// audit, "EXTERNAL REST POINT RESOLUTION MISMATCH"): a kiválasztott
// pihenőpont feloldása mostantól FORRÁS-FÜGGŐ (lásd
// lib/vedett-route/restStopFlow/resolveRestPoint.ts "AUTHORITATIVE
// SOURCE" szakasza) — korábban ez a végpont KIZÁRÓLAG a rest_points DB
// táblában (listOwnRestPoints()) keresett, forrástól függetlenül, ami
// minden OSM/VEDETT_SAROK candidate esetén garantált 404-et adott, még a
// MOTIS hívás előtt. USER forrásnál a célpontot a hívó SAJÁT
// pihenőpontjai közül kell kiválasztani (listOwnRestPoints(),
// RLS-scoped) — más felhasználó pihenőpontjára soha nem tervezhető
// útvonal ezen a végponton keresztül. VEDETT_SAROK forrásnál a "places"
// tábla az authoritative forrás (rest_point_eligible === true kapuval).
// OSM forrásnál a discovery candidate payload (validált, lásd
// schemas.ts) az authoritative forrás — SOHA nem íródik DB-be.
//
// Hibakód-szétválasztás (Sprint E.2 hotfix): REST_POINT_NOT_FOUND = a
// pont nem oldható fel (nem létezik / nem a hívóé / nem eligible) — ez
// MOTIS előtti hiba. REST_POINT_NO_ROUTE = a pont sikeresen feloldódott,
// a MOTIS hívás lezajlott, de nincs használható itinerary. Korábban
// mindkét eset REST_POINT_NO_ROUTE-ként jelent meg, ami admin-
// diagnosztikában megkülönböztethetetlen volt.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { restStopRouteToRestPointSchema } from "@/lib/vedett-route/restStopFlow/schemas";
import { listOwnRestPoints } from "@/lib/rest-points/queries";
import { getApprovedPlaces } from "@/lib/data";
import { resolveSelectedRestPoint } from "@/lib/vedett-route/restStopFlow/resolveRestPoint";
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
      { ok: false, reason: "REST_POINT_NOT_FOUND", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  const { restPoint: ref } = parsed.data;
  // Csak azt a forrást kérdezzük le, amelyikre TÉNYLEGESEN szükség van —
  // OSM esetén nincs DB-hívás egyáltalán (lásd resolveRestPoint.ts
  // "AUTHORITATIVE SOURCE" szakasza).
  const ownPoints = ref.source === "USER" ? await listOwnRestPoints() : [];
  const places = ref.source === "VEDETT_SAROK" ? await getApprovedPlaces() : [];
  const restPoint = resolveSelectedRestPoint(ref, { ownPoints, places });
  if (!restPoint) {
    // USER: vagy nem létezik, vagy nem a hívóé — az RLS miatt a
    // listOwnRestPoints() eleve csak a sajátjait adja vissza, tehát ez a
    // két eset innen nem különböztethető meg (és nem is kell — egyik
    // esetben sem szivárogtatunk információt más felhasználó pontjának
    // létezéséről). VEDETT_SAROK: nem létező hely, vagy létezik, de nem
    // rest_point_eligible. OSM: a validáció (schemas.ts) már lefutott,
    // ez az ág itt gyakorlatilag elérhetetlen OSM-re.
    return NextResponse.json(
      { ok: false, reason: "REST_POINT_NOT_FOUND", message: "A kiválasztott pihenőpont nem található." },
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
