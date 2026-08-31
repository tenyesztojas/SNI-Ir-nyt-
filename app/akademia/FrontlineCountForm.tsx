"use client";
import { useState } from "react";
import { updateFrontlineCount } from "@/lib/academy/actions";

export default function FrontlineCountForm({ current }: { current: number }) {
  const [count, setCount] = useState(current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateFrontlineCount(count);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="frontline-count" className="text-xs text-gray-600">
        Aktív ügyfélkapcsolati munkatársak száma:
      </label>
      <input
        id="frontline-count"
        type="number"
        min={0}
        max={9999}
        value={count}
        onChange={(e) => setCount(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-20 rounded-xl border border-gray-200 px-3 py-1 text-sm text-center outline-none focus:border-sni-brand-teal"
        aria-label="Frontline munkatársak száma"
      />
      <span className="text-xs text-gray-500">fő</span>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-full bg-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition disabled:opacity-50"
      >
        {saving ? "Mentés..." : saved ? "Mentve ✓" : "Mentés"}
      </button>
    </div>
  );
}
