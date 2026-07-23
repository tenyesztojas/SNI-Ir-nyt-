"use client";

import { useState, useTransition } from "react";
import { Check, X, Pencil, ChevronDown, ChevronUp, Star } from "lucide-react";
import { Review } from "@/lib/types";
import { decideReview, adminEditAndApproveReview } from "@/lib/actions/reviews";

type Item = Review & { decision: "approved" | "rejected" | null };

export default function AdminPendingReviews({
  initial,
  placeNameById,
}: {
  initial: Review[];
  placeNameById: Record<string, string>;
}) {
  const [items, setItems] = useState<Item[]>(
    initial.map((r) => ({ ...r, decision: null }))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    title: string; positiveText: string; warningText: string;
  }>({ title: "", positiveText: "", warningText: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(r: Item) {
    setEditingId(r.id);
    setEditValues({
      title: r.title,
      positiveText: r.positiveText,
      warningText: r.warningText ?? "",
    });
    setExpandedId(r.id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function decide(id: string, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decideReview(id, decision);
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, decision } : r)));
      if (editingId === id) setEditingId(null);
    });
  }

  function saveAndApprove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await adminEditAndApproveReview(id, {
        title: editValues.title,
        positiveText: editValues.positiveText,
        warningText: editValues.warningText,
      });
      if (result?.error) { setError(result.error); return; }
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, decision: "approved" } : r)));
      setEditingId(null);
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs jóváhagyásra váró értékelés.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.map((r) => {
        const isEditing = editingId === r.id;
        const isExpanded = expandedId === r.id;

        return (
          <div key={r.id} className="card">
            {/* Fejléc */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-sni-text truncate">{r.title}</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{placeNameById[r.placeId] ?? r.placeId}</span>
                  <span>·</span>
                  <span>{r.authorName}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Star size={12} className="text-amber-400" fill="currentColor" />
                    {r.overallRating}/5
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {/* Tartalom (összecsukható) */}
            {isExpanded && !isEditing && (
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
                  Zajszint: {r.noiseRating} · Zsúfoltság: {r.crowdRating} · 
                  Személyzet: {r.staffEmpathyRating} · Biztonság: {r.safetyRating}
                </p>
                {r.images && r.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Szerkesztő mód */}
            {isEditing && (
              <div className="mt-3 space-y-3 rounded-xl border border-sni-brand-teal/30 bg-teal-50/30 p-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Értékelés címe</label>
                  <input
                    className="input-field text-sm"
                    value={editValues.title}
                    onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mi volt jó?</label>
                  <textarea
                    rows={4}
                    className="input-field text-sm resize-none"
                    value={editValues.positiveText}
                    onChange={(e) => setEditValues((v) => ({ ...v, positiveText: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mire figyelj? (opcionális)</label>
                  <textarea
                    rows={2}
                    className="input-field text-sm resize-none"
                    value={editValues.warningText}
                    onChange={(e) => setEditValues((v) => ({ ...v, warningText: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Gombok */}
            {r.decision === null && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!isEditing ? (
                  <>
                    <button
                      disabled={isPending}
                      onClick={() => decide(r.id, "approved")}
                      className="btn-secondary text-sm"
                    >
                      <Check size={15} /> Jóváhagyás
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => startEdit(r)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil size={14} /> Szerkesztés + jóváhagyás
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => decide(r.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <X size={15} /> Elutasítás
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={isPending}
                      onClick={() => saveAndApprove(r.id)}
                      className="btn-primary text-sm"
                    >
                      <Check size={15} /> {isPending ? "Mentés..." : "Mentés és jóváhagyás"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="btn-secondary text-sm"
                    >
                      Mégse
                    </button>
                  </>
                )}
              </div>
            )}

            {r.decision !== null && (
              <p className={`mt-3 text-sm font-medium ${r.decision === "approved" ? "text-emerald-600" : "text-red-600"}`}>
                {r.decision === "approved" ? "✓ Jóváhagyva" : "✗ Elutasítva"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
