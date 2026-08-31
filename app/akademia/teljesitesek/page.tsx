import { getCurrentPartnerId, getPartnerProfile, getPartnerEnrollments } from "@/lib/academy/data";
import AcademyNav from "@/components/academy/AcademyNav";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  invited:          { label: "Meghívva",         color: "bg-blue-100 text-blue-700" },
  opened:           { label: "Megnyitotta",       color: "bg-indigo-100 text-indigo-700" },
  in_progress:      { label: "Folyamatban",       color: "bg-amber-100 text-amber-700" },
  course_completed: { label: "Tananyag kész",     color: "bg-purple-100 text-purple-700" },
  test_in_progress: { label: "Tesztel",           color: "bg-orange-100 text-orange-700" },
  test_failed:      { label: "Teszt sikertelen",  color: "bg-red-100 text-red-700" },
  completed:        { label: "Teljesítette",      color: "bg-emerald-100 text-emerald-700" },
  expired:          { label: "Lejárt",            color: "bg-gray-100 text-gray-500" },
  revoked:          { label: "Visszavonva",       color: "bg-gray-100 text-gray-400" },
};

export default async function TeljesitesekPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);
  const enrollments = await getPartnerEnrollments(partnerId);

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="teljesitesek" />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-6">Teljesítések</h1>

        {enrollments.length === 0 ? (
          <p className="text-gray-400 text-sm">Még nincsenek beiratkozások.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Munkatárs</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Képzés</th>
                  <th className="px-4 py-3 text-left">Státusz</th>
                  <th className="px-4 py-3 text-left">Haladás</th>
                  <th className="px-4 py-3 text-left">Teszt</th>
                  <th className="px-4 py-3 text-left">Beiratkozás</th>
                  <th className="px-4 py-3 text-left">Teljesítés dátuma</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const p = e.participant as { first_name: string; last_name: string; email: string } | undefined;
                  const cv = e.course_version as { version: string; course?: { title: string } | null } | undefined;
                  const cert = e.certificate as { certificate_code: string; status: string; issued_at: string; test_score: number } | undefined;
                  const statusInfo = STATUS_LABELS[e.status] ?? STATUS_LABELS.invited;

                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {p?.last_name} {p?.first_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p?.email}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {cv?.course?.title ?? "–"} <span className="text-gray-400">({cv?.version})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-sni-brand-teal" style={{ width: `${e.progress_percent}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{e.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {cert ? (
                          <span className="font-semibold text-emerald-600">{cert.test_score}%</span>
                        ) : e.status === "test_failed" ? (
                          <span className="text-red-500">Sikertelen</span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(e.created_at).toLocaleDateString("hu-HU")}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {cert?.issued_at
                          ? new Date(cert.issued_at).toLocaleDateString("hu-HU")
                          : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {enrollments.length > 0 && (
          <p className="mt-4 text-right text-xs text-gray-400">
            {enrollments.filter((e) => e.status === "completed").length} teljesítette /{" "}
            {enrollments.length} beiratkozott
          </p>
        )}
      </div>
    </div>
  );
}
