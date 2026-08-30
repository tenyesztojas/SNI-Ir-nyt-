import { redirect } from "next/navigation";
import Link from "next/link";
import { isCurrentUserAdmin } from "@/lib/data";
import { adminGetUserReports, adminGetReportAuditLog } from "@/lib/community/data";
import { USER_REPORT_CATEGORIES } from "@/lib/community/types";
import AdminUserReportActions from "./AdminUserReportActions";

export const metadata = { title: "Felhasználói jelentések – Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending:                   "Várakozik",
  under_review:              "Vizsgálat alatt",
  resolved_no_action:        "Lezárva (nincs intézkedés)",
  resolved_warning_sent:     "Lezárva (figyelmeztetés küldve)",
  resolved_help_disabled:    "Lezárva (segítség kikapcsolva)",
  resolved_profile_suspended:"Lezárva (profil felfüggesztve)",
  rejected:                  "Elutasítva",
};

const STATUS_COLORS: Record<string, string> = {
  pending:                   "bg-amber-100 text-amber-700",
  under_review:              "bg-blue-100 text-blue-700",
  resolved_no_action:        "bg-gray-100 text-gray-600",
  resolved_warning_sent:     "bg-orange-100 text-orange-700",
  resolved_help_disabled:    "bg-red-100 text-red-700",
  resolved_profile_suspended:"bg-red-200 text-red-800",
  rejected:                  "bg-gray-100 text-gray-500",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "🚨 Kritikus",
  high:     "⚠️ Magas",
  normal:   "ℹ️ Normál",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border border-red-300",
  high:     "bg-amber-100 text-amber-700 border border-amber-200",
  normal:   "bg-gray-100 text-gray-600",
};

export default async function FelhasznaloiJelentesekPage({
  searchParams,
}: {
  searchParams: { severity?: string; status?: string };
}) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const filterSeverity = searchParams.severity ?? "";
  const filterStatus   = searchParams.status ?? "";

  const reports = await adminGetUserReports({
    severity: filterSeverity || undefined,
    status:   filterStatus || undefined,
  });

  const criticalCount = reports.filter((r) => r.severity === "critical" && r.status === "pending").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold text-sni-text">Felhasználói jelentések</h1>
        {criticalCount > 0 && (
          <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white animate-pulse">
            {criticalCount} kritikus vár!
          </span>
        )}
      </div>
      <p className="text-gray-500 text-sm mb-5">
        {reports.length} bejelentés{filterSeverity || filterStatus ? " (szűrve)" : ""}
      </p>

      {/* Szűrők */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold text-gray-400 self-center mr-1">Súlyosság:</span>
          {[
            { v: "", l: "Mind" },
            { v: "critical", l: "🚨 Kritikus" },
            { v: "high",     l: "⚠️ Magas" },
            { v: "normal",   l: "ℹ️ Normál" },
          ].map(({ v, l }) => (
            <Link
              key={v}
              href={`?severity=${v}&status=${filterStatus}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filterSeverity === v
                  ? "bg-sni-brand-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold text-gray-400 self-center mr-1">Státusz:</span>
          {[
            { v: "",               l: "Mind" },
            { v: "pending",        l: "Várakozik" },
            { v: "under_review",   l: "Vizsgálat alatt" },
          ].map(({ v, l }) => (
            <Link
              key={v}
              href={`?severity=${filterSeverity}&status=${v}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filterStatus === v
                  ? "bg-sni-brand-teal text-sni-brand-navy"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      {reports.length === 0 && (
        <p className="mt-8 text-center text-gray-400">Nincs bejelentés a szűrési feltételeknek megfelelően.</p>
      )}

      <div className="space-y-5">
        {reports.map((r) => {
          const categoryLabel = USER_REPORT_CATEGORIES.find((c) => c.value === r.reason)?.label ?? r.reason;
          return (
            <ReportCard
              key={r.id}
              report={r}
              categoryLabel={categoryLabel}
            />
          );
        })}
      </div>
    </div>
  );
}

async function ReportCard({
  report: r,
  categoryLabel,
}: {
  report: Awaited<ReturnType<typeof adminGetUserReports>>[0];
  categoryLabel: string;
}) {
  const auditLog = await adminGetReportAuditLog(r.id);

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-soft ${
        r.severity === "critical"
          ? "border-red-300"
          : r.severity === "high"
          ? "border-amber-200"
          : "border-gray-100"
      }`}
    >
      {/* Fejléc */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${SEVERITY_COLORS[r.severity] ?? "bg-gray-100 text-gray-600"}`}>
            {SEVERITY_LABELS[r.severity] ?? r.severity}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
          {r.hidden_at && (
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs text-orange-700 font-semibold">
              👁 Elrejtve
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 shrink-0">
          {new Date(r.created_at).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Metaadatok */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
        <div><span className="font-semibold">Bejelentő:</span> {r.reporter_user_id.slice(0, 8)}…</div>
        <div><span className="font-semibold">Bejelentett:</span> {r.reported_user_id.slice(0, 8)}…</div>
        <div className="col-span-2"><span className="font-semibold">Kategória:</span> {categoryLabel}</div>
        {r.retention_until && (
          <div className="col-span-2">
            <span className="font-semibold">Megőrzendő:</span>{" "}
            {new Date(r.retention_until).toLocaleDateString("hu-HU")}
            {r.legal_hold && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-bold">LEGAL HOLD</span>}
          </div>
        )}
        {r.appeal_deadline_at && (
          <div className="col-span-2">
            <span className="font-semibold">Fellebbezési határidő:</span>{" "}
            {new Date(r.appeal_deadline_at).toLocaleDateString("hu-HU")}
          </div>
        )}
      </div>

      {/* Leírás */}
      <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{r.description}</p>

      {r.admin_note && (
        <p className="text-xs text-gray-400 italic mb-3">Admin megjegyzés: {r.admin_note}</p>
      )}

      {/* Audit napló */}
      {auditLog.length > 0 && (
        <details className="mb-3">
          <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
            Audit napló ({auditLog.length} bejegyzés)
          </summary>
          <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-gray-100">
            {auditLog.map((entry) => (
              <div key={entry.id} className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{entry.action}</span>
                {entry.previous_status && entry.new_status && (
                  <span className="ml-1 text-gray-400">
                    {entry.previous_status} → {entry.new_status}
                  </span>
                )}
                {entry.previous_severity && entry.new_severity && (
                  <span className="ml-1 text-gray-400">
                    [súlyosság: {entry.previous_severity} → {entry.new_severity}]
                  </span>
                )}
                <span className="ml-2 text-gray-400">{new Date(entry.created_at).toLocaleString("hu-HU")}</span>
                <p className="text-gray-500 mt-0.5 italic">{entry.justification}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <AdminUserReportActions
        reportId={r.id}
        reportedUserId={r.reported_user_id}
        currentStatus={r.status}
        currentSeverity={r.severity}
        isHidden={!!r.hidden_at}
      />
    </div>
  );
}
