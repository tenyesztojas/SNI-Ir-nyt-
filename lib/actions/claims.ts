"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

// ─────────────────────────────────────────────────────────────────────────────
// Hely-igénylés (place_claims) — ÁSZF 7. pont
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Igénylés benyújtása: a felhasználó saját e-mail-jét adja meg, azt küldjük
 * visszaigazolóra. Ha a domain egyezik a hely website-jával, azonnal auto-verify.
 */
export async function submitClaim(
  placeId: string,
  businessEmail: string
): Promise<{ error?: string; autoVerified?: boolean }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Létező aktív igénylés ellenőrzése
  const { data: existing } = await supabase
    .from("place_claims")
    .select("id, status")
    .eq("place_id", placeId)
    .eq("claimant_user_id", user.id)
    .in("status", ["pending", "verified"])
    .maybeSingle();

  if (existing) {
    if (existing.status === "verified") return { error: "Ezt a helyet már sikeresen igényelted." };
    return { error: "Már van folyamatban lévő igénylésed ehhez a helyhez." };
  }

  // Hely website domain-jének lekérése
  const { data: place } = await supabase
    .from("places")
    .select("website, slug")
    .eq("id", placeId)
    .single();

  const token = randomBytes(32).toString("hex");
  const emailDomain = businessEmail.split("@")[1]?.toLowerCase() ?? "";

  // Auto-verify ha a domain egyezik a hely website-jával
  let websiteDomain = "";
  if (place?.website) {
    try {
      const url = place.website.startsWith("http") ? place.website : `https://${place.website}`;
      websiteDomain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore parse error */ }
  }

  const autoVerify = emailDomain.length > 0 && emailDomain === websiteDomain;

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("place_claims").insert({
    place_id: placeId,
    claimant_user_id: user.id,
    verification_method: autoVerify ? "domain_match" : "email_token",
    verification_data: businessEmail,
    verification_token: autoVerify ? null : token,
    status: autoVerify ? "verified" : "pending",
    verified_at: autoVerify ? new Date().toISOString() : null,
  });

  if (error) return { error: "Nem sikerült az igénylés benyújtása." };

  if (!autoVerify) {
    // TODO: token e-mail küldése (pl. Resend/Mailgun)
    // await sendVerificationEmail(businessEmail, token, placeId);
    // Ideiglenesen: konzolra írjuk a tokent (dev)
    console.log(`[claim-verify] place=${placeId} token=${token} email=${businessEmail}`);
  } else {
    revalidatePath(`/helyek/${place?.slug ?? placeId}`);
  }

  return { autoVerified: autoVerify };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: igénylés jóváhagyása / elutasítása
// ─────────────────────────────────────────────────────────────────────────────

export async function approveClaim(
  claimId: string
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("place_claims")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) return { error: "Nem sikerült a jóváhagyás." };
  revalidatePath("/admin/igenylesek");
  return {};
}

export async function rejectClaim(
  claimId: string,
  reason?: string
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("place_claims")
    .update({ status: "rejected", reject_reason: reason ?? null })
    .eq("id", claimId);

  if (error) return { error: "Nem sikerült az elutasítás." };
  revalidatePath("/admin/igenylesek");
  return {};
}
