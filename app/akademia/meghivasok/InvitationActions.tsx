"use client";
import { useState, useTransition } from "react";
import { resendInvitation, revokeInvitation } from "@/lib/academy/actions";

export default function InvitationActions({ enrollmentId }: { enrollmentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revoked, setRevoked] = useState(false);

  function handleResend() {
    startTransition(async () => {
      const res = await resendInvitation(enrollmentId);
      setMsg(res.ok ? { ok: true, text: "Újraküldve." } : { ok: false, text: res.error ?? "Hiba." });
    });
  }

  function handleRevoke() {
    if (!confirm("Biztosan visszavonod ezt a meghívást?")) return;
    startTransition(async () => {
      const res = await revokeInvitation(enrollmentId);
      if (res.ok) {
        setRevoked(true);
        setMsg({ ok: true, text: "Visszavonva." });
      } else {
        setMsg({ ok: false, text: res.error ?? "Hiba." });
      }
    });
  }

  if (revoked) {
    return <span className="text-xs text-gray-400">Visszavonva</span>;
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex gap-2">
        <button
          onClick={handleResend}
          disabled={isPending}
          className="text-xs text-sni-brand-blue underline hover:no-underline disabled:opacity-50"
        >
          Újraküldés
        </button>
        <span className="text-gray-200">|</span>
        <button
          onClick={handleRevoke}
          disabled={isPending}
          className="text-xs text-red-500 underline hover:no-underline disabled:opacity-50"
        >
          Visszavonás
        </button>
      </div>
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</span>
      )}
    </div>
  );
}
