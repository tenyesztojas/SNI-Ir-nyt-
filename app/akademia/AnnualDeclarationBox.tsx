"use client";
import { useState } from "react";
import { confirmAnnualDeclaration } from "@/lib/academy/actions";

export default function AnnualDeclarationBox({
  confirmedAt,
  frontlineCount,
}: {
  confirmedAt: string | null;
  frontlineCount: number;
}) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(!!confirmedAt);
  const [confirmedDate, setConfirmedDate] = useState(confirmedAt);

  async function handleConfirm() {
    if (!checked) return;
    setSaving(true);
    await confirmAnnualDeclaration(frontlineCount);
    setSaving(false);
    setDone(true);
    setConfirmedDate(new Date().toISOString());
  }

  if (done && confirmedDate) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
        <p className="font-semibold mb-1">✓ Éves nyilatkozat megerősítve</p>
        <p className="text-xs text-emerald-700">
          Megerősítve: {new Date(confirmedDate).toLocaleDateString("hu-HU")}
        </p>
        <button
          onClick={() => setDone(false)}
          className="mt-2 text-xs underline text-emerald-700 hover:text-emerald-900"
        >
          Újra megerősít
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
      <p className="text-sm font-semibold text-blue-900 mb-3">Éves partneri nyilatkozat</p>
      <div className="flex items-start gap-3">
        <input
          id="annual-declaration"
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 accent-sni-brand-teal"
        />
        <label htmlFor="annual-declaration" className="text-xs text-blue-800 cursor-pointer">
          Megerősítem, hogy a rendszerben szereplő ügyfélkapcsolati munkatársi létszám ({frontlineCount} fő) és képzési adatok naprakészek.
        </label>
      </div>
      <button
        onClick={handleConfirm}
        disabled={!checked || saving}
        className="mt-3 rounded-full bg-sni-brand-teal px-5 py-2 text-xs font-bold text-sni-brand-navy disabled:opacity-40 hover:bg-sni-brand-blue hover:text-white transition"
      >
        {saving ? "Megerősítés..." : "Megerősítés"}
      </button>
    </div>
  );
}
