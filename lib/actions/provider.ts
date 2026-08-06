"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";
import { ProviderProfile, ServicePackage, AvailabilitySlot } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Szolgáltató regisztráció benyújtása
// ─────────────────────────────────────────────────────────────────────────────

export async function submitProviderRegistration(input: {
  placeId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  taxNumber?: string;
  bookingType: "appointment" | "accommodation" | "both";
  customDescription?: string;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Már van pending vagy approved regisztráció?
  const { data: existing } = await supabase
    .from("provider_registrations")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (existing?.status === "approved") return { error: "Már van jóváhagyott szolgáltatói fiókod." };
  if (existing?.status === "pending") return { error: "A regisztrációd elbírálás alatt van." };

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("provider_registrations").insert({
    user_id: user.id,
    place_id: input.placeId || null,
    company_name: input.companyName,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone || null,
    tax_number: input.taxNumber || null,
    booking_type: input.bookingType,
    custom_description: input.customDescription || null,
    status: "pending",
  });

  if (error) return { error: "Nem sikerült a regisztráció benyújtása." };
  revalidatePath("/admin/szolgaltatok");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: regisztráció jóváhagyása → provider_profile létrehozása
// ─────────────────────────────────────────────────────────────────────────────

export async function approveProviderRegistration(
  registrationId: string
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();

  const { data: reg } = await adminClient
    .from("provider_registrations")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (!reg) return { error: "A regisztráció nem található." };
  if (!reg.place_id) return { error: "A regisztrációhoz nincs hely rendelve." };

  // Provider profile létrehozása
  const { error: profileError } = await adminClient.from("provider_profiles").insert({
    user_id: reg.user_id,
    place_id: reg.place_id,
    registration_id: registrationId,
    company_name: reg.company_name,
    contact_email: reg.contact_email,
    contact_phone: reg.contact_phone,
    booking_type: reg.booking_type,
    custom_description: reg.custom_description,
  });

  if (profileError) return { error: "Nem sikerült a provider profil létrehozása." };

  // Regisztráció státusz frissítése
  await adminClient
    .from("provider_registrations")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", registrationId);

  // Hely booking_enabled bekapcsolása
  await adminClient
    .from("places")
    .update({ booking_enabled: true })
    .eq("id", reg.place_id);

  // Profiles tábla: user role = provider (ha nem admin)
  await adminClient
    .from("profiles")
    .update({ role: "provider" })
    .eq("id", reg.user_id)
    .neq("role", "admin");

  revalidatePath("/admin/szolgaltatok");
  return {};
}

export async function rejectProviderRegistration(
  registrationId: string,
  reason: string
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("provider_registrations")
    .update({
      status: "rejected",
      reject_reason: reason,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", registrationId);

  if (error) return { error: "Nem sikerült az elutasítás." };
  revalidatePath("/admin/szolgaltatok");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag kezelés
// ─────────────────────────────────────────────────────────────────────────────

export async function setBookingLive(
  value: boolean
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  await adminClient
    .from("feature_flags")
    .update({ value: value ? "true" : "false", updated_at: new Date().toISOString() })
    .eq("key", "booking_live");

  revalidatePath("/admin");
  revalidatePath("/helyek");
  return {};
}

export async function setPlaceBookingEnabled(
  placeId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  if (!(await isCurrentUserAdmin())) return { error: "Nincs jogosultságod." };

  const adminClient = createAdminClient();
  await adminClient
    .from("places")
    .update({ booking_enabled: enabled })
    .eq("id", placeId);

  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: szolgáltatás csomag kezelés
// ─────────────────────────────────────────────────────────────────────────────

export async function createServicePackage(input: {
  name: string;
  description?: string;
  packageType: "appointment" | "accommodation";
  durationMinutes?: number;
  unitName?: string;
  maxGuests?: number;
  priceAmount: number;
  priceCurrency?: string;
  priceUnit: string;
}): Promise<{ error?: string; id?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();
  const { data: provider } = await adminClient
    .from("provider_profiles")
    .select("id, place_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .single();

  if (!provider) return { error: "Nincs aktív szolgáltatói profilod." };

  const { data, error } = await adminClient.from("service_packages").insert({
    provider_id: provider.id,
    place_id: provider.place_id,
    name: input.name,
    description: input.description || null,
    package_type: input.packageType,
    duration_minutes: input.durationMinutes || null,
    unit_name: input.unitName || null,
    max_guests: input.maxGuests || null,
    price_amount: input.priceAmount,
    price_currency: input.priceCurrency || "HUF",
    price_unit: input.priceUnit,
    active: true,
  }).select("id").single();

  if (error) return { error: "Nem sikerült a csomag létrehozása." };
  revalidatePath("/szolgaltato/szolgaltatasok");
  return { id: data.id };
}

export async function updateServicePackage(
  packageId: string,
  input: Partial<{
    name: string;
    description: string;
    priceAmount: number;
    priceUnit: string;
    durationMinutes: number;
    unitName: string;
    maxGuests: number;
    active: boolean;
  }>
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();
  // Ownership check
  const { data: pkg } = await adminClient
    .from("service_packages")
    .select("provider_id, provider_profiles!inner(user_id)")
    .eq("id", packageId)
    .single();

  if (!pkg) return { error: "A csomag nem található." };

  const providerUserId = (pkg.provider_profiles as unknown as { user_id: string } | null)?.user_id;
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin && providerUserId !== user.id) return { error: "Nincs jogosultságod." };

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.priceAmount !== undefined) updateData.price_amount = input.priceAmount;
  if (input.priceUnit !== undefined) updateData.price_unit = input.priceUnit;
  if (input.durationMinutes !== undefined) updateData.duration_minutes = input.durationMinutes;
  if (input.unitName !== undefined) updateData.unit_name = input.unitName;
  if (input.maxGuests !== undefined) updateData.max_guests = input.maxGuests;
  if (input.active !== undefined) updateData.active = input.active;

  const { error } = await adminClient
    .from("service_packages")
    .update(updateData)
    .eq("id", packageId);

  if (error) return { error: "Nem sikerült a frissítés." };
  revalidatePath("/szolgaltato/szolgaltatasok");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: elérhetőség kezelés
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertAvailabilitySlot(input: {
  id?: string;
  packageId?: string;
  slotType: "recurring" | "specific" | "blocked";
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  specificDate?: string;
  dateFrom?: string;
  dateTo?: string;
  capacity?: number;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();
  const { data: provider } = await adminClient
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .single();

  if (!provider) return { error: "Nincs aktív szolgáltatói profilod." };

  const slotData = {
    provider_id: provider.id,
    package_id: input.packageId || null,
    slot_type: input.slotType,
    day_of_week: input.dayOfWeek ?? null,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    specific_date: input.specificDate || null,
    date_from: input.dateFrom || null,
    date_to: input.dateTo || null,
    capacity: input.capacity ?? 1,
  };

  const { error } = input.id
    ? await adminClient.from("availability_slots").update(slotData).eq("id", input.id)
    : await adminClient.from("availability_slots").insert(slotData);

  if (error) return { error: "Nem sikerült menteni az elérhetőséget." };
  revalidatePath("/szolgaltato/elerheto");
  return {};
}

export async function deleteAvailabilitySlot(
  slotId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();
  await adminClient.from("availability_slots").delete().eq("id", slotId);
  revalidatePath("/szolgaltato/elerheto");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: leírás módosítása (korlátozott scope)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProviderDescription(
  description: string
): Promise<{ error?: string }> {
  if (description.length > 2000) return { error: "Leírás maximum 2000 karakter lehet." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("provider_profiles")
    .update({ custom_description: description, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: "Nem sikerült a mentés." };
  revalidatePath("/szolgaltato/dashboard");
  return {};
}
