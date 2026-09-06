// Validációs sémák — külön fájlban, hogy Next.js request-scope-független
// egységtesztekkel ellenőrizhetők legyenek (lásd __tests__/vedett-route/).

import { z } from "zod";

export const personalizationWeightsSchema = z
  .object({
    transfers: z.number().min(0).max(2).optional(),
    modeSwitches: z.number().min(0).max(2).optional(),
    underground: z.number().min(0).max(2).optional(),
    walking: z.number().min(0).max(2).optional(),
    duration: z.number().min(0).max(2).optional(),
    waiting: z.number().min(0).max(2).optional(),
  })
  .optional();

export const journeySearchSchema = z.object({
  from: z.string().min(2, "Az indulási hely megadása kötelező."),
  to: z.string().min(2, "A célhely megadása kötelező."),
  departAt: z.string().datetime().optional(),
  weights: personalizationWeightsSchema,
});
