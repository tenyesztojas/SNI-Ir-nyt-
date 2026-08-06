"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Booking, BookingStatus } from "@/lib/types";
import { confirmBooking, rejectBooking } from "@/lib/actions/bookings";

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Várakozó", confirmed: "Visszaigazolt", rejected: "Elutasított",
  cancelled: "Lemondva", completed: "Teljesített",
};
const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-800", confirmed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700", cancelled: "bg-gray-100 text-gray-600",
  completed: "bg-blue-100 text-blue-800",
};

export default function ProviderBookingsManager({ bookings: initial }: { bookings: Booking[] }) {
  const [bookings, setBookings] = useState(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BookingStatus | "all">("all");

  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  function handleConfirm(id: string) {
    startTransition(async () => {
      const r = await confirmBooking(id);
      if (r.error) { setError(r.error); return; }
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "confirmed" as const, confirmedAt: new Date().toISOString() } : b));
    });
  }

  function handleReject(id: string) {
    const reason = prompt("Elutasítás oka (kötelező):");
    if (!reason) return;
    startTransition(async () => {
      const r = await rejectBooking(id, reason);
      if (r.error) { setError(r.error); return; }
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "rejected" as const, rejectReason: reason } : b));
    });
  }

  return (
    <div>
      {/* Szűrő */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "pending", "confirmed", "rejected", "cancelled"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-sni-brand-teal text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f === "all" ? "Összes" : STATUS_LABELS[f as BookingStatus]}
            {f !== "all" && ` (${bookings.filter((b) => b.status === f).length})`}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-10">Nincs foglalás ebben a kategóriában.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div key={b.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{b.guestName}</p>
                  <p className="text-xs text-gray-500">
                    {b.packageName} ·{" "}
                    {b.bookingType === "appointment"
                      ? `${b.appointmentDate ?? ""} ${b.appointmentTime ?? ""}`
                      : `${b.checkinDate ?? ""} → ${b.checkoutDate ?? ""} (${b.numGuests} fő)`}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString("hu-HU")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                  <button onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100">
                    {expandedId === b.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {expandedId === b.id && (
                <div className="mt-3 border-t border-gray-50 pt-3 space-y-1 text-xs text-gray-600">
                  <p><span className="font-medium">E-mail:</span> {b.guestEmail}</p>
                  {b.guestPhone && <p><span className="font-medium">Telefon:</span> {b.guestPhone}</p>}
                  {b.guestNote && <p className="rounded-lg bg-gray-50 px-3 py-2 mt-2">{b.guestNote}</p>}
                  {b.totalAmount && <p><span className="font-medium">Összeg:</span> {b.totalAmount.toLocaleString("hu-HU")} {b.currency}</p>}
                  <p className="text-gray-400">Adatmegőrzés: {b.dataRetentionUntil}</p>
                  {b.rejectReason && <p className="text-red-600"><span className="font-medium">Elutasítás oka:</span> {b.rejectReason}</p>}
                </div>
              )}

              {b.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button disabled={isPending} onClick={() => handleConfirm(b.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Visszaigazolás
                  </button>
                  <button disabled={isPending} onClick={() => handleReject(b.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <XCircle size={13} /> Elutasítás
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
