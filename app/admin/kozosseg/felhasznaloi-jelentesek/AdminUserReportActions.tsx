"use client";

import { useState } from "react";
import {
  adminUpdateUserReport,
  adminDisableHelpSettings,
  adminToggleHideReport,
  adminOverrideSeverity,
} from "@/app/kozosseg/actions";

interface Props {
  reportId: string;
  reportedUserId: string;
  currentStatus: string;
  currentSeverity: string;
  isHidden: boolean;
}

const STATUS_OPTIONS = [
  { value: "under_review",               label: "Vizsgálat alatt" },
  { value: "resolved_no_action",         label: "Lezár – nincs intézkedés" },
  { value: "resolved_warning_sent",      label: "Lezár + figyelmeztetés küldve" },
  { value: "resolved_help_disabled",     label: "Lezár + segítség kikapcsolva" },
  { value: "resolved_profile_suspended", label: "Lezár + profil felfüggesztve" },
  { value: "rejected",                   label: "Elutasít" },
];

const SEVERITY_OPTIONS = [
  { value: "critical", label: "🚨 Kritikus" },
  { value: "high",     label: "⚠️ Magas" },
  { value: "normal",   label: "ℹ️ Normál" },
];

export default function AdminUserReportActions({
  reportId,
  reportedUserId,
  currentStatus,
  currentSeverity,
  isHidden,
}: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [severity, setSeverity] = useState(currentSeverity);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hidden, setHidden] = useState(isHidden);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleUpdate() {
    if (!justification.trim()) {
      setMsg({ ok: false, text: "A döntés indoklása kötelező." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const severityChanged = severity !== currentSeverity;
      await adminUpdateUserReport(
        reportId,
        status,
        justification,
        severityChanged ? severity : undefined,
        justification
      );
      if (status === "resolved_help_disabled") {
        await adminDisableHelpSettings(reportedUserId);
      }
      setMsg({ ok: true, text: "Mentve." });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleHide() {
    setHiding(true);
    setMsg(null);
    try {
      await adminToggleHideReport(reportId, !hidden);
      setHidden(!hidden);
      setMsg({ ok: true, text: hidden ? "Tartalom visszaállítva." : "Tartalom ideiglenesen elrejtve." });
    } finally {
      setHiding(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 flex flex-col gap-3">
      {/* Státusz + súlyosság */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Státusz</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-sni-brand-teal"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Súlyosság-felülbírálat</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-xl border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-sni-brand-teal"
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Kötelező indoklás */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">
          Döntés indoklása <span className="text-red-500">*</span>
          <span className="font-normal text-gray-400 ml-1">(kötelező, audit naplóba kerül)</span>
        </label>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={2}
          placeholder="Kötelező: miért ezt a döntést hoztad? Az audit napló rögzíti."
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-sni-brand-teal resize-none"
          aria-required="true"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleUpdate}
          disabled={saving || !justification.trim()}
          className="rounded-full bg-sni-brand-teal px-4 py-1.5 text-xs font-bold text-sni-brand-navy disabled:opacity-50 hover:bg-sni-brand-blue hover:text-white transition"
        >
          {saving ? "Mentés..." : "Döntés mentése"}
        </button>

        <button
          onClick={handleToggleHide}
          disabled={hiding}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            hidden
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200"
          }`}
          title={hidden ? "Tartalom visszaállítása" : "Tartalom ideiglenes elrejtése"}
        >
          {hiding ? "..." : hidden ? "↩ Visszaállítás" : "👁 Ideiglenes elrejtés"}
        </button>
      </div>

      {msg && (
        <p
          className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
          role="status"
          aria-live="polite"
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
