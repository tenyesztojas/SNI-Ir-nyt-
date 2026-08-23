"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToConnection } from "@/app/kozosseg/actions";

export default function RespondButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handle(response: "accepted" | "declined") {
    setLoading(true);
    await respondToConnection(connectionId, response);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2 shrink-0">
      <button
        onClick={() => handle("accepted")}
        disabled={loading}
        className="rounded-xl bg-sni-brand-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-sni-brand-blue disabled:opacity-60 transition"
      >
        Elfogad
      </button>
      <button
        onClick={() => handle("declined")}
        disabled={loading}
        className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-300 hover:text-red-500 disabled:opacity-60 transition"
      >
        Elutasít
      </button>
    </div>
  );
}
