"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMediaAppearance } from "./actions";

export default function MediaDeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm("Biztosan törlöd ezt a megjelenést?")) return;
    startTransition(async () => {
      await deleteMediaAppearance(id);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? "..." : "Törlés"}
    </button>
  );
}
