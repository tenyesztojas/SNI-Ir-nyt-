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
//
// A `to` UGYANEZT a mintát követi (Védett Hely „Navigálj oda” integráció,
// 2026-09-09): ha a felhasználó egy már ismert VédettSarok Védett Helyet
// választott úti célnak (lásd components/NavigateButton.tsx ->
// /vedett-utvonal deep link -> VedettUtvonalSearchForm KNOWN_PLACE
// destination állapot), a kliens a MÁR ISMERT koordinátát (toCoordinates)
// küldi — nincs felesleges, pontatlan eredményt is hozó Nominatim-
// geokódolás egy olyan helyre, amelynek a koordinátája már a VédettSarok
// adatbázisában megbízhatóan ismert. `toName` egy opcionális, tisztán
// megjelenítési célú label (a Védett Hely neve) — SOHA nem megy
// geokódolásra. Szabadszöveges célhely (to) esetén a viselkedés
// VÁLTOZATLAN: a hívó geocodeAddress()-t futtat rá.
export const journeySearchSchema = z
  .object({
    from: z.string().min(2, "Az indulási hely megadása kötelező.").optional(),
    fromCoordinates: routeOriginCoordinatesSchema.optional(),
    to: z.string().min(2, "A célhely megadása kötelező.").optional(),
    toCoordinates: routeOriginCoordinatesSchema.optional(),
    toName: z.string().trim().min(1).max(200).optional(),
    departAt: z.string().datetime().optional(),
    weights: personalizationWeightsSchema,
    // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C) — explicit,
    // opcionális felhasználói preferencia (lásd lib/vedett-route/types.ts
    // JourneySearchRequest.stepFreeRequired kommentje). Hiányzó/undefined
    // esetén a route.ts `?? false`-t alkalmaz — a mezőnek NINCS itt zod
    // .default()-je, hogy a hiányzó érték és az explicit `false` egyaránt
    // tisztán "false"-ként legyen kezelve, változatlan viselkedéssel.
    stepFreeRequired: z.boolean().optional(),
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

    const hasTo = typeof data.to === "string" && data.to.trim().length >= 2;
    const hasToCoordinates = Boolean(data.toCoordinates);
    if (!hasTo && !hasToCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A célhely megadása kötelező.",
        path: ["to"],
      });
    }
    if (hasTo && hasToCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A célhely csak egyféleképpen adható meg (cím VAGY ismert Védett Hely koordinátája).",
        path: ["to"],
      });
    }
  });

// Deep-link query paraméterek validációja (Védett Hely "Navigálj oda" ->
// /vedett-utvonal?name=...&lat=...&lon=..., 2026-09-09). A query paraméterek
// mindig STRING-ek, ezért a latitude/longitude-ot előbb számmá alakítjuk
// (Number(...) egy invalid stringre NaN-t ad, amit a meglévő
// latitudeSchema/longitudeSchema .min()/.max() ellenőrzése helyesen
// elutasít — nincs második, párhuzamos tartomány-ellenőrzés). Érvénytelen
// vagy hiányzó adat esetén a hívónak (app/vedett-utvonal/page.tsx) NULL-t
// kell visszaadnia, és a normál, üres keresőt kell megjelenítenie —
// SOSEM szabad crash-elnie egy hibás deep linktől.
export const routeDestinationDeepLinkSchema = z.object({
  name: z.string().trim().min(1).max(200),
  lat: z.preprocess((v) => Number(v), latitudeSchema),
  lon: z.preprocess((v) => Number(v), longitudeSchema),
});
