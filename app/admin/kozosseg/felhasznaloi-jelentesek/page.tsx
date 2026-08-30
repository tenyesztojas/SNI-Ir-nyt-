import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/data";
import { adminGetUserReports } from "@/lib/community/data";
import AdminUserReportActions from "./AdminUserReportActions";

export const metadata = { title: "Felhasználói jelentések – Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Várakozik",
  under_review: "Vizsgálat alatt",
  resolved_no_action: "Lezárva (nincs intézkedés)",
  resolved_warning_sent: "Lezárva (figyelmeztetés küldve)",
  resolved_help_disabled: "Lezárva (segítség kikapcsolva)",
  resolved_profile_suspended: "Lezárva (profil felfüggesztve)",
  rejected: "Elutasítva",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  under_review: "bg-blue-100 text-blue-700",
  resolved_no_action: "bg-gray-100 text-gray-600",
  resolved_warning_sent: "bg-orange-100 text-orange-700",
  resolved_help_disabled: "bg-red-100 text-red-700",
  resolved_profile_suspended: "bg-red-200 text-red-800",
  rejected: "bg-gray-100 text-gray-500",
};

export default async function FelhasznaloiJelentesekPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const reports = await adminGetUserReports();
  const pending = reports.filter((r) => r.status === "pending");
  const other = reports.filter((r) => r.status !== "pending");

  function renderReport(r: (typeof reports)[0]) {
    return (
      <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 shrink-0">
            {new Date(r.created_at).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
          <div><span className="font-semibold">Bejelentő:</span> {r.reporter_user_id.slice(0, 8)}…</div>
          <div><span className="font-semibold">Bejelentett:</span> {r.reported_user_id.slice(0, 8)}…</div>
          <div><span className="font-semibold">Ok:</span> {r.reason}</div>
          {r.related_help_setting_id && (
            <div><span className="font-semibold">Help ID:</span> {r.related_help_setting_id.slice(0, 8)}…</div>
          )}
        </div>
        <p className="text-sm text-gray-700 mb-3">{r.description}</p>
        {r.admin_note && (
          <p className="text-xs text-gray-400 italic mb-3">Admin megjegyzés: {r.admin_note}</p>
        )}
        <AdminUserReportActions
          reportId={r.id}
          reportedUserId={r.reported_user_id}
          currentStatus={r.status}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Felhasználói jelentések</h1>
      <p className="mt-1 text-gray-500 mb-6">
        Közösségi segítség funkcióhoz kapcsolódó felhasználói bejelentések ({reports.length} összesen, {pending.length} várakozik)
      </p>

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-3">Várakozó jelentések ({pending.length})</h2>
          <div className="space-y-4">{pending.map(renderReport)}</div>
        </div>
      )}

      {other.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Lezárt / egyéb ({other.length})</h2>
          <div className="space-y-4">{other.map(renderReport)}</div>
        </div>
      )}

      {reports.length === 0 && (
        <p className="mt-8 text-center text-gray-400">Nincs felhasználói bejelentés.</p>
      )}
    </div>
  );
}
