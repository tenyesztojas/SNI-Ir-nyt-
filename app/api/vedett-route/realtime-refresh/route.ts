// POST /api/vedett-route/realtime-refresh
//
// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH, 2026-09-16) — provider-neutrális
// végpont, amely egy MÁR MEGTERVEZETT Journey TRANSIT lábainak friss
// realtime állapotát adja vissza, kizárólag a kért, stabil identitású
// (tripId, opcionálisan routeId) lábakra. Architektúra: "B) CONTROLLED
// MOTIS REFRESH" — a motisClient.ts-ben KIZÁRÓLAG a /api/v6/plan végpont
// létezik (nincs dedikált egy-trip-státusz lekérdezés), ezért egy minimális,
// a Journey saját origin/destination/departAt paramétereivel futó plan
// re-query adja az alapot, PONTOS identitás-egyezéssel párosítva vissza
// (lásd extractUpdates.ts).
//
// SOHA nem fogad el/bíz a kliens által küldött teljes Journey objektumban —
// csak validált primitíveket (koordináták, ISO időpont, tripId/routeId).
// Jogosultság és rate-limit: ugyanaz a minta, mint a többi Védett Útvonal
// route-nál (lásd rest-stops/resume/route.ts).

import { NextResponse } from "next/server";
import { requireVedettRouteAccess } from "@/lib/vedett-route/access";
import { realtimeRefreshSchema } from "@/lib/vedett-route/realtimeRefresh/schemas";
import { buildRealtimeRefreshRequest } from "@/lib/vedett-route/realtimeRefresh/buildRequest";
import { extractRealtimeUpdates } from "@/lib/vedett-route/realtimeRefresh/extractUpdates";
import { fetchMotisPlan } from "@/lib/vedett-route/motisClient";
import { rateLimiter } from "@/lib/rate-limit";

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

  const planParams = buildRealtimeRefreshRequest(
    { from: parsed.data.from, to: parsed.data.to, departAt: parsed.data.departAt },
    Math.min(3, Math.max(1, parsed.data.legs.length))
  );
  const planResult = await fetchMotisPlan(planParams);

  if (!planResult.ok) {
    // Hálózati/routing hiba esetén a navigáció NEM szakad meg (lásd Sprint
    // 7.2, 10. pont) — a kliens ezt egyszerűen egy "nincs új adat" válaszként
    // kezeli, a következő polling ciklus újra próbálkozik.
    return NextResponse.json({ ok: true, updates: [] });
  }

  const freshLegs = [
    ...(planResult.data.itineraries ?? []),
    ...(planResult.data.direct ?? []),
  ].flatMap((itinerary) => itinerary.legs ?? []);

  const updates = extractRealtimeUpdates(freshLegs, parsed.data.legs);
  return NextResponse.json({ ok: true, updates });
}
