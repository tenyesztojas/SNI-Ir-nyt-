// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — KORÁBBI KÖR
// KORREKCIÓJA. A Sprint 7.2-es buildRealtimeRefreshRequest() egy teljes
// MotisPlanParams-ot (fromPlace/toPlace/time/numItineraries) épített a
// Journey fagyasztott origin/destination/departAt adataiból, egy
// /api/v6/plan re-query-hez. Élő VPS-audit bizonyította, hogy ez az
// absztrakció önmagában okozza a realtime-refresh csendes no-op-ját egy
// már lefutott trip esetén (lásd app/api/vedett-route/realtime-refresh/
// route.ts fejléce) — a realtime-refresh MOSTANTÓL SOHA nem hív /plan-t,
// helyette tripId-nkénti GET /api/v6/trip hívásokat indít
// (motisClient.ts fetchMotisTrip(), extractUpdates.ts). A korábbi
// MotisPlanParams-építő logika emiatt megszűnt — a normál, tervezési célú
// /plan hívások (orchestrator.ts) és az ott használt fagyasztott departAt
// VÁLTOZATLANOK maradnak, csak ebből a modulból tűntek el.
//
// Ez a modul innentől KIZÁRÓLAG a kérésben szereplő TRANSIT láb-identitások
// deduplikált tripId-listájának PURE (hálózat nélküli) előállítását végzi
// — ugyanaz a "pure request/input-builder" minta, mint korábban, csak más
// bemenet/kimenet.

import type { RealtimeRefreshIdentity } from "./extractUpdates.ts";

// Sorrend-megőrző, egyedi (nem üres) tripId-lista. Ha több TRANSIT láb
// UGYANARRA a tripId-re hivatkozik (pl. egy hosszú, több JourneyLeg-re
// bontott azonos fizikai trip-szakasz), a MOTIS /api/v6/trip végpontot
// pollingonként KIZÁRÓLAG EGYSZER hívjuk az adott tripId-re — a hívó
// (route.ts) ebből építi a tripId -> /trip válasz Map-et, amit aztán
// minden identitásra újra felhasznál.
export function dedupeRealtimeRefreshTripIds(legs: readonly RealtimeRefreshIdentity[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const leg of legs) {
    if (!leg.tripId) continue;
    if (seen.has(leg.tripId)) continue;
    seen.add(leg.tripId);
    result.push(leg.tripId);
  }
  return result;
}
