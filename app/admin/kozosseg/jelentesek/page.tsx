import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/data";
import { adminGetPendingReports } from "@/lib/community/data";
import ResolveReportButton from "./ResolveReportButton";

export const metadata = { title: "Közösségi jelentések – Admin" };
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  zaklatás: "Zaklatás",
  kéretlen_üzenet: "Kéretlen üzenet",
  gyanús_profil: "Gyanús profil",
  spam: "Spam",
  sértő_tartalom: "Sértő tartalom",
  gyermekadat: "Gyermekadat megosztása",
  nem_megfelelő_fotó: "Nem megfelelő fotó",
  reklám: "Reklám",
  egyéb: "Egyéb",
};

export default async function JelentesekPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const reports = await adminGetPendingReports();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Közösségi jelentések</h1>
      <p className="mt-1 text-gray-500">Nyitott bejelentések ({reports.length})</p>

      {reports.length === 0 ? (
        <p className="mt-8 text-center text-gray-400">Nincs nyitott bejelentés.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {reports.map((r: Record<string, unknown>) => (
            <div key={r.id as string} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    {REASON_LABELS[r.reason as string] ?? r.reason as string}
                  </span>
                  <p className="mt-2 text-sm text-gray-700">{r.description as string || "—"}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(r.created_at as string).toLocaleDateString("hu-HU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <ResolveReportButton reportId={r.id as string} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
