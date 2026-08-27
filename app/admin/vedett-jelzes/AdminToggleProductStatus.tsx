"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminToggleProductStatus } from "@/app/vedett-jelzes/actions";

export default function AdminToggleProductStatus({
  slug,
  currentStatus,
}: {
  slug: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    startTransition(async () => {
      await adminToggleProductStatus(slug, currentStatus);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
        currentStatus === "COMING_SOON"
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
          : "bg-green-100 text-green-700 hover:bg-green-200"
      }`}
    >
      {isPending ? "..." : currentStatus === "COMING_SOON" ? "COMING SOON" : "ELÉRHETŐ"}
    </button>
  );
}
