import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndProfile, isCurrentUserAdmin } from "@/lib/data";
import { redirect } from "next/navigation";
import ProviderBookingsManager from "@/components/ProviderBookingsManager";
import ProviderNav from "@/components/ProviderNav";
import { Booking } from "@/lib/types";

export default async function ProviderBookingsPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");
  const isAdmin = await isCurrentUserAdmin();

  const adminClient = createAdminClient();
  const { data: provider } = await adminClient
    .from("provider_profiles")
    .select("id, company_name")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!provider && !isAdmin) redirect("/szolgaltato/regisztracio");

  const { data: rawBookings } = provider
    ? await adminClient.from("bookings").select("*, service_packages(name)").eq("provider_id", provider.id).order("created_at", { ascending: false }).limit(200)
    : { data: [] };

  const bookings: Booking[] = (rawBookings ?? []).map((b) => ({
    id: b.id, providerId: b.provider_id, packageId: b.package_id, placeId: b.place_id,
    guestUserId: b.guest_user_id, bookingType: b.booking_type,
    appointmentDate: b.appointment_date, appointmentTime: b.appointment_time,
    checkinDate: b.checkin_date, checkoutDate: b.checkout_date,
    numGuests: b.num_guests, guestName: b.guest_name, guestEmail: b.guest_email,
    guestPhone: b.guest_phone, guestNote: b.guest_note,
    totalAmount: b.total_amount, currency: b.currency, status: b.status,
    rejectReason: b.reject_reason, confirmedAt: b.confirmed_at, cancelledAt: b.cancelled_at,
    dataRetentionUntil: b.data_retention_until, createdAt: b.created_at, updatedAt: b.updated_at,
    packageName: (b.service_packages as { name: string } | null)?.name,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <ProviderNav companyName={provider?.company_name ?? "Admin"} active="foglalasok" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-2">Foglalások</h1>
        <p className="text-sm text-gray-600 mb-6">
          A vendégek adatait az Adatkezelési Tájékoztató szerint kezeljük. Megőrzési határidő a foglalásnál.
        </p>
        <ProviderBookingsManager bookings={bookings} />
      </div>
    </div>
  );
}
