// VÉDETT ÚTVONAL — COMMUNITY INTELLIGENCE — report-esemény kontextusa (2026-10-06).
//
// A CommunityReportTransitContext (route/trip/megálló-azonosítók) MELLÉ egy
// kiegészítő esemény-kontextus, amely azt írja le, HOGYAN kapcsolódik a
// jelzés a járathoz — a felhasználó mozgása NÉLKÜL:
//
//   - phase: a navigáció MÁR LÉTEZŐ walk→transit fázisa a jelzés pillanatában
//     (felszállt / megállóban / gyalog / csak geometriai TRANSIT láb).
//     Ez dönti el, mennyire köthető egy "dugó" a konkrét triphez.
//   - contextSource: az aktív vagy a KÖVETKEZŐ TRANSIT lábból jött-e a kontextus.
//   - headsign: a MOTIS által adott célállomás-felirat (irány-információ;
//     GTFS direction_id-t a runtime NEM ismer).
//   - segment: a szakasz két MEGÁLLÓJÁNAK MOTIS-koordinátája (infrastruktúra,
//     NEM a felhasználó pozíciója). Felhasználói GPS-t ez a modul soha nem olvas.
//
// Ami nem ismert, az null — semmit nem találunk ki.

export const COMMUNITY_CONTEXT_PHASES = [
  "onboard", // walk→transit fázis: BOARDED (GPS-bizonyíték a járművön tartózkodásra)
  "onboard_uncertain", // BOARDED_UNCERTAIN_GEOMETRY (gyenge geometriájú sínes láb)
  "transit_leg", // az aktív láb geometriailag TRANSIT, felszállási bizonyíték nélkül
  "at_stop", // APPROACHING_BOARDING / AT_BOARDING_AREA — a megállónál/felé
  "walking", // gyalogos szakasz, a kontextus a KÖVETKEZŐ járatra mutat
  "unknown",
] as const;
export type CommunityContextPhase = (typeof COMMUNITY_CONTEXT_PHASES)[number];

export const COMMUNITY_CONTEXT_SOURCES = ["active_leg", "next_leg", "none"] as const;
export type CommunityContextSource = (typeof COMMUNITY_CONTEXT_SOURCES)[number];

/**
 * Mennyire köthető a jelzés a kontextusban szereplő triphez/szakaszhoz (0..1).
 * Determinisztikus, konfigurálható; az aggregáció forrás-súlyként használja.
 * Pl. egy "dugó" jelzés felszállt utastól erősen, gyalogostól gyengén
 * köthető az adott járathoz.
 */
export const COMMUNITY_CONTEXT_PHASE_CONFIDENCE: Record<CommunityContextPhase, number> = {
  onboard: 1,
  onboard_uncertain: 0.8,
  transit_leg: 0.7,
  at_stop: 0.6,
  walking: 0.3,
  unknown: 0.2,
};

export interface CommunityReportSegmentGeometry {
  fromLat: number;
  fromLon: number;
  toLat: number | null;
  toLon: number | null;
}

export interface CommunityReportEventContext {
  phase: CommunityContextPhase;
  contextSource: CommunityContextSource;
  headsign: string | null;
  segment: CommunityReportSegmentGeometry | null;
}

export const EMPTY_EVENT_CONTEXT: CommunityReportEventContext = {
  phase: "unknown",
  contextSource: "none",
  headsign: null,
  segment: null,
};

interface EventLegLike {
  mode: string;
  headsign?: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
}

const isCoord = (lat: unknown, lon: unknown): lat is number =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** walk→transit fázis (legTransition.ts WalkToTransitPhase) -> report-fázis. */
export function mapWalkToTransitPhase(
  walkToTransitPhase: string | null | undefined,
  activeLegMode: string | null | undefined
): CommunityContextPhase {
  switch (walkToTransitPhase) {
    case "BOARDED":
      return "onboard";
    case "BOARDED_UNCERTAIN_GEOMETRY":
      return "onboard_uncertain";
    case "APPROACHING_BOARDING":
    case "AT_BOARDING_AREA":
      return "at_stop";
    case "WALKING":
      return "walking";
    default:
      if (activeLegMode === "TRANSIT") return "transit_leg";
      if (activeLegMode === "WALK") return "walking";
      return "unknown";
  }
}

/**
 * Ugyanazt a lábat választja, mint a buildCommunityReportContext() (aktív
 * TRANSIT, különben a következő TRANSIT), és ahhoz adja az esemény-kontextust.
 */
export function buildCommunityReportEventContext(
  legs: readonly EventLegLike[] | null | undefined,
  activeLegIndex: number | null | undefined,
  walkToTransitPhase?: string | null
): CommunityReportEventContext {
  if (!legs || legs.length === 0) return { ...EMPTY_EVENT_CONTEXT };
  const start = typeof activeLegIndex === "number" && activeLegIndex >= 0 ? activeLegIndex : 0;
  const activeLeg = legs[start];
  const transitIndex = legs.findIndex((leg, index) => index >= start && leg.mode === "TRANSIT");
  const phase = mapWalkToTransitPhase(walkToTransitPhase, activeLeg?.mode);
  if (transitIndex < 0) return { ...EMPTY_EVENT_CONTEXT, phase: phase === "unknown" ? "unknown" : phase };
  const leg = legs[transitIndex];
  const headsign = typeof leg.headsign === "string" ? leg.headsign.trim().slice(0, 80) || null : null;
  const segment = isCoord(leg.fromLat, leg.fromLon)
    ? {
        fromLat: leg.fromLat,
        fromLon: leg.fromLon as number,
        toLat: isCoord(leg.toLat, leg.toLon) ? leg.toLat : null,
        toLon: isCoord(leg.toLat, leg.toLon) ? (leg.toLon as number) : null,
      }
    : null;
  return { phase, contextSource: transitIndex === start ? "active_leg" : "next_leg", headsign, segment };
}

/** Megálló-koordináta kerekítése (5 tizedes ≈ 1 m — megálló-pontosság, nem több). */
export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Durva térbeli cella (0.01° ≈ 1.1 km É-D irányban Budapesten) a tér/idő
 * aggregációhoz és indexhez. A szakasz KEZDŐ MEGÁLLÓJÁBÓL számolva — nem a
 * felhasználó pozíciójából.
 */
export const GEO_CELL_DEGREES = 0.01;
export function computeGeoCell(lat: number, lon: number): string {
  const latCell = Math.floor(lat / GEO_CELL_DEGREES);
  const lonCell = Math.floor(lon / GEO_CELL_DEGREES);
  return `g${GEO_CELL_DEGREES}:${latCell}:${lonCell}`;
}
