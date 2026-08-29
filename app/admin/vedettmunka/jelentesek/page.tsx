import Link from "next/link";
import { adminGetJobReports } from "@/lib/vedettmunka/data";
import ReportActionButtons from "./ReportActionButtons";

export const metadata = { title: "Admin – VédettMunka jelentések" };
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  reviewed: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Nyitott",
  reviewed: "Vizsgálat alatt",
  resolved: "Megoldva",
  dismissed: "Elutasítva",
};

export default async function AdminJelentesekPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const status = searchParams.status;
  const reports = await adminGetJobReports(status);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin/vedettmunka" className="text-sm text-sni-brand-blue hover:underline">← VédettMunka admin</Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Hirdetés-jelentések ({reports.length})</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {[undefined, "open", "reviewed", "resolved", "dismissed"].map((s) => (
          <a key={s ?? "all"} href={s ? `?status=${s}` : "?"}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${(!status && !s) || status === s ? "bg-sni-brand-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {s ? STATUS_LABELS[s] : "Összes"}
          </a>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {reports.length === 0 && <p className="text-sm text-gray-400">Nincs találat.</p>}
        {reports.map((r) => {
          const jobTitle = (r.job_posts as { title: string } | null)?.title ?? "–";
          return (
            <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString("hu-HU")}</span>
                  </div>
                  <p className="mt-1 font-bold text-sni-brand-navy">{jobTitle}</p>
                  <p className="text-sm font-semibold text-gray-700">Ok: {r.reason}</p>
                  {r.description && <p className="mt-1 text-sm text-gray-600">{r.description}</p>}
                  {r.admin_note && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">Admin megjegyzés: {r.admin_note}</p>
                  )}
                  <Link href={`/vedettmunka/allasok/${r.job_id}`} target="_blank"
                    className="mt-1 block text-xs text-sni-brand-blue hover:underline">
                    Hirdetés megtekintése →
                  </Link>
                </div>
                <ReportActionButtons reportId={r.id} currentStatus={r.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
