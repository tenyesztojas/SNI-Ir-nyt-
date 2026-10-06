// VÉDETT ÚTVONAL — SENSORY & TRAFFIC INTELLIGENCE LAYER — forrásfüggetlen
// megfigyelés-modell és adapter-határ.
//
// Minden adatforrás (community report, később BKK GTFS-RT, BKK historikus/
// APC, járműprofil) ugyanarra a TrafficObservation alakra képez le, így az
// aggregáció és a historikus modell nem a community reporthoz kötött. Új
// forrás = új adapter, a Community Reports rendszer átépítése nélkül.
//
// v1-ben KIZÁRÓLAG a community adapter létezik. Nem dokumentált BKK API-t
// itt szándékosan NEM implementálunk.

import { COMMUNITY_REPORT_DEFINITIONS, type CommunityReportType, type TrafficDimension } from "./config.ts";
import type { CommunityReportTransitContext } from "./context.ts";

export const TRAFFIC_OBSERVATION_SOURCES = ["community", "bkk_realtime", "bkk_historical", "vehicle_profile"] as const;
export type TrafficObservationSource = (typeof TRAFFIC_OBSERVATION_SOURCES)[number];

export interface TrafficObservation {
  source: TrafficObservationSource;
  /** ISO időpont. */
  observedAt: string;
  /** ISO időpont, vagy null, ha a megfigyelés nem évül el (pl. statikus járműprofil). */
  expiresAt: string | null;
  context: CommunityReportTransitContext;
  /** Dimenziónkénti jelzés 0..1 skálán; hiányzó dimenzió = nincs róla információ. */
  signals: Partial<Record<TrafficDimension, number>>;
  /** Forrás-megbízhatósági szorzó (alap: 1). Pl. egy APC mérés később > 1 lehet. */
  sourceWeight?: number;
}

/** Lekérdezési kulcs: route + irány + szakasz + időablak. Null mező = nincs szűrés rá. */
export interface TrafficObservationQuery {
  routeId: string | null;
  directionId: 0 | 1 | null;
  tripId?: string | null;
  fromStopId: string | null;
  toStopId: string | null;
  windowMinutes: number;
  now: Date;
}

/** Adapter-határ a későbbi forrásokhoz (bkk_realtime, bkk_historical, vehicle_profile). */
export interface TrafficObservationAdapter {
  readonly source: TrafficObservationSource;
  fetchObservations(query: TrafficObservationQuery): Promise<TrafficObservation[]>;
}

/** Egy DB-sor (vagy bármely tárolt community report) minimális alakja. */
export interface StoredCommunityReport {
  reportType: CommunityReportType;
  createdAt: string;
  expiresAt: string;
  context: CommunityReportTransitContext;
}

export function communityReportToObservation(report: StoredCommunityReport): TrafficObservation {
  return {
    source: "community",
    observedAt: report.createdAt,
    expiresAt: report.expiresAt,
    context: report.context,
    signals: { ...COMMUNITY_REPORT_DEFINITIONS[report.reportType].signals },
    sourceWeight: 1,
  };
}

/** A query-kulcsra illeszkedő megfigyelések (null query-mező = joker). */
export function matchesObservationQuery(observation: TrafficObservation, query: TrafficObservationQuery): boolean {
  const ctx = observation.context;
  if (query.routeId !== null && ctx.routeId !== query.routeId) return false;
  if (query.directionId !== null && ctx.directionId !== null && ctx.directionId !== query.directionId) return false;
  if (query.tripId && ctx.tripId !== query.tripId) return false;
  if (query.fromStopId !== null && ctx.fromStopId !== query.fromStopId) return false;
  if (query.toStopId !== null && ctx.toStopId !== query.toStopId) return false;
  const observedAt = new Date(observation.observedAt).getTime();
  if (!Number.isFinite(observedAt)) return false;
  const windowStart = query.now.getTime() - query.windowMinutes * 60_000;
  return observedAt >= windowStart && observedAt <= query.now.getTime();
}
