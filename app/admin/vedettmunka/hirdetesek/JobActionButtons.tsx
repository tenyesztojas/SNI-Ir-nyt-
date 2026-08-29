"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateJobStatus } from "@/app/vedettmunka/actions";

const NEXT_STATUSES: Record<string, { label: string; value: string; color: string }[]> = {
  submitted:       [{ label: "Elfogad", value: "approved", color: "bg-green-600" }, { label: "Vissza (javítás)", value: "needs_revision", color: "bg-orange-500" }, { label: "Elutasít", value: "rejected", color: "bg-red-600" }],
  under_review:    [{ label: "Jóváhagyás", value: "approved", color: "bg-green-600" }, { label: "Vissza (javítás)", value: "needs_revision", color: "bg-orange-500" }, { label: "Elutasít", value: "rejected", color: "bg-red-600" }],
  needs_revision:  [{ label: "Jóváhagyás", value: "approved", color: "bg-green-600" }, { label: "Elutasít", value: "rejected", color: "bg-red-600" }],
  approved:        [{ label: "Publikálás", value: "published", color: "bg-green-700" }, { label: "Visszavon", value: "archived", color: "bg-gray-400" }],
  published:       [{ label: "Archivál", value: "archived", color: "bg-gray-400" }],
  rejected:        [{ label: "Archivál", value: "archived", color: "bg-gray-400" }],
};

export default function JobActionButtons({ jobId, currentStatus }: { jobId: string; currentStatus: string }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const router = useRouter();

  const actions = NEXT_STATUSES[currentStatus] ?? [];
  if (actions.length === 0) return null;

  function act(status: string) {
    startTransition(async () => {
      await adminUpdateJobStatus(jobId, status, note || undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 items-end shrink-0">
      <div className="flex flex-wrap gap-2">
        {actions.map(({ label, value, color }) => (
          <button key={value} onClick={() => act(value)} disabled={isPending}
            className={`rounded-full ${color} px-3 py-1 text-xs font-bold text-white disabled:opacity-50`}>
            {isPending ? "..." : label}
          </button>
        ))}
        <button onClick={() => setShowNote(!showNote)}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
          Megjegyzés
        </button>
      </div>
      {showNote && (
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Admin megjegyzés (pl. javítás oka)..."
          className="w-56 rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-sni-brand-teal" />
      )}
    </div>
  );
}
