// Védett Jelzés modul — szerver oldali adathozzáférés

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  VjSignal,
  VjProduct,
  VjFulfillmentProfile,
  VjWaitlistEntry,
} from "./types";

// ── Saját jelzés ──────────────────────────────────────────────────────────────

export async function getMySignal(): Promise<VjSignal | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("vj_signals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data as VjSignal | null;
}

// QR token alapján — publikus (admin client, RLS bypass)
export async function getSignalByQrToken(qrToken: string): Promise<VjSignal | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vj_signals")
    .select("id, display_name, neurodivergence_type, support_needs, overwhelmed_mode_active, qr_token")
    .eq("qr_token", qrToken)
    .maybeSingle();
  return data as VjSignal | null;
}

// ── Termékek ──────────────────────────────────────────────────────────────────

export async function getVjProducts(): Promise<VjProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vj_products")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as VjProduct[];
}

export async function getVjProductBySlug(slug: string): Promise<VjProduct | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vj_products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data as VjProduct | null;
}

// ── Fulfillment profil ────────────────────────────────────────────────────────

export async function getMyFulfillmentProfile(): Promise<VjFulfillmentProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("vj_fulfillment_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data as VjFulfillmentProfile | null;
}

// ── Várólisták (felhasználó) ──────────────────────────────────────────────────

export async function getMyWaitlistEntries(): Promise<VjWaitlistEntry[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("vj_waitlist_entries")
    .select("*, product:vj_products(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as VjWaitlistEntry[];
}

export async function getMyWaitlistEntry(productSlug: string): Promise<VjWaitlistEntry | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("vj_waitlist_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_slug", productSlug)
    .maybeSingle();

  return data as VjWaitlistEntry | null;
}

// ── Admin lekérdezések ────────────────────────────────────────────────────────

export async function adminGetWaitlistByProduct(productSlug: string): Promise<VjWaitlistEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vj_waitlist_entries")
    .select("*")
    .eq("product_slug", productSlug)
    .order("created_at", { ascending: true });
  return (data ?? []) as VjWaitlistEntry[];
}

export async function adminGetAllWaitlistEntries(): Promise<VjWaitlistEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vj_waitlist_entries")
    .select("*, product:vj_products(*)")
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as VjWaitlistEntry[];
}

export async function adminGetWaitlistKpis(): Promise<Record<string, { total: number; pending: number; confirmed: number; shipped: number }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vj_waitlist_entries")
    .select("product_slug, status");

  const result: Record<string, { total: number; pending: number; confirmed: number; shipped: number }> = {};
  for (const row of data ?? []) {
    if (!result[row.product_slug]) result[row.product_slug] = { total: 0, pending: 0, confirmed: 0, shipped: 0 };
    result[row.product_slug].total++;
    if (row.status === "pending")   result[row.product_slug].pending++;
    if (row.status === "confirmed") result[row.product_slug].confirmed++;
    if (row.status === "shipped")   result[row.product_slug].shipped++;
  }
  return result;
}
