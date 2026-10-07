// VÉDETT ÚTVONAL — BOARDING POSITION GUIDANCE ("Melyik részébe szálljak?") (2026-10-07).
//
// ADATKÉPESSÉG (lásd a feature riport capability mátrixát): a futásidőben
// ténylegesen elérhető, MEGBÍZHATÓ adat a MOTIS lábak megálló-koordinátái, a
// TRANSIT láb geometriája (BKK shapes), a köztes megállók, és a leszállás utáni
// gyalogos láb OSM-alapú útvonal-geometriája. NINCS futásidejű adat kijáratokról,
// liftről, mozgólépcsőről, platformon belüli kijáratpozícióról, kocsiszámról,
// járműhosszról vagy peronhosszról. Ezért ez a modul LEVEL 2 (geometriai
// heurisztika): a szerelvény ELEJE / KÖZEPE / VÉGE felé orientál, a leszállás
// UTÁNI következő utasmozgás (átszállás vagy gyalogos folytatás) irányából.
// SOHA nem ad kocsiszámot, ajtót, kijáratot vagy akadálymentességi állítást.
//
// FRONT = a jármű HALADÁSI iránya szerinti eleje (a geometria utolsó szakaszának
// iránya a leszállási megállóba érkezéskor) — nem "észak" és nem shape-sorrend
// önmagában. Ellenkező irányú menetnél a haladási vektor megfordul, így
// ugyanarra a fizikai célra FRONT <-> REAR automatikusan felcserélődik.

import { decodePolyline, type LatLon } from "../geometry.ts";
import type { JourneyLeg } from "../types.ts";

export const BOARDING_POSITIONS = ["FRONT", "MIDDLE", "REAR", "UNKNOWN"] as const;
export type BoardingPosition = (typeof BOARDING_POSITIONS)[number];
export type BoardingConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type BoardingBasis = "WALK_PATH_GEOMETRY" | "STRAIGHT_LINE_TARGET" | "NONE";
export type BoardingTargetType = "TRANSFER" | "DESTINATION" | "NONE";
export type BoardingReasonCode = "BETTER_FOR_TRANSFER" | "LESS_WALKING_AFTER_EXIT" | "GEOMETRY_BASED";
export type BoardingUnknownReason =
  | "NOT_TRANSIT"
  | "UNSUPPORTED_MODE"
  | "COMPLEX_STATION"
  | "NO_DIRECTION"
  | "NO_TARGET"
  | "TARGET_TOO_CLOSE"
  | "AMBIGUOUS_GEOMETRY";

export interface BoardingPositionRecommendation {
  position: BoardingPosition;
  confidence: BoardingConfidence;
  /** Az adat-képességi szint (2 = geometriai heurisztika). 3/4/5 csak explicit infrastruktúra-adattal. */
  level: 0 | 2;
  basis: BoardingBasis;
  targetType: BoardingTargetType;
  reasonCodes: BoardingReasonCode[];
  unknownReason: BoardingUnknownReason | null;
}

/**
 * Központi, dokumentált küszöbök (méter / fok).
 *  - directionLookbackMeters 80: a haladási irányt a leszállási megálló előtti
 *    ~80 m geometriából számoljuk (rövidebb: zajos, hosszabb: kanyarban torz).
 *  - targetSampleMeters 60: a gyalogos út ennyi méter utáni pontja jelzi, merre
 *    indul az utas a leszállás után (peronhossz-nagyságrend: metró ~80-120 m).
 *  - minTargetDistanceMeters 15: ennél közelebbi cél nem ad irányinformációt.
 *  - frontRearMinAlongMeters 25 / mediumMinAlongMeters 40: ennyivel kell a célnak
 *    előre/hátra esnie (LOW / MEDIUM).
 *  - mediumMaxAngleDeg 45: MEDIUM csak ha a cél egyértelműen előre/hátra van.
 *  - minPreviousStopMeters 150: tartalék irány (előző megálló) csak ekkora távolságból.
 */
export const BOARDING_CONFIG = {
  directionLookbackMeters: 80,
  targetSampleMeters: 60,
  minTargetDistanceMeters: 15,
  frontRearMinAlongMeters: 25,
  mediumMinAlongMeters: 40,
  mediumMaxAngleDeg: 45,
  middleMaxAlongMeters: 15,
  minPreviousStopMeters: 150,
} as const;

/** Támogatott módok: ahol a szerelvényen belüli pozíció értelmes. Vasútnál a peron-geometria nem ellenőrzött -> legfeljebb LOW. */
const FULL_SUPPORT_MODES = new Set(["SUBWAY", "METRO", "SUBURBAN", "TRAM"]);
const LOW_ONLY_MODES = new Set(["RAIL", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "LONG_DISTANCE", "HIGHSPEED_RAIL", "NIGHT_RAIL"]);

/**
 * Többvonalas / bonyolult csomópontok: itt a megálló-koordináták és a gyalogos
 * út nem elég a megbízható irányhoz (több szint, több peron, hosszú átjárók) —
 * UNKNOWN jobb, mint rossz ajánlás. Normalizált (ékezet nélküli, kisbetűs) névrészlet.
 */
export const COMPLEX_STATION_NAME_PARTS = [
  "deak ferenc ter",
  "kalvin ter",
  "keleti palyaudvar",
  "nyugati palyaudvar",
  "ors vezer tere",
  "szell kalman ter",
  "kelenfold vasutallomas",
  "batthyany ter",
] as const;

export function normalizeStationName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isComplexStation(name: string | null | undefined): boolean {
  const n = normalizeStationName(name);
  return n.length > 0 && COMPLEX_STATION_NAME_PARTS.some((part) => n.includes(part));
}

const EARTH_RADIUS_M = 6_371_000;
/** Lokális síkvetület (méter) a referenciapont körül — rövid távolságokra pontos. */
function toLocal(ref: LatLon, p: LatLon): { x: number; y: number } {
  const lat0 = (ref.lat * Math.PI) / 180;
  return {
    x: (((p.lon - ref.lon) * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos(lat0),
    y: (((p.lat - ref.lat) * Math.PI) / 180) * EARTH_RADIUS_M,
  };
}
const dist = (a: LatLon, b: LatLon) => {
  const v = toLocal(a, b);
  return Math.hypot(v.x, v.y);
};
const isFiniteCoord = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function legPolyline(leg: JourneyLeg): LatLon[] {
  try {
    return decodePolyline(leg.geometryEncoded, leg.geometryPrecision ?? 6).filter((p) => isFiniteCoord(p.lat, p.lon));
  } catch {
    return [];
  }
}

/** Pont a vonal mentén, a kezdetétől adott távolságra (vagy a vége, ha rövidebb). */
function pointAlong(points: readonly LatLon[], meters: number): LatLon | null {
  if (points.length === 0) return null;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (acc + seg >= meters && seg > 0) {
      const t = (meters - acc) / seg;
      return { lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t, lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * t };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

/** Haladási irány (egységvektor a lokális síkon) a leszállási megállóba érkezéskor. */
export function travelDirectionAtAlighting(leg: JourneyLeg): { unit: { x: number; y: number }; source: "LEG_GEOMETRY" | "PREVIOUS_STOP" } | null {
  const stop: LatLon | null = isFiniteCoord(leg.toLat, leg.toLon) ? { lat: leg.toLat as number, lon: leg.toLon as number } : null;
  const line = legPolyline(leg);
  if (stop && line.length >= 3) {
    // Visszafelé haladva az első pont, amely legalább lookback távolságra van a megállótól.
    const reversed = [...line].reverse();
    const back = pointAlong(reversed, BOARDING_CONFIG.directionLookbackMeters);
    if (back && dist(back, stop) >= BOARDING_CONFIG.directionLookbackMeters * 0.5) {
      const v = toLocal(back, stop);
      const len = Math.hypot(v.x, v.y);
      if (len > 0) return { unit: { x: v.x / len, y: v.y / len }, source: "LEG_GEOMETRY" };
    }
  }
  const prev = leg.intermediateStops?.filter((s) => isFiniteCoord(s.lat, s.lon)).at(-1);
  if (stop && prev && dist(prev as LatLon, stop) >= BOARDING_CONFIG.minPreviousStopMeters) {
    const v = toLocal(prev as LatLon, stop);
    const len = Math.hypot(v.x, v.y);
    if (len > 0) return { unit: { x: v.x / len, y: v.y / len }, source: "PREVIOUS_STOP" };
  }
  return null;
}

/** A leszállás utáni következő utasmozgás célpontja (átszállás > gyalogos folytatás). */
export function nextMovementTarget(legs: readonly JourneyLeg[], transitIndex: number): { point: LatLon; basis: BoardingBasis; targetType: BoardingTargetType } | null {
  const next = legs[transitIndex + 1];
  if (!next) return null;
  const afterNext = legs[transitIndex + 2];
  if (next.mode === "WALK") {
    const targetType: BoardingTargetType = afterNext?.mode === "TRANSIT" ? "TRANSFER" : "DESTINATION";
    const path = legPolyline(next);
    if (path.length >= 2) {
      const p = pointAlong(path, BOARDING_CONFIG.targetSampleMeters);
      if (p) return { point: p, basis: "WALK_PATH_GEOMETRY", targetType };
    }
    if (isFiniteCoord(next.toLat, next.toLon)) return { point: { lat: next.toLat as number, lon: next.toLon as number }, basis: "STRAIGHT_LINE_TARGET", targetType };
    return null;
  }
  if (next.mode === "TRANSIT" && isFiniteCoord(next.fromLat, next.fromLon)) {
    return { point: { lat: next.fromLat as number, lon: next.fromLon as number }, basis: "STRAIGHT_LINE_TARGET", targetType: "TRANSFER" };
  }
  return null;
}

const unknown = (reason: BoardingUnknownReason, basis: BoardingBasis = "NONE", targetType: BoardingTargetType = "NONE"): BoardingPositionRecommendation => ({
  position: "UNKNOWN", confidence: "NONE", level: 0, basis, targetType, reasonCodes: [], unknownReason: reason,
});

const downgrade = (c: BoardingConfidence): BoardingConfidence => (c === "HIGH" ? "MEDIUM" : c === "MEDIUM" ? "LOW" : c === "LOW" ? "NONE" : "NONE");

/** A boarding-ajánlás egy TRANSIT lábhoz. Tiszta, determinisztikus. */
export function recommendBoardingPosition(legs: readonly JourneyLeg[], transitIndex: number): BoardingPositionRecommendation {
  const leg = legs[transitIndex];
  if (!leg || leg.mode !== "TRANSIT") return unknown("NOT_TRANSIT");
  const mode = (leg.transitMode ?? "").toUpperCase();
  const lowOnly = LOW_ONLY_MODES.has(mode);
  if (!FULL_SUPPORT_MODES.has(mode) && !lowOnly) return unknown("UNSUPPORTED_MODE");
  if (isComplexStation(leg.toName)) return unknown("COMPLEX_STATION");

  const stop: LatLon | null = isFiniteCoord(leg.toLat, leg.toLon) ? { lat: leg.toLat as number, lon: leg.toLon as number } : null;
  const direction = travelDirectionAtAlighting(leg);
  if (!stop || !direction) return unknown("NO_DIRECTION");
  const target = nextMovementTarget(legs, transitIndex);
  if (!target) return unknown("NO_TARGET");

  const d = toLocal(stop, target.point);
  const distance = Math.hypot(d.x, d.y);
  if (distance < BOARDING_CONFIG.minTargetDistanceMeters) return unknown("TARGET_TOO_CLOSE", target.basis, target.targetType);
  const along = d.x * direction.unit.x + d.y * direction.unit.y;
  const angleDeg = (Math.acos(Math.min(1, Math.abs(along) / distance)) * 180) / Math.PI;

  let position: BoardingPosition;
  if (along >= BOARDING_CONFIG.frontRearMinAlongMeters) position = "FRONT";
  else if (along <= -BOARDING_CONFIG.frontRearMinAlongMeters) position = "REAR";
  else if (Math.abs(along) <= BOARDING_CONFIG.middleMaxAlongMeters) position = "MIDDLE";
  else return unknown("AMBIGUOUS_GEOMETRY", target.basis, target.targetType);

  // Confidence: geometriai heurisztika -> legfeljebb MEDIUM (HIGH csak explicit infrastruktúra-adatból).
  let confidence: BoardingConfidence = target.basis === "WALK_PATH_GEOMETRY" ? "MEDIUM" : "LOW";
  if (position === "MIDDLE") confidence = "LOW"; // középső kijárat nem bizonyított
  if (position !== "MIDDLE" && (Math.abs(along) < BOARDING_CONFIG.mediumMinAlongMeters || angleDeg > BOARDING_CONFIG.mediumMaxAngleDeg)) {
    confidence = confidence === "MEDIUM" ? "LOW" : confidence;
  }
  if (direction.source === "PREVIOUS_STOP") confidence = downgrade(confidence);
  if (lowOnly && (confidence === "MEDIUM" || confidence === "HIGH")) confidence = "LOW";
  if (confidence === "NONE") return unknown("AMBIGUOUS_GEOMETRY", target.basis, target.targetType);

  const reasonCodes: BoardingReasonCode[] = [target.targetType === "TRANSFER" ? "BETTER_FOR_TRANSFER" : "LESS_WALKING_AFTER_EXIT", "GEOMETRY_BASED"];
  return { position, confidence, level: 2, basis: target.basis, targetType: target.targetType, reasonCodes, unknownReason: null };
}

/** Csak MEDIUM/HIGH ajánlás jeleníthető meg; LOW/NONE/UNKNOWN esetén nincs UI. */
export function isDisplayableBoardingRecommendation(r: BoardingPositionRecommendation | null | undefined): r is BoardingPositionRecommendation {
  return Boolean(r && (r.position === "FRONT" || r.position === "REAR" || r.position === "MIDDLE") && (r.confidence === "MEDIUM" || r.confidence === "HIGH"));
}

/**
 * Időzítés: csak akkor releváns, amikor az utas még választhat pozíciót —
 * a következő TRANSIT láb felé közeledve vagy a beszállási ponton. Felszállás
 * után, gyalogos szakasz közepén vagy leszállás után nincs ajánlás.
 */
export function selectBoardingGuidanceLegIndex(
  legs: readonly JourneyLeg[],
  activeLegIndex: number | null | undefined,
  walkToTransitPhase: string | null | undefined
): number | null {
  if (walkToTransitPhase !== "APPROACHING_BOARDING" && walkToTransitPhase !== "AT_BOARDING_AREA") return null;
  const start = Math.max(0, activeLegIndex ?? 0);
  const idx = legs.findIndex((leg, i) => i >= start && leg.mode === "TRANSIT");
  return idx >= 0 ? idx : null;
}

/** Feature flag (kliens): alapból KI, csak "true" kapcsolja be. */
export function isBoardingGuidanceEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** UI-szöveg kódokból (az engine nem ad szabad szöveget). Geometriai becslésnél óvatos megfogalmazás. */
export function boardingGuidanceText(r: BoardingPositionRecommendation): { title: string; detail: string } | null {
  if (!isDisplayableBoardingRecommendation(r)) return null;
  const where = r.position === "FRONT" ? "eleje felé" : r.position === "REAR" ? "vége felé" : "közepe táján";
  const title = r.confidence === "HIGH" ? `Utazz a szerelvény ${where}` : `Érdemes lehet a szerelvény ${where} utazni`;
  const detail = r.reasonCodes.includes("BETTER_FOR_TRANSFER")
    ? "Így egyszerűbb lehet az átszállás."
    : "Így kevesebb gyaloglásra lehet szükség leszállás után.";
  return { title, detail };
}
