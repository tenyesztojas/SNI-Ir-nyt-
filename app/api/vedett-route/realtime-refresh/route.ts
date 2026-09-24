// POST /api/vedett-route/realtime-refresh
//
// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH, 2026-09-16) — provider-neutrális
// végpont, amely egy MÁR MEGTERVEZETT Journey TRANSIT lábainak friss
// realtime állapotát adja vissza, kizárólag a kért, stabil identitású
// (tripId, opcionálisan routeId) lábakra.
//
// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — KORÁBBI KÖR
// KORREKCIÓJA. A Sprint 7.2-es "B) CONTROLLED MOTIS REFRESH" architektúra
// egy minimális, a Journey saját origin/destination/departAt paramétereivel
// futó /api/v6/plan re-query-t indított, és ebből próbált pontos tripId-
// egyezést találni. Élő VPS-audit (lásd docs/vedett-route audit-riportok,
// user saját BKK/MOTIS 2.11.2 tesztje) BIZONYÍTOTTA, hogy ez hibás
// absztrakció: ha a kért trip már lefutott (pl. az M2 a Déli pályaudvarra
// már megérkezett), egy /plan újratervezés a departAt körüli KÖVETKEZŐ M2
// itinerary-kat adja vissza — a pontos tripId-egyezés emiatt
// szisztematikusan, csendben hibázik, MIKÖZBEN a MOTIS-nak ténylegesen VAN
// élő realtime adata a konkrét trip-ről (a user élő tesztje: ugyanaz a
// tripId GET /api/v6/trip?tripId=... hívással realTime=true-t ad).
//
// A realtime-refresh MOSTANTÓL SOHA nem hív /plan-t. Minden kért TRANSIT
// lábhoz (tripId-nkénti deduplikálással, lásd buildRequest.ts
// dedupeRealtimeRefreshTripIds()) egy GET /api/v6/trip?tripId=... hívást
// indít (fetchMotisTrip(), motisClient.ts) — ez EGYETLEN, MÁR AZONOSÍTOTT
// fizikai trip élő állapotát adja vissza, nem egy új route-keresést. A
// válasz TELJES trip-span-jéből (nem a user saját boarding/alighting
// szakaszából) a helyes sub-leg realtime idejét az extractUpdates.ts
// extractRealtimeUpdatesFromTrips()-e vágja ki, KIZÁRÓLAG a JourneyLeg
// saját fromStopId/toStopId alapján (lásd ott a részletes indoklást).
//
// A kérés from/to/departAt mezői (a kliens továbbra is elküldi, hátrafelé
// kompatibilis kéréstest-alak miatt) ezen az úton MÁR NEM kerülnek
// felhasználásra — a normál, tervezési célú /plan hívások (orchestrator.ts)
// és az ott használt fagyasztott departAt VÁLTOZATLANOK, ez a végpont nem
// nyúl hozzájuk.
//
// SOHA nem fogad el/bíz a kliens által küldött teljes Journey objektumban —
// csak validált primitíveket (koordináták, ISO időpont, tripId/routeId/
// fromStopId/toStopId). Jogosultság és rate-limit: ugyanaz a minta, mint a
// többi Védett Útvonal route-nál (lásd rest-stops/resume/route.ts).
//
// IDENTITÁS-SZABÁLY (VÁLTOZATLAN, Sprint 7.2 óta): SOHA nincs fallback egy
// másik tripre — sem route-only, sem legközelebbi-indulás, sem automatikus
// "következő járat" helyettesítés. Pontos, teljes tripId-egyezés, vagy
// no-op — ez nem változott, csak az adatforrás.

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { realtimeRefreshSchema } from "@/lib/vedett-route/realtimeRefresh/schemas";
import { dedupeRealtimeRefreshTripIds } from "@/lib/vedett-route/realtimeRefresh/buildRequest";
import { extractRealtimeUpdatesFromTrips } from "@/lib/vedett-route/realtimeRefresh/extractUpdates";
import { fetchMotisTrip } from "@/lib/vedett-route/motisClient";
import { rateLimiter } from "@/lib/rate-limit";
import { vedettRouteRealtimeRefreshDebugLog } from "@/lib/vedett-route/logger";
import type { MotisItinerary } from "@/lib/vedett-route/motisTypes";

// Konzervatív, a 30 mp-es kliens-oldali polling intervallumhoz illesztett
// korlát: legfeljebb 10 kérés / 60 mp / felhasználó — bőven elég a normál
// pollinghoz (2/perc) + visibility-return refresh-ekhez, de blokkolja egy
// esetleges request storm-ot.
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const auth = await requireVedettRouteAccess();
  if (!auth.ok) return auth.response;

  const rateLimit = await rateLimiter.check(`vedett-route:realtime-refresh:${auth.userId}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "RATE_LIMITED", message: "Túl sok frissítési kérés érkezett rövid idő alatt." },
      { status: 200 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = realtimeRefreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "INVALID_REQUEST", message: parsed.error.errors[0]?.message ?? "Érvénytelen kérés." },
      { status: 400 }
    );
  }

  // SPRINT 9 — tripId-nkénti deduplikálás: ha több TRANSIT láb ugyanarra a
  // tripId-re hivatkozik, a MOTIS /trip végpontot pollingonként KIZÁRÓLAG
  // EGYSZER hívjuk meg az adott tripId-re (lásd buildRequest.ts).
  const uniqueTripIds = dedupeRealtimeRefreshTripIds(parsed.data.legs);

  const tripResponsesByTripId = new Map<string, MotisItinerary | null>();
  await Promise.all(
    uniqueTripIds.map(async (tripId) => {
      const result = await fetchMotisTrip({ tripId });
      // Bármilyen nem-ok eredmény (not_found/routing_error/timeout/
      // routing_engine_unavailable) CSENDES no-op-ra fut ehhez a
      // tripId-hez — soha nem dob hibát a kliens felé, soha nem old fel
      // egy másik tripId-t helyette, soha nem jelez cancelled/off-route
      // állapotot pusztán a hiányzó adat miatt.
      tripResponsesByTripId.set(tripId, result.ok ? result.data : null);
      // DIAGNOSZTIKAI LOGGING (2026-09-24) — TISZTÁN megfigyelő réteg,
      // KIZÁRÓLAG a VEDETT_ROUTE_REALTIME_REFRESH_DEBUG flag mögött (lásd
      // logger.ts): melyik tripId-re kértünk MOTIS /trip lekérdezést, és a
      // motisClient milyen result.reason-t adott vissza sikertelen esetben
      // (a motisClient saját, tripId nélküli logjait EGÉSZÍTI KI, nem
      // helyettesíti). A viselkedést/no-op szemantikát NEM módosítja.
      vedettRouteRealtimeRefreshDebugLog("motis_trip_fetch", {
        tripId,
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
      });
    })
  );

  const updates = extractRealtimeUpdatesFromTrips(parsed.data.legs, tripResponsesByTripId);
  return NextResponse.json({ ok: true, updates });
}
