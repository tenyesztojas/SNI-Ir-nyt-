// VÉDETT ÚTVONAL — STATION INFRASTRUCTURE COMPILER (2026-10-07)
//
// KANONIKUS FORRÁS. A VPS sidecar BYTE-AZONOS másolatot használ:
//   vps-accessibility-sidecar/src/lib/stationInfrastructureCompiler.ts
// (a station-intelligence teszt ellenőrzi az egyezést). Ezért ez a fájl
// SZÁNDÉKOSAN önálló: nincs import, nincs fájlrendszer, nincs hálózat.
//
// Bemenet: a MEGLÉVŐ accessibility index (stops.txt + pathways.txt nyers
// GTFS mezői, lásd accessibilityIndex.ts) — tehát a GTFS-t nem olvassuk
// újra, és a MOTIS-szal azonos bkk_gtfs.zip generációhoz kötött.
// Kimenet: kompakt, determinisztikus station-infrastruktúra index
// (csak azok az állomás-komplexumok, ahol van pathway vagy explicit
// bejárat/generikus csomópont).
//
// MIT NEM ÁLLÍT: kocsi- vagy ajtópozíciót, peron- vagy szerelvényhosszt,
// teljes akadálymentességet. A névből kinyert címkék (pl. "[A]", "[lift]")
// csak KIEGÉSZÍTŐ jelek — az explicit pathway_mode mindig erősebb.

export const STATION_INFRASTRUCTURE_SCHEMA_VERSION = 1;

// --- GTFS pathway_mode (GTFS Schedule reference, pathways.txt) -----------
// 1 walkway, 2 stairs, 3 moving sidewalk/travelator, 4 escalator,
// 5 elevator, 6 fare gate, 7 exit gate. Más érték -> UNKNOWN (fail-safe).
export type PathwayModeKind =
  | "WALKWAY"
  | "STAIRS"
  | "MOVING_SIDEWALK"
  | "ESCALATOR"
  | "ELEVATOR"
  | "FARE_GATE"
  | "EXIT_GATE"
  | "UNKNOWN";

const PATHWAY_MODE_KINDS: Record<number, PathwayModeKind> = {
  1: "WALKWAY",
  2: "STAIRS",
  3: "MOVING_SIDEWALK",
  4: "ESCALATOR",
  5: "ELEVATOR",
  6: "FARE_GATE",
  7: "EXIT_GATE",
};

export function pathwayModeKind(mode: number | null | undefined): PathwayModeKind {
  if (typeof mode !== "number" || !Number.isInteger(mode)) return "UNKNOWN";
  return PATHWAY_MODE_KINDS[mode] ?? "UNKNOWN";
}

/**
 * Lépcsőmentes szempontból EXPLICIT módon használható él-típus. Mozgólépcső
 * (4) NEM számít lépcsőmentesnek (kerekesszékkel nem használható), az
 * UNKNOWN sem (fail-safe).
 */
export function isStepFreePathwayMode(mode: number | null | undefined): boolean {
  const kind = pathwayModeKind(mode);
  return kind === "WALKWAY" || kind === "MOVING_SIDEWALK" || kind === "ELEVATOR" || kind === "FARE_GATE" || kind === "EXIT_GATE";
}

// --- GTFS location_type -------------------------------------------------
// 0/üres: stop/platform, 1: station, 2: entrance/exit, 3: generic node,
// 4: boarding area.
export type LocationKind = "PLATFORM" | "STATION" | "ENTRANCE" | "GENERIC_NODE" | "BOARDING_AREA" | "UNKNOWN";

export function locationKind(locationType: number | null | undefined): LocationKind {
  if (locationType === undefined || locationType === null || locationType === 0) return "PLATFORM";
  if (locationType === 1) return "STATION";
  if (locationType === 2) return "ENTRANCE";
  if (locationType === 3) return "GENERIC_NODE";
  if (locationType === 4) return "BOARDING_AREA";
  return "UNKNOWN";
}

// --- Névből kinyert, KONZERVATÍV szemantikus címkék ---------------------
export type StationSemanticTag = "EXIT_LABEL" | "LIFT_LABEL" | "DIRECTION_HINT";

export interface ParsedStationNodeName {
  tags: StationSemanticTag[];
  /** Csak rövid, egyértelmű kijárat-betű/szám (pl. "A", "B2"). */
  exitLabel: string | null;
  /** A "»" utáni irány-szöveg (pl. "M3 Kőbánya-Kispest"), rövidítve. */
  directionHint: string | null;
}

const EXIT_LABEL_PATTERN = /^[A-Z][0-9]?$/;
const MAX_HINT_LENGTH = 60;

function cleanHint(raw: string): string | null {
  const text = raw.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > MAX_HINT_LENGTH ? text.slice(0, MAX_HINT_LENGTH).trim() : text;
}

/** Determinisztikus, hibatűrő névparser. Ismeretlen formátum -> nincs címke. */
export function parseStationNodeName(name: string | null | undefined): ParsedStationNodeName {
  const result: ParsedStationNodeName = { tags: [], exitLabel: null, directionHint: null };
  if (typeof name !== "string" || name.length === 0 || name.length > 300) return result;
  const tags = new Set<StationSemanticTag>();
  const groups: string[] = [];
  const bracket = /\[([^\]]{1,120})\]|\(([^)]{1,120})\)/g;
  let match: RegExpExecArray | null;
  while ((match = bracket.exec(name)) !== null) groups.push((match[1] ?? match[2] ?? "").trim());
  for (const group of groups) {
    if (EXIT_LABEL_PATTERN.test(group)) {
      tags.add("EXIT_LABEL");
      if (result.exitLabel === null) result.exitLabel = group;
      continue;
    }
    if (/^lift(\b|\s|$)/i.test(group)) tags.add("LIFT_LABEL");
    const arrow = group.indexOf("»");
    if (arrow >= 0) {
      const hint = cleanHint(group.slice(arrow + 1));
      if (hint) {
        tags.add("DIRECTION_HINT");
        if (result.directionHint === null) result.directionHint = hint;
      }
    }
  }
  result.tags = Array.from(tags).sort();
  return result;
}

// --- Bemenet (a meglévő accessibility index nyers mezői) ---------------
export interface StationCompilerStopInput {
  stopId: string;
  stopName?: string;
  latitude?: number;
  longitude?: number;
  locationType?: number;
  parentStation?: string;
  wheelchairBoarding?: number;
}

export interface StationCompilerPathwayInput {
  pathwayId: string;
  fromStopId: string;
  toStopId: string;
  pathwayMode: number;
  isBidirectional: boolean;
  traversalTime?: number;
}

export interface StationCompilerInput {
  provider: string;
  dataset: string;
  /** A forrás GTFS zip tartalom-hash alapú generációja (determinisztikus). */
  sourceGeneration: string;
  stopsById: Record<string, StationCompilerStopInput>;
  pathways: StationCompilerPathwayInput[];
}

// --- Kompakt kimenet ----------------------------------------------------
export type StationCapability = "NONE" | "GEOMETRY_ONLY" | "GRAPH_PARTIAL" | "GRAPH_USABLE" | "GRAPH_WITH_LIFT";

export interface CompiledStationNode {
  id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  /** Nyers GTFS location_type (üres -> null, a szemantika: 0). */
  locationType: number | null;
  parentStationId: string | null;
  /** Nyers GTFS wheelchair_boarding (0/üres: nincs info vagy öröklés, 1: igen, 2: nem). */
  wheelchairBoarding: number | null;
  tags: StationSemanticTag[];
  exitLabel: string | null;
  directionHint: string | null;
}

export interface CompiledStationEdge {
  id: string;
  from: string;
  to: string;
  /** Nyers GTFS pathway_mode. */
  mode: number;
  bidirectional: boolean;
  /** Nyers traversal_time másodpercben; hiányzó/érvénytelen -> null (NEM találunk ki értéket). */
  traversalTime: number | null;
}

export interface CompiledStationComplex {
  id: string;
  capability: StationCapability;
  parentStationIds: string[];
  nodes: CompiledStationNode[];
  edges: CompiledStationEdge[];
  /** Kijárat-jelölt csomópontok (lásd isExitCandidate). */
  exitNodeIds: string[];
  liftEdgeCount: number;
  edgesMissingTraversalTime: number;
}

export interface CompiledStationInfrastructureIndex {
  schemaVersion: number;
  provider: string;
  dataset: string;
  sourceGeneration: string;
  complexes: CompiledStationComplex[];
  /** stop_id -> komplexum id (csak a komplexumokba tartozó csomópontokra). */
  complexIdByStopId: Record<string, string>;
  diagnostics: {
    malformedPathways: number;
    pathwaysWithUnknownNodes: number;
    unknownPathwayModes: number;
  };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validLat = (v: unknown): number | null => (isFiniteNumber(v) && Math.abs(v) <= 90 ? v : null);
const validLon = (v: unknown): number | null => (isFiniteNumber(v) && Math.abs(v) <= 180 ? v : null);

function compileNode(stop: StationCompilerStopInput): CompiledStationNode {
  const parsed = parseStationNodeName(stop.stopName);
  const lat = validLat(stop.latitude);
  const lon = validLon(stop.longitude);
  const wb = stop.wheelchairBoarding;
  return {
    id: stop.stopId,
    name: typeof stop.stopName === "string" && stop.stopName.length > 0 ? stop.stopName.slice(0, 200) : null,
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    locationType: isFiniteNumber(stop.locationType) && Number.isInteger(stop.locationType) ? stop.locationType : null,
    parentStationId: typeof stop.parentStation === "string" && stop.parentStation.length > 0 ? stop.parentStation : null,
    wheelchairBoarding: wb === 0 || wb === 1 || wb === 2 ? wb : null,
    tags: parsed.tags,
    exitLabel: parsed.exitLabel,
    directionHint: parsed.directionHint,
  };
}

/**
 * Kijárat-jelölt: location_type=2 csomópont, amely NEM belső elosztó
 * ("hub"). Hub = címke nélküli bejárat-csomópont, amelynek legalább két
 * MÁSIK location_type=2 szomszédja van (pl. egy aluljáró-csomópont, ami
 * több utcai kijárathoz vezet). A BKK feedben a "[A]".."[J]" kijáratok
 * egy közös csomópontra futnak — a közös csomópont nem utcai kijárat.
 */
export function computeExitCandidateIds(nodes: readonly CompiledStationNode[], edges: readonly CompiledStationEdge[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const entranceNeighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) return;
    if (locationKind(na.locationType) === "ENTRANCE" && locationKind(nb.locationType) === "ENTRANCE") {
      const set = entranceNeighbors.get(a) ?? new Set<string>();
      set.add(b);
      entranceNeighbors.set(a, set);
    }
  };
  for (const e of edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  return nodes
    .filter((n) => locationKind(n.locationType) === "ENTRANCE")
    .filter((n) => n.exitLabel !== null || (entranceNeighbors.get(n.id)?.size ?? 0) < 2)
    .map((n) => n.id)
    .sort();
}

function directedReachable(starts: readonly string[], edges: readonly CompiledStationEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = adj.get(a) ?? [];
    list.push(b);
    adj.set(a, list);
  };
  for (const e of edges) {
    add(e.from, e.to);
    if (e.bidirectional) add(e.to, e.from);
  }
  const seen = new Set<string>(starts);
  const queue = [...starts];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function classifyComplexCapability(nodes: readonly CompiledStationNode[], edges: readonly CompiledStationEdge[], exitNodeIds: readonly string[]): StationCapability {
  const anyCoords = nodes.some((n) => n.lat !== null && n.lon !== null);
  if (edges.length === 0) return anyCoords ? "GEOMETRY_ONLY" : "NONE";
  const platforms = nodes.filter((n) => locationKind(n.locationType) === "PLATFORM").map((n) => n.id);
  if (platforms.length === 0 || exitNodeIds.length === 0) return "GRAPH_PARTIAL";
  const reach = directedReachable(platforms, edges);
  const exitReachable = exitNodeIds.some((id) => reach.has(id) && !platforms.includes(id));
  if (!exitReachable) return "GRAPH_PARTIAL";
  return edges.some((e) => pathwayModeKind(e.mode) === "ELEVATOR") ? "GRAPH_WITH_LIFT" : "GRAPH_USABLE";
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (root !== x) {
      root = this.find(root);
      this.parent.set(x, root);
    }
    return root;
  }
  add(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Determinisztikus: a lexikografikusan kisebb gyökér marad.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

/**
 * A teljes station-infrastruktúra index fordítása. Tiszta, determinisztikus
 * (rendezett kimenet, nincs időbélyeg). Hibás sorokat kihagy és számol,
 * sosem dob kivételt hibás adat miatt.
 */
export function compileStationInfrastructure(input: StationCompilerInput): CompiledStationInfrastructureIndex {
  const stops = input.stopsById && typeof input.stopsById === "object" ? input.stopsById : {};
  const rawPathways = Array.isArray(input.pathways) ? input.pathways : [];
  const diagnostics = { malformedPathways: 0, pathwaysWithUnknownNodes: 0, unknownPathwayModes: 0 };

  const edges: CompiledStationEdge[] = [];
  for (const p of rawPathways) {
    if (!p || typeof p.pathwayId !== "string" || typeof p.fromStopId !== "string" || typeof p.toStopId !== "string" || !isFiniteNumber(p.pathwayMode)) {
      diagnostics.malformedPathways++;
      continue;
    }
    if (!stops[p.fromStopId] || !stops[p.toStopId] || p.fromStopId === p.toStopId) {
      diagnostics.pathwaysWithUnknownNodes++;
      continue;
    }
    if (pathwayModeKind(p.pathwayMode) === "UNKNOWN") diagnostics.unknownPathwayModes++;
    const t = p.traversalTime;
    edges.push({
      id: p.pathwayId,
      from: p.fromStopId,
      to: p.toStopId,
      mode: p.pathwayMode,
      bidirectional: p.isBidirectional === true,
      traversalTime: isFiniteNumber(t) && t > 0 && t <= 3600 ? Math.round(t) : null,
    });
  }
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Mag-csomópontok: pathway-végpontok + explicit bejárat/generikus csomópont.
  const seeds = new Set<string>();
  for (const e of edges) {
    seeds.add(e.from);
    seeds.add(e.to);
  }
  for (const stop of Object.values(stops)) {
    if (!stop || typeof stop.stopId !== "string") continue;
    const kind = locationKind(stop.locationType);
    if (kind === "ENTRANCE" || kind === "GENERIC_NODE" || kind === "BOARDING_AREA") seeds.add(stop.stopId);
  }
  const infraParents = new Set<string>();
  for (const id of seeds) {
    const parent = stops[id]?.parentStation;
    if (parent && stops[parent]) infraParents.add(parent);
    if (locationKind(stops[id]?.locationType) === "STATION") infraParents.add(id);
  }

  const uf = new UnionFind();
  for (const id of seeds) uf.add(id);
  for (const stop of Object.values(stops)) {
    if (!stop || typeof stop.stopId !== "string") continue;
    const parent = stop.parentStation;
    if (parent && infraParents.has(parent)) {
      uf.union(stop.stopId, parent);
    }
  }
  for (const parent of infraParents) uf.add(parent);
  for (const e of edges) uf.union(e.from, e.to);

  const members = new Map<string, string[]>();
  for (const id of [...seeds, ...infraParents, ...Object.keys(stops).filter((id) => infraParents.has(stops[id]?.parentStation ?? ""))]) {
    if (!stops[id]) continue;
    const root = uf.find(id);
    const list = members.get(root) ?? [];
    if (!list.includes(id)) list.push(id);
    members.set(root, list);
  }

  const edgesByRoot = new Map<string, CompiledStationEdge[]>();
  for (const e of edges) {
    const root = uf.find(e.from);
    const list = edgesByRoot.get(root) ?? [];
    list.push(e);
    edgesByRoot.set(root, list);
  }

  const complexes: CompiledStationComplex[] = [];
  const complexIdByStopId: Record<string, string> = {};
  const roots = Array.from(members.keys()).sort();
  for (const root of roots) {
    const ids = (members.get(root) ?? []).slice().sort();
    const nodes = ids.map((id) => compileNode(stops[id]));
    const complexEdges = edgesByRoot.get(root) ?? [];
    const parentStationIds = nodes.filter((n) => locationKind(n.locationType) === "STATION").map((n) => n.id).sort();
    const id = parentStationIds[0] ?? ids[0];
    const exitNodeIds = computeExitCandidateIds(nodes, complexEdges);
    complexes.push({
      id,
      capability: classifyComplexCapability(nodes, complexEdges, exitNodeIds),
      parentStationIds,
      nodes,
      edges: complexEdges,
      exitNodeIds,
      liftEdgeCount: complexEdges.filter((e) => pathwayModeKind(e.mode) === "ELEVATOR").length,
      edgesMissingTraversalTime: complexEdges.filter((e) => e.traversalTime === null).length,
    });
    for (const n of nodes) complexIdByStopId[n.id] = id;
  }
  complexes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    schemaVersion: STATION_INFRASTRUCTURE_SCHEMA_VERSION,
    provider: String(input.provider ?? ""),
    dataset: String(input.dataset ?? ""),
    sourceGeneration: String(input.sourceGeneration ?? ""),
    complexes,
    complexIdByStopId,
    diagnostics,
  };
}

/** Komplexumok kiválasztása adott stop_id-khez (station-scoped slice). */
export function selectComplexesForStops(
  index: CompiledStationInfrastructureIndex,
  stopIds: readonly string[],
  maxComplexes = 40
): { complexes: CompiledStationComplex[]; unmatchedStopIds: string[] } {
  const byId = new Map(index.complexes.map((c) => [c.id, c] as const));
  const picked = new Map<string, CompiledStationComplex>();
  const unmatched: string[] = [];
  for (const stopId of stopIds) {
    const complexId = index.complexIdByStopId[stopId];
    const complex = complexId ? byId.get(complexId) : undefined;
    if (!complex) {
      unmatched.push(stopId);
      continue;
    }
    if (picked.size < maxComplexes) picked.set(complex.id, complex);
  }
  return {
    complexes: Array.from(picked.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    unmatchedStopIds: Array.from(new Set(unmatched)).sort(),
  };
}
