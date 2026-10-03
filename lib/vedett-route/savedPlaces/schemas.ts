// Mentett helyek — bemenet-validáció (zod). A display_name szabad szöveg
// (NEM enum): "Nagyi", "Edzés", "Orvos" stb. mind érvényes.

import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "@/lib/rest-points/schemas";

export const SAVED_PLACES_LIMIT = 20;
export const SAVED_PLACE_NAME_MAX = 60;
export const SAVED_PLACE_ADDRESS_MAX = 300;

export const savedPlaceDisplayNameSchema = z
  .string({ required_error: "A név megadása kötelező." })
  .trim()
  .min(1, "A név megadása kötelező.")
  .max(SAVED_PLACE_NAME_MAX, `A név legfeljebb ${SAVED_PLACE_NAME_MAX} karakter lehet.`);

export const savedPlaceCreateSchema = z
  .object({
    displayName: savedPlaceDisplayNameSchema,
    address: z
      .string({ required_error: "A cím megadása kötelező." })
      .trim()
      .min(1, "A cím megadása kötelező.")
      .max(SAVED_PLACE_ADDRESS_MAX, "A cím túl hosszú."),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export const savedPlaceRenameSchema = z.object({ displayName: savedPlaceDisplayNameSchema }).strict();

export type SavedPlaceCreateInput = z.infer<typeof savedPlaceCreateSchema>;
