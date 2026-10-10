// HÁTTÉRNAVIGÁCIÓS MVP (2026-10-10) — a natív Android foreground service
// MINIMÁLIS figyelmeztetési terve. Pure: a webes navigáció (displayedJourney +
// aktív szakasz) az egyetlen állapotforrás, ebből csak a leszállási
// megállók sorrendje, koordinátája, az előző megálló (közeli megállók
// kezeléséhez) és a tervezett érkezés kerül át. Analitikába SOHA nem megy.

import type { Journey } from "../types";

export interface NativeAlertTarget {
  id: string;
  stopName: string;
  lat: number;
  lon: number;
  prevLat?: number;
  prevLon?: number;
  scheduledArrivalMs?: number;
}

export interface NativeAlertPlan {
  version: 1;
  targets: NativeAlertTarget[];
}

const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * A `fromLegIndex`-től (aktív szakasz) kezdve minden közösségi közlekedési
 * szakasz leszállási megállója, sorrendben. Koordináta nélküli szakasz kimarad.
 */
export function buildNativeAlertPlan(journey: Journey, fromLegIndex: number | null | undefined = 0): NativeAlertPlan {
  const start = typeof fromLegIndex === "number" && fromLegIndex > 0 ? fromLegIndex : 0;
  const targets: NativeAlertTarget[] = [];
  journey.legs.forEach((leg, index) => {
    if (index < start || leg.mode !== "TRANSIT") return;
    if (!isCoord(leg.toLat) || !isCoord(leg.toLon)) return;
    const scheduledArrivalMs = parseMs(leg.arrivalTime) ?? parseMs(leg.scheduledArrivalTime);
    const stops = leg.intermediateStops ?? [];
    const prev = [...stops].reverse().find((s) => isCoord(s.lat) && isCoord(s.lon));
    const target: NativeAlertTarget = {
      // Stabil azonosító: újratervezés vagy realtime késés (arrivalTime változás)
      // után ugyanaz a leszállás nem riaszt újra; eltérő járat (tripId) vagy
      // eltérő felszálló/leszálló megálló külön szakasz marad.
      id: [leg.tripId ?? leg.routeShortName ?? leg.transitMode ?? "T", leg.fromName, leg.toName].join("|"),
      stopName: leg.toName,
      lat: leg.toLat,
      lon: leg.toLon,
    };
    if (prev) {
      target.prevLat = prev.lat;
      target.prevLon = prev.lon;
    }
    if (scheduledArrivalMs !== undefined) target.scheduledArrivalMs = scheduledArrivalMs;
    targets.push(target);
  });
  return { version: 1, targets };
}
