// Sprint E — bemenet-validáció (zod) a rest-stop API végpontokhoz.
// Ugyanazt a mintát követi, mint lib/vedett-route/schemas.ts és
// lib/rest-points/schemas.ts.

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../rest-points/schemas.ts";

const coordinateSchema = z.object({
  lat: latitudeSchema,
  lon: longitudeSchema,
});

// POST /api/vedett-route/rest-stops/nearby
export const restStopNearbySchema = z.object({
  currentPosition: coordinateSchema,
  preference: z
    .object({
      preferQuiet: z.boolean().optional(),
      preferIndoors: z.boolean().optional(),
      avoidPurchaseRequired: z.boolean().optional(),
    })
    .optional(),
});
export type RestStopNearbyInput = z.infer<typeof restStopNearbySchema>;

// POST /api/vedett-route/rest-stops/route-to-rest-point
export const restStopRouteToRestPointSchema = z.object({
  currentPosition: coordinateSchema,
  restPointId: z.string().trim().min(1, "A pihenőpont azonosítója kötelező."),
  departAt: z.string().datetime().optional(),
});
export type RestStopRouteToRestPointInput = z.infer<typeof restStopRouteToRestPointSchema>;

// POST /api/vedett-route/rest-stops/resume
export const restStopResumeSchema = z.object({
  currentPosition: coordinateSchema,
  originalDestination: z.object({
    name: z.string().trim().min(1),
    lat: latitudeSchema,
    lon: longitudeSchema,
  }),
  departAt: z.string().datetime().optional(),
});
export type RestStopResumeInput = z.infer<typeof restStopResumeSchema>;
