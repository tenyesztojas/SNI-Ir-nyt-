"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCityCoordinates, BUDAPEST_DISTRICT_COORDINATES } from "@/lib/community/types";
import type { CommunityRole, MessagePrivacy } from "@/lib/community/types";

// ── Nominatim geocoding (szerver oldalon, API kulcs nélkül) ──
async function geocodeWithNominatim(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=hu&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VedettSarok/1.0 (holvay.csaba@gmail.com)" },
      next: { revalidate: 86400 }, // 24h cache
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // silent fail
  }
  return null;
}

// ── Közelítő koordináta kiszámítása (lokális szótár + Nominatim fallback) ──
async function getApproximateCoords(
  city: string | undefined,
  district: string | undefined
): Promise<{ lat: number | null; lng: number | null }> {
  const cityNorm = city?.trim() ?? "";
  const districtNorm = district?.trim() ?? "";

  // Budapest kerület — lokális szótárból
  if (cityNorm.toLowerCase() === "budapest" && districtNorm) {
    const distEntry = Object.entries(BUDAPEST_DISTRICT_COORDINATES).find(
      ([k]) => k.toLowerCase() === districtNorm.toLowerCase()
    );
    if (distEntry) return distEntry[1];
  }

  // Lokális szótár (leggyakoribb városok, gyors)
  if (cityNorm) {
    const local = findCityCoordinates(cityNorm);
    if (local) return local;
  }

  // Nominatim fallback — minden magyarországi település
  if (cityNorm) {
    const query = districtNorm
      ? `${districtNorm} kerület, ${cityNorm}, Magyarország`
      : `${cityNorm}, Magyarország`;
    const nominatim = await geocodeWithNominatim(query);
    if (nominatim) return nominatim;
  }

  return { lat: null, lng: null };
}

// ── Push értesítés küldése egy usernek ──────────────────────
async function sendPushToUser(userId: string, title: string, body: string, url: string) {
  try {
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", userId);
    if (!subs?.length) return;

    const webpush = (await import("web-push")).default;
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;

    webpush.setVapidDetails("mailto:holvay.csaba@gmail.com", pub, priv);
    const payload = JSON.stringify({ title, body, url });
    await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
      )
    );
  } catch {
    // Push hiba nem állítja meg a fő műveletet
  }
}

// ── Értesítés létrehozása az adatbázisban ───────────────────
async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  relatedUserId?: string;
  relatedConnectionId?: string;
  relatedThreadId?: string;
}) {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    related_user_id: params.relatedUserId,
    related_connection_id: params.relatedConnectionId,
    related_thread_id: params.relatedThreadId,
  });
}

// ── Profil létrehozása / frissítése ──────────────────────────
export async function upsertCommunityProfile(formData: {
  display_name: string;
  role: CommunityRole;
  intro_text?: string;
  profile_image_url?: string;
  avatar_type?: string;
  county?: string;
  city?: string;
  district?: string;
  map_display_enabled?: boolean;
  child_age_group?: string[];
  neurodivergence_tags?: string[];
  connection_goals?: string[];
  accepts_friend_requests?: boolean;
  accepts_first_message?: MessagePrivacy;
  push_friend_requests?: boolean;
  push_messages?: boolean;
  push_connection_accepted?: boolean;
  profile_visibility?: string;
}): Promise<{ ok: boolean; error?: string; profileId?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };

  const coords = await getApproximateCoords(formData.city, formData.district);

  const payload = {
    user_id: user.id,
    display_name: formData.display_name,
    role: formData.role,
    intro_text: formData.intro_text ?? null,
    profile_image_url: formData.profile_image_url ?? null,
    avatar_type: formData.avatar_type ?? "icon",
    county: formData.county ?? null,
    city: formData.city ?? null,
    district: formData.district ?? null,
    map_display_enabled: formData.map_display_enabled ?? true,
    approximate_lat: coords.lat,
    approximate_lng: coords.lng,
    child_age_group: formData.child_age_group ?? [],
    neurodivergence_tags: formData.neurodivergence_tags ?? [],
    connection_goals: formData.connection_goals ?? [],
    accepts_friend_requests: formData.accepts_friend_requests ?? true,
    accepts_first_message: formData.accepts_first_message ?? "connection",
    push_friend_requests: formData.push_friend_requests ?? true,
    push_messages: formData.push_messages ?? true,
    push_connection_accepted: formData.push_connection_accepted ?? true,
    profile_visibility: formData.profile_visibility ?? "active",
    status: "active",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("community_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/kozosseg");
  revalidatePath("/kozosseg/profilom");
  return { ok: true, profileId: data.id };
}

// ── Profil elrejtése / törlése ───────────────────────────────
export async function setCommunityProfileVisibility(
  visibility: "active" | "hidden"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };

  const status = visibility === "hidden" ? "hidden_by_user" : "active";
  const { error } = await supabase
    .from("community_profiles")
    .update({ profile_visibility: visibility, status, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/kozosseg/profilom");
  return { ok: true };
}

// ── Kapcsolódási kérés küldése ────────────────────────────────
export async function sendConnectionRequest(
  receiverUserId: string,
  introMessage?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };
  if (user.id === receiverUserId) return { ok: false, error: "Magadnak nem küldhetsz jelölést." };

  // Ellenőrzés: fogad-e a másik fél jelölést?
  const { data: receiverProfile } = await supabase
    .from("community_profiles")
    .select("accepts_friend_requests, push_friend_requests, display_name")
    .eq("user_id", receiverUserId)
    .single();

  if (!receiverProfile?.accepts_friend_requests) {
    return { ok: false, error: "Ez a felhasználó nem fogad jelöléseket." };
  }

  // Saját profil displayName-hez
  const { data: myProfile } = await supabase
    .from("community_profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .single();

  const { data: conn, error } = await supabase
    .from("community_connections")
    .insert({
      requester_user_id: user.id,
      receiver_user_id: receiverUserId,
      status: "pending",
      intro_message: introMessage ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Már küldtél jelölést ennek a tagnak." };
    return { ok: false, error: error.message };
  }

  // Értesítés + push
  const senderName = myProfile?.display_name ?? "Valaki";
  await createNotification({
    userId: receiverUserId,
    type: "connection_request",
    title: "Új kapcsolódási kérés",
    body: `${senderName} kapcsolódni szeretne veled.`,
    relatedUserId: user.id,
    relatedConnectionId: conn.id,
  });

  if (receiverProfile.push_friend_requests) {
    await sendPushToUser(
      receiverUserId,
      "Új kapcsolódási kérés",
      `${senderName} kapcsolódni szeretne veled a VédettSarok Közösségben.`,
      "/kozosseg/kapcsolataim"
    );
  }

  revalidatePath("/kozosseg/kapcsolataim");
  return { ok: true };
}

// ── Kapcsolati kérés megválaszolása ──────────────────────────
export async function respondToConnection(
  connectionId: string,
  response: "accepted" | "declined"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };

  const { data: conn, error } = await supabase
    .from("community_connections")
    .update({
      status: response,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("receiver_user_id", user.id)
    .eq("status", "pending")
    .select("requester_user_id")
    .single();

  if (error || !conn) return { ok: false, error: error?.message ?? "Nem sikerült." };

  if (response === "accepted") {
    // Chat szál létrehozása
    await supabase.from("community_threads").insert({
      participant_1_user_id: conn.requester_user_id,
      participant_2_user_id: user.id,
      connection_id: connectionId,
    });

    // Értesítés a kérelmezőnek
    const { data: myProfile } = await supabase
      .from("community_profiles")
      .select("display_name, push_connection_accepted")
      .eq("user_id", user.id)
      .single();

    await createNotification({
      userId: conn.requester_user_id,
      type: "connection_accepted",
      title: "Kapcsolódási kérés elfogadva",
      body: `${myProfile?.display_name ?? "Valaki"} elfogadta a kapcsolódási kérésedet.`,
      relatedUserId: user.id,
      relatedConnectionId: connectionId,
    });

    if (myProfile?.push_connection_accepted) {
      await sendPushToUser(
        conn.requester_user_id,
        "Kapcsolódási kérés elfogadva",
        `${myProfile?.display_name ?? "Valaki"} elfogadta a kérésedet.`,
        "/kozosseg/kapcsolataim"
      );
    }
  }

  revalidatePath("/kozosseg/kapcsolataim");
  return { ok: true };
}

// ── Üzenet küldése ────────────────────────────────────────────
export async function sendMessage(
  threadId: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  if (!body.trim()) return { ok: false, error: "Az üzenet nem lehet üres." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };

  const { data: thread } = await supabase
    .from("community_threads")
    .select("participant_1_user_id, participant_2_user_id")
    .eq("id", threadId)
    .single();

  if (!thread) return { ok: false, error: "Szál nem található." };
  const otherId =
    thread.participant_1_user_id === user.id
      ? thread.participant_2_user_id
      : thread.participant_1_user_id;

  const { error } = await supabase.from("community_messages").insert({
    thread_id: threadId,
    sender_user_id: user.id,
    body: body.trim(),
  });
  if (error) return { ok: false, error: error.message };

  // last_message_at frissítése
  await supabase
    .from("community_threads")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", threadId);

  // Push a másik félnek
  const { data: myProfile } = await supabase
    .from("community_profiles")
    .select("display_name, push_messages")
    .eq("user_id", user.id)
    .single();

  const { data: otherProfile } = await supabase
    .from("community_profiles")
    .select("push_messages")
    .eq("user_id", otherId)
    .single();

  await createNotification({
    userId: otherId,
    type: "new_message",
    title: "Új üzenet",
    body: `${myProfile?.display_name ?? "Valaki"} üzenetet küldött.`,
    relatedUserId: user.id,
    relatedThreadId: threadId,
  });

  if (otherProfile?.push_messages) {
    await sendPushToUser(
      otherId,
      "Új üzenet",
      `${myProfile?.display_name ?? "Valaki"} üzenetet küldött a VédettSarok Közösségben.`,
      `/kozosseg/uzenetek/${threadId}`
    );
  }

  revalidatePath(`/kozosseg/uzenetek/${threadId}`);
  return { ok: true };
}

// ── Üzenetek olvasottra állítása ─────────────────────────────
export async function markThreadMessagesRead(threadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("community_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_user_id", user.id)
    .is("read_at", null);
}

// ── Értesítések olvasottnak jelölése ─────────────────────────
export async function markAllNotificationsRead() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/ertesitesek");
}

// ── Felhasználó tiltása ───────────────────────────────────────
export async function blockUser(targetUserId: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase.from("community_connections")
    .upsert({
      requester_user_id: user.id,
      receiver_user_id: targetUserId,
      status: "blocked",
      updated_at: new Date().toISOString(),
    }, { onConflict: "requester_user_id,receiver_user_id" });

  revalidatePath("/kozosseg");
  return { ok: true };
}

// ── Bejelentés küldése ────────────────────────────────────────
export async function submitReport(params: {
  reportedUserId?: string;
  reportedProfileId?: string;
  reportedMessageId?: string;
  reason: string;
  description?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nem vagy bejelentkezve." };

  const { error } = await supabase.from("community_reports").insert({
    reporter_user_id: user.id,
    reported_user_id: params.reportedUserId ?? null,
    reported_profile_id: params.reportedProfileId ?? null,
    reported_message_id: params.reportedMessageId ?? null,
    reason: params.reason,
    description: params.description ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Admin: profil státusz módosítása ─────────────────────────
export async function adminSetProfileStatus(
  profileId: string,
  status: "active" | "suspended" | "deleted"
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  await admin
    .from("community_profiles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  revalidatePath("/admin/kozosseg");
  return { ok: true };
}

// ── Admin: jelentés lezárása ──────────────────────────────────
export async function adminResolveReport(
  reportId: string,
  adminNote?: string
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  await admin
    .from("community_reports")
    .update({
      status: "resolved",
      admin_note: adminNote ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  revalidatePath("/admin/kozosseg/jelentesek");
  return { ok: true };
}
