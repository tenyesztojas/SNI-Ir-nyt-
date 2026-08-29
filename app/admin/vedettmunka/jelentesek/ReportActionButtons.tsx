"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateReportStatus } from "@/app/vedettmunka/actions";

export default function ReportActionButtons({ reportId, currentStatus }: { reportId: string; currentStatus: string }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const router = useRouter();

  function act(status: string) {
    startTransition(async () => {
      await adminUpdateReportStatus(reportId, status, note || undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex flex-wrap gap-2">
        {currentStatus === "open" && (
          <button onClick={() => act("reviewed")} disabled={isPending}
            className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
            Vizsgálat alá vesz
          </button>
        )}
        {currentStatus !== "resolved" && (
          <button onClick={() => act("resolved")} disabled={isPending}
            className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
            Megoldva
          </button>
        )}
        {currentStatus !== "dismissed" && (
          <button onClick={() => act("dismissed")} disabled={isPending}
            className="rounded-full bg-gray-400 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
            Elutasít
          </button>
        )}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Megjegyzés..."
        className="w-48 rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-sni-brand-teal" />
    </div>
  );
}
