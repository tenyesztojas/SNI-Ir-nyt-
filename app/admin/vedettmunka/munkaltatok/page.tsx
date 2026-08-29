import Link from "next/link";
import { adminGetEmployers } from "@/lib/vedettmunka/data";
import { EMPLOYER_STATUS_LABELS } from "@/lib/vedettmunka/types";
import EmployerActionButtons from "./EmployerActionButtons";

export const metadata = { title: "Admin – Védett Munka munkáltatók" };
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-gray-100 text-gray-600",
};

export default async function AdminMunkaltatokPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const status = searchParams.status;
  const employers = await adminGetEmployers(status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin/vedettmunka" className="text-sm text-sni-brand-blue hover:underline">← Védett Munka admin</Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Munkáltatók ({employers.length})</h1>

      {/* Szűrők */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[undefined, "pending_review", "approved", "rejected", "suspended"].map((s) => (
          <a
            key={s ?? "all"}
            href={s ? `?status=${s}` : "?"}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${(!status && !s) || status === s ? "bg-sni-brand-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {s ? EMPLOYER_STATUS_LABELS[s as keyof typeof EMPLOYER_STATUS_LABELS] : "Összes"}
          </a>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {employers.length === 0 && <p className="text-sm text-gray-400">Nincs találat.</p>}
        {employers.map((emp) => (
          <div key={emp.id} className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[emp.status]}`}>
                    {EMPLOYER_STATUS_LABELS[emp.status]}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(emp.created_at).toLocaleDateString("hu-HU")}</span>
                </div>
                <h2 className="mt-1 font-bold text-sni-brand-navy">{emp.company_name}</h2>
                <p className="text-sm text-gray-600">{emp.contact_name} · {emp.contact_email}</p>
                {emp.website && <a href={emp.website} target="_blank" rel="noopener noreferrer" className="text-xs text-sni-brand-blue hover:underline">{emp.website}</a>}
              </div>
              <EmployerActionButtons employerId={emp.id} currentStatus={emp.status} />
            </div>
            {emp.description && (
              <p className="mt-3 text-sm text-gray-600 line-clamp-2">{emp.description}</p>
            )}
            {emp.admin_note && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">Admin megjegyzés: {emp.admin_note}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {emp.open_to_neurodivergent && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Neurodivergens</span>}
              {emp.open_to_disabled && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">Megváltozott munkaképességű</span>}
              {emp.open_to_parents && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Szülők</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
