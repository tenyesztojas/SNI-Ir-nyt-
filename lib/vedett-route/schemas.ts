// Validációs sémák — külön fájlban, hogy Next.js request-scope-független
// egységtesztekkel ellenőrizhetők legyenek (lásd __tests__/vedett-route/).

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../rest-points/schemas.ts";

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

// „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09),
// TASK B — a meglévő rest-points/schemas.ts már validált, valós
// földrajzi tartományú lat/lon sémáit használja fel (nem duplikáljuk a
// -90..90 / -180..180 határellenőrzést egy második definícióban).
export const routeOriginCoordinatesSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

// A `from` mostantól OPCIONÁLIS: MANUAL indulási mód esetén a kliens a
// szabadszöveges címet küldi (from), CURRENT_LOCATION mód esetén a
// STRUKTURÁLT koordinátát (fromCoordinates) — a kettő EGYMÁST KIZÁRJA,
// lásd a superRefine()-t lent. A geokódolást (geocodeAddress()) a hívó
// (app/api/admin/vedett-utvonal/search/route.ts) KIZÁRÓLAG akkor
// futtatja, ha `from` van jelen — fromCoordinates esetén a geokódolás
// TELJESEN KI VAN HAGYVA (spec: "NE próbálja geocodolni").
export const journeySearchSchema = z
  .object({
    from: z.string().min(2, "Az indulási hely megadása kötelező.").optional(),
    fromCoordinates: routeOriginCoordinatesSchema.optional(),
    to: z.string().min(2, "A célhely megadása kötelező."),
    departAt: z.string().datetime().optional(),
    weights: personalizationWeightsSchema,
  })
  .superRefine((data, ctx) => {
    const hasFrom = typeof data.from === "string" && data.from.trim().length >= 2;
    const hasFromCoordinates = Boolean(data.fromCoordinates);
    if (!hasFrom && !hasFromCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Az indulási hely megadása kötelező.",
        path: ["from"],
      });
    }
    if (hasFrom && hasFromCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Az indulási hely csak egyféleképpen adható meg (cím VAGY aktuális helyzet).",
        path: ["from"],
      });
    }
  });
