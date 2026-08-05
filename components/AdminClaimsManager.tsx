"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { PlaceClaim } from "@/lib/types";
import { approveClaim, rejectClaim } from "@/lib/actions/claims";

interface Props {
  pending: PlaceClaim[];
  others: PlaceClaim[];
}

export default function AdminClaimsManager({ pending, others }: Props) {
  const [items, setItems] = useState<PlaceClaim[]>([...pending, ...others]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(id: string) {
    startTransition(async () => {
      const r = await approveClaim(id);
      if (r.error) { setError(r.error); return; }
      setItems((prev) => prev.map((c) => c.id === id ? { ...c, status: "verified" as const } : c));
    });
  }

  function handleReject(id: string) {
    const reason = prompt("Elutasítás oka (opcionális):");
    if (reason === null) return; // Cancel pressed
    startTransition(async () => {
      const r = await rejectClaim(id, reason || undefined);
      if (r.error) { setError(r.error); return; }
      setItems((prev) => prev.map((c) => c.id === id ? { ...c, status: "rejected" as const, rejectReason: reason } : c));
    });
  }

  const pendingItems = items.filter((c) => c.status === "pending");
  const otherItems = items.filter((c) => c.status !== "pending");

  return (
    <div className="mt-5 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pendingItems.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
            Várakozó igénylések ({pendingItems.length})
          </h2>
          <div className="space-y-3">
            {pendingItems.map((c) => (
              <ClaimCard
                key={c.id}
                claim={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                onApprove={() => handleApprove(c.id)}
                onReject={() => handleReject(c.id)}
                isPending={isPending}
              />
            ))}
          </div>
        </section>
      )}

      {otherItems.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Lezárt igénylések
          </h2>
          <div className="space-y-3">
            {otherItems.map((c) => (
              <ClaimCard
                key={c.id}
                claim={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                isPending={isPending}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ClaimCard({
  claim, expanded, onToggle, onApprove, onReject, isPending,
}: {
  claim: PlaceClaim;
  expanded: boolean;
  onToggle: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isPending: boolean;
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    verified: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-700",
  };
  const statusLabels: Record<string, string> = {
    pending: "Várakozó",
    verified: "Megerősítve",
    rejected: "Elutasítva",
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">
            {claim.placeName ?? claim.placeId}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {claim.verificationData} · {claim.verificationMethod}
          </p>
          <p className="text-xs text-gray-400">
            {new Date(claim.createdAt).toLocaleString("hu-HU")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[claim.status] ?? "bg-gray-100 text-gray-600"}`}>
            {statusLabels[claim.status] ?? claim.status}
          </span>
          <button onClick={onToggle} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1 text-xs text-gray-600 border-t border-gray-50 pt-3">
          <p><span className="font-medium">User ID:</span> {claim.claimantUserId}</p>
          <p><span className="font-medium">Hely ID:</span> {claim.placeId}</p>
          {claim.rejectReason && (
            <p className="text-red-600"><span className="font-medium">Elutasítás oka:</span> {claim.rejectReason}</p>
          )}
          {claim.verifiedAt && (
            <p className="text-emerald-700"><span className="font-medium">Megerősítve:</span> {new Date(claim.verifiedAt).toLocaleString("hu-HU")}</p>
          )}
        </div>
      )}

      {claim.status === "pending" && onApprove && onReject && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={isPending}
            onClick={onApprove}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 size={13} /> Jóváhagyás
          </button>
          <button
            disabled={isPending}
            onClick={onReject}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle size={13} /> Elutasítás
          </button>
        </div>
      )}
    </div>
  );
}
