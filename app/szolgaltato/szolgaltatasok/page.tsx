import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndProfile, isCurrentUserAdmin } from "@/lib/data";
import { redirect } from "next/navigation";
import ServicePackagesManager from "@/components/ServicePackagesManager";
import ProviderNav from "@/components/ProviderNav";
import { ServicePackage } from "@/lib/types";

export default async function ProviderServicesPage() {
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

  const { data: rawPackages } = provider
    ? await adminClient.from("service_packages").select("*").eq("provider_id", provider.id).order("sort_order")
    : { data: [] };

  const packages: ServicePackage[] = (rawPackages ?? []).map((p) => ({
    id: p.id, providerId: p.provider_id, placeId: p.place_id,
    name: p.name, description: p.description, packageType: p.package_type,
    durationMinutes: p.duration_minutes, unitName: p.unit_name, maxGuests: p.max_guests,
    priceAmount: p.price_amount, priceCurrency: p.price_currency, priceUnit: p.price_unit,
    active: p.active, sortOrder: p.sort_order, createdAt: p.created_at,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <ProviderNav companyName={provider?.company_name ?? "Admin"} active="szolgaltatasok" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-2">Szolgáltatások és árak</h1>
        <p className="text-sm text-gray-600 mb-6">
          Az árak csak bejelentkezett felhasználóknak látszanak (GDPR, Adatkezelési Tájékoztató 2.4. pont).
        </p>
        <ServicePackagesManager packages={packages} bookingType={(provider?.booking_type ?? "appointment") as "appointment" | "accommodation" | "both"} />
      </div>
    </div>
  );
}
