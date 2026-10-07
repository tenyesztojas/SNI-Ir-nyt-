// JOURNEY MONITOR ADMIN SZIMULÁTOR (2026-10-07) — KIZÁRÓLAG diagnosztikai,
// admin-only eszköz (a panelt csak az /admin/vedett-utvonal szerverkomponense
// kapcsolhatja be, lásd app/admin/layout.tsx szerveroldali admin-ellenőrzése).
//
// Ez a modul NEM implementál Journey Monitort: kizárólag valódi
// RealtimeLegUpdate-alakú frissítéseket állít elő a jelenlegi journey-ből,
// amelyeket a VALÓDI realtime-feldolgozási lánc (VedettUtvonalSearchForm
// handleRealtimeUpdates -> evaluateRealtimeDegradation -> mergeRealtimeUpdates
// -> evaluateMissedConnection -> decideRealtimeMonitorTrigger -> Live
// Alternative) dolgoz fel. Trigger-típust SOHA nem injektál.
//
// Csak memóriában él: nincs Supabase, localStorage, cookie, URL, analytics,
// navigation-session perzisztálás. Csak a saját kliens által feldolgozott
// update-tömböt módosítja — a valódi realtime feedet / MOTIS-t nem.

import type { Journey, JourneyLeg } from "../types.ts";
import type { RealtimeLegUpdate } from "../realtimeRefresh/extractUpdates.ts";

export type JourneyMonitorSimulationKind = "DELAY" | "CANCELLED" | "MISSED_CONNECTION";

/** A +10 perces késés szimuláció mértéke. */
export const SIMULATED_DELAY_MINUTES = 10;
/** Elveszett csatlakozásnál a cél-tartalék (perc): egyértelműen <= -1 (CLEARLY_MISSED), kis margóval. */
export const SIMULATED_MISSED_TARGET_SLACK_MINUTES = -2;

export interface JourneyMonitorSimulation {
  kind: JourneyMonitorSimulationKind;
  /** Az érintett trip (MISSED esetén a késleltetett, jelenlegi láb tripje). */
  tripId: string;
  routeId?: string;
  /** MISSED esetén a lekésett, következő TRANSIT láb tripje. */
  connectionToTripId?: string;
  /** A szimulált (rögzített) frissítések — minden szimulált poll UGYANEZT adja át. */
  updates: RealtimeLegUpdate[];
  /** A navigációs session generációja a szimuláció indításakor (session-váltás után inaktív). */
  sessionGeneration: number;
}

const parseMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const shift = (iso: string | undefined, minutes: number): string | undefined => {
  const ms = parseMs(iso);
  return ms === null ? undefined : new Date(ms + minutes * 60_000).toISOString();
};
const legMinutes = (leg: JourneyLeg): number | null =>
  typeof leg.durationMinutes === "number" && Number.isFinite(leg.durationMinutes) && leg.durationMinutes >= 0 ? leg.durationMinutes : null;

/** Az első még hátralévő, tripId-vel rendelkező, nem kimaradt TRANSIT láb indexe. */
export function findSimulationTargetLegIndex(journey: Journey, activeLegIndex: number | null): number | null {
  const from = Math.max(0, activeLegIndex ?? 0);
  for (let i = from; i < journey.legs.length; i++) {
    const leg = journey.legs[i];
    if (leg.mode === "TRANSIT" && leg.tripId && leg.cancelled !== true) return i;
  }
  return null;
}

export interface SimulatableConnection {
  fromLegIndex: number;
  toLegIndex: number;
  /** A jelenlegi tartalék (perc) — UGYANAZ a képlet, mint evaluateMissedConnection-ben. */
  slackMinutes: number;
  /** Ennyivel kell késleltetni az első láb érkezését a cél-tartalékhoz. */
  requiredDelayMinutes: number;
}

/**
 * TRANSIT -> (opcionális nem-TRANSIT lábak) -> TRANSIT pár a hátralévő részben,
 * az evaluateMissedConnection párosítási szabályai szerint (tripId mindkét
 * oldalon, nincs kimaradás, érvényes közbeeső időtartamok és időpontok).
 */
export function findSimulatableConnection(journey: Journey, activeLegIndex: number | null): SimulatableConnection | null {
  const legs = journey.legs;
  for (let i = Math.max(0, activeLegIndex ?? 0); i < legs.length; i++) {
    const current = legs[i];
    if (current.mode !== "TRANSIT") continue;
    let j = i + 1;
    let between = 0;
    let valid = true;
    while (j < legs.length && legs[j].mode !== "TRANSIT") {
      const m = legMinutes(legs[j]);
      if (m === null) valid = false;
      else between += m;
      j++;
    }
    if (j >= legs.length) return null;
    const next = legs[j];
    if (!valid || current.cancelled === true || next.cancelled === true || !current.tripId || !next.tripId) continue;
    const arrivalMs = parseMs(current.arrivalTime);
    const departureMs = parseMs(next.departureTime);
    if (arrivalMs === null || departureMs === null) continue;
    const slackMinutes = (departureMs - (arrivalMs + between * 60_000)) / 60_000;
    const requiredDelayMinutes = Math.max(1, Math.ceil(slackMinutes - SIMULATED_MISSED_TARGET_SLACK_MINUTES));
    return { fromLegIndex: i, toLegIndex: j, slackMinutes, requiredDelayMinutes };
  }
  return null;
}

/** A jelenlegi journey-ből épít RealtimeLegUpdate-alakú szimulációt; null, ha nem építhető. */
export function buildJourneyMonitorSimulation(input: {
  journey: Journey;
  activeLegIndex: number | null;
  kind: JourneyMonitorSimulationKind;
  sessionGeneration: number;
}): JourneyMonitorSimulation | null {
  const { journey, activeLegIndex, kind, sessionGeneration } = input;

  if (kind === "MISSED_CONNECTION") {
    const connection = findSimulatableConnection(journey, activeLegIndex);
    if (!connection) return null;
    const leg = journey.legs[connection.fromLegIndex];
    const next = journey.legs[connection.toLegIndex];
    const scheduledArrival = leg.scheduledArrivalTime ?? leg.arrivalTime;
    const arrivalTime = shift(leg.arrivalTime, connection.requiredDelayMinutes);
    const arrivalMs = parseMs(arrivalTime);
    const scheduledMs = parseMs(scheduledArrival);
    const update: RealtimeLegUpdate = {
      tripId: leg.tripId!,
      ...(leg.routeId !== undefined ? { routeId: leg.routeId } : {}),
      realtime: true,
      departureTime: leg.departureTime,
      scheduledDepartureTime: leg.scheduledDepartureTime ?? leg.departureTime,
      arrivalTime,
      scheduledArrivalTime: scheduledArrival,
      ...(arrivalMs !== null && scheduledMs !== null ? { delayMinutes: Math.round((arrivalMs - scheduledMs) / 60_000) } : {}),
    };
    return {
      kind,
      tripId: leg.tripId!,
      routeId: leg.routeId,
      connectionToTripId: next.tripId,
      updates: [update],
      sessionGeneration,
    };
  }

  const index = findSimulationTargetLegIndex(journey, activeLegIndex);
  if (index === null) return null;
  const leg = journey.legs[index];
  const identity = { tripId: leg.tripId!, ...(leg.routeId !== undefined ? { routeId: leg.routeId } : {}) };

  if (kind === "CANCELLED") {
    return { kind, tripId: leg.tripId!, routeId: leg.routeId, updates: [{ ...identity, realtime: true, cancelled: true }], sessionGeneration };
  }

  // DELAY: menetrendi idő + 10 perc, delayMinutes = 10 (a valódi extractUpdates alakja).
  const scheduledDepartureTime = leg.scheduledDepartureTime ?? leg.departureTime;
  const scheduledArrivalTime = leg.scheduledArrivalTime ?? leg.arrivalTime;
  if (!scheduledDepartureTime && !scheduledArrivalTime) return null;
  return {
    kind,
    tripId: leg.tripId!,
    routeId: leg.routeId,
    updates: [
      {
        ...identity,
        realtime: true,
        scheduledDepartureTime,
        departureTime: shift(scheduledDepartureTime, SIMULATED_DELAY_MINUTES),
        scheduledArrivalTime,
        arrivalTime: shift(scheduledArrivalTime, SIMULATED_DELAY_MINUTES),
        delayMinutes: SIMULATED_DELAY_MINUTES,
      },
    ],
    sessionGeneration,
  };
}

/** A szimuláció a megadott navigációs sessionben aktív-e (session-váltás = elfogadott alternatíva, reroute, stop/start). */
export function isSimulationActive(simulation: JourneyMonitorSimulation | null, sessionGeneration: number): simulation is JourneyMonitorSimulation {
  return simulation !== null && simulation.sessionGeneration === sessionGeneration;
}

/**
 * Overlay a VALÓDI poll frissítéseire: a szimulált trip(ek) valódi
 * frissítését a szimulált állapot váltja, a többi frissítés érintetlen.
 * Inaktív szimulációnál a bemenetet VÁLTOZATLANUL (ugyanazt a tömböt) adja vissza.
 */
export function applySimulationOverlay(
  updates: RealtimeLegUpdate[],
  simulation: JourneyMonitorSimulation | null,
  sessionGeneration: number
): RealtimeLegUpdate[] {
  if (!isSimulationActive(simulation, sessionGeneration)) return updates;
  const simulatedTrips = new Set(simulation.updates.map((u) => u.tripId));
  return [...updates.filter((u) => !simulatedTrips.has(u.tripId)), ...simulation.updates];
}
