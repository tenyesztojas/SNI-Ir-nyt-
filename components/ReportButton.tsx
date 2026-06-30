"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { submitReport } from "@/lib/actions/reports";
import { REPORT_TYPE_OPTIONS } from "@/lib/reportTypes";
import { ReportType } from "@/lib/types";

export default function ReportButton({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("hibas_adat");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitReport({ placeId, reportType, description });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <p className="mt-2 text-sm text-sni-greendark">
        Köszönjük a jelzést, hamarosan átnézzük!
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-sni-warn"
      >
        <Flag size={14} /> Hibás adat jelentése
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex flex-col gap-2 rounded-xl2 border border-gray-200 bg-white p-4"
        >
          <label className="text-sm font-medium text-sni-text" htmlFor="report-type">
            Mi a probléma?
          </label>
          <select
            id="report-type"
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="input-field"
          >
            {REPORT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <label className="text-sm font-medium text-sni-text" htmlFor="report-description">
            Részletek
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input-field"
            placeholder="Pl. a telefonszám már nem helyes, vagy a hely bezárt."
            required
            minLength={5}
          />

          {error && <p className="text-sm text-sni-warn">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-secondary">
              Jelzés elküldése
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-gray-500 hover:underline"
            >
              Mégse
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
