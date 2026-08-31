import { getCurrentPartnerId, getPartnerProfile, getPartnerParticipants } from "@/lib/academy/data";
import AcademyNav from "@/components/academy/AcademyNav";
import Link from "next/link";
import { UserPlus, CheckCircle, Clock, Mail, AlertCircle } from "lucide-react";

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

export default async function MunkatarsakPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);
  const participants = await getPartnerParticipants(partnerId);

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="munkatarsak" />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-sni-text">Munkatársak</h1>
            <p className="text-sm text-gray-500">{participants.length} bejegyzett munkatárs</p>
          </div>
          <Link
            href="/akademia/munkatarsak/uj"
            className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
          >
            <UserPlus size={15} /> Munkatárs hozzáadása
          </Link>
        </div>

        {participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <Mail size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-500">Még nincsenek meghívott munkatársak</p>
            <p className="text-sm text-gray-400 mt-1">Adj hozzá munkatársat, és küldd el a képzési meghívót.</p>
            <Link
              href="/akademia/munkatarsak/uj"
              className="inline-flex items-center gap-2 mt-4 rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
            >
              <UserPlus size={14} /> Első munkatárs hozzáadása
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Név</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Telephely</th>
                  <th className="px-4 py-3 text-left">Munkakör</th>
                  <th className="px-4 py-3 text-left">Státusz</th>
                  <th className="px-4 py-3 text-left">Haladás</th>
                  <th className="px-4 py-3 text-left">Teszt</th>
                  <th className="px-4 py-3 text-left">Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const enr = Array.isArray(p.enrollment) ? p.enrollment[0] : p.enrollment;
                  const cert = Array.isArray(enr?.certificate) ? enr?.certificate[0] : enr?.certificate;
                  const statusInfo = STATUS_LABELS[enr?.status ?? "invited"] ?? STATUS_LABELS.invited;

                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-sni-text whitespace-nowrap">
                        {p.last_name} {p.first_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.email}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.location || "–"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.job_role || "–"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {enr ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-gray-100">
                              <div
                                className="h-1.5 rounded-full bg-sni-brand-teal"
                                style={{ width: `${enr.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{enr.progress_percent}%</span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {cert ? (
                          <span className="text-emerald-600 font-semibold">
                            ✓ {cert.test_score}%
                          </span>
                        ) : enr?.status === "test_failed" ? (
                          <span className="text-red-500">Sikertelen</span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {enr && enr.status !== "revoked" && (
                            <Link
                              href={`/akademia/meghivasok?enrollmentId=${enr.id}`}
                              className="text-xs text-sni-brand-blue underline hover:no-underline"
                            >
                              Meghívás
                            </Link>
                          )}
                          {cert && (
                            <Link
                              href={`/akademia/igazolasok?code=${cert.certificate_code}`}
                              className="text-xs text-emerald-600 underline hover:no-underline"
                            >
                              Igazolás
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
