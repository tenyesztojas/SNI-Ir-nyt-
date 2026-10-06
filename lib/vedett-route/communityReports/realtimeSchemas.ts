// VÉDETT ÚTVONAL — REALTIME COMMUNITY STATE — lekérdezés-validáció.
// Csak azonosítók (route/trip/megálló) és durva cella — koordináta nem.

import { z } from "zod";

const TRANSIT_ID_PATTERN = /^[A-Za-z0-9_.:\-]{1,200}$/;
const transitId = z.string().regex(TRANSIT_ID_PATTERN, "Érvénytelen azonosító.").nullable().optional();
export const GEO_CELL_PATTERN = /^g0\.01:-?\d{1,6}:-?\d{1,6}$/;

export const communityStateQuerySchema = z
  .object({
    tripId: transitId,
    routeId: transitId,
    fromStopId: transitId,
    toStopId: transitId,
    geoCell: z.string().regex(GEO_CELL_PATTERN, "Érvénytelen cella.").nullable().optional(),
  })
  .strict()
  .refine((q) => Boolean(q.tripId || q.routeId || q.geoCell), { message: "Legalább tripId, routeId vagy geoCell kell." });

export type CommunityStateQueryInput = z.infer<typeof communityStateQuerySchema>;
