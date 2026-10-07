// VÉDETT ÚTVONAL — STATION GUIDANCE BUILDER (2026-10-07)
//
// Egy TRANSIT láb LESZÁLLÁSI állomására: legjobb kijárat (exit selection),
// belső átszállási útvonal (transfer guidance), akadálymentességi
// minősítés és a boarding-position motor számára egy explicit
// pathway-csomópont cél. Tiszta, determinisztikus; csak szerveren fut
// (a gráf soha nem kerül a kliensbe).
//
// Célpont-prioritás (spec 19): 1) explicit állomás-infrastruktúra
// (átszállási platform / kiválasztott kijárat útja), 2) gyalogos
// geometria, 3) egyenes vonalú végpont. Ha bármi hiányzik: nincs
// guidance — a kliens a LEVEL 2 geometriai motorra esik vissza.

import { decodePolyline, type LatLon } from "../geometry.ts";
import type { JourneyLeg } from "../types.ts";
import { locationKind, type CompiledStationComplex, type CompiledStationNode } from "./compiler.ts";
import {
  buildStationGraph,
  classifyStationPathAccessibility,
  distanceMeters,
  shortestPathsFrom,
  type StationGraph,
  type StationPath,
} from "./graph.ts";
import type {
  LegStationGuidance,
  StationAccessibilityCode,
  StationBoardingTarget,
  StationExitReasonCode,
  StationExitRecommendation,
  StationGuidanceConfidence,
  StationTargetBasis,
  StationTransferGuidance,
  StationTransferReasonCode,
} from "./guidanceTypes.ts";

export const STATION_GUIDANCE_CONFIG = {
  /** Gyalogos cél: ennyi méterre a gyalogos láb mentén (vagy a vége). */
  walkTargetAlongMeters: 150,
  /** Kijárat -> cél gyaloglás modell-sebessége (csak rangsoroláshoz, nem közölt adat). */
  walkSpeedMps: 1.2,
  /** Boarding cél: a peronhoz legközelebbi útvonal-csomópont legalább ennyire legyen a peron koordinátától. */
  boardingTargetMinMeters: 15,
  /** Ennél távolabbi célnál a kijárat-választás nem informatív (pl. hibás geometria). */
  maxTargetDistanceMeters: 5_000,
} as const;

const SAFE_EXIT_LABEL = /^[A-Z][0-9]?$/;
export function sanitizeExitLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const t = label.trim();
  return SAFE_EXIT_LABEL.test(t) ? t : null;
}

const isFiniteCoord = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

const nodePoint = (n: CompiledStationNode | undefined): LatLon | null =>
  n && n.lat !== null && n.lon !== null && isFiniteCoord(n.lat, n.lon) ? { lat: n.lat, lon: n.lon } : null;

function pointAlong(points: readonly LatLon[], meters: number): LatLon | null {
  if (points.length === 0) return null;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = distanceMeters(points[i - 1], points[i]);
    if (seg > 0 && acc + seg >= meters) {
      const t = (meters - acc) / seg;
      return { lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t, lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * t };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

/** Feloldott állomás-hivatkozás: a komplexum és a nyers GTFS stop_id. */
export interface ResolvedStationStop {
  complex: CompiledStationComplex;
  gtfsStopId: string;
}

export type StationStopResolver = (motisStopId: string | undefined) => ResolvedStationStop | null;

const graphCache = new WeakMap<CompiledStationComplex, StationGraph>();
function graphFor(complex: CompiledStationComplex): StationGraph {
  let g = graphCache.get(complex);
  if (!g) {
    g = buildStationGraph(complex);
    graphCache.set(complex, g);
  }
  return g;
}

/** A peron(ok), ahonnan a belső útvonal indul. Állomás-ID esetén a gyerek-peronok (bizonytalan). */
function resolveSources(graph: StationGraph, gtfsStopId: string): { sources: string[]; platformResolved: boolean } {
  const node = graph.nodes.get(gtfsStopId);
  if (!node) return { sources: [], platformResolved: false };
  if (locationKind(node.locationType) === "STATION") {
    const children = Array.from(graph.nodes.values())
      .filter((n) => n.parentStationId === node.id && locationKind(n.locationType) === "PLATFORM")
      .map((n) => n.id)
      .sort();
    return { sources: children, platformResolved: false };
  }
  return { sources: [node.id], platformResolved: true };
}

interface MovementTarget {
  point: LatLon;
  basis: StationTargetBasis;
  targetType: "TRANSFER" | "DESTINATION";
}

function walkTarget(walk: JourneyLeg, targetType: "TRANSFER" | "DESTINATION"): MovementTarget | null {
  let line: LatLon[] = [];
  try {
    line = decodePolyline(walk.geometryEncoded, walk.geometryPrecision ?? 6).filter((p) => isFiniteCoord(p.lat, p.lon));
  } catch {
    line = [];
  }
  if (line.length >= 2) {
    const p = pointAlong(line, STATION_GUIDANCE_CONFIG.walkTargetAlongMeters);
    if (p) return { point: p, basis: "WALK_PATH_GEOMETRY", targetType };
  }
  if (isFiniteCoord(walk.toLat, walk.toLon)) return { point: { lat: walk.toLat as number, lon: walk.toLon as number }, basis: "STRAIGHT_LINE_TARGET", targetType };
  return null;
}

function nextTransitIndex(legs: readonly JourneyLeg[], i: number): number | null {
  if (legs[i + 1]?.mode === "TRANSIT") return i + 1;
  if (legs[i + 1]?.mode === "WALK" && legs[i + 2]?.mode === "TRANSIT") return i + 2;
  return null;
}

/** A boarding-motor célpontja: a peron utáni első, kellően távoli útvonal-csomópont (max. 2 lépés). */
function boardingTargetFromPath(path: StationPath, graph: StationGraph, platform: LatLon | null, targetType: "TRANSFER" | "DESTINATION"): StationBoardingTarget | null {
  if (!platform || path.nodeIds.length < 2) return null;
  for (const id of path.nodeIds.slice(1, 3)) {
    const p = nodePoint(graph.nodes.get(id));
    if (p && distanceMeters(platform, p) >= STATION_GUIDANCE_CONFIG.boardingTargetMinMeters) {
      return { lat: p.lat, lon: p.lon, basis: "STATION_PATHWAY_NODE", targetType };
    }
  }
  return null;
}

function pathConfidence(path: StationPath, platformResolved: boolean): StationGuidanceConfidence {
  if (path.usesUnknownMode) return "LOW";
  if (path.hasEstimatedCost || !platformResolved) return "MEDIUM";
  return "HIGH";
}

function accessibilityFor(stepFreePath: StationPath | null, graph: StationGraph): { accessibility: StationAccessibilityCode; liftAvailable: boolean } {
  const accessibility = classifyStationPathAccessibility(stepFreePath, graph);
  const liftAvailable = Boolean(stepFreePath?.usesLift) && (accessibility === "HAS_LIFT" || accessibility === "STEP_FREE_CONFIRMED");
  return { accessibility, liftAvailable };
}

/** Valódi gyalogos útvonal eredménye egy kijárat -> cél párra (MOTIS foot). */
export interface ExitWalkingScore {
  durationSeconds: number;
  distanceMeters: number;
}

/** Egy kijárat -> cél gyalogos-routing kérés (az enrichment hajtja végre, időkerettel). */
export interface ExitWalkingRequest {
  key: string;
  from: LatLon;
  to: LatLon;
}

/** Stabil kulcs egy kijárat -> cél párhoz (kerekített koordináták, ID nélkül). */
export function exitWalkingKey(from: LatLon, to: LatLon): string {
  const r = (v: number) => v.toFixed(5);
  return `${r(from.lat)},${r(from.lon)}>${r(to.lat)},${r(to.lon)}`;
}

export interface StationGuidanceOptions {
  /** A felhasználó MEGLÉVŐ lépcsőmentes preferenciája (stepFreeRequired). */
  stepFreePreferred: boolean;
  /** Ha megadott: a légvonalban legígéretesebb kijáratok valódi gyalogos pontszáma (exitWalkingKey szerint). */
  walkingScores?: ReadonlyMap<string, ExitWalkingScore>;
  /** Gyűjtő: a valódi gyalogos routingra javasolt (legfeljebb N) kijárat -> cél pár. */
  onWalkingRequests?: (requests: ExitWalkingRequest[]) => void;
}

/** RECOMMENDED METRO EXITS v1: csak metró lábakra adunk állomás-guidance-t. */
export const METRO_TRANSIT_MODES: ReadonlySet<string> = new Set(["SUBWAY", "METRO"]);
/** Légvonalbeli előszűrés után ennyi kijáratra kérünk valódi gyalogos útvonalat. */
export const WALKING_RANKING_CANDIDATES = 3;

interface ExitEvaluation {
  id: string;
  node: CompiledStationNode;
  path: StationPath;
  distance: number;
  score: number;
}

function compareExit(a: ExitEvaluation, b: ExitEvaluation): number {
  return a.score - b.score || a.distance - b.distance || (a.node.exitLabel ?? "~").localeCompare(b.node.exitLabel ?? "~") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function evaluateExits(graph: StationGraph, complex: CompiledStationComplex, sources: string[], target: LatLon, stepFree: boolean): ExitEvaluation[] {
  const paths = shortestPathsFrom(graph, sources, { stepFreePreferred: stepFree });
  const out: ExitEvaluation[] = [];
  for (const id of complex.exitNodeIds) {
    if (sources.includes(id)) continue;
    const node = graph.nodes.get(id);
    const p = nodePoint(node);
    const path = paths.get(id);
    if (!node || !p || !path || path.steps.length === 0) continue;
    const distance = distanceMeters(p, target);
    if (distance > STATION_GUIDANCE_CONFIG.maxTargetDistanceMeters) continue;
    out.push({ id, node, path, distance, score: path.totalSeconds + distance / STATION_GUIDANCE_CONFIG.walkSpeedMps });
  }
  return out.sort(compareExit);
}

/**
 * Egy TRANSIT láb leszállási állomásának guidance-e. Nincs adat -> null
 * (a kliens ekkor a LEVEL 2 geometriára esik vissza vagy UNKNOWN).
 */
export function buildLegStationGuidance(
  legs: readonly JourneyLeg[],
  transitIndex: number,
  resolve: StationStopResolver,
  options: StationGuidanceOptions
): LegStationGuidance | null {
  const leg = legs[transitIndex];
  if (!leg || leg.mode !== "TRANSIT") return null;
  if (!METRO_TRANSIT_MODES.has((leg.transitMode ?? "").toUpperCase())) return null;
  const resolved = resolve(leg.toStopId);
  if (!resolved) return null;
  const { complex, gtfsStopId } = resolved;
  const base = {
    schemaVersion: 1 as const,
    capability: complex.capability,
    interchangeComplex: complex.parentStationIds.length >= 2,
  };
  if (complex.capability === "NONE" || complex.capability === "GEOMETRY_ONLY") {
    return { ...base, status: "NO_STATION_GRAPH", stationPathConfidence: "NONE" };
  }
  const graph = graphFor(complex);
  const { sources, platformResolved } = resolveSources(graph, gtfsStopId);
  if (sources.length === 0) return { ...base, status: "NO_STATION_GRAPH", stationPathConfidence: "NONE" };
  const platformPoint = platformResolved ? nodePoint(graph.nodes.get(sources[0])) ?? (isFiniteCoord(leg.toLat, leg.toLon) ? { lat: leg.toLat as number, lon: leg.toLon as number } : null) : null;

  // 1) Belső átszállás ugyanabban a komplexumban.
  const nextIdx = nextTransitIndex(legs, transitIndex);
  if (nextIdx !== null) {
    const nextResolved = resolve(legs[nextIdx].fromStopId);
    if (nextResolved && nextResolved.complex.id === complex.id && sources.includes(nextResolved.gtfsStopId)) {
      // Ugyanarról a peronról indul a következő járat: nincs belső útvonal, nincs kijárat.
      return { ...base, status: "NO_TARGET", stationPathConfidence: "NONE" };
    }
    if (nextResolved && nextResolved.complex.id === complex.id) {
      const preferred = shortestPathsFrom(graph, sources, { stepFreePreferred: options.stepFreePreferred }).get(nextResolved.gtfsStopId) ?? null;
      const any = preferred ?? (options.stepFreePreferred ? shortestPathsFrom(graph, sources, { stepFreePreferred: false }).get(nextResolved.gtfsStopId) ?? null : null);
      const stepFreePath = options.stepFreePreferred ? preferred : shortestPathsFrom(graph, sources, { stepFreePreferred: true }).get(nextResolved.gtfsStopId) ?? null;
      if (any && any.steps.length > 0) {
        const { accessibility, liftAvailable } = accessibilityFor(stepFreePath, graph);
        const reasonCodes: StationTransferReasonCode[] = ["EXPLICIT_GTFS_PATHWAY"];
        if (liftAvailable) reasonCodes.push("LIFT_PATH_AVAILABLE");
        if (accessibility === "STEP_FREE_CONFIRMED") reasonCodes.push("STEP_FREE_PATH_AVAILABLE");
        const confidence = pathConfidence(any, platformResolved);
        const transfer: StationTransferGuidance = {
          confidence,
          reasonCodes,
          traversalSeconds: any.hasEstimatedCost ? null : any.totalSeconds,
          liftAvailable,
          accessibility,
        };
        const boardingTarget = boardingTargetFromPath(any, graph, platformPoint, "TRANSFER");
        return { ...base, status: "TRANSFER_PATH", stationPathConfidence: confidence, transfer, ...(boardingTarget ? { boardingTarget } : {}) };
      }
    }
  }

  // 2) Kijárat-választás a következő TÉNYLEGES utasmozgás céljához.
  let target: MovementTarget | null = null;
  if (nextIdx !== null) {
    // Átszállás: kijáratot CSAK akkor ajánlunk, ha felszíni gyaloglás valóban
    // kell: van köztes gyalogos láb, a következő járat NEM metró (metró-metró
    // kapcsolat lehet modellezetlen belső átjáró), és a következő megálló nem
    // ugyanehhez az állomás-komplexumhoz tartozik.
    const next = legs[nextIdx];
    const walkBetween = legs[transitIndex + 1]?.mode === "WALK";
    const nextIsMetro = METRO_TRANSIT_MODES.has((next.transitMode ?? "").toUpperCase());
    const nextResolved = resolve(next.fromStopId);
    const sameComplex = nextResolved !== null && nextResolved.complex.id === complex.id;
    if (!walkBetween || nextIsMetro || sameComplex) return { ...base, status: "NO_TARGET", stationPathConfidence: "NONE" };
    if (isFiniteCoord(next.fromLat, next.fromLon)) target = { point: { lat: next.fromLat as number, lon: next.fromLon as number }, basis: "NEXT_STOP_COORDINATE", targetType: "TRANSFER" };
  } else if (legs[transitIndex + 1]?.mode === "WALK") {
    // Nincs további tömegközlekedés: a felhasználó végső célja (az utolsó láb vége).
    const last = legs[legs.length - 1];
    target = isFiniteCoord(last?.toLat, last?.toLon)
      ? { point: { lat: last.toLat as number, lon: last.toLon as number }, basis: "WALK_DESTINATION", targetType: "DESTINATION" }
      : walkTarget(legs[transitIndex + 1], "DESTINATION");
  }
  if (!target) return { ...base, status: "NO_TARGET", stationPathConfidence: "NONE" };
  if (complex.capability === "GRAPH_PARTIAL") return { ...base, status: "GRAPH_PARTIAL", stationPathConfidence: "LOW" };

  let candidates = evaluateExits(graph, complex, sources, target.point, options.stepFreePreferred);
  if (candidates.length === 0 && options.stepFreePreferred) candidates = evaluateExits(graph, complex, sources, target.point, false);
  if (candidates.length === 0) return { ...base, status: "NO_CONNECTED_EXIT", stationPathConfidence: "NONE" };

  // Valódi gyalogos rangsor: a légvonalban legígéretesebb N kijáratra a
  // hívó (enrichment) MOTIS foot útvonalat kér; ha van eredmény, az dönt.
  const goalPoint: LatLon = target.point;
  const shortlist = candidates.slice(0, WALKING_RANKING_CANDIDATES);
  options.onWalkingRequests?.(
    shortlist.map((c) => {
      const from = nodePoint(c.node) as LatLon;
      return { key: exitWalkingKey(from, goalPoint), from, to: goalPoint };
    })
  );
  const walked = options.walkingScores
    ? shortlist
        .map((c) => ({ c, w: options.walkingScores!.get(exitWalkingKey(nodePoint(c.node) as LatLon, goalPoint)) }))
        .filter((x): x is { c: ExitEvaluation; w: ExitWalkingScore } => Boolean(x.w) && Number.isFinite(x.w!.durationSeconds) && Number.isFinite(x.w!.distanceMeters))
    : [];
  const rankingBasis: "WALKING_ROUTE" | "STRAIGHT_LINE" = walked.length > 0 ? "WALKING_ROUTE" : "STRAIGHT_LINE";
  let best = candidates[0];
  let bestWalk: ExitWalkingScore | null = null;
  let walkWinner = false;
  let alternatives = candidates.length;
  if (walked.length > 0) {
    const scored = walked
      .map((x) => ({ ...x, score: x.c.path.totalSeconds + x.w.durationSeconds }))
      .sort((a, b) => a.score - b.score || a.w.distanceMeters - b.w.distanceMeters || compareExit(a.c, b.c));
    best = scored[0].c;
    bestWalk = scored[0].w;
    const shortestWalk = scored.reduce((m, x) => (x.w.durationSeconds < m.w.durationSeconds ? x : m), scored[0]);
    walkWinner = shortestWalk.c.id === best.id;
    alternatives = scored.length;
  } else {
    const nearest = candidates.reduce((m, c) => (c.distance < m.distance || (c.distance === m.distance && compareExit(c, m) < 0) ? c : m), candidates[0]);
    walkWinner = nearest.id === best.id;
  }
  const stepFreePath = shortestPathsFrom(graph, sources, { stepFreePreferred: true }).get(best.id) ?? null;
  const { accessibility, liftAvailable } = accessibilityFor(stepFreePath, graph);

  // Bizonyosság: valódi gyalogos útvonal + teljes explicit állomási út -> HIGH;
  // légvonalbeli rangsor (vagy becsült élköltség / feloldatlan peron) -> legfeljebb MEDIUM.
  let confidence = pathConfidence(best.path, platformResolved);
  if (rankingBasis === "STRAIGHT_LINE" && target.basis !== "WALK_PATH_GEOMETRY" && confidence === "HIGH") confidence = "MEDIUM";

  const reasonCodes: StationExitReasonCode[] = [target.targetType === "TRANSFER" ? "BEST_EXIT_FOR_TRANSFER" : "BEST_EXIT_FOR_DESTINATION", "EXPLICIT_GTFS_PATHWAY"];
  if (alternatives >= 2 && walkWinner) reasonCodes.push("SHORTER_WALK_AFTER_EXIT");
  if (alternatives >= 2 && !walkWinner) reasonCodes.push("SHORTER_STATION_PATH");
  if (liftAvailable) reasonCodes.push("LIFT_PATH_AVAILABLE");
  if (accessibility === "STEP_FREE_CONFIRMED") reasonCodes.push("STEP_FREE_PATH_AVAILABLE");

  const exit: StationExitRecommendation = {
    label: sanitizeExitLabel(best.node.exitLabel),
    confidence,
    reasonCodes,
    internalTraversalSeconds: best.path.hasEstimatedCost ? null : best.path.totalSeconds,
    targetDistanceMeters: Math.round(best.distance),
    accessibility,
    targetBasis: target.basis,
    rankingBasis,
    walkingRoute: bestWalk ? { durationSeconds: Math.round(bestWalk.durationSeconds), distanceMeters: Math.round(bestWalk.distanceMeters) } : null,
  };
  const boardingTarget = boardingTargetFromPath(best.path, graph, platformPoint, target.targetType);
  return { ...base, status: "EXIT_SELECTED", stationPathConfidence: confidence, exit, ...(boardingTarget ? { boardingTarget } : {}) };
}

/** Egy teljes journey összes TRANSIT lábára (immutábilis másolat). */
export function attachStationGuidanceToLegs(legs: readonly JourneyLeg[], resolve: StationStopResolver, options: StationGuidanceOptions): JourneyLeg[] {
  return legs.map((leg, i) => {
    if (leg.mode !== "TRANSIT") return leg;
    let guidance: LegStationGuidance | null = null;
    try {
      guidance = buildLegStationGuidance(legs, i, resolve, options);
    } catch {
      guidance = null; // fail-open
    }
    return guidance ? { ...leg, stationGuidance: guidance } : leg;
  });
}
