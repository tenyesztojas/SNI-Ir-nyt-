"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/data";

async function requireAdmin() {
  if (!(await isCurrentUserAdmin())) {
    throw new Error("Nincs admin jogosultságod ehhez a művelethez.");
  }
}

/** Értékelés jóváhagyása: status = approved, published_at = now */
export async function approveReview(reviewId: string): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ status: "approved", published_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) throw error;
  revalidatePath("/admin/ertekelesek");
  revalidatePath("/helyek", "layout");
}

/** Értékelés elutasítása moderátori megjegyzéssel */
export async function rejectReview(
  reviewId: string,
  adminNote?: string
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ status: "rejected", admin_note: adminNote ?? null })
    .eq("id", reviewId);
  if (error) throw error;
  revalidatePath("/admin/ertekelesek");
}

/**
 * Értékelés szövegének eltávolítása (redacted):
 * a rekord megmarad statisztikai célból, de a szöveg törlődik.
 */
export async function redactReview(
  reviewId: string,
  adminNote?: string
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      status: "redacted",
      positive_text: "[A tartalom moderátor által eltávolítva]",
      warning_text: null,
      title: "[Eltávolítva]",
      admin_note: adminNote ?? null,
    })
    .eq("id", reviewId);
  if (error) throw error;
  revalidatePath("/admin/ertekelesek");
  revalidatePath("/helyek", "layout");
}

/** Felhasználó felfüggesztése */
export async function suspendUser(
  userId: string,
  note?: string
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_suspended: true, moderation_note: note ?? null })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

/** Felfüggesztés feloldása */
export async function unsuspendUser(userId: string): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_suspended: false, moderation_note: null })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

/** Fraud-jelzés állítása */
export async function setFraudFlag(
  userId: string,
  flag: boolean
): Promise<void> {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ fraud_risk_flag: flag })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}
