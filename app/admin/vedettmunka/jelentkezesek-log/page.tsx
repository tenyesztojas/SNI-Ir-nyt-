import Link from "next/link";
import { adminGetApplicationLogs } from "@/lib/vedettmunka/data";

export const metadata = { title: "Admin – Jelentkezési napló" };
export const dynamic = "force-dynamic";

const DELIVERY_COLOR: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-500",
};
const DELIVERY_LABELS: Record<string, string> = {
  sent: "Elküldve",
  failed: "Hiba",
  pending: "Folyamatban",
};

export default async function JelentkezesekLogPage() {
  const logs = await adminGetApplicationLogs();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin/vedettmunka" className="text-sm text-sni-brand-blue hover:underline">← VédettMunka admin</Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Jelentkezési napló ({logs.length})</h1>
      <p className="mt-1 text-xs text-gray-400">
        Csak technikai adatok tárolódnak. CV tartalom nem kerül mentésre.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400">
              <th className="pb-2 pr-4">Dátum</th>
              <th className="pb-2 pr-4">Jelölt</th>
              <th className="pb-2 pr-4">Állás</th>
              <th className="pb-2 pr-4">CV fájlnév</th>
              <th className="pb-2">Státusz</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">Nincs napló bejegyzés.</td></tr>
            )}
            {logs.map((log) => {
              const jobTitle = (log.job_posts as { title: string } | null)?.title ?? "–";
              return (
                <tr key={log.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleDateString("hu-HU")}
                  </td>
                  <td className="py-2 pr-4">
                    <p className="font-semibold">{log.applicant_name}</p>
                    <p className="text-xs text-gray-400">{log.applicant_email}</p>
                  </td>
                  <td className="py-2 pr-4 text-xs">{jobTitle}</td>
                  <td className="py-2 pr-4 text-xs text-gray-400">{log.cv_filename ?? "–"}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DELIVERY_COLOR[log.delivery_status]}`}>
                      {DELIVERY_LABELS[log.delivery_status]}
                    </span>
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
