"use client";

import { useState, useTransition } from "react";
import { Check, X, Trash2, ExternalLink } from "lucide-react";
import { decideReport } from "@/lib/actions/reports";
import { removeReview } from "@/lib/actions/reviews";
import { removePlace } from "@/lib/actions/places";
import { REPORT_TYPE_LABELS } from "@/lib/reportTypes";
import type { ReportWithPlace } from "@/lib/data";

type Item = ReportWithPlace & { decision: "resolved" | "dismissed" | "removed" | null };

export default function AdminReports({ initial }: { initial: ReportWithPlace[] }) {
  const [items, setItems] = useState<Item[]>(
    initial.map((r) => ({ ...r, decision: null }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(id: string, decision: "resolved" | "dismissed") {
    setError(null);
    startTransition(async () => {
      const result = await decideReport(id, decision);
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, decision } : r)));
    });
  }

  function handleRemoveReview(item: Item) {
    if (!item.reviewId) return;
    if (!confirm("Eltávolítod ezt az értékelést? (visszafordíthatatlan)")) return;
    setError(null);
    startTransition(async () => {
      const result = await removeReview(
        item.reviewId!,
        item.id,
        "Admin eltávolította – bejelentés alapján jogsértő tartalom"
      );
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, decision: "removed" } : r)));
    });
  }

  function handleRemovePlace(item: Item) {
    if (!confirm("Eltávolítod ezt a helyet? (visszafordíthatatlan)")) return;
    setError(null);
    startTransition(async () => {
      const result = await removePlace(
        item.placeId,
        item.id,
        "Admin eltávolította – bejelentés alapján jogsértő tartalom"
      );
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, decision: "removed" } : r)));
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs nyitott hibajelentés.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.map((r) => (
        <div key={r.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <a
                href={r.placeSlug ? `/helyek/${r.placeSlug}` : "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-sni-brand-blue hover:underline"
              >
                {r.placeName} <ExternalLink size={13} />
              </a>
              <p className="text-sm text-gray-500">{REPORT_TYPE_LABELS[r.reportType]}</p>
              {r.reviewId && (
                <p className="mt-0.5 text-xs text-amber-700 font-medium">
                  ⚠ Értékeléshez kapcsolt bejelentés (review ID: {r.reviewId.slice(0, 8)}…)
                </p>
              )}
            </div>
          </div>

          <p className="mt-2 text-sm text-gray-700">{r.description}</p>

          {r.decision === null ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Értékelés eltávolítása – jogi igény esetén */}
              {r.reviewId && (
                <button
                  disabled={isPending}
                  onClick={() => handleRemoveReview(r)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Értékelés eltávolítása
                </button>
              )}
              {/* Hely eltávolítása */}
              {!r.reviewId && (
                <button
                  disabled={isPending}
                  onClick={() => handleRemovePlace(r)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Hely eltávolítása
                </button>
              )}
              <button
                disabled={isPending}
                onClick={() => decide(r.id, "resolved")}
                className="btn-secondary text-sm"
              >
                <Check size={15} /> Megoldva (eltávolítás nélkül)
              </button>
              <button
                disabled={isPending}
                onClick={() => decide(r.id, "dismissed")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                <X size={15} /> Elvetve
              </button>
            </div>
          ) : (
            <p className={`mt-3 text-sm font-medium ${
              r.decision === "removed" ? "text-red-600"
              : r.decision === "resolved" ? "text-emerald-600"
              : "text-gray-400"
            }`}>
              {r.decision === "removed" ? "✓ Eltávolítva"
               : r.decision === "resolved" ? "✓ Megoldva"
               : "Elvetve"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
