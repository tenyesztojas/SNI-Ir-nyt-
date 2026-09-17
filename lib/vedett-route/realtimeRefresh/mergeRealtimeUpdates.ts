// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — PURE merge: a
// RealtimeLegUpdate-eket kizárólag PONTOS stabil identitás (tripId, ha
// mindkét oldalon jelen van a routeId is: routeId) egyezés esetén vezeti
// be egy meglévő Journey-be. Identitás-eltérés (vagy identitás hiánya) =
// no-op az adott lábra.
//
// KIZÁRÓLAG ezeket a mezőket módosíthatja egy TRANSIT lábon:
// departureTime, scheduledDepartureTime, arrivalTime, scheduledArrivalTime,
// realtime, delayMinutes, cancelled. SOHA nem érinti: WALK/RENTAL lábakat,
// geometriát, intermediateStops-t, mode-ot, routeShortName/routeLongName-t,
// fromName/toName-t, a journey egyéb mezőit (routeProgress, sensory,
// ranking, instruction state, rest-stop state — ezek egyike sincs a
// Journey/JourneyLeg típusban, ezért a spread garantálja, hogy változatlanok
// maradnak).
//
// LEÉRTÉKELÉSI (downgrade) SZABÁLY (Sprint 7.2, 6. pont — dokumentált,
// szándékosan konzervatív döntés): ha egy láb korábban realtime=true volt,
// egy scheduled-only (realtime=false) frissítés NEM törli automatikusan a
// korábbi realtime departure/arrival/delay adatot — csak a scheduled*
// mezőket engedjük frissíteni. Egyetlen kivétel: egy PROVEN cancellation
// (update.cancelled === true) UGYANARRA a stabil trip identity-re mindig
// elsőbbséget kap.

import type { Journey, JourneyLeg } from "../types.ts";
import type { RealtimeLegUpdate } from "./extractUpdates.ts";

function findUpdate(leg: JourneyLeg, updates: RealtimeLegUpdate[]): RealtimeLegUpdate | undefined {
  if (!leg.tripId) return undefined;
  return updates.find((u) => {
    if (u.tripId !== leg.tripId) return false;
    if (leg.routeId !== undefined && u.routeId !== undefined && leg.routeId !== u.routeId) return false;
    return true;
  });
}

function mergeLeg(leg: JourneyLeg, update: RealtimeLegUpdate): JourneyLeg {
  if (update.cancelled === true) {
    return { ...leg, cancelled: true };
  }
  if (leg.realtime && !update.realtime) {
    // Konzervatív downgrade védelem: a korábbi realtime idők/delay marad,
    // csak a scheduled* mezők frissülhetnek.
    return {
      ...leg,
      scheduledDepartureTime: update.scheduledDepartureTime ?? leg.scheduledDepartureTime,
      scheduledArrivalTime: update.scheduledArrivalTime ?? leg.scheduledArrivalTime,
    };
  }
  return {
    ...leg,
    departureTime: update.departureTime ?? leg.departureTime,
    scheduledDepartureTime: update.scheduledDepartureTime ?? leg.scheduledDepartureTime,
    arrivalTime: update.arrivalTime ?? leg.arrivalTime,
    scheduledArrivalTime: update.scheduledArrivalTime ?? leg.scheduledArrivalTime,
    realtime: update.realtime,
    delayMinutes: update.delayMinutes,
    cancelled: update.cancelled,
  };
}

export function mergeRealtimeUpdates(journey: Journey, updates: RealtimeLegUpdate[]): Journey {
  if (updates.length === 0) return journey;
  let changed = false;
  const legs = journey.legs.map((leg) => {
    if (leg.mode !== "TRANSIT") return leg;
    const update = findUpdate(leg, updates);
    if (!update) return leg;
    changed = true;
    return mergeLeg(leg, update);
  });
  if (!changed) return journey;
  return { ...journey, legs };
}
