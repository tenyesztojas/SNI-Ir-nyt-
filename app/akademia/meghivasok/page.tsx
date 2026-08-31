import { getCurrentPartnerId, getPartnerProfile, getPartnerEnrollments } from "@/lib/academy/data";
import AcademyNav from "@/components/academy/AcademyNav";
import InvitationActions from "./InvitationActions";

export default async function MeghivasokPage() {
  const partnerId = (await getCurrentPartnerId())!;
  const partner = await getPartnerProfile(partnerId);
  const enrollments = await getPartnerEnrollments(partnerId);

  const active = enrollments.filter((e) => !["revoked", "completed"].includes(e.status));

  return (
    <div className="min-h-screen bg-gray-50">
      <AcademyNav companyName={partner?.company_name ?? ""} active="meghivasok" />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-sni-text mb-6">Meghívások</h1>

        {active.length === 0 ? (
          <p className="text-gray-400 text-sm">Nincsenek aktív meghívások.</p>
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
                  <th className="px-4 py-3 text-left">Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {active.map((e) => {
                  const p = e.participant as { first_name: string; last_name: string; email: string } | undefined;
                  const cv = e.course_version as { version: string; course?: { title: string } | null } | undefined;

                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {p?.last_name} {p?.first_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p?.email}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{cv?.course?.title ?? "–"} ({cv?.version})</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-semibold capitalize">
                          {e.status}
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
                      <td className="px-4 py-3">
                        <InvitationActions enrollmentId={e.id} />
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
