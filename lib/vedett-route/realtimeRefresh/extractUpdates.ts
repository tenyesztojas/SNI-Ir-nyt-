// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — PURE extraction: a friss
// MOTIS /api/v6/plan válasz NYERS legs-eiből kizárólag a kért, stabil
// identitású (tripId, opcionálisan routeId) TRANSIT lábak refreshelhető
// mezőit nyeri ki. SOHA nem párosít routeShortName/busszám/megállónév/
// timestamp/leg-index alapján — kizárólag PONTOS tripId (+ ha megadott,
// routeId) egyezés esetén.
//
// computeDelayMinutes-t az orchestrator.ts-ből importálja (NEM
// duplikálja) — ugyanaz a bizonyított logika, mint a keresés-időpontban.

import { computeDelayMinutes } from "../orchestrator.ts";
import type { MotisLeg } from "../motisTypes.ts";

export interface RealtimeRefreshIdentity {
  tripId: string;
  routeId?: string;
}

export interface RealtimeLegUpdate {
  tripId: string;
  routeId?: string;
  departureTime?: string;
  scheduledDepartureTime?: string;
  arrivalTime?: string;
  scheduledArrivalTime?: string;
  realtime: boolean;
  delayMinutes?: number;
  cancelled?: boolean;
}

function matchesIdentity(leg: MotisLeg, identity: RealtimeRefreshIdentity): boolean {
  if (!leg.tripId || leg.tripId !== identity.tripId) return false;
  if (identity.routeId !== undefined && leg.routeId !== undefined && leg.routeId !== identity.routeId) {
    // Mindkét oldalon jelen van a routeId, de nem egyezik — ugyanaz a
    // tripId két különböző route alatt bizonytalan egyezés, ezért inkább
    // no-op (biztonságos, konzervatív döntés).
    return false;
  }
  return true;
}

export function extractRealtimeUpdates(
  freshLegs: MotisLeg[],
  requestedIdentities: RealtimeRefreshIdentity[]
): RealtimeLegUpdate[] {
  const updates: RealtimeLegUpdate[] = [];
  for (const identity of requestedIdentities) {
    if (!identity.tripId) continue;
    const match = freshLegs.find((leg) => matchesIdentity(leg, identity));
    if (!match) continue;
    updates.push({
      tripId: identity.tripId,
      routeId: identity.routeId,
      departureTime: match.startTime,
      scheduledDepartureTime: match.from?.scheduledDeparture,
      arrivalTime: match.endTime,
      scheduledArrivalTime: match.to?.scheduledArrival,
      realtime: Boolean(match.realTime),
      delayMinutes: computeDelayMinutes(match),
      cancelled: match.cancelled === true ? true : undefined,
    });
  }
  return updates;
}
