import { getAllEnrollments } from "@/lib/academy/data";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPartnerekPage() {
  const admin = createAdminClient();

  const { data: partners } = await admin
    .from("provider_profiles")
    .select("id, company_name")
    .eq("active", true)
    .order("company_name");

  const enrollments = await getAllEnrollments();

  // Group by partner
  const byPartner = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = byPartner.get(e.partner_id) ?? [];
    list.push(e);
    byPartner.set(e.partner_id, list);
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-sni-text mb-6">Partnerek – Akadémia teljesítések</h1>

      {(partners ?? []).length === 0 ? (
        <p className="text-gray-400 text-sm">Nincs aktív partner.</p>
      ) : (
        <div className="space-y-4">
          {(partners ?? []).map((p) => {
            const enrs = byPartner.get(p.id) ?? [];
            const completed = enrs.filter((e) => e.status === "completed").length;
            const total = enrs.length;
            return (
              <div key={p.id} className="rounded-2xl border border-gray-100 bg-white shadow-soft px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-sni-text">{p.company_name}</p>
                  <p className="text-xs text-gray-400">{completed}/{total} teljesített</p>
                </div>
                {enrs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase border-b border-gray-100">
                          <th className="py-1 text-left">Munkatárs</th>
                          <th className="py-1 text-left">Státusz</th>
                          <th className="py-1 text-left">Haladás</th>
                          <th className="py-1 text-left">Teszt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrs.map((e) => {
                          const part = e.participant as { first_name: string; last_name: string } | undefined;
                          const cert = e.certificate as { test_score: number } | undefined;
                          return (
                            <tr key={e.id} className="border-b border-gray-50">
                              <td className="py-1.5">{part?.last_name} {part?.first_name}</td>
                              <td className="py-1.5">
                                <span className={`rounded-full px-2 py-0.5 font-semibold ${
                                  e.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                                  e.status === "test_failed" ? "bg-red-100 text-red-600" :
                                  "bg-gray-100 text-gray-500"
                                }`}>
                                  {e.status}
                                </span>
                              </td>
                              <td className="py-1.5">{e.progress_percent}%</td>
                              <td className="py-1.5">{cert ? `${cert.test_score}%` : "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
