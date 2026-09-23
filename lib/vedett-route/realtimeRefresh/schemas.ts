// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — bemenet-validáció (zod) a
// POST /api/vedett-route/realtime-refresh végponthoz. Ugyanazt a mintát
// követi, mint lib/vedett-route/restStopFlow/schemas.ts.
//
// FONTOS: a kliens SOHA nem küldi át a teljes (bizalmatlan) Journey
// objektumot — csak a lekérdezéshez feltétlenül szükséges, validált
// primitíveket (koordináták, ISO időpont, tripId/routeId/fromStopId/
// toStopId identitás-lista).
//
// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — fromStopId/toStopId
// HOZZÁADVA a leg-identitáshoz: a realtime-refresh mostantól GET
// /api/v6/trip hívásokból vágja ki a user saját boarding/alighting
// szakaszát a teljes fizikai trip span-jéből (lásd extractUpdates.ts) —
// ehhez a JourneyLeg saját fromStopId/toStopId-jára van szükség, amit a
// kliens innentől a tripId/routeId mellett küld. Opcionálisak maradnak
// (nem törik a kontraktust, ha valamiért hiányoznának) — hiányuk esetén az
// adott leg egyszerűen kimarad a frissítésből (lásd extractUpdates.ts),
// SOHA nem esik vissza a teljes trip origin/destination idejére.

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../rest-points/schemas.ts";

const coordinateSchema = z.object({
  lat: latitudeSchema,
  lon: longitudeSchema,
});

// PONTOSAN egyező (tripId, opcionálisan routeId) identitás — soha nem
// routeShortName/busszám/megállónév/timestamp/leg-index. fromStopId/
// toStopId a sub-leg határpontok kivágásához (lásd extractUpdates.ts).
const legIdentitySchema = z.object({
  tripId: z.string().trim().min(1, "A tripId kötelező.").max(200),
  routeId: z.string().trim().min(1).max(200).optional(),
  fromStopId: z.string().trim().min(1).max(200).optional(),
  toStopId: z.string().trim().min(1).max(200).optional(),
});

// POST /api/vedett-route/realtime-refresh
export const realtimeRefreshSchema = z.object({
  from: coordinateSchema,
  to: coordinateSchema,
  departAt: z.string().datetime(),
  legs: z.array(legIdentitySchema).min(1, "Legalább egy TRANSIT láb identitása kötelező.").max(20),
});
export type RealtimeRefreshInput = z.infer<typeof realtimeRefreshSchema>;
