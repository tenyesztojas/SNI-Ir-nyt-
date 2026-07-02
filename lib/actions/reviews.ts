"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reviewSchema, ReviewInput } from "@/lib/schemas";
import { isCurrentUserAdmin } from "@/lib/data";

export async function submitReview(
  placeId: string,
  input: ReviewInput,
  images: string[] = []
): Promise<{ error?: string }> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Hibás vagy hiányos adatok." };
  }
  const data = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { error: "Az értékelés beküldéséhez be kell jelentkezned." };
  }

  const { error } = await supabase.from("reviews").insert({
    place_id: placeId,
    author_id: user.id,
    title: data.title,
    overall_rating: data.overallRating,
    noise_rating: data.noiseRating,
    crowd_rating: data.crowdRating,
    staff_empathy_rating: data.staffRating,
    safety_rating: data.safetyRating,
    quiet_space_rating: data.quietSpaceRating,
    positive_text: data.positiveText,
    warning_text: data.warningText || null,
    would_return: data.wouldReturn === "igen",
    images: images.length > 0 ? images : null,
    status: "pending",
  });

  if (error) {
    return { error: "Nem sikerült az értékelés beküldése. Próbáld újra." };
  }

  revalidatePath("/admin/ertekelesek");
  revalidatePath("/profil");
  return {};
}

export async function decideReview(
  reviewId: string,
  decision: "approved" | "rejected"
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    return { error: "Nincs jogosultságod ehhez a művelethez." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("reviews").update({ status: decision }).eq("id", reviewId);

  if (error) {
    return { error: "Nem sikerült a státusz frissítése." };
  }

  revalidatePath("/admin/ertekelesek");
  revalidatePath("/helyek");
  return {};
}
