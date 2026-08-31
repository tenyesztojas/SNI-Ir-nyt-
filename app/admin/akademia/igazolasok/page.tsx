import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function AdminIgazolasokPage() {
  const admin = createAdminClient();

  const { data: certs } = await admin
    .from("academy_certificates")
    .select(`
      *,
      enrollment:academy_enrollments(
        partner_id,
        participant:academy_participants(first_name, last_name, email),
        course_version:academy_course_versions(version, course:academy_courses(title))
      )
    `)
    .order("issued_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-xl font-bold text-sni-text mb-6">Összes igazolás ({certs?.length ?? 0})</h1>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Résztvevő</th>
              <th className="px-4 py-3 text-left">Képzés</th>
              <th className="px-4 py-3 text-left">Kód</th>
              <th className="px-4 py-3 text-left">Eredmény</th>
              <th className="px-4 py-3 text-left">Kiállítva</th>
              <th className="px-4 py-3 text-left">Lejár</th>
              <th className="px-4 py-3 text-left">Ellenőrzés</th>
            </tr>
          </thead>
          <tbody>
            {(certs ?? []).map((cert) => {
              const enr = cert.enrollment as {
                participant?: { first_name: string; last_name: string; email: string };
                course_version?: { version: string; course?: { title: string } | null } | null;
              } | undefined;
              return (
                <tr key={cert.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{enr?.participant?.last_name} {enr?.participant?.first_name}</p>
                    <p className="text-xs text-gray-400">{enr?.participant?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {enr?.course_version?.course?.title ?? "–"}
                    <br />
                    <span className="text-gray-400">{enr?.course_version?.version}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{cert.certificate_code}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600">{cert.test_score}%</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString("hu-HU") : "–"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {cert.expires_at ? new Date(cert.expires_at).toLocaleDateString("hu-HU") : "–"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/akademia/igazolas/${cert.certificate_code}`}
                      target="_blank"
                      className="text-xs text-sni-brand-blue underline hover:no-underline"
                    >
                      Megnyitás
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
