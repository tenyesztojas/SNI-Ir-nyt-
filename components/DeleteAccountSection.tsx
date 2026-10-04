"use client";

import { useState } from "react";
import { clearNavigationSession } from "@/lib/vedett-route/navigation/navigationSessionPersistence";

export default function DeleteAccountSection() {
  const [step, setStep] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.message ?? "A fiók törlése most nem sikerült. Próbáld újra később.");
        setBusy(false);
        return;
      }
      clearNavigationSession();
      window.location.assign("/");
    } catch {
      setError("A fiók törlése most nem sikerült. Próbáld újra később.");
      setBusy(false);
    }
  }

  return (
    <div id="fiok-torlese" className="mt-8 rounded-2xl border border-red-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-bold text-gray-900">Fiók törlése</h2>
      {step === 0 ? (
        <button type="button" onClick={() => setStep(1)} className="btn-secondary mt-3 min-h-[44px]">
          Fiók törlése
        </button>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-gray-700">
            A fiók törlése végleges. A fiókodhoz kapcsolódó személyes adatok és mentett adatok törlésre kerülnek,
            kivéve azokat az adatokat, amelyeket jogszabály alapján tovább kell megőriznünk.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="min-h-[44px] rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {busy ? "Törlés…" : "Fiókom végleges törlése"}
            </button>
            <button type="button" disabled={busy} onClick={() => setStep(0)} className="btn-secondary min-h-[44px]">
              Mégse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
