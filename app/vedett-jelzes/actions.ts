"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NeurodivergenceType, VjSignalSnapshot, VjFulfillmentSnapshot } from "@/lib/vedett-jelzes/types";

// ── Saját jelzés mentése (create/update) ─────────────────────────────────────

export async function upsertSignal(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const display_name        = (formData.get("display_name") as string)?.trim();
  const neurodivergence_type = formData.get("neurodivergence_type") as NeurodivergenceType;
  const support_needs        = formData.getAll("support_needs") as string[];

  if (!display_name || !neurodivergence_type) {
    throw new Error("Kötelező mezők hiányoznak.");
  }

  const { error } = await supabase
    .from("vj_signals")
    .upsert(
      {
        user_id:              user.id,
        display_name,
        neurodivergence_type,
        support_needs,
        updated_at:           new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);

  revalidatePath("/vedett-jelzes/sajat-jelzes");
  revalidatePath("/vedett-jelzes/sajat-jelzes/kijelzes");
  redirect("/vedett-jelzes/sajat-jelzes?mentve=1");
}

// ── Túlterhelődtem mód toggle ─────────────────────────────────────────────────

export async function toggleOverwhelmedMode(currentlyActive: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("vj_signals")
    .update({ overwhelmed_mode_active: !currentlyActive, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/vedett-jelzes/sajat-jelzes/kijelzes");
}

// ── Fulfillment profil mentése ────────────────────────────────────────────────

export async function upsertFulfillmentProfile(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const profile = {
    user_id:      user.id,
    full_name:    (formData.get("full_name")    as string)?.trim(),
    email:        (formData.get("email")        as string)?.trim(),
    phone:        (formData.get("phone")        as string)?.trim() || null,
    postal_code:  (formData.get("postal_code")  as string)?.trim(),
    city:         (formData.get("city")         as string)?.trim(),
    address_line: (formData.get("address_line") as string)?.trim(),
    country:      (formData.get("country")      as string)?.trim() || "Magyarország",
    updated_at:   new Date().toISOString(),
  };

  if (!profile.full_name || !profile.email || !profile.postal_code || !profile.city || !profile.address_line) {
    throw new Error("Kötelező mezők hiányoznak.");
  }

  const { error } = await supabase
    .from("vj_fulfillment_profiles")
    .upsert(profile, { onConflict: "user_id" });

  if (error) throw new Error(error.message);
}

// ── Waitlist feliratkozás ─────────────────────────────────────────────────────

export async function subscribeToWaitlist(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const product_slug = formData.get("product_slug") as string;
  if (!product_slug) throw new Error("Hiányzó termék azonosító.");

  // 1. Fulfillment profil mentése
  await upsertFulfillmentProfile(formData);

  // 2. Aktuális jelzés lekérése snapshothoz
  const { data: signal } = await supabase
    .from("vj_signals")
    .select("display_name, neurodivergence_type, support_needs")
    .eq("user_id", user.id)
    .maybeSingle();

  const signalSnapshot: VjSignalSnapshot | null = signal
    ? {
        display_name:        signal.display_name,
        neurodivergence_type: signal.neurodivergence_type,
        support_needs:       signal.support_needs,
      }
    : null;

  const fulfillmentSnapshot: VjFulfillmentSnapshot = {
    full_name:    (formData.get("full_name")    as string)?.trim(),
    email:        (formData.get("email")        as string)?.trim(),
    phone:        (formData.get("phone")        as string)?.trim() || null,
    postal_code:  (formData.get("postal_code")  as string)?.trim(),
    city:         (formData.get("city")         as string)?.trim(),
    address_line: (formData.get("address_line") as string)?.trim(),
    country:      (formData.get("country")      as string)?.trim() || "Magyarország",
  };

  // 3. Waitlist bejegyzés
  const { error } = await supabase
    .from("vj_waitlist_entries")
    .upsert(
      {
        user_id:              user.id,
        product_slug,
        signal_snapshot:      signalSnapshot,
        fulfillment_snapshot: fulfillmentSnapshot,
        status:               "pending",
      },
      { onConflict: "user_id,product_slug" }
    );

  if (error) throw new Error(error.message);

  revalidatePath("/vedett-jelzes/varolistaim");
  redirect(`/vedett-jelzes/varolistaim?feliratkozott=${product_slug}`);
}

// ── Feliratkozás lemondása ────────────────────────────────────────────────────

export async function cancelWaitlistEntry(productSlug: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("vj_waitlist_entries")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("product_slug", productSlug)
    .eq("status", "pending");

  revalidatePath("/vedett-jelzes/varolistaim");
}

// ── Admin: státusz módosítás ──────────────────────────────────────────────────

export async function adminUpdateWaitlistStatus(entryId: string, status: string) {
  const admin = createAdminClient();

  const updates: Record<string, unknown> = { status };
  if (status === "confirmed") updates.confirmed_at = new Date().toISOString();
  if (status === "shipped")   updates.shipped_at   = new Date().toISOString();

  const { error } = await admin
    .from("vj_waitlist_entries")
    .update(updates)
    .eq("id", entryId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/vedett-jelzes");
}

// ── Admin: termék státusz toggle ─────────────────────────────────────────────

export async function adminToggleProductStatus(slug: string, currentStatus: string) {
  const admin = createAdminClient();
  const newStatus = currentStatus === "COMING_SOON" ? "AVAILABLE" : "COMING_SOON";

  const { error } = await admin
    .from("vj_products")
    .update({ status: newStatus })
    .eq("slug", slug);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/vedett-jelzes");
}
