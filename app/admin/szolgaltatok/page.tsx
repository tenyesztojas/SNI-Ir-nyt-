import Link from "next/link";
import { Building2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProviderRegistration } from "@/lib/types";
import AdminProvidersManager from "@/components/AdminProvidersManager";

export default async function AdminProvidersPage() {
  const adminClient = createAdminClient();

  const { data: rawRegs } = await adminClient
    .from("provider_registrations")
    .select("id, user_id, place_id, company_name, contact_name, contact_email, contact_phone, booking_type, custom_description, status, reject_reason, reviewed_at, created_at")
    .order("created_at", { ascending: false });

  const placeIds = [...new Set((rawRegs ?? []).map((r) => r.place_id).filter(Boolean))];
  const { data: places } = placeIds.length
    ? await adminClient.from("places").select("id, name, slug").in("id", placeIds)
    : { data: [] };

  const placeById = new Map((places ?? []).map((p) => [p.id, p]));

  const registrations: ProviderRegistration[] = (rawRegs ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    placeId: r.place_id,
    companyName: r.company_name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    bookingType: r.booking_type,
    customDescription: r.custom_description,
    status: r.status,
    rejectReason: r.reject_reason,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    placeName: r.place_id ? placeById.get(r.place_id)?.name : undefined,
    placeSlug: r.place_id ? placeById.get(r.place_id)?.slug : undefined,
  }));

  const pending = registrations.filter((r) => r.status === "pending");
  const others = registrations.filter((r) => r.status !== "pending");

  const stats = [
    { label: "Várakozó", value: pending.length, icon: Clock, color: "text-amber-600" },
    { label: "Jóváhagyott", value: registrations.filter(r => r.status === "approved").length, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Elutasított", value: registrations.filter(r => r.status === "rejected").length, icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <Building2 size={24} className="text-sni-brand-teal" />
        <h1 className="text-2xl font-bold text-sni-text">Szolgáltatói regisztrációk</h1>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <s.icon size={22} className={s.color} />
            <div>
              <p className="text-xl font-bold text-sni-text">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {registrations.length === 0 ? (
        <p className="mt-10 text-center text-gray-500">Még nincs regisztrációs kérelem.</p>
      ) : (
        <AdminProvidersManager pending={pending} others={others} />
      )}
    </div>
  );
}
