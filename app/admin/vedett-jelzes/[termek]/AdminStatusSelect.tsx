"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateWaitlistStatus } from "@/app/vedett-jelzes/actions";
import { WAITLIST_STATUS_LABELS, type WaitlistStatus } from "@/lib/vedett-jelzes/types";

const STATUSES: WaitlistStatus[] = ["pending", "confirmed", "shipped", "cancelled"];

const STATUS_COLORS: Record<WaitlistStatus, string> = {
  pending:   "text-amber-700 bg-amber-50 border-amber-200",
  confirmed: "text-blue-700 bg-blue-50 border-blue-200",
  shipped:   "text-green-700 bg-green-50 border-green-200",
  cancelled: "text-gray-500 bg-gray-50 border-gray-200",
};

export default function AdminStatusSelect({
  entryId,
  currentStatus,
}: {
  entryId: string;
  currentStatus: WaitlistStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    startTransition(async () => {
      await adminUpdateWaitlistStatus(entryId, newStatus);
      router.refresh();
    });
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={isPending}
      className={`rounded-lg border px-2 py-1 text-xs font-semibold outline-none transition disabled:opacity-60 ${STATUS_COLORS[currentStatus]}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {WAITLIST_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
