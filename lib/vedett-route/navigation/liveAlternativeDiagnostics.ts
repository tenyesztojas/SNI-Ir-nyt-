// ADMIN LIVE ALTERNATIVE DIAGNOSZTIKA (2026-10-08) — KIZÁRÓLAG diagnosztikai
// láthatóság az admin Journey Monitor szimulátor panelhez (/admin/vedett-
// utvonal, szerveroldali admin-gate mögött). NEM befolyásol semmilyen döntést:
// a maybeStartLiveAlternativeSearch() csak JELENTI, hol és miért állt meg.
//
// Csak memóriában (React state), nincs perzisztálás, nincs analytics, nincs
// koordináta / személyes adat — kizárólag állapotkód, ok-kód, origin-típus,
// HTTP status és jelöltszám.

export type LiveAlternativeDiagnosticStage =
  | "TRIGGER_RECEIVED"
  | "GUARD_BLOCKED"
  | "ORIGIN_SKIPPED"
  | "SEARCH_STARTED"
  | "SEARCH_FAILED"
  | "SEARCH_RESULTS"
  | "CANDIDATE_REJECTED"
  | "OFFERED";

export interface LiveAlternativeDiagnosticEvent {
  stage: LiveAlternativeDiagnosticStage;
  /** Pontos ok-kód (pl. GPS_UNRELIABLE, COOLDOWN_ACTIVE, NO_ALIGHTING_TIME, NO_DISTINCT_CANDIDATE). */
  reason?: string;
  /** Csak a típus — koordináta SOHA. */
  originKind?: "GPS" | "ALIGHTING";
  httpStatus?: number;
  candidateCount?: number;
}

export interface LiveAlternativeDiagnosticRun {
  runId: number;
  triggerType: string;
  eventId: string;
  stage: LiveAlternativeDiagnosticStage;
  reason: string | null;
  originKind: "GPS" | "ALIGHTING" | null;
  httpStatus: number | null;
  candidateCount: number | null;
}

export interface LiveAlternativeDiagnosticsState {
  /** Az UTOLSÓ (legfrissebb runId-jű) folyamat aktuális állapota. */
  latest: LiveAlternativeDiagnosticRun | null;
  /** Az utolsó folyamat, amely ténylegesen keresést indított (SEARCH_STARTED-ig eljutott). */
  lastSearch: LiveAlternativeDiagnosticRun | null;
}

export function createInitialLiveAlternativeDiagnosticsState(): LiveAlternativeDiagnosticsState {
  return { latest: null, lastSearch: null };
}

/** Új folyamat kezdete (TRIGGER_RECEIVED) — a korábbi folyamat késői eseményei ezután nem írhatják felül. */
export function startLiveAlternativeDiagnosticRun(
  state: LiveAlternativeDiagnosticsState,
  run: { runId: number; triggerType: string; eventId: string }
): LiveAlternativeDiagnosticsState {
  return {
    ...state,
    latest: {
      runId: run.runId,
      triggerType: run.triggerType,
      eventId: run.eventId,
      stage: "TRIGGER_RECEIVED",
      reason: null,
      originKind: null,
      httpStatus: null,
      candidateCount: null,
    },
  };
}

function applyEvent(run: LiveAlternativeDiagnosticRun, event: LiveAlternativeDiagnosticEvent): LiveAlternativeDiagnosticRun {
  return {
    ...run,
    stage: event.stage,
    reason: event.reason ?? null,
    originKind: event.originKind ?? run.originKind,
    httpStatus: event.httpStatus ?? run.httpStatus,
    candidateCount: event.candidateCount ?? run.candidateCount,
  };
}

/**
 * Egy folyamat eseménye. A `runId` köti a folyamathoz: más (régebbi) futás
 * eseménye nem keveredhet a legfrissebbe — csak a saját `lastSearch`
 * bejegyzését frissítheti, ha az ő keresése az utolsó keresés.
 */
export function reportLiveAlternativeDiagnostic(
  state: LiveAlternativeDiagnosticsState,
  runId: number,
  event: LiveAlternativeDiagnosticEvent
): LiveAlternativeDiagnosticsState {
  const latest = state.latest && state.latest.runId === runId ? applyEvent(state.latest, event) : state.latest;
  let lastSearch = state.lastSearch;
  if (event.stage === "SEARCH_STARTED" && latest && latest.runId === runId) {
    lastSearch = latest;
  } else if (lastSearch && lastSearch.runId === runId) {
    lastSearch = applyEvent(lastSearch, event);
  }
  return { latest, lastSearch };
}
