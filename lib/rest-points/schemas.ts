// Pihenőpontok — bemenet-validáció (zod), ugyanazt a mintát követve, mint
// lib/vedett-route/schemas.ts.

import { z } from "zod";

// Koordináta-validáció: valós földrajzi tartomány, NEM csak "van szám".
// Ez fedi le a "coordinate validation" tesztkövetelményt (R. pont).
export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const restPointCreateSchema = z.object({
  name: z.string().trim().min(1, "A pihenőpont nevének megadása kötelező.").max(120),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  toilet: z.boolean().optional(),
  seating: z.boolean().optional(),
  quietSpace: z.boolean().optional(),
  indoors: z.boolean().optional(),
  outdoors: z.boolean().optional(),
  purchaseRequired: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const restPointUpdateSchema = restPointCreateSchema.partial();

export type RestPointCreateInput = z.infer<typeof restPointCreateSchema>;
export type RestPointUpdateInput = z.infer<typeof restPointUpdateSchema>;
