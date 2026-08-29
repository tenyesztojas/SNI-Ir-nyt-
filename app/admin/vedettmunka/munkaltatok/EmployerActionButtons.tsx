"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateEmployerStatus } from "@/app/vedettmunka/actions";

export default function EmployerActionButtons({
  employerId,
  currentStatus,
}: {
  employerId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const router = useRouter();

  function act(status: string) {
    startTransition(async () => {
      await adminUpdateEmployerStatus(employerId, status, note || undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 items-end shrink-0">
      <div className="flex flex-wrap gap-2">
        {currentStatus !== "approved" && (
          <button onClick={() => act("approved")} disabled={isPending}
            className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
            Jóváhagyás
          </button>
        )}
        {currentStatus !== "rejected" && (
          <button onClick={() => act("rejected")} disabled={isPending}
            className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
            Elutasítás
          </button>
        )}
        {currentStatus !== "suspended" && currentStatus === "approved" && (
          <button onClick={() => act("suspended")} disabled={isPending}
            className="rounded-full bg-gray-400 px-3 py-1 text-xs font-bold text-white hover:bg-gray-500 disabled:opacity-50">
            Felfüggesztés
          </button>
        )}
        <button onClick={() => setShowNote(!showNote)}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:border-gray-300">
          Megjegyzés
        </button>
      </div>
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Admin megjegyzés..."
          className="w-52 rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-sni-brand-teal"
        />
      )}
    </div>
  );
}
