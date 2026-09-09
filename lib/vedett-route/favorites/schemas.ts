// Kedvenc útvonalak (VÉDETT ÚTVONAL — Kedvenc Útvonalak feladat,
// 2026-09-09) — bemenet-validáció (zod), ugyanazt a mintát követve, mint
// lib/rest-points/schemas.ts és lib/vedett-route/schemas.ts.
//
// FONTOS: ez a modul NEM ismétli meg a koordináta-tartomány ellenőrzést —
// a MEGLÉVŐ latitudeSchema/longitudeSchema-t importálja a
// lib/rest-points/schemas.ts-ből (ugyanaz a minta, mint
// lib/vedett-route/schemas.ts routeOriginCoordinatesSchema-ja).

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "@/lib/rest-points/schemas";

// A szenzoros prioritás belső mappingje (0/1/2) — lásd
// VedettUtvonalSearchForm.tsx SENSORY_PRIORITY_LEVELS — NEM módosult, itt
// csak a kötelező, pontosan-0/1/2 validációt adjuk hozzá a mentéshez
// (a keresési kérésnél használt personalizationWeightsSchema -ban ezek a
// mezők opcionálisak és folytonosak lehetnek — a kedvencnél MINDIG
// mind a 6 kulcs kötelező, és MINDIG egész 0/1/2, mert a slider lépésköze
// erre szűkült).
const weightValueSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const favoriteWeightsSchema = z.object({
  transfers: weightValueSchema,
  modeSwitches: weightValueSchema,
  underground: weightValueSchema,
  walking: weightValueSchema,
  duration: weightValueSchema,
  waiting: weightValueSchema,
});

// Strukturált cím — UGYANAZ a három mező, mint a
// VedettUtvonalSearchForm.tsx RouteOrigin/RouteDestination MANUAL ágán
// (Város / Irányítószám vagy kerület / Utca, házszám). Mindhárom kötelező
// — ugyanaz az invariáns, mint a kliens oldali isManualAddressComplete().
export const favoriteStructuredAddressSchema = z.object({
  city: z.string().trim().min(1, "A város megadása kötelező.").max(120),
  districtOrPostalCode: z.string().trim().min(1, "Az irányítószám vagy kerület megadása kötelező.").max(60),
  street: z.string().trim().min(1, "Az utca, házszám megadása kötelező.").max(200),
});

// Ismert Védett Hely célpont (a Védett Hely "Navigálj oda" -> Védett
// Útvonal integráció KNOWN_PLACE módjának megfelelően) — a koordináta már
// ismert, NEM kell újra-geokódolni.
export const favoriteKnownPlaceSchema = z.object({
  name: z.string().trim().min(1, "A hely nevének megadása kötelező.").max(200),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  placeId: z.string().trim().min(1).max(200).optional(),
});

export const favoriteRouteCreateSchema = z
  .object({
    // Ha a felhasználó nem ír nevet, a hívó (queries.ts
    // buildDefaultFavoriteName()) determinisztikus javaslatot generál —
    // NEM AI-alapú, egyszerű "[induló] → [cél]" string-összeállítás.
    name: z.string().trim().max(120).optional(),
    originMode: z.enum(["MANUAL", "CURRENT_LOCATION"]),
    originManual: favoriteStructuredAddressSchema.optional(),
    destinationMode: z.enum(["MANUAL", "KNOWN_PLACE"]),
    destinationManual: favoriteStructuredAddressSchema.optional(),
    destinationKnownPlace: favoriteKnownPlaceSchema.optional(),
    weights: favoriteWeightsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.originMode === "MANUAL" && !data.originManual) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hiányzik az indulási cím.", path: ["originManual"] });
    }
    if (data.originMode === "CURRENT_LOCATION" && data.originManual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "\"Aktuális helyzetem\" induló mód esetén nem adható meg manuális cím (GPS privacy — lásd migráció).",
        path: ["originManual"],
      });
    }
    if (data.destinationMode === "MANUAL" && !data.destinationManual) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hiányzik a célcím.", path: ["destinationManual"] });
    }
    if (data.destinationMode === "MANUAL" && data.destinationKnownPlace) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MANUAL célhely esetén nem adható meg ismert hely adat.",
        path: ["destinationKnownPlace"],
      });
    }
    if (data.destinationMode === "KNOWN_PLACE" && !data.destinationKnownPlace) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hiányzik az ismert hely adata.", path: ["destinationKnownPlace"] });
    }
    if (data.destinationMode === "KNOWN_PLACE" && data.destinationManual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ismert hely célpont esetén nem adható meg manuális cím.",
        path: ["destinationManual"],
      });
    }
  });

export const favoriteRouteRenameSchema = z.object({
  name: z.string().trim().min(1, "A kedvenc útvonal nevének megadása kötelező.").max(120),
});

export type FavoriteRouteCreateInput = z.infer<typeof favoriteRouteCreateSchema>;
export type FavoriteRouteRenameInput = z.infer<typeof favoriteRouteRenameSchema>;
export type FavoriteWeights = z.infer<typeof favoriteWeightsSchema>;
export type FavoriteStructuredAddress = z.infer<typeof favoriteStructuredAddressSchema>;
export type FavoriteKnownPlace = z.infer<typeof favoriteKnownPlaceSchema>;
