// VédettSarok Közösség — szerver oldali adathozzáférés
// FONTOS: user_private_lat és user_private_lng soha nem kerül lekérdezésbe!

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CommunityProfile,
  CommunityConnection,
  CommunityThread,
  CommunityMessage,
  Notification,
  CommunityHelpSettings,
  CommunityUserReport,
  ReportAuditLogEntry,
  ReportAppeal,
} from "./types";

// Biztonságos oszloplista — user_private_lat/lng szándékosan kihagyva
const SAFE_PROFILE_COLS = `
  id, user_id, display_name, role, profile_image_url, avatar_type,
  intro_text, country, county, city, district, map_display_enabled,
  approximate_lat, approximate_lng, use_location_for_nearby,
  child_age_group, neurodivergence_tags, connection_goals,
  accepts_friend_requests, accepts_first_message,
  push_friend_requests, push_messages, push_connection_accepted,
  profile_visibility, status, created_at, updated_at
`.trim();

// ── Saját profil ──────────────────────────────────────────────
export async function getOwnCommunityProfile(): Promise<CommunityProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("community_profiles")
    .select(SAFE_PROFILE_COLS)
    .eq("user_id", user.id)
    .maybeSingle();

  return data as CommunityProfile | null;
}

// ── Aktív tagok listája (keresés/térkép) ─────────────────────
export async function getActiveCommunityMembers(filters?: {
  city?: string;
  county?: string;
  district?: string;
  role?: string;
  goal?: string;
}): Promise<CommunityProfile[]> {
  const supabase = await createClient();

  let query = supabase
    .from("community_profiles")
    .select(SAFE_PROFILE_COLS)
    .eq("status", "active")
    .eq("profile_visibility", "active");

  if (filters?.city) query = query.eq("city", filters.city);
  if (filters?.county) query = query.eq("county", filters.county);
  if (filters?.district) query = query.eq("district", filters.district);
  if (filters?.role) query = query.eq("role", filters.role);
  if (filters?.goal) query = query.contains("connection_goals", [filters.goal]);

  const { data } = await query.order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as unknown as CommunityProfile[];
}

// ── Egy tag profilja (nyilvános) ──────────────────────────────
export async function getCommunityProfileById(id: string): Promise<CommunityProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_profiles")
    .select(SAFE_PROFILE_COLS)
    .eq("id", id)
    .eq("status", "active")
    .eq("profile_visibility", "active")
    .maybeSingle();
  return data as CommunityProfile | null;
}

// ── Kapcsolatok ───────────────────────────────────────────────
export async function getMyConnections(): Promise<CommunityConnection[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("community_connections")
    .select("*")
    .or(`requester_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  if (!data) return [];

  // A másik fél profilját mindig a current user szempontjából töltjük be
  // + deduplikáció: ha ugyanaz a pár kétszer szerepel, csak a legfrissebbet tartjuk meg
  const seenOtherIds = new Set<string>();
  const deduped = data.filter((c) => {
    const otherId =
      c.requester_user_id === user.id ? c.receiver_user_id : c.requester_user_id;
    if (seenOtherIds.has(otherId)) return false;
    seenOtherIds.add(otherId);
    return true;
  });

  const connections: CommunityConnection[] = await Promise.all(
    deduped.map(async (c) => {
      const otherId =
        c.requester_user_id === user.id
          ? c.receiver_user_id
          : c.requester_user_id;

      const { data: prof } = await supabase
        .from("community_profiles")
        .select(SAFE_PROFILE_COLS)
        .eq("user_id", otherId)
        .maybeSingle();

      return {
        ...c,
        other_profile: (prof ?? null) as CommunityProfile | null,
      };
    })
  );

  return connections;
}

export async function getConnectionBetween(
  userId: string,
  otherId: string
): Promise<CommunityConnection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_connections")
    .select("*")
    .or(
      `and(requester_user_id.eq.${userId},receiver_user_id.eq.${otherId}),` +
      `and(requester_user_id.eq.${otherId},receiver_user_id.eq.${userId})`
    )
    .maybeSingle();
  return data as CommunityConnection | null;
}

// ── Chat szálak ───────────────────────────────────────────────
export async function getMyThreads(): Promise<CommunityThread[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("community_threads")
    .select("*")
    .or(`participant_1_user_id.eq.${user.id},participant_2_user_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });

  if (!data) return [];

  // Deduplikáció: ugyanolyan résztvevő-pár esetén csak a legfrissebbet tartjuk meg
  const seenOtherIds = new Set<string>();
  const deduped = data.filter((t) => {
    const otherId =
      t.participant_1_user_id === user.id
        ? t.participant_2_user_id
        : t.participant_1_user_id;
    if (seenOtherIds.has(otherId)) return false;
    seenOtherIds.add(otherId);
    return true;
  });

  // Lekérjük a másik fél profilját
  const threads: CommunityThread[] = await Promise.all(
    deduped.map(async (t) => {
      const otherId =
        t.participant_1_user_id === user.id
          ? t.participant_2_user_id
          : t.participant_1_user_id;

      const { data: prof } = await supabase
        .from("community_profiles")
        .select(SAFE_PROFILE_COLS)
        .eq("user_id", otherId)
        .maybeSingle();

      // Olvasatlan üzenetek száma
      const { count } = await supabase
        .from("community_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", t.id)
        .neq("sender_user_id", user.id)
        .is("read_at", null);

      return {
        ...t,
        other_profile: prof as CommunityProfile | null,
        unread_count: count ?? 0,
      };
    })
  );

  return threads;
}

export async function getThreadMessages(threadId: string): Promise<CommunityMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // RLS biztosítja, hogy csak a résztvevő láthatja
  const { data } = await supabase
    .from("community_messages")
    .select("id, thread_id, sender_user_id, body, read_at, created_at, status")
    .eq("thread_id", threadId)
    .in("status", ["active", "deleted_by_user"])
    .order("created_at", { ascending: true });

  return (data ?? []) as CommunityMessage[];
}

// ── Értesítések ───────────────────────────────────────────────
export async function getMyNotifications(): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []) as Notification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // 1. Bejövő, várakozó kapcsolati kérések — deduplikálva (egy kérő csak egyszer számít)
  const { data: pendingRows } = await supabase
    .from("community_connections")
    .select("requester_user_id")
    .eq("receiver_user_id", user.id)
    .eq("status", "pending");

  const uniqueRequesters = new Set((pendingRows ?? []).map((r) => r.requester_user_id));
  const pendingCount = uniqueRequesters.size;

  // 2. Olvasatlan üzenetek — csak a deduplikált szálakból (egy másik felhasználó → egy szál)
  const { data: allThreads } = await supabase
    .from("community_threads")
    .select("id, participant_1_user_id, participant_2_user_id")
    .or(`participant_1_user_id.eq.${user.id},participant_2_user_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });

  // Deduplikáció: egy másik félhez csak az első (legfrissebb) szálat vesszük
  const seenOtherIds = new Set<string>();
  const canonicalThreadIds: string[] = [];
  for (const t of allThreads ?? []) {
    const otherId = t.participant_1_user_id === user.id ? t.participant_2_user_id : t.participant_1_user_id;
    if (!seenOtherIds.has(otherId)) {
      seenOtherIds.add(otherId);
      canonicalThreadIds.push(t.id);
    }
  }

  let unreadMessages = 0;
  if (canonicalThreadIds.length > 0) {
    const { count } = await supabase
      .from("community_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", canonicalThreadIds)
      .neq("sender_user_id", user.id)
      .is("read_at", null);
    unreadMessages = count ?? 0;
  }

  return pendingCount + unreadMessages;
}

// ── Közösségi segítség beállítások ───────────────────────────
export async function getOwnHelpSettings(): Promise<CommunityHelpSettings | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("community_help_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return data as CommunityHelpSettings | null;
}

export async function getHelpSettingsByUserId(userId: string): Promise<CommunityHelpSettings | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("community_help_settings")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .maybeSingle();
  return data as CommunityHelpSettings | null;
}

export async function getPublicHelpSettingsList(filters?: {
  help_needed?: boolean;
  help_offered?: boolean;
  category?: string;
}): Promise<CommunityHelpSettings[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("community_help_settings")
    .select("*")
    .eq("enabled", true)
    .in("visibility", ["city_or_district", "county"]);

  if (filters?.help_needed) query = query.eq("help_needed_enabled", true);
  if (filters?.help_offered) query = query.eq("help_offered_enabled", true);
  if (filters?.category) {
    query = query.or(
      `help_needed_categories.cs.{"${filters.category}"},help_offered_categories.cs.{"${filters.category}"}`
    );
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(100);
  return (data ?? []) as CommunityHelpSettings[];
}

// ── Admin: közösségi segítség beállítások ───────────────────
export async function adminGetAllHelpSettings() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_help_settings")
    .select("*")
    .order("updated_at", { ascending: false });
  return (data ?? []) as CommunityHelpSettings[];
}

export async function adminGetUserReports(filters?: {
  severity?: string;
  status?: string;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("community_user_reports")
    .select("*")
    // Critical first, then high, then normal; within same severity newest first
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters?.severity) query = query.eq("severity", filters.severity);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data } = await query;
  // Re-sort: critical < high < normal (ascending alphabetically doesn't work)
  const severityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 };
  const sorted = (data ?? []).sort((a, b) => {
    const sa = severityOrder[a.severity as string] ?? 2;
    const sb = severityOrder[b.severity as string] ?? 2;
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
  });
  return sorted as CommunityUserReport[];
}

export async function adminGetReportAuditLog(reportId: string): Promise<ReportAuditLogEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_report_audit_log")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ReportAuditLogEntry[];
}

export async function adminGetReportAppeals(reportId: string): Promise<ReportAppeal[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_report_appeals")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ReportAppeal[];
}

// ── Admin: közösségi profilok listája ─────────────────────────
export async function adminGetAllCommunityProfiles(): Promise<CommunityProfile[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_profiles")
    .select(SAFE_PROFILE_COLS)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as CommunityProfile[];
}

// ── Admin: jelentések listája ─────────────────────────────────
export async function adminGetPendingReports() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_reports")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return data ?? [];
}
