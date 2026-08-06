"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndProfile, isCurrentUserAdmin } from "@/lib/data";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Calendar, BookOpen, CheckCircle2, Clock, LayoutDashboard } from "lucide-react";
import ProviderNav from "@/components/ProviderNav";
import ProviderDescriptionEditor from "@/components/ProviderDescriptionEditor";

export default async function ProviderDashboardPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes?next=/szolgaltato/dashboard");
  const isAdmin = await isCurrentUserAdmin();

  const adminClient = createAdminClient();
  const { data: provider } = await adminClient
    .from("provider_profiles")
    .select("id, company_name, booking_type, custom_description")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!provider && !isAdmin) redirect("/szolgaltato/regisztracio");

  const providerId = provider?.id;
  const bookings = providerId
    ? (await adminClient.from("bookings").select("status").eq("provider_id", providerId)).data ?? []
    : [];
  const { count: packageCount } = providerId
    ? await adminClient.from("service_packages").select("id", { count: "exact", head: true }).eq("provider_id", providerId).eq("active", true)
    : { count: 0 };

  const stats = {
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    total: bookings.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ProviderNav companyName={provider?.company_name ?? "Admin nézet"} active="dashboard" />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-6">Áttekintés</h1>

        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          {[
            { label: "Összes foglalás", value: stats.total, icon: BookOpen, color: "text-sni-brand-teal" },
            { label: "Várakozó", value: stats.pending, icon: Clock, color: "text-amber-500" },
            { label: "Visszaigazolt", value: stats.confirmed, icon: CheckCircle2, color: "text-emerald-600" },
            { label: "Aktív csomag", value: packageCount ?? 0, icon: Package, color: "text-sni-brand-blue" },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-3">
              <s.icon size={24} className={s.color} />
              <div>
                <p className="text-xl font-bold text-sni-text">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          {[
            { href: "/szolgaltato/szolgaltatasok", label: "Szolgáltatások", desc: "Árak, csomagok szerkesztése", icon: Package },
            { href: "/szolgaltato/elerheto", label: "Elérhetőség", desc: "Szabad idők beállítása", icon: Calendar },
            { href: "/szolgaltato/foglalasok", label: "Foglalások", desc: stats.pending > 0 ? `${stats.pending} várakozó` : "Nincs várakozó", icon: BookOpen },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="card hover:border-sni-brand-teal/40 hover:shadow-md transition-all">
              <item.icon size={20} className="text-sni-brand-teal mb-2" />
              <p className="font-semibold text-sm">{item.label}</p>
              <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            </Link>
          ))}
        </div>

        {provider && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Helyleírás pontosítása</h2>
            <p className="text-xs text-gray-500 mb-4">
              Kiegészítheted a hely leírását foglalási szempontból fontos információkkal (max 2000 karakter).
            </p>
            <ProviderDescriptionEditor initialValue={provider.custom_description ?? ""} />
          </div>
        )}
      </div>
    </div>
  );
}
