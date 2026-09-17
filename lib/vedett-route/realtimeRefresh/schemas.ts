// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — bemenet-validáció (zod) a
// POST /api/vedett-route/realtime-refresh végponthoz. Ugyanazt a mintát
// követi, mint lib/vedett-route/restStopFlow/schemas.ts.
//
// FONTOS: a kliens SOHA nem küldi át a teljes (bizalmatlan) Journey
// objektumot — csak a lekérdezéshez feltétlenül szükséges, validált
// primitíveket (koordináták, ISO időpont, tripId/routeId identitás-lista).

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../rest-points/schemas.ts";

const coordinateSchema = z.object({
  lat: latitudeSchema,
  lon: longitudeSchema,
});

// PONTOSAN egyező (tripId, opcionálisan routeId) identitás — soha nem
// routeShortName/busszám/megállónév/timestamp/leg-index.
const legIdentitySchema = z.object({
  tripId: z.string().trim().min(1, "A tripId kötelező.").max(200),
  routeId: z.string().trim().min(1).max(200).optional(),
});

// POST /api/vedett-route/realtime-refresh
export const realtimeRefreshSchema = z.object({
  from: coordinateSchema,
  to: coordinateSchema,
  departAt: z.string().datetime(),
  legs: z.array(legIdentitySchema).min(1, "Legalább egy TRANSIT láb identitása kötelező.").max(20),
});
export type RealtimeRefreshInput = z.infer<typeof realtimeRefreshSchema>;
