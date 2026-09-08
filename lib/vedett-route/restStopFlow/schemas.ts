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
//
// Sprint E.2 hotfix (2026-09-08, valódi Vercel Preview 404 root cause
// audit): "EXTERNAL REST POINT RESOLUTION MISMATCH" — a korábbi, sima
// `restPointId: string` mező forrás-független volt, ezért a szerver
// mindig a rest_points DB táblában (KIZÁRÓLAG USER forrás) próbálta
// feloldani egy OSM/VEDETT_SAROK candidate id-jét is, ami garantáltan
// 404-et adott. Mostantól a kliens EXPLICIT módon jelzi a forrást
// (`source`), forrásonként eltérő, szigorúan validált mezőkkel — lásd
// resolveRestPoint.ts "AUTHORITATIVE SOURCE" szakasza az egyes ágak
// indoklásáért.
//
// Biztonsági validáció forrásonként (spec 5. pont):
//  - USER: az id-n kívül semmilyen más klienstől kapott mezőt (koordináta,
//    név) NEM fogadunk el/használunk fel — a szerver mindig a saját,
//    RLS-scope-olt rest_points sorból olvas.
//  - VEDETT_SAROK: az id formátuma explicit ellenőrzött
//    ("vedett-sarok:<placeId>" prefix) — a koordinátát/nevet itt sem a
//    klienstől fogadjuk el, mindig a "places" táblából olvasunk.
//  - OSM: az id formátuma explicit ellenőrzött (Overpass elem-azonosító
//    formátum, "osm:<node|way|relation>/<szám>"), a név hossza korlátozott,
//    a koordináták a szokásos lat/lon tartományra validáltak.
const userRestPointRefSchema = z.object({
  source: z.literal("USER"),
  id: z.string().trim().min(1, "A pihenőpont azonosítója kötelező.").max(200),
});

const vedettSarokRestPointRefSchema = z.object({
  source: z.literal("VEDETT_SAROK"),
  id: z
    .string()
    .trim()
    .min(1, "A pihenőpont azonosítója kötelező.")
    .max(200)
    .regex(/^vedett-sarok:.+$/, "Érvénytelen VédettSarok pihenőpont-azonosító."),
});

const osmRestPointRefSchema = z.object({
  source: z.literal("OSM"),
  id: z
    .string()
    .trim()
    .min(1, "A pihenőpont azonosítója kötelező.")
    .max(200)
    .regex(/^osm:(node|way|relation)\/\d+$/, "Érvénytelen OSM pihenőpont-azonosító."),
  name: z.string().trim().min(1, "A pihenőpont nevének megadása kötelező.").max(200),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const restPointRefSchema = z.discriminatedUnion("source", [
  userRestPointRefSchema,
  vedettSarokRestPointRefSchema,
  osmRestPointRefSchema,
]);
export type RestPointRef = z.infer<typeof restPointRefSchema>;

export const restStopRouteToRestPointSchema = z.object({
  currentPosition: coordinateSchema,
  restPoint: restPointRefSchema,
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
