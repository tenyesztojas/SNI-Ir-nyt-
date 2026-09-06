"use client";

import { useState } from "react";
import type { OrchestratedSearchResult, PersonalizationWeights, RankedJourney, RankingLabel } from "@/lib/vedett-route/types";

type SearchApiResponse =
  | OrchestratedSearchResult
  | { ok: false; reason: string; message: string };

const LABEL_META: Record<RankingLabel, { text: string; className: string }> = {
  FASTEST: { text: "Leggyorsabb", className: "bg-blue-100 text-blue-800" },
  FEWEST_TRANSFERS: { text: "Legkevesebb átszállás", className: "bg-purple-100 text-purple-800" },
  CALMEST: { text: "Legnyugodtabb (becsült)", className: "bg-green-100 text-green-800" },
};

const FACTOR_LABELS: Record<string, string> = {
  transfers: "Átszállások száma",
  modeSwitches: "Közlekedési mód váltások",
  underground: "Földalatti (metró) arány",
  walking: "Gyaloglás",
  duration: "Teljes utazási idő",
  waiting: "Várakozás",
  crowding: "Jármű-foglaltság (valós idejű)",
  vehicleAccessibility: "Jármű-szintű akadálymentesség / érzékszervi terhelés",
};

function RankedJourneyCard({ ranked }: { ranked: RankedJourney }) {
  const journey = ranked.journey;
  const sensory = journey.sensory;

  return (
    <div className="card border-2" style={{ borderColor: ranked.labels.length > 0 ? "#93c5fd" : "#e5e7eb" }}>
      <div className="flex flex-wrap items-center gap-2">
        {ranked.labels.map((label) => (
          <span key={label} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_META[label].className}`}>
            {LABEL_META[label].text}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-xl font-bold text-sni-text">{journey.totalDurationMinutes} perc</p>
        <p className="text-sm text-gray-500">
          {new Date(journey.departureTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
          {" → "}
          {new Date(journey.arrivalTime).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="mt-2 space-y-1">
        {journey.legs.map((leg, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {leg.mode === "WALK" ? "Gyaloglás" : `${leg.transitMode ?? ""} ${leg.routeShortName ?? leg.routeLongName ?? "Járat"}`.trim()}
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

      {sensory && (
        <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-700">
          <p>
            Szenzoros terhelés becslés: <span className="font-semibold">{Math.round(100 - sensory.score)}/100</span>{" "}
            (magasabb = nyugodtabb) · Adatlefedettség:{" "}
            <span className="font-semibold">{Math.round(sensory.confidence * 100)}%</span>
          </p>
          {sensory.missingFactors.length > 0 && (
            <p className="mt-1 text-gray-500">
              Nem elérhető adat, ezért nem számít bele: {sensory.missingFactors.map((f) => FACTOR_LABELS[f] ?? f).join(", ")}.
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-sm text-sni-text">{ranked.explanation}</p>

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

const WEIGHT_FIELDS: { key: keyof PersonalizationWeights; label: string }[] = [
  { key: "transfers", label: "Átszállások zavarnak" },
  { key: "modeSwitches", label: "Közlekedési mód váltása zavar" },
  { key: "underground", label: "Földalatti (metró) szakasz zavar" },
  { key: "walking", label: "Sok gyaloglás zavar" },
  { key: "duration", label: "Hosszú utazási idő zavar" },
  { key: "waiting", label: "Várakozás zavar" },
];

export default function VedettUtvonalSearchForm({ disabled }: { disabled: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [datetime, setDatetime] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchApiResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [weights, setWeights] = useState<PersonalizationWeights>({
    transfers: 1,
    modeSwitches: 1,
    underground: 1,
    walking: 1,
    duration: 1,
    waiting: 1,
  });

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
          weights,
        }),
      });
      const data = (await res.json()) as SearchApiResponse;
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

        <div>
          <button
            type="button"
            onClick={() => setShowPersonalization((v) => !v)}
            className="text-sm font-medium text-sni-primary underline"
          >
            {showPersonalization ? "Személyre szabás elrejtése" : "Személyre szabás (mennyire zavaró egy-egy tényező neked?)"}
          </button>
          {showPersonalization && (
            <div className="mt-2 space-y-2 rounded bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                Ez nem diagnózis-alapú beállítás — csak a te személyes preferenciádat súlyozza. 0 = nem számít, 1 = alapértelmezett, 2 = kétszeresen fontos.
              </p>
              {WEIGHT_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="w-56 text-xs text-gray-700">{label}</label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.25}
                    value={weights[key]}
                    disabled={disabled}
                    onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right text-xs text-gray-600">{weights[key]}</span>
                </div>
              ))}
            </div>
          )}
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
          <p className="text-xs text-gray-500">
            Adatforrás: BKK · Átlagos adatlefedettség: {Math.round(result.dataCoverage.sensoryConfidenceAvg * 100)}%
            {result.dataCoverage.motisImportedAt && ` · MOTIS adat frissessége: ${new Date(result.dataCoverage.motisImportedAt).toLocaleString("hu-HU")}`}
          </p>
          {result.journeys.map((r, i) => (
            <RankedJourneyCard key={i} ranked={r} />
          ))}
        </div>
      )}
    </div>
  );
}
