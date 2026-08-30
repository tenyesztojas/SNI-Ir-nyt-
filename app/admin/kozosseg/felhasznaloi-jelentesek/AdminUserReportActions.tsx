"use client";

import { useState } from "react";
import { adminUpdateUserReport, adminDisableHelpSettings } from "@/app/kozosseg/actions";

interface Props {
  reportId: string;
  reportedUserId: string;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: "under_review", label: "Vizsgálat alatt" },
  { value: "resolved_no_action", label: "Lezár (nincs intézkedés)" },
  { value: "resolved_warning_sent", label: "Lezár + figyelmeztetés küldve" },
  { value: "resolved_help_disabled", label: "Lezár + segítség kikapcsolva" },
  { value: "resolved_profile_suspended", label: "Lezár + profil felfüggesztve" },
  { value: "rejected", label: "Elutasít" },
];

export default function AdminUserReportActions({ reportId, reportedUserId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleUpdate() {
    setSaving(true);
    await adminUpdateUserReport(reportId, status, note || undefined);
    if (status === "resolved_help_disabled") {
      await adminDisableHelpSettings(reportedUserId);
    }
    setSaving(false);
    setMsg("Mentve.");
  }

  return (
    <div className="border-t pt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-sni-brand-teal"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Admin megjegyzés (opcionális)"
          className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-sni-brand-teal"
        />
        <button
          onClick={handleUpdate}
          disabled={saving}
          className="rounded-full bg-sni-brand-teal px-4 py-1.5 text-xs font-bold text-sni-brand-navy disabled:opacity-60 hover:bg-sni-brand-blue hover:text-white transition"
        >
          {saving ? "..." : "Mentés"}
        </button>
      </div>
      {msg && <p className="text-xs text-green-600">{msg}</p>}
    </div>
  );
}
