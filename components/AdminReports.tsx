"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { decideReport } from "@/lib/actions/reports";
import { REPORT_TYPE_LABELS } from "@/lib/reportTypes";
import type { ReportWithPlace } from "@/lib/data";

export default function AdminReports({ initial }: { initial: ReportWithPlace[] }) {
  const [items, setItems] = useState(
    initial.map((r) => ({ ...r, decision: null as "resolved" | "dismissed" | null }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(id: string, decision: "resolved" | "dismissed") {
    setError(null);
    startTransition(async () => {
      const result = await decideReport(id, decision);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, decision } : r)));
    });
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Nincs nyitott hibajelentés.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-sni-warn">{error}</p>}
      {items.map((r) => (
        <div key={r.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <a
                href={r.placeSlug ? `/helyek/${r.placeSlug}` : "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sni-brand-blue hover:underline"
              >
                {r.placeName}
              </a>
              <p className="text-sm text-gray-500">{REPORT_TYPE_LABELS[r.reportType]}</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-700">{r.description}</p>

          {r.decision === null ? (
            <div className="mt-3 flex gap-3">
              <button disabled={isPending} onClick={() => decide(r.id, "resolved")} className="btn-secondary">
                <Check size={16} /> Megoldva
              </button>
              <button
                disabled={isPending}
                onClick={() => decide(r.id, "dismissed")}
                className="inline-flex items-center gap-1.5 rounded-xl2 border border-sni-warn px-4 py-2 text-sm font-medium text-sni-warn hover:bg-sni-warn/10"
              >
                <X size={16} /> Elvetve
              </button>
            </div>
          ) : (
            <p
              className={`mt-3 text-sm font-medium ${
                r.decision === "resolved" ? "text-sni-greendark" : "text-sni-warn"
              }`}
            >
              {r.decision === "resolved" ? "Megoldva" : "Elvetve"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
