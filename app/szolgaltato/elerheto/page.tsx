import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndProfile, isCurrentUserAdmin } from "@/lib/data";
import { redirect } from "next/navigation";
import AvailabilityManager from "@/components/AvailabilityManager";
import ProviderNav from "@/components/ProviderNav";
import { AvailabilitySlot, ServicePackage } from "@/lib/types";

export default async function ProviderAvailabilityPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");
  const isAdmin = await isCurrentUserAdmin();

  const adminClient = createAdminClient();
  const { data: provider } = await adminClient
    .from("provider_profiles")
    .select("id, company_name, booking_type")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!provider && !isAdmin) redirect("/szolgaltato/regisztracio");

  const [slotsRes, pkgRes] = await Promise.all([
    provider ? adminClient.from("availability_slots").select("*").eq("provider_id", provider.id).order("created_at") : { data: [] },
    provider ? adminClient.from("service_packages").select("id, name, package_type").eq("provider_id", provider.id).eq("active", true) : { data: [] },
  ]);

  const slots: AvailabilitySlot[] = (slotsRes.data ?? []).map((s) => ({
    id: s.id, providerId: s.provider_id, packageId: s.package_id, slotType: s.slot_type,
    dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time,
    specificDate: s.specific_date, dateFrom: s.date_from, dateTo: s.date_to,
    capacity: s.capacity, createdAt: s.created_at,
  }));

  const packages: ServicePackage[] = (pkgRes.data ?? []).map((p) => ({
    id: p.id, providerId: "", placeId: "", name: p.name, packageType: p.package_type,
    priceAmount: 0, priceCurrency: "HUF", priceUnit: "alkalom" as const,
    active: true, sortOrder: 0, createdAt: "",
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <ProviderNav companyName={provider?.company_name ?? "Admin"} active="elerheto" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-2">Elérhetőség / Naptár</h1>
        <p className="text-sm text-gray-600 mb-6">
          Add meg, mikor érhető el a foglalás. Ismétlődő (heti) és egyszeri időpontok egyaránt beállíthatók.
        </p>
        <AvailabilityManager slots={slots} packages={packages} />
      </div>
    </div>
  );
}
