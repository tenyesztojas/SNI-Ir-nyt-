"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Review } from "@/lib/types";
import { decideReview } from "@/lib/actions/reviews";

export default function AdminPendingReviews({
  initial,
  placeNameById,
}: {
  initial: Review[];
  placeNameById: Record<string, string>;
}) {
  const [items, setItems] = useState(
    initial.map((r) => ({ ...r, decision: null as "approved" | "rejected" | null }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(id: string, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decideReview(id, decision);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, decision } : r)));
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs jóváhagyásra váró értékelés.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-sni-warn">{error}</p>}
      {items.map((r) => (
        <div key={r.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sni-text">{r.title}</h3>
              <p className="text-sm text-gray-500">
                {placeNameById[r.placeId] ?? r.placeId} — {r.authorName} · Összbenyomás: {r.overallRating}/5
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-700">
            <span className="font-medium">Mi volt jó: </span>
            {r.positiveText}
          </p>
          {r.warningText && (
            <p className="mt-1 text-sm text-gray-700">
              <span className="font-medium">Mire figyeljen más család: </span>
              {r.warningText}
            </p>
          )}

          {r.decision === null ? (
            <div className="mt-3 flex gap-3">
              <button disabled={isPending} onClick={() => decide(r.id, "approved")} className="btn-secondary">
                <Check size={16} /> Jóváhagyás
              </button>
              <button
                disabled={isPending}
                onClick={() => decide(r.id, "rejected")}
                className="inline-flex items-center gap-1.5 rounded-xl2 border border-sni-warn px-4 py-2 text-sm font-medium text-sni-warn hover:bg-sni-warn/10"
              >
                <X size={16} /> Elutasítás
              </button>
            </div>
          ) : (
            <p
              className={`mt-3 text-sm font-medium ${
                r.decision === "approved" ? "text-sni-greendark" : "text-sni-warn"
              }`}
            >
              {r.decision === "approved" ? "Jóváhagyva" : "Elutasítva"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
