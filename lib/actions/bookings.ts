"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

// ─────────────────────────────────────────────────────────────────────────────
// Foglalás beküldése (vendég)
// GDPR: csak a szükséges adatok, megőrzési határidővel
// ─────────────────────────────────────────────────────────────────────────────

export async function submitBooking(input: {
  packageId: string;
  placeId: string;
  providerId: string;
  bookingType: "appointment" | "accommodation";
  // Időpont foglaláshoz
  appointmentDate?: string;
  appointmentTime?: string;
  // Szállásfoglaláshoz
  checkinDate?: string;
  checkoutDate?: string;
  numGuests?: number;
  // Vendég adatok
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestNote?: string;
}): Promise<{ error?: string; bookingId?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Foglaláshoz bejelentkezés szükséges." };

  // Csomag árat lekérjük az összeg kiszámolásához
  const adminClient = createAdminClient();
  const { data: pkg } = await adminClient
    .from("service_packages")
    .select("price_amount, price_currency, price_unit, active")
    .eq("id", input.packageId)
    .single();

  if (!pkg || !pkg.active) return { error: "A kiválasztott csomag nem elérhető." };

  // Összeg kiszámolása szállás esetén
  let totalAmount = pkg.price_amount;
  if (input.bookingType === "accommodation" && input.checkinDate && input.checkoutDate) {
    const nights = Math.ceil(
      (new Date(input.checkoutDate).getTime() - new Date(input.checkinDate).getTime()) / 86400000
    );
    if (nights < 1) return { error: "Érvénytelen dátum." };
    if (pkg.price_unit === "éjszaka" || pkg.price_unit === "fő/éjszaka") {
      const guests = input.numGuests ?? 1;
      totalAmount = pkg.price_amount * nights * (pkg.price_unit === "fő/éjszaka" ? guests : 1);
    }
  }

  // GDPR: adatmegőrzési határidő = 2 év
  const retentionDate = new Date();
  retentionDate.setFullYear(retentionDate.getFullYear() + 2);

  const { data, error } = await adminClient.from("bookings").insert({
    provider_id: input.providerId,
    package_id: input.packageId,
    place_id: input.placeId,
    guest_user_id: user.id,
    booking_type: input.bookingType,
    appointment_date: input.appointmentDate || null,
    appointment_time: input.appointmentTime || null,
    checkin_date: input.checkinDate || null,
    checkout_date: input.checkoutDate || null,
    num_guests: input.numGuests ?? 1,
    guest_name: input.guestName,
    guest_email: input.guestEmail,
    guest_phone: input.guestPhone || null,
    guest_note: input.guestNote || null,
    total_amount: totalAmount,
    currency: pkg.price_currency,
    status: "pending",
    data_retention_until: retentionDate.toISOString().split("T")[0],
  }).select("id").single();

  if (error) return { error: "Nem sikerült a foglalás benyújtása." };

  revalidatePath("/foglalasaim");
  return { bookingId: data.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: foglalás visszaigazolása / elutasítása
// ─────────────────────────────────────────────────────────────────────────────

export async function confirmBooking(
  bookingId: string
): Promise<{ error?: string }> {
  const adminClient = createAdminClient();
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  // Provider ownership ellenőrzés
  const { data: booking } = await adminClient
    .from("bookings")
    .select("id, status, provider_id, provider_profiles!inner(user_id)")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "A foglalás nem található." };
  const providerUserId = (booking.provider_profiles as unknown as { user_id: string } | null)?.user_id;
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin && providerUserId !== user.id) return { error: "Nincs jogosultságod." };
  if (booking.status !== "pending") return { error: "Csak függőben lévő foglalást lehet visszaigazolni." };

  await adminClient
    .from("bookings")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  revalidatePath("/szolgaltato/foglalasok");
  return {};
}

export async function rejectBooking(
  bookingId: string,
  reason: string
): Promise<{ error?: string }> {
  const adminClient = createAdminClient();
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const { data: booking } = await adminClient
    .from("bookings")
    .select("id, status, provider_profiles!inner(user_id)")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "A foglalás nem található." };
  const providerUserId = (booking.provider_profiles as unknown as { user_id: string } | null)?.user_id;
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin && providerUserId !== user.id) return { error: "Nincs jogosultságod." };

  await adminClient
    .from("bookings")
    .update({
      status: "rejected",
      reject_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  revalidatePath("/szolgaltato/foglalasok");
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendég: foglalás lemondása
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelBooking(
  bookingId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Bejelentkezés szükséges." };

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("guest_user_id", user.id)
    .eq("status", "pending");

  if (error) return { error: "Nem sikerült a lemondás." };
  revalidatePath("/foglalasaim");
  return {};
}
