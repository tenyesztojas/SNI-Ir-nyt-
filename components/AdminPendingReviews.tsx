"use client";

import { useState, useTransition } from "react";
import { Trash2, ChevronDown, ChevronUp, Star, Flag } from "lucide-react";
import { Review } from "@/lib/types";
import { removeReview } from "@/lib/actions/reviews";

export default function AdminFlaggedReviews({
  initial,
  placeNameById,
}: {
  initial: Review[];
  placeNameById: Record<string, string>;
}) {
  const [items, setItems] = useState<Review[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove(id: string) {
    if (!confirm("Biztosan eltávolítod ezt az értékelést? Ez visszafordíthatatlan.")) return;
    setError(null);
    startTransition(async () => {
      const result = await removeReview(id, null, "Admin manuálisan eltávolította – gyanús tartalom");
      if (result?.error) { setError(result.error); return; }
      setRemovedId(id);
      setTimeout(() => setItems((prev) => prev.filter((r) => r.id !== id)), 800);
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs megjelölt értékelés.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.map((r) => {
        const isExpanded = expandedId === r.id;
        const isRemoved = removedId === r.id;

        return (
          <div
            key={r.id}
            className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity ${
              isRemoved ? "opacity-30" : "border-amber-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{r.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {placeNameById[r.placeId] ?? r.placeId}
                  </span>
                  <span>·</span>
                  <span>{r.authorName}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Star size={11} className="text-amber-400" fill="currentColor" />
                    {r.overallRating}/5
                  </span>
                </p>
                {r.flagReason && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <Flag size={11} />
                    Megjelölés oka: {r.flagReason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  disabled={isPending || isRemoved}
                  onClick={() => handleRemove(r.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Eltávolítás
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Mi volt jó: </span>{r.positiveText}
                </p>
                {r.warningText && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Mire figyelj: </span>{r.warningText}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Visszatérne: {r.wouldReturn ? "Igen" : "Nem"} ·
                  Zaj: {r.noiseRating} · Zsúfoltság: {r.crowdRating} ·
                  Személyzet: {r.staffEmpathyRating} · Biztonság: {r.safetyRating}
                </p>
                {r.images && r.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
