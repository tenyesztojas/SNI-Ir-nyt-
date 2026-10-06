// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — kérés-validáció.
//
// A kliens CSAK a report típusát és a már ismert közlekedési kontextust
// küldi. Időpont, service_date, time_bucket, expires_at, source: SZERVER
// számolja — kliens nem írhatja felül. Ismeretlen mező -> elutasítás
// (.strict()), így koordináta/cím/szabad szöveg nem csúszhat be.

import { z } from "zod";
import { COMMUNITY_REPORT_TYPES } from "./config.ts";
import { COMMUNITY_VEHICLE_TYPES } from "./context.ts";

// MOTIS azonosítók pl. "bkkgtfs_056216", "20260911_17:08_bkkgtfs_C98050336".
const TRANSIT_ID_PATTERN = /^[A-Za-z0-9_.:\-]{1,200}$/;
const transitId = z.string().regex(TRANSIT_ID_PATTERN, "Érvénytelen azonosító.").nullable().optional();

export const communityReportContextSchema = z
  .object({
    routeId: transitId,
    tripId: transitId,
    vehicleId: transitId,
    directionId: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
    fromStopId: transitId,
    toStopId: transitId,
    vehicleType: z.enum(COMMUNITY_VEHICLE_TYPES).nullable().optional(),
  })
  .strict();

export const communityReportSubmitSchema = z
  .object({
    reportType: z.enum(COMMUNITY_REPORT_TYPES),
    context: communityReportContextSchema.nullable().optional(),
  })
  .strict();

export type CommunityReportSubmitInput = z.infer<typeof communityReportSubmitSchema>;
