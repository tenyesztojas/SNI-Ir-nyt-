import { z } from "zod";

export const ratingSchema = z
  .number({ invalid_type_error: "Kötelező megadni." })
  .min(1, "1 és 5 között adj értéket.")
  .max(5, "1 és 5 között adj értéket.");

export const newPlaceSchema = z.object({
  name: z.string().min(2, "Add meg a hely nevét."),
  category: z.string().min(1, "Válassz kategóriát."),
  address: z.string().min(3, "Add meg a pontos címet."),
  city: z.string().min(2, "Add meg a települést."),
  website: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  description: z.string().min(10, "Írj legalább egy rövid, pár mondatos leírást."),
  whyFriendly: z.string().min(10, "Írd le röviden, miért tartod autizmus/SNI-barátnak."),
  ownExperience: z.string().min(10, "Írd le röviden a saját tapasztalatodat."),
  noiseRating: ratingSchema,
  crowdRating: ratingSchema,
  staffRating: ratingSchema,
  safetyRating: ratingSchema,
  quietSpaceRating: ratingSchema,
  wouldRecommend: z.enum(["igen", "nem"], { errorMap: () => ({ message: "Válassz egy opciót." }) }),
});

export type NewPlaceInput = z.infer<typeof newPlaceSchema>;

export const reviewSchema = z.object({
  title: z.string().min(3, "Adj rövid címet az értékelésnek."),
  overallRating: ratingSchema,
  noiseRating: ratingSchema,
  crowdRating: ratingSchema,
  staffRating: ratingSchema,
  safetyRating: ratingSchema,
  quietSpaceRating: ratingSchema,
  positiveText: z.string().min(5, "Írd le, mi volt jó."),
  warningText: z.string().optional().or(z.literal("")),
  wouldReturn: z.enum(["igen", "nem"], { errorMap: () => ({ message: "Válassz egy opciót." }) }),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export const reportSchema = z.object({
  placeId: z.string().uuid("Hibás hely-azonosító."),
  reportType: z.enum(["hibas_adat", "nem_mukodik", "nem_megfelelo_tartalom", "egyeb"], {
    errorMap: () => ({ message: "Válassz típust." }),
  }),
  description: z.string().min(5, "Írd le röviden, mi a probléma."),
});

export type ReportInput = z.infer<typeof reportSchema>;
