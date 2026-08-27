"use client";

import { useState } from "react";

interface UploadResult {
  ok: boolean;
  message?: string;
  provider?: string;
  lastUpdated?: string;
  feedVersion?: string | null;
  feedInfo?: { feedPublisherName?: string; feedStartDate?: string; feedEndDate?: string } | null;
  entryCount?: number;
}

export default function VedettUtvonalGtfsUploadForm({ disabled }: { disabled: boolean }) {
  const [provider, setProvider] = useState<"MAV_RAIL" | "MAV_BUS">("MAV_RAIL");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("provider", provider);
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/vedett-utvonal/gtfs-upload", { method: "POST", body: formData });
      const data = (await res.json()) as UploadResult;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "A feltöltés sikertelen (hálózati hiba)." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">GTFS statikus feed feltöltése (MÁV / Volán)</h2>
      <p className="mt-1 text-sm text-gray-500">
        A MÁV és a MÁV/Volán GTFS-nek nincs dokumentált, kulcsos OpenData API-ja mint a BKK-nak — a zip fájlt
        manuálisan kell beszerezni és itt feltölteni. A rendszer ellenőrzi, hogy a zip valóban GTFS statikus
        struktúrájú-e (agency/stops/routes/trips/stop_times.txt megléte), mielőtt elmentené.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Adatforrás</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as "MAV_RAIL" | "MAV_BUS")}
            disabled={disabled}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="MAV_RAIL">MÁV – vasút</option>
            <option value="MAV_BUS">MÁV / Volán – autóbusz</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">GTFS zip fájl</label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={disabled}
            className="mt-1 w-full text-sm"
          />
        </div>

        <button type="submit" disabled={disabled || uploading || !file} className="btn-primary disabled:opacity-50">
          {uploading ? "Feltöltés és ellenőrzés…" : "Feltöltés"}
        </button>

        {disabled && (
          <p className="text-sm text-amber-700">A funkció ki van kapcsolva (feature flag: VEDETT_ROUTE_ENABLED=false).</p>
        )}
      </form>

      {result && (
        <div className={`mt-4 rounded p-3 text-sm ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {result.ok ? (
            <>
              <p className="font-medium">Sikeres feltöltés — {result.provider}</p>
              {result.feedInfo?.feedPublisherName && <p>Kiadó: {result.feedInfo.feedPublisherName}</p>}
              {result.feedInfo?.feedStartDate && result.feedInfo?.feedEndDate && (
                <p>Érvényesség: {result.feedInfo.feedStartDate} – {result.feedInfo.feedEndDate}</p>
              )}
              {result.feedVersion && <p>Verzió: {result.feedVersion}</p>}
              <p>Fájlok a zip-ben: {result.entryCount}</p>
            </>
          ) : (
            <p>{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
