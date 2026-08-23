// Validációs sémák — külön fájlban, hogy Next.js request-scope-független
// egységtesztekkel ellenőrizhetők legyenek (lásd __tests__/vedett-route/).

import { z } from "zod";

export const journeySearchSchema = z.object({
  from: z.string().min(2, "Az indulási hely megadása kötelező."),
  to: z.string().min(2, "A célhely megadása kötelező."),
  departAt: z.string().datetime().optional(),
});
