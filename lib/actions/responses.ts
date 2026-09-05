"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";
import { autoModerateResponse } from "@/lib/autoModerate";

// ─────────────────────────────────────────────────────────────────────────────
// Nyilvános Válasz (place_responses) — ÁSZF 7.5. pont
// Csak ellenőrzött (verified claim) tulajdonos küldhet választ.
// RLS a DB-n is érvényesíti ezt.
// ─────────────────────────────────────────────────────────────────────────────

export async function submitPlaceResponse(
  reviewId: string,
  placeId: string,
  text: string
): Promise<{ error?: string; flagged?: boolean }> {
  const trimmed = text.trim();
  if (trimmed.length < 10) return { error: "A válasz legalább 10 karakter legyen." };
  if (trimmed.length > 2000) return { error: "A válasz maximum 2000 karakter lehet." };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Ellenőrzés: van-e verified claim ehhez a helyhez
  const { data: claim } = await supabase
    .from("place_claims")
    .select("id")
    .eq("place_id", placeId)
    .eq("claimant_user_id", user.id)
    .eq("status", "verified")
    .maybeSingle();

  if (!claim) {
    return { error: "Csak ellenőrzött tulajdonos írhat nyilvános választ." };
  }

  // Már van aktív válasz erre az értékelésre?
  const { data: existing } = await supabase
    .from("place_responses")
    .select("id")
    .eq("review_id", reviewId)
    .eq("status", "published")
    .maybeSingle();

  if (existing) {
    return { error: "Ehhez az értékeléshez már van aktív válasz." };
  }

  // Automatikus szűrő (PII-mintázat is)
  const mod = autoModerateResponse(trimmed);
  if (!mod.pass) {
    return { error: `A válasz nem felel meg a tartalmi előírásoknak: ${(mod as { reason: string }).reason}` };
  }

  const flagged = mod.flagged === true;
  const flagReason = flagged ? (mod as { flagReason: string }).flagReason : null;

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("place_responses").insert({
    review_id: reviewId,
    place_id: placeId,
    responder_user_id: user.id,
    text: trimmed,
    status: "published",
    flagged_for_review: flagged,
    flag_reason: flagReason,
  });

  if (error) return { error: "Nem sikerült a válasz közzététele." };

  revalidatePath(`/helyek`);
  return { flagged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Válasz eltávolítása — admin vagy bejelentés alapján
// ─────────────────────────────────────────────────────────────────────────────

export async function removePlaceResponse(
  responseId: string,
  reportId: string | null,
  reason: string
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("place_responses")
    .update({ status: "removed_by_admin" })
    .eq("id", responseId);

  if (error) return { error: "Nem sikerült az eltávolítás." };

  if (reportId) {
    await adminClient
      .from("reports")
      .update({ status: "resolved", resolution_note: reason })
      .eq("id", reportId);
  }

  revalidatePath("/admin/jelzesek");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Hely tulajdonosa törölheti saját válaszát
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteOwnResponse(
  responseId: string,
  placeId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Csak akkor törölheti, ha ő küldte
  const { error } = await supabase
    .from("place_responses")
    .update({ status: "removed_by_admin" })
    .eq("id", responseId)
    .eq("responder_user_id", user.id);

  if (error) return { error: "Nem sikerült a törlés." };
  revalidatePath(`/helyek`);
  return {};
}
