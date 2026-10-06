// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 — közlekedési kontextus + időkulcsok.
//
// KIZÁRÓLAG az alkalmazás által MÁR ismert Journey/JourneyLeg adatból dolgozik
// (routeId, tripId, fromStopId, toStopId, transitMode). Nem indít GPS-
// követést, nem olvas koordinátát, nem tárol trace-et. Minden mező nullable:
// a report akkor is elküldhető, ha semmi nem ismert.

import { COMMUNITY_REPORT_TIME_ZONE, TIME_BUCKET_MINUTES } from "./config.ts";

export const COMMUNITY_VEHICLE_TYPES = ["bus", "trolleybus", "tram", "subway", "suburban_rail", "rail", "ferry", "other"] as const;
export type CommunityVehicleType = (typeof COMMUNITY_VEHICLE_TYPES)[number];

export interface CommunityReportTransitContext {
  routeId: string | null;
  tripId: string | null;
  vehicleId: string | null;
  /** GTFS direction_id (0/1), ha ismert. A tripId önmagában is irányt implikál. */
  directionId: 0 | 1 | null;
  fromStopId: string | null;
  toStopId: string | null;
  vehicleType: CommunityVehicleType | null;
}

export const EMPTY_TRANSIT_CONTEXT: CommunityReportTransitContext = {
  routeId: null,
  tripId: null,
  vehicleId: null,
  directionId: null,
  fromStopId: null,
  toStopId: null,
  vehicleType: null,
};

/** MOTIS nyers mód -> stabil járműtípus. Ismeretlen -> "other", hiányzó -> null. */
export function normalizeVehicleType(transitMode: string | null | undefined): CommunityVehicleType | null {
  if (!transitMode) return null;
  const mode = transitMode.toUpperCase();
  if (mode === "BUS" || mode === "COACH") return "bus";
  if (mode === "TROLLEYBUS") return "trolleybus";
  if (mode === "TRAM") return "tram";
  if (mode === "SUBWAY" || mode === "METRO") return "subway";
  if (mode === "SUBURBAN") return "suburban_rail";
  if (mode === "RAIL" || mode === "REGIONAL_RAIL" || mode === "REGIONAL_FAST_RAIL" || mode === "LONG_DISTANCE" || mode === "HIGHSPEED_RAIL" || mode === "NIGHT_RAIL") return "rail";
  if (mode === "FERRY") return "ferry";
  return "other";
}

interface LegLike {
  mode: string;
  transitMode?: string;
  tripId?: string;
  routeId?: string;
  fromStopId?: string;
  toStopId?: string;
}

/**
 * Kontextus a navigáció aktuális állapotából: az aktív TRANSIT láb, vagy ha
 * a felhasználó épp gyalogol/átszáll, a KÖVETKEZŐ TRANSIT láb (pl. a megállóban
 * várakozva jelzett zsúfoltság arra a járatra vonatkozik). Ha nincs ilyen ->
 * üres kontextus (a report ettől még elküldhető).
 */
export function buildCommunityReportContext(
  legs: readonly LegLike[] | null | undefined,
  activeLegIndex: number | null | undefined
): CommunityReportTransitContext {
  if (!legs || legs.length === 0) return { ...EMPTY_TRANSIT_CONTEXT };
  const start = typeof activeLegIndex === "number" && activeLegIndex >= 0 ? activeLegIndex : 0;
  const leg = legs.slice(start).find((candidate) => candidate.mode === "TRANSIT");
  if (!leg) return { ...EMPTY_TRANSIT_CONTEXT };
  return {
    routeId: leg.routeId ?? null,
    tripId: leg.tripId ?? null,
    vehicleId: null, // jelenleg a kliens nem ismer jármű-azonosítót — később GTFS-RT VehiclePosition-ből
    directionId: null,
    fromStopId: leg.fromStopId ?? null,
    toStopId: leg.toStopId ?? null,
    vehicleType: normalizeVehicleType(leg.transitMode),
  };
}

/** Szakasz-kulcs a from/to megállópárból; ha egyik sem ismert -> null. */
export function buildSegmentKey(fromStopId: string | null | undefined, toStopId: string | null | undefined): string | null {
  if (!fromStopId && !toStopId) return null;
  return `${fromStopId ?? "?"}>${toStopId ?? "?"}`;
}

export interface CommunityReportTimeKeys {
  /** Közlekedési nap (YYYY-MM-DD, Budapest). 03:00 előtt az előző naphoz tartozik (GTFS service day konvenció). */
  serviceDate: string;
  /** 0..95 — a helyi idő 15 perces sávja. */
  timeBucket: number;
  /** ISO hét napja, 1 = hétfő ... 7 = vasárnap (helyi idő). */
  weekday: number;
}

const SERVICE_DAY_ROLLOVER_HOUR = 3;
const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function localParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMMUNITY_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 1,
  };
}

export function computeCommunityReportTimeKeys(date: Date): CommunityReportTimeKeys {
  const local = localParts(date);
  const timeBucket = Math.floor((local.hour * 60 + local.minute) / TIME_BUCKET_MINUTES);
  let serviceDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (local.hour < SERVICE_DAY_ROLLOVER_HOUR) serviceDay = new Date(serviceDay.getTime() - 24 * 60 * 60_000);
  return { serviceDate: serviceDay.toISOString().slice(0, 10), timeBucket, weekday: local.weekday };
}
