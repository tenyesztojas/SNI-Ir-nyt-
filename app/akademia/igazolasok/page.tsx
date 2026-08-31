import { getCurrentPartnerId, getPartnerProfile, getPartnerEnrollments } from "@/lib/academy/data";
import AcademyNav from "@/components/academy/AcademyNav";
import Link from "next/link";

export default async function IgazolasokPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);
  const enrollments = await getPartnerEnrollments(partnerId);

  // Only show completed enrollments that have a certificate
  const completed = enrollments.filter((e) => e.status === "completed" && e.certificate);

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="igazolasok" />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-6">Igazolások</h1>

        {completed.length === 0 ? (
          <p className="text-gray-400 text-sm">Még nem született teljesített igazolás.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Munkatárs</th>
                  <th className="px-4 py-3 text-left">Képzés</th>
                  <th className="px-4 py-3 text-left">Teszt eredmény</th>
                  <th className="px-4 py-3 text-left">Igazolás száma</th>
                  <th className="px-4 py-3 text-left">Kiállítva</th>
                  <th className="px-4 py-3 text-left">Lejár</th>
                  <th className="px-4 py-3 text-left">Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((e) => {
                  const p = e.participant as { first_name: string; last_name: string; email: string } | undefined;
                  const cv = e.course_version as { version: string; course?: { title: string } | null } | undefined;
                  const cert = e.certificate as {
                    certificate_code: string;
                    status: string;
                    issued_at: string;
                    expires_at?: string;
                    test_score: number;
                  } | undefined;

                  if (!cert) return null;

                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {p?.last_name} {p?.first_name}
                        <div className="text-xs text-gray-400">{p?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {cv?.course?.title ?? "–"}
                        <div className="text-gray-400">{cv?.version}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-600">{cert.test_score}%</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                          {cert.certificate_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString("hu-HU") : "–"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {cert.expires_at ? new Date(cert.expires_at).toLocaleDateString("hu-HU") : "–"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/akademia/igazolas/${cert.certificate_code}`}
                            className="text-xs text-sni-brand-blue underline hover:no-underline"
                            target="_blank"
                          >
                            Megtekintés
                          </Link>
                          <Link
                            href={`/akademia/meghivo/letolt?code=${cert.certificate_code}`}
                            className="text-xs text-emerald-600 underline hover:no-underline"
                          >
                            PDF letöltés
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-right text-xs text-gray-400">
          Összesen {completed.length} érvényes igazolás
        </p>
      </div>
    </div>
  );
}
