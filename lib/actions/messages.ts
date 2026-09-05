"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConsentType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Anonimizált üzenetküldő (messages) — ÁSZF 7.6. pont
// GDPR: a Hely SEHOL nem látja a Felhasználó valós nevét / e-mail-jét
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Üzenet küldése értékelőtől → hely, vagy helytől → értékelő.
 * Küldés előtt ellenőrzi a consent_log táblát.
 */
export async function sendMessage(params: {
  reviewId: string | null;
  placeId: string;
  recipientUserId: string;
  text: string;
  senderRole: "place" | "reviewer";
}): Promise<{ error?: string }> {
  const { reviewId, placeId, recipientUserId, text, senderRole } = params;
  const trimmed = text.trim();
  if (trimmed.length < 2) return { error: "Az üzenet legalább 2 karakter legyen." };
  if (trimmed.length > 1000) return { error: "Az üzenet maximum 1000 karakter lehet." };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Ha a hely küld, ellenőrizze a consent_log-ot
  if (senderRole === "place" && reviewId) {
    const { data: consent } = await supabase
      .from("consent_log")
      .select("consent_type")
      .eq("review_id", reviewId)
      .eq("place_id", placeId)
      .is("revoked_at", null)
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!consent || consent.consent_type === "block") {
      return { error: "A felhasználó nem engedélyezte az üzenetküldést." };
    }
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("messages").insert({
    review_id: reviewId,
    place_id: placeId,
    sender_user_id: user.id,
    recipient_user_id: recipientUserId,
    sender_role: senderRole,
    text: trimmed,
  });

  if (error) return { error: "Nem sikerült az üzenet elküldése." };
  revalidatePath("/uzenet");
  return {};
}

/**
 * Válasz egy bejövő üzenetre (a recipientUserId automatikusan az eredeti küldő)
 */
export async function replyToMessage(
  originalMessageId: string,
  text: string
): Promise<{ error?: string }> {
  const trimmed = text.trim();
  if (trimmed.length < 2) return { error: "Az üzenet legalább 2 karakter legyen." };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Eredeti üzenet adatainak lekérése
  const { data: orig } = await supabase
    .from("messages")
    .select("review_id, place_id, sender_user_id, recipient_user_id, sender_role")
    .eq("id", originalMessageId)
    .single();

  if (!orig) return { error: "Az eredeti üzenet nem található." };

  // A válaszban a szerepek felcserélődnek
  const newSenderRole: "place" | "reviewer" =
    orig.sender_role === "place" ? "reviewer" : "place";
  const recipientUserId = orig.sender_user_id;

  return sendMessage({
    reviewId: orig.review_id,
    placeId: orig.place_id,
    recipientUserId,
    text: trimmed,
    senderRole: newSenderRole,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent kezelés — ÁSZF 7.6. és GDPR 3.1. pont
// ─────────────────────────────────────────────────────────────────────────────

export async function setConsent(params: {
  placeId: string;
  reviewId: string;
  consentType: ConsentType;
}): Promise<{ error?: string }> {
  const { placeId, reviewId, consentType } = params;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();

  // Előző consent visszavonása
  await adminClient
    .from("consent_log")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("place_id", placeId)
    .eq("review_id", reviewId)
    .is("revoked_at", null);

  // Új consent bejegyzés (block esetén is explicit rögzítjük)
  const { error } = await adminClient.from("consent_log").insert({
    user_id: user.id,
    place_id: placeId,
    review_id: reviewId,
    consent_type: consentType,
  });

  if (error) return { error: "Nem sikerült a beállítás mentése." };
  revalidatePath("/uzenet");
  return {};
}

/**
 * Hely tiltása — shorthand a "block" consent típushoz
 */
export async function blockPlace(
  placeId: string,
  reviewId: string
): Promise<{ error?: string }> {
  return setConsent({ placeId, reviewId, consentType: "block" });
}

/**
 * Üzenet olvasottnak jelölése
 */
export async function markMessageRead(
  messageId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("recipient_user_id", user.id);

  return {};
}
