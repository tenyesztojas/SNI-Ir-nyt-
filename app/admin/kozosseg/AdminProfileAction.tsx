"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetProfileStatus } from "@/app/kozosseg/actions";

export default function AdminProfileAction({
  profileId,
  currentStatus,
}: {
  profileId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(status: "active" | "suspended" | "deleted") {
    if (!confirm(`Biztosan "${status}" státuszra állítod?`)) return;
    setLoading(true);
    await adminSetProfileStatus(profileId, status);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {currentStatus !== "active" && (
        <button
          onClick={() => setStatus("active")}
          disabled={loading}
          className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 disabled:opacity-60 transition"
        >
          Jóváhagy
        </button>
      )}
      {currentStatus !== "suspended" && currentStatus !== "deleted" && (
        <button
          onClick={() => setStatus("suspended")}
          disabled={loading}
          className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-60 transition"
        >
          Felfüggeszt
        </button>
      )}
      {currentStatus !== "deleted" && (
        <button
          onClick={() => setStatus("deleted")}
          disabled={loading}
          className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60 transition"
        >
          Töröl
        </button>
      )}
    </div>
  );
}
