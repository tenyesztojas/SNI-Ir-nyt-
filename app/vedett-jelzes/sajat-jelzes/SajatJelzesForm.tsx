"use client";

import { useState, useTransition } from "react";
import { upsertSignal } from "@/app/vedett-jelzes/actions";
import {
  NEURODIVERGENCE_LABELS,
  SUPPORT_NEEDS_CATALOG,
  SUPPORT_NEED_CATEGORIES,
  type VjSignal,
  type NeurodivergenceType,
  type SupportNeedItem,
} from "@/lib/vedett-jelzes/types";

export default function SajatJelzesForm({ signal }: { signal: VjSignal | null }) {
  const [displayName, setDisplayName] = useState(signal?.display_name ?? "");
  const [neurodivType, setNeurodivType] = useState<NeurodivergenceType>(
    signal?.neurodivergence_type ?? "autizmus"
  );
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(
    new Set(signal?.support_needs ?? [])
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleNeed(id: string) {
    setSelectedNeeds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    // A checkboxok nevét manuálisan adjuk hozzá
    selectedNeeds.forEach((id) => fd.append("support_needs", id));
    startTransition(async () => {
      try {
        await upsertSignal(fd);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  // Katalógus kategória szerint csoportosítva
  const categories = Object.keys(SUPPORT_NEED_CATEGORIES) as SupportNeedItem["category"][];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">

      {/* Megjelenített név */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-sni-text">
          Megjelenített név <span className="text-red-500">*</span>
        </label>
        <input
          name="display_name"
          type="text"
          required
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Pl. Kis Péter"
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20"
        />
        <p className="mt-1 text-xs text-gray-400">
          Ez a név jelenik meg a kártyádon és a fizikai termékeken.
        </p>
      </div>

      {/* Érintettség típusa */}
      <div>
        <p className="mb-2 text-sm font-semibold text-sni-text">
          Érintettség <span className="text-red-500">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NEURODIVERGENCE_LABELS) as NeurodivergenceType[]).map((type) => (
            <label key={type} className="cursor-pointer">
              <input
                type="radio"
                name="neurodivergence_type"
                value={type}
                checked={neurodivType === type}
                onChange={() => setNeurodivType(type)}
                className="sr-only"
              />
              <span
                className={`inline-block rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  neurodivType === type
                    ? "border-sni-brand-teal bg-sni-brand-teal text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal/60"
                }`}
              >
                {NEURODIVERGENCE_LABELS[type]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Segítségigények */}
      <div>
        <p className="mb-1 text-sm font-semibold text-sni-text">Segítségigények</p>
        <p className="mb-4 text-xs text-gray-400">
          Jelöld be, ami fontos neked. Ezek jelennek meg a kártyádon és a QR-t beolvasó segítők látják.
        </p>
        <div className="flex flex-col gap-6">
          {categories.map((cat) => {
            const items = SUPPORT_NEEDS_CATALOG.filter((n) => n.category === cat);
            return (
              <div key={cat}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  {SUPPORT_NEED_CATEGORIES[cat]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleNeed(item.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        selectedNeeds.has(item.id)
                          ? "border-sni-brand-teal bg-sni-brand-teal/10 font-semibold text-sni-brand-teal"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending || !displayName.trim()}
          className="rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-white shadow-md transition hover:bg-sni-brand-blue disabled:opacity-60"
        >
          {isPending ? "Mentés..." : signal ? "Módosítások mentése" : "Jelzés létrehozása"}
        </button>
      </div>
    </form>
  );
}
