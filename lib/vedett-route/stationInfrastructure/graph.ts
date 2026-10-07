// VÉDETT ÚTVONAL — STATION GRAPH + PATHFINDING (2026-10-07)
//
// Irányított gráf a lefordított komplexum pathway-éleiből
// (is_bidirectional=1 -> mindkét irány, 0 -> csak a deklarált irány),
// determinisztikus Dijkstra. Költség: elsődlegesen a GTFS traversal_time.
// Hiányzó traversal_time esetén az él HASZNÁLHATÓ, de a költsége csak
// BECSLÉS (estimated=true), amit a kimenet soha nem mutat másodpercként.
//
// BŐVÍTÉSI PONT: `StationEdgeCostModel` — később érzékszervi (zaj, fény,
// zsúfoltság) vagy közösségi (pl. "lift nem működik") él-annotáció ide
// köthető. Most NINCS ilyen adat, ezért az alapmodell csak idő + explicit
// akadálymentességi kizárás.

import {
  isStepFreePathwayMode,
  pathwayModeKind,
  type CompiledStationComplex,
  type CompiledStationEdge,
  type CompiledStationNode,
} from "./compiler.ts";

export interface StationGraphEdge {
  edgeId: string;
  from: string;
  to: string;
  mode: number;
  traversalTime: number | null;
}

export interface StationGraph {
  complexId: string;
  nodes: ReadonlyMap<string, CompiledStationNode>;
  adjacency: ReadonlyMap<string, readonly StationGraphEdge[]>;
}

export function buildStationGraph(complex: CompiledStationComplex): StationGraph {
  const nodes = new Map(complex.nodes.map((n) => [n.id, n] as const));
  const adjacency = new Map<string, StationGraphEdge[]>();
  const add = (from: string, to: string, e: CompiledStationEdge) => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const list = adjacency.get(from) ?? [];
    list.push({ edgeId: e.id, from, to, mode: e.mode, traversalTime: e.traversalTime });
    adjacency.set(from, list);
  };
  for (const e of complex.edges) {
    add(e.from, e.to, e);
    if (e.bidirectional) add(e.to, e.from, e);
  }
  for (const list of adjacency.values()) {
    list.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  }
  return { complexId: complex.id, nodes, adjacency };
}

const EARTH_RADIUS_M = 6_371_000;
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const lat0 = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const x = (((b.lon - a.lon) * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos(lat0);
  const y = (((b.lat - a.lat) * Math.PI) / 180) * EARTH_RADIUS_M;
  return Math.hypot(x, y);
}

export interface EdgeCost {
  seconds: number;
  estimated: boolean;
}

export interface StationEdgeCostContext {
  stepFreePreferred: boolean;
}

/** Bővíthető él-költség modell. `null` = az él ebben a kontextusban nem használható. */
export interface StationEdgeCostModel {
  edgeCost(edge: StationGraphEdge, graph: StationGraph, ctx: StationEdgeCostContext): EdgeCost | null;
}

/** Konzervatív becslés hiányzó traversal_time-ra: lassú (1 m/s) gyaloglás, min. 15 s; koordináta nélkül 60 s. */
const FALLBACK_SPEED_MPS = 1;
const FALLBACK_MIN_SECONDS = 15;
const FALLBACK_NO_COORD_SECONDS = 60;

export const DEFAULT_STATION_EDGE_COST_MODEL: StationEdgeCostModel = {
  edgeCost(edge, graph, ctx) {
    // Akadálymentességi preferencia: csak EXPLICIT lépcsőmentes él-típus használható.
    if (ctx.stepFreePreferred && !isStepFreePathwayMode(edge.mode)) return null;
    if (edge.traversalTime !== null) return { seconds: edge.traversalTime, estimated: false };
    const a = graph.nodes.get(edge.from);
    const b = graph.nodes.get(edge.to);
    if (a?.lat != null && a.lon != null && b?.lat != null && b.lon != null) {
      const d = distanceMeters({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
      return { seconds: Math.max(FALLBACK_MIN_SECONDS, Math.round(d / FALLBACK_SPEED_MPS)), estimated: true };
    }
    return { seconds: FALLBACK_NO_COORD_SECONDS, estimated: true };
  },
};

export interface StationPathStep {
  edgeId: string;
  from: string;
  to: string;
  mode: number;
  seconds: number;
  estimated: boolean;
}

export interface StationPath {
  nodeIds: string[];
  steps: StationPathStep[];
  totalSeconds: number;
  /** Ha bármely él költsége becsült -> a teljes idő NEM közölhető. */
  hasEstimatedCost: boolean;
  usesStairs: boolean;
  usesEscalator: boolean;
  usesLift: boolean;
  usesUnknownMode: boolean;
}

function summarize(nodeIds: string[], steps: StationPathStep[]): StationPath {
  return {
    nodeIds,
    steps,
    totalSeconds: steps.reduce((s, x) => s + x.seconds, 0),
    hasEstimatedCost: steps.some((s) => s.estimated),
    usesStairs: steps.some((s) => pathwayModeKind(s.mode) === "STAIRS"),
    usesEscalator: steps.some((s) => pathwayModeKind(s.mode) === "ESCALATOR"),
    usesLift: steps.some((s) => pathwayModeKind(s.mode) === "ELEVATOR"),
    usesUnknownMode: steps.some((s) => pathwayModeKind(s.mode) === "UNKNOWN"),
  };
}

const MAX_SETTLED_NODES = 5_000;

/**
 * Determinisztikus Dijkstra több forrásból (költség 0) az összes elérhető
 * csomópontig. Egyenlő költségnél a lexikografikusan kisebb út nyer.
 */
export function shortestPathsFrom(
  graph: StationGraph,
  sources: readonly string[],
  ctx: StationEdgeCostContext,
  model: StationEdgeCostModel = DEFAULT_STATION_EDGE_COST_MODEL
): Map<string, StationPath> {
  const best = new Map<string, { cost: number; key: string; nodeIds: string[]; steps: StationPathStep[] }>();
  const settled = new Set<string>();
  const frontier: { cost: number; key: string; node: string }[] = [];
  for (const s of [...sources].sort()) {
    if (!graph.nodes.has(s) || best.has(s)) continue;
    best.set(s, { cost: 0, key: s, nodeIds: [s], steps: [] });
    frontier.push({ cost: 0, key: s, node: s });
  }
  while (frontier.length > 0 && settled.size < MAX_SETTLED_NODES) {
    frontier.sort((a, b) => a.cost - b.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const cur = frontier.shift() as { cost: number; key: string; node: string };
    if (settled.has(cur.node)) continue;
    const entry = best.get(cur.node);
    if (!entry || entry.cost !== cur.cost || entry.key !== cur.key) continue;
    settled.add(cur.node);
    for (const edge of graph.adjacency.get(cur.node) ?? []) {
      if (settled.has(edge.to)) continue;
      const c = model.edgeCost(edge, graph, ctx);
      if (!c || !Number.isFinite(c.seconds) || c.seconds < 0) continue;
      const cost = entry.cost + c.seconds;
      const key = `${entry.key}>${edge.to}`;
      const prev = best.get(edge.to);
      if (!prev || cost < prev.cost || (cost === prev.cost && key < prev.key)) {
        best.set(edge.to, {
          cost,
          key,
          nodeIds: [...entry.nodeIds, edge.to],
          steps: [...entry.steps, { edgeId: edge.edgeId, from: edge.from, to: edge.to, mode: edge.mode, seconds: c.seconds, estimated: c.estimated }],
        });
        frontier.push({ cost, key, node: edge.to });
      }
    }
  }
  const out = new Map<string, StationPath>();
  for (const [node, v] of best) if (settled.has(node)) out.set(node, summarize(v.nodeIds, v.steps));
  return out;
}

export function shortestPath(
  graph: StationGraph,
  sources: readonly string[],
  target: string,
  ctx: StationEdgeCostContext,
  model?: StationEdgeCostModel
): StationPath | null {
  return shortestPathsFrom(graph, sources, ctx, model).get(target) ?? null;
}

// --- Akadálymentességi minősítés ---------------------------------------
export type StationPathAccessibility = "STEP_FREE_CONFIRMED" | "HAS_LIFT" | "ACCESSIBILITY_UNKNOWN";

/**
 * GTFS wheelchair_boarding (stops.txt):
 *  - szülő nélküli csomópont: 0/üres = nincs info, 1 = akadálymentes, 2 = nem;
 *  - gyerek (peron/bejárat): 0/üres = a szülő állomás értékét ÖRÖKLI, 1/2 explicit.
 * Visszatérés: 1 | 2 | null (ismeretlen). A jelentést NEM fordítjuk meg.
 */
export function effectiveWheelchairBoarding(node: CompiledStationNode | undefined, graph: StationGraph): 1 | 2 | null {
  if (!node) return null;
  if (node.wheelchairBoarding === 1 || node.wheelchairBoarding === 2) return node.wheelchairBoarding;
  if (node.parentStationId) {
    const parent = graph.nodes.get(node.parentStationId);
    if (parent && (parent.wheelchairBoarding === 1 || parent.wheelchairBoarding === 2)) return parent.wheelchairBoarding;
  }
  return null;
}

/**
 * STEP_FREE_CONFIRMED csak ha: minden él EXPLICIT lépcsőmentes típus
 * (nincs lépcső, mozgólépcső, ismeretlen mód), és a végpontok
 * wheelchair_boarding értéke nem 2, a cél-csomóponté (vagy öröklött) 1.
 * HAS_LIFT: az útvonal explicit lift-élt (pathway_mode=5) használ, és
 * minden más éle is explicit lépcsőmentes típus, de a végpontok
 * akadálymentessége nem bizonyított. Lépcsővel/mozgólépcsővel/ismeretlen
 * móddal kevert útvonal: UNKNOWN.
 * Egyetlen lift megléte SOHA nem jelent teljes akadálymentességet.
 */
export function classifyStationPathAccessibility(path: StationPath | null, graph: StationGraph): StationPathAccessibility {
  if (!path || path.steps.length === 0) return "ACCESSIBILITY_UNKNOWN";
  const allStepFree = path.steps.every((s) => isStepFreePathwayMode(s.mode));
  const start = graph.nodes.get(path.nodeIds[0]);
  const end = graph.nodes.get(path.nodeIds[path.nodeIds.length - 1]);
  const startWb = effectiveWheelchairBoarding(start, graph);
  const endWb = effectiveWheelchairBoarding(end, graph);
  if (!allStepFree) return "ACCESSIBILITY_UNKNOWN";
  if (startWb !== 2 && endWb === 1) return "STEP_FREE_CONFIRMED";
  if (path.usesLift && startWb !== 2 && endWb !== 2) return "HAS_LIFT";
  return "ACCESSIBILITY_UNKNOWN";
}
