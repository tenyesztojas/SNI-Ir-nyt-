"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminResolveReport } from "@/app/kozosseg/actions";

export default function ResolveReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  async function handle() {
    setLoading(true);
    await adminResolveReport(reportId, note || undefined);
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="shrink-0">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-200 transition"
        >
          Lezár
        </button>
      ) : (
        <div className="space-y-2 min-w-[200px]">
          <textarea
            className="input-field text-xs min-h-[60px] resize-none"
            placeholder="Admin megjegyzés (opcionális)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handle}
              disabled={loading}
              className="flex-1 rounded-xl bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? "..." : "Lezárás"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs">
              Mégse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
