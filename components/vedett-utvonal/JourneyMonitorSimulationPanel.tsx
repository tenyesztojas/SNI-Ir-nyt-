"use client";

// JOURNEY MONITOR ADMIN SZIMULÁTOR (2026-10-07) — diagnosztikai panel, NEM
// termék-UI. Csak akkor renderelődik, ha a szülő (RankedJourneyCard) a
// szerveroldalon (kizárólag /admin/vedett-utvonal) bekapcsolt
// journeyMonitorSimulationEnabled propot kapta ÉS aktív a navigáció.
// Nincs analytics, nincs hálózati hívás — csak a szülő callbackjeit hívja,
// amelyek a VALÓDI realtime-feldolgozási láncot használják.

import type { JourneyMonitorSimulationKind } from "@/lib/vedett-route/navigation/journeyMonitorSimulation";
import type {
  LiveAlternativeDiagnosticRun,
  LiveAlternativeDiagnosticsState,
} from "@/lib/vedett-route/navigation/liveAlternativeDiagnostics";

/** Egy diagnosztikai futás egysoros, személyes adat nélküli összefoglalója (koordináta nincs). */
export function formatLiveAlternativeDiagnosticRun(run: LiveAlternativeDiagnosticRun | null): string {
  if (!run) return "—";
  const parts = [`${run.stage}${run.reason ? ` (${run.reason})` : ""}`, `${run.triggerType} ${run.eventId}`];
  if (run.originKind) parts.push(`origin: ${run.originKind}`);
  if (run.httpStatus !== null) parts.push(`HTTP ${run.httpStatus}`);
  if (run.candidateCount !== null) parts.push(`jelölt: ${run.candidateCount}`);
  return parts.join(" · ");
}

const KIND_LABEL: Record<JourneyMonitorSimulationKind, string> = {
  DELAY: "+10 perc késés",
  CANCELLED: "Járatkimaradás",
  MISSED_CONNECTION: "Elveszett csatlakozás",
};

export interface JourneyMonitorSimulationPanelProps {
  active: { kind: JourneyMonitorSimulationKind; tripId: string; connectionToTripId?: string } | null;
  missedConnectionAvailable: boolean;
  pendingEventId: string | null;
  lastTrigger: { type: string; eventId: string } | null;
  notice: string | null;
  onSimulate: (kind: JourneyMonitorSimulationKind) => void;
  onSimulatedPoll: () => void;
  onClear: () => void;
  liveAlternativeDiagnostics?: LiveAlternativeDiagnosticsState;
}

export default function JourneyMonitorSimulationPanel({
  active,
  missedConnectionAvailable,
  pendingEventId,
  lastTrigger,
  notice,
  onSimulate,
  onSimulatedPoll,
  onClear,
  liveAlternativeDiagnostics,
}: JourneyMonitorSimulationPanelProps) {
  const button = "rounded border border-amber-400 bg-white px-2 py-1 text-xs disabled:opacity-40";
  return (
    <div className="absolute bottom-24 left-2 z-30 w-64 rounded-lg border border-amber-400 bg-amber-50/95 p-2 text-xs text-gray-800 shadow-lg">
      <p className="mb-1 font-semibold">Journey Monitor teszt</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={() => onSimulate("DELAY")}>
          +10 perc késés
        </button>
        <button type="button" className={button} onClick={() => onSimulate("CANCELLED")}>
          Járatkimaradás
        </button>
        <button type="button" className={button} disabled={!missedConnectionAvailable} onClick={() => onSimulate("MISSED_CONNECTION")}>
          Elveszett csatlakozás
        </button>
        <button type="button" className={button} disabled={!active} onClick={onSimulatedPoll}>
          Szimulált poll
        </button>
        <button type="button" className={button} disabled={!active} onClick={onClear}>
          Szimuláció törlése
        </button>
      </div>
      {!missedConnectionAvailable && <p className="mt-1">Nincs szimulálható csatlakozás ezen az útvonalon.</p>}
      <p className="mt-1">
        Szimuláció: {active ? `${KIND_LABEL[active.kind]} — ${active.tripId}${active.connectionToTripId ? ` → ${active.connectionToTripId}` : ""}` : "nincs"}
      </p>
      <p>Pending: {pendingEventId ?? "—"}</p>
      <p>Utolsó trigger: {lastTrigger ? `${lastTrigger.type} (${lastTrigger.eventId})` : "—"}</p>
      <p className="mt-1">Live Alternative: {formatLiveAlternativeDiagnosticRun(liveAlternativeDiagnostics?.latest ?? null)}</p>
      <p>Utolsó keresés: {formatLiveAlternativeDiagnosticRun(liveAlternativeDiagnostics?.lastSearch ?? null)}</p>
      {notice && <p className="mt-1 font-medium">{notice}</p>}
    </div>
  );
}
