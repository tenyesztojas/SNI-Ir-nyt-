"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelWaitlistEntry } from "@/app/vedett-jelzes/actions";

export default function CancelButton({ productSlug }: { productSlug: string }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    startTransition(async () => {
      await cancelWaitlistEntry(productSlug);
      router.refresh();
    });
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="self-start rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-red-300 hover:text-red-500 transition"
      >
        Lemondás
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">Biztosan lemondod?</span>
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
      >
        {isPending ? "..." : "Igen, lemondás"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
      >
        Mégsem
      </button>
    </div>
  );
}
