"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Place, Category } from "@/lib/types";
import CategoryBadge from "./CategoryBadge";
import { decidePlace } from "@/lib/actions/places";

export default function AdminPendingPlaces({
  initial,
  categories,
}: {
  initial: Place[];
  categories: Category[];
}) {
  const [items, setItems] = useState(
    initial.map((p) => ({ ...p, decision: null as "approved" | "rejected" | null }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  function decide(id: string, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decidePlace(id, decision);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, decision } : p)));
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs jóváhagyásra váró hely.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-sni-warn">{error}</p>}
      {items.map((p) => (
        <div key={p.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sni-text">{p.name}</h3>
              <p className="text-sm text-gray-500">{p.city}</p>
            </div>
            <CategoryBadge category={categoryBySlug.get(p.category)} />
          </div>
          <p className="mt-2 text-sm text-gray-600">{p.description}</p>
          <p className="mt-2 rounded-xl2 bg-sni-green/40 px-3 py-2 text-sm text-gray-700">
            {p.whyFriendly}
          </p>

          {p.decision === null ? (
            <div className="mt-3 flex gap-3">
              <button disabled={isPending} onClick={() => decide(p.id, "approved")} className="btn-secondary">
                <Check size={16} /> Jóváhagyás
              </button>
              <button
                disabled={isPending}
                onClick={() => decide(p.id, "rejected")}
                className="inline-flex items-center gap-1.5 rounded-xl2 border border-sni-warn px-4 py-2 text-sm font-medium text-sni-warn hover:bg-sni-warn/10"
              >
                <X size={16} /> Elutasítás
              </button>
            </div>
          ) : (
            <p
              className={`mt-3 text-sm font-medium ${
                p.decision === "approved" ? "text-sni-greendark" : "text-sni-warn"
              }`}
            >
              {p.decision === "approved" ? "Jóváhagyva" : "Elutasítva"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
