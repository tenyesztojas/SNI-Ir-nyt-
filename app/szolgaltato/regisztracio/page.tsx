import Link from "next/link";
import { Building2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndProfile } from "@/lib/data";
import { redirect } from "next/navigation";
import ProviderRegistrationForm from "@/components/ProviderRegistrationForm";

export default async function ProviderRegistrationPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes?next=/szolgaltato/regisztracio");

  const adminClient = createAdminClient();

  // Van-e már regisztráció?
  const { data: existing } = await adminClient
    .from("provider_registrations")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  // Helyek listája
  const { data: places } = await adminClient
    .from("places")
    .select("id, name, city")
    .eq("status", "published")
    .order("name");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 size={28} className="text-sni-brand-teal" />
          <h1 className="text-2xl font-bold text-sni-text">Szolgáltatói regisztráció</h1>
        </div>
        <p className="text-gray-600 text-sm">
          Regisztrálj szolgáltatóként, hogy foglalásokat fogadhass és kezelhesd az áraidat.
        </p>
      </div>

      {existing?.status === "pending" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center mb-6">
          <p className="font-semibold text-amber-900">A regisztrációd elbírálás alatt van.</p>
          <p className="mt-1 text-sm text-amber-700">1–2 munkanapon belül e-mailben értesítünk.</p>
        </div>
      )}

      {existing?.status === "approved" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center mb-6">
          <p className="font-semibold text-emerald-900">Már van jóváhagyott szolgáltatói fiókod.</p>
          <Link href="/szolgaltato/dashboard" className="btn-primary mt-3 inline-block">
            Ugrás a dashboardra
          </Link>
        </div>
      )}

      {!existing && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <ProviderRegistrationForm places={places ?? []} />
        </div>
      )}
    </div>
  );
}
