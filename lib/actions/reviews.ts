"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewSchema, ReviewInput } from "@/lib/schemas";
import { isCurrentUserAdmin } from "@/lib/data";
import { sendAdminPush } from "@/lib/push";
import { autoModerateReview } from "@/lib/autoModerate";

// ─────────────────────────────────────────────────────────────────────────────
// submitReview — automatikus közzététel, emberi jóváhagyás nélkül (ÁSZF 3. pont)
// ─────────────────────────────────────────────────────────────────────────────
export async function submitReview(
  placeId: string,
  input: ReviewInput,
  images: string[] = []
): Promise<{ error?: string; rejectionReason?: string }> {
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

  // Automatikus technikai ellenőrzés — bináris, determinisztikus döntés
  // SOHA nem vizsgálja a tartalom pozitív/negatív hangvételét.
  const modResult = autoModerateReview({
    title: data.title,
    positiveText: data.positiveText,
    warningText: data.warningText,
  });

  if (!modResult.pass) {
    // Automatikus elutasítás — azonnali, konkrét indoklással (ÁSZF 4. pont / DSA 17. cikk)
    return {
      error: "Az értékelés automatikus technikai ellenőrzésen nem ment át.",
      rejectionReason: modResult.reason,
    };
  }

  // Közzététel — automatikus, emberi beavatkozás nélkül (adminClient: RLS bypass)
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("reviews").insert({
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
    status: "published",
    flagged_for_review: modResult.flagged,
    flag_reason: modResult.flagged ? modResult.flagReason : null,
  });

  if (error) {
    return { error: "Nem sikerült az értékelés beküldése. Próbáld újra." };
  }

  if (modResult.flagged) {
    // Gyanús mintázat esetén admin értesítés (de a tartalom már közzé van téve)
    const { data: place } = await supabase.from("places").select("name").eq("id", placeId).single();
    await sendAdminPush(
      "Megjelölt értékelés közzétéve",
      `${place?.name ?? placeId} — automatikusan közzétéve, de gyanús mintázat (${modResult.flagReason})`,
      "/admin/ertekelesek"
    );
  }

  revalidatePath(`/helyek`);
  revalidatePath("/profil");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// removeReview — UTÓLAGOS, bejelentés-alapú eltávolítás (ÁSZF 7. pont)
// Ez az egyetlen pont ahol emberi döntés érinti egy közzétett értékelés sorsát.
// Csak admin végezheti, és minden eltávolítás audit logba kerül.
// ─────────────────────────────────────────────────────────────────────────────
export async function removeReview(
  reviewId: string,
  reportId: string | null,
  reason: string
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const supabase = createClient();

  // 1. Értékelés eltávolítása (státusz: removed)
  const { error: updateErr } = await supabase
    .from("reviews")
    .update({ status: "removed" })
    .eq("id", reviewId);
  if (updateErr) return { error: "Nem sikerült eltávolítani." };

  // 2. Audit log bejegyzés
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("moderation_log").insert({
    content_type: "review",
    content_id: reviewId,
    admin_id: userData.user?.id,
    report_id: reportId,
    action: "removed",
    reason,
  });

  // 3. Bejelentés lezárása, ha van
  if (reportId) {
    await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
  }

  revalidatePath("/admin/ertekelesek");
  revalidatePath("/admin/jelzesek");
  revalidatePath("/helyek");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// submitAppeal — fellebbezés automatikus elutasítás ellen (DSA 17. cikk)
// ─────────────────────────────────────────────────────────────────────────────
export async function submitAppeal(input: {
  contentType: "review" | "place";
  contentId: string | null; // null ha az elutasítás miatt nem jött létre rekord
  rejectionReason: string;
  userExplanation: string;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Fellebbezés beküldéséhez be kell jelentkezned." };

  const { error } = await supabase.from("appeals").insert({
    content_type: input.contentType,
    content_id: input.contentId,
    user_id: userData.user.id,
    rejection_reason: input.rejectionReason,
    user_explanation: input.userExplanation,
    status: "new",
  });

  if (error) return { error: "Nem sikerült a fellebbezés beküldése." };

  await sendAdminPush(
    "Új fellebbezés érkezett",
    `${input.contentType} — automatikus elutasítás ellen`,
    "/admin/ertekelesek"
  );

  return {};
}
