"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportJob } from "@/app/vedettmunka/actions";
import { REPORT_REASONS } from "@/lib/vedettmunka/types";

export default function JobReportButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("job_id", jobId);
    startTransition(async () => {
      try {
        await reportJob(fd);
        setDone(true);
        setOpen(false);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (done) return <p className="text-sm text-gray-500">Köszönjük a jelzést!</p>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-500 transition hover:border-red-200 hover:text-red-600"
      >
        <Flag size={16} /> Hirdetés jelzése
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="font-bold text-sni-brand-navy">Hirdetés jelzése</h3>
            <p className="mt-1 text-xs text-gray-500">
              Kérlek válaszd ki az okot, majd küld el. Az admin megvizsgálja a jelzést.
            </p>
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500">Ok *</span>
              <select
                name="reason"
                required
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500">Leírás (opcionális)</span>
              <textarea
                name="description"
                rows={3}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-full bg-sni-brand-navy py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {isPending ? "Küldés..." : "Jelzés elküldése"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm"
              >
                Mégse
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
