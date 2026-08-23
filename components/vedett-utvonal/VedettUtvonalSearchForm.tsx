"use client";

import { useState } from "react";
import type { Journey, JourneySearchResult } from "@/lib/vedett-route/types";

function JourneyCard({ journey }: { journey: Journey }) {
  return (
    <div className="card">
      <div className="flex items-baseline justify-between">
        <p className="text-xl font-bold text-sni-text">{journey.totalDurationMinutes} perc</p>
        <p className="text-sm text-gray-500">
          {new Date(journey.departureTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
          {" → "}
          {new Date(journey.arrivalTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="mt-2 space-y-1">
        {journey.legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-medium">
              {leg.mode === "WALK" ? "Gyaloglás" : leg.routeShortName ?? leg.routeLongName ?? "Járat"}
            </span>
            <span className="text-gray-500">
              {leg.fromName} → {leg.toName} ({leg.durationMinutes} perc)
            </span>
            {leg.realtime ? (
              leg.delayMinutes ? (
                <span className="text-amber-600">+{leg.delayMinutes} perc valós idejű késés</span>
              ) : (
                <span className="text-green-600">valós idejű, pontos</span>
              )
            ) : (
              <span className="text-gray-400">menetrendi adat</span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {journey.transfers} átszállás · {journey.walkingMinutes} perc gyaloglás · {journey.waitingMinutes} perc várakozás
      </p>

      {!journey.realtimeAvailable && (
        <p className="mt-1 text-xs italic text-gray-400">Valós idejű adat nem áll rendelkezésre.</p>
      )}

      {journey.alerts.length > 0 && (
        <div className="mt-2 space-y-1">
          {journey.alerts.map((a) => (
            <p key={a.id} className="text-xs text-amber-700">
              ⚠️ {a.header}
              {a.description ? ` — ${a.description}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VedettUtvonalSearchForm({ disabled }: { disabled: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [datetime, setDatetime] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JourneySearchResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResult(null);

    if (!from.trim() || !to.trim()) {
      setFormError("Add meg az indulási helyet és a célhelyet.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/vedett-utvonal/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          departAt: when === "now" ? new Date().toISOString() : new Date(datetime).toISOString(),
        }),
      });
      const data = (await res.json()) as JourneySearchResult;
      setResult(data);
    } catch {
      setResult({ ok: false, reason: "routing_engine_unavailable", message: "Az útvonaltervezés átmenetileg nem érhető el." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">Útvonalkereső</h2>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Honnan?</label>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Cím vagy hely"
            disabled={disabled}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Hová?</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Cím vagy VédettSarok hely"
            disabled={disabled}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Indulás</label>
          <div className="mt-1 flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} disabled={disabled} /> Most
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={when === "scheduled"} onChange={() => setWhen("scheduled")} disabled={disabled} /> Időpont
            </label>
            {when === "scheduled" && (
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                disabled={disabled}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button type="submit" disabled={disabled || loading} className="btn-primary disabled:opacity-50">
          {loading ? "Keresés…" : "Útvonal keresése"}
        </button>

        {disabled && (
          <p className="text-sm text-amber-700">
            A funkció ki van kapcsolva (feature flag: VEDETT_ROUTE_ENABLED=false).
          </p>
        )}
      </form>

      {result && !result.ok && (
        <p className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">{result.message}</p>
      )}

      {result?.ok && result.journeys.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">Nem található útvonal a megadott feltételekkel.</p>
      )}

      {result?.ok && result.journeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {result.journeys.slice(0, 5).map((j, i) => (
            <JourneyCard key={i} journey={j} />
          ))}
        </div>
      )}
    </div>
  );
}
