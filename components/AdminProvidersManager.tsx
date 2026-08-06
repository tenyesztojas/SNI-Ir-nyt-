"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { ProviderRegistration } from "@/lib/types";
import { approveProviderRegistration, rejectProviderRegistration } from "@/lib/actions/provider";

const BOOKING_TYPE_LABELS: Record<string, string> = {
  appointment: "Időpontos",
  accommodation: "Szállásfoglalás",
  both: "Mindkettő",
};

interface Props {
  pending: ProviderRegistration[];
  others: ProviderRegistration[];
}

export default function AdminProvidersManager({ pending, others }: Props) {
  const [items, setItems] = useState([...pending, ...others]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(id: string) {
    if (!confirm("Jóváhagyod ezt a szolgáltatói regisztrációt?")) return;
    startTransition(async () => {
      const r = await approveProviderRegistration(id);
      if (r.error) { setError(r.error); return; }
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "approved" as const } : i));
    });
  }

  function handleReject(id: string) {
    const reason = prompt("Elutasítás oka:");
    if (reason === null) return;
    startTransition(async () => {
      const r = await rejectProviderRegistration(id, reason || "Nem felelt meg a követelményeknek.");
      if (r.error) { setError(r.error); return; }
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "rejected" as const, rejectReason: reason } : i));
    });
  }

  const pendingItems = items.filter((i) => i.status === "pending");
  const otherItems = items.filter((i) => i.status !== "pending");

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-800",
      approved: "bg-emerald-100 text-emerald-800",
      rejected: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      pending: "Várakozó", approved: "Jóváhagyott", rejected: "Elutasított",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100"}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pendingItems.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3">
            Várakozó kérelmek ({pendingItems.length})
          </h2>
          <div className="space-y-3">
            {pendingItems.map((reg) => (
              <RegCard key={reg.id} reg={reg} expanded={expandedId === reg.id}
                onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                onApprove={() => handleApprove(reg.id)}
                onReject={() => handleReject(reg.id)}
                isPending={isPending} statusBadge={statusBadge} />
            ))}
          </div>
        </section>
      )}

      {otherItems.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Lezárt kérelmek
          </h2>
          <div className="space-y-3">
            {otherItems.map((reg) => (
              <RegCard key={reg.id} reg={reg} expanded={expandedId === reg.id}
                onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                isPending={isPending} statusBadge={statusBadge} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RegCard({ reg, expanded, onToggle, onApprove, onReject, isPending, statusBadge }: {
  reg: ProviderRegistration;
  expanded: boolean;
  onToggle: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isPending: boolean;
  statusBadge: (s: string) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-sni-brand-teal" />
            <p className="font-semibold text-gray-900 text-sm">{reg.companyName}</p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {reg.placeName ?? "Nincs hely"} · {reg.contactEmail} · {BOOKING_TYPE_LABELS[reg.bookingType]}
          </p>
          <p className="text-xs text-gray-400">{new Date(reg.createdAt).toLocaleString("hu-HU")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge(reg.status)}
          <button onClick={onToggle} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-gray-50 pt-3 space-y-1 text-xs text-gray-600">
          <p><span className="font-medium">Kapcsolattartó:</span> {reg.contactName}</p>
          {reg.contactPhone && <p><span className="font-medium">Telefon:</span> {reg.contactPhone}</p>}
          {reg.customDescription && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-700">{reg.customDescription}</p>
          )}
          {reg.rejectReason && (
            <p className="text-red-600"><span className="font-medium">Elutasítás oka:</span> {reg.rejectReason}</p>
          )}
        </div>
      )}

      {reg.status === "pending" && onApprove && onReject && (
        <div className="mt-3 flex gap-2">
          <button disabled={isPending} onClick={onApprove}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <CheckCircle2 size={13} /> Jóváhagyás
          </button>
          <button disabled={isPending} onClick={onReject}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            <XCircle size={13} /> Elutasítás
          </button>
        </div>
      )}
    </div>
  );
}
