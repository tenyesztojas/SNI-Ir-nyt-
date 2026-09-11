// VÉDETT ÚTVONAL — PATHWAYS DIRECTED GRAPH (2026-09-11, Task C2, spec 12. pont)
//
// KŐKEMÉNY SZABÁLY: TILOS az a primitív heurisztika, hogy "ha az
// állomáson VAN stairs pathway, akkor az állomás inaccessible" — a valós
// Kelenföld-fixture bizonyítja, hogy UGYANAZON az állomáson lehet stairs
// ÉS elevator ÉS walkway alternatíva egyszerre (lásd a feature riport
// audit-eredményét). Ehelyett ez a modul egy VALÓDI, IRÁNYÍTOTT gráfot épít
// a pathways.txt rekordokból (from_stop_id -> to_stop_id, pathway_mode,
// is_bidirectional), és a konkrét, szükséges (from,to) stop-pár között
// keres lépcsőmentes utat — nem az egész állomás egyetlen, aggregált
// állapotát ítéli meg.

import type { AccessibilityStatus } from "./accessibility.ts";

// Csak a graph-építéshez ténylegesen szükséges mezők — SZÁNDÉKOSAN nem a
// teljes accessibilityIndex.ts PathwayAccessibilityIndexEntry típusra
// kötve (az `pathwayId`/`traversalTime` mezőket ez a modul nem használja),
// hogy elkerüljük a felesleges, szoros modul-kapcsolatot. Bármely, ezt az
// alakot kielégítő objektum (így a teljes PathwayAccessibilityIndexEntry
// is) strukturálisan átadható.
export interface PathwayGraphEdgeInput {
  fromStopId: string;
  toStopId: string;
  pathwayMode: number;
  isBidirectional: boolean;
}

interface GraphEdge {
  to: string;
  /** GTFS pathway_mode — 2 = STAIRS (lépcsőmentes szempontból NEM használható edge). */
  mode: number;
}

export interface PathwayGraph {
  adjacency: Map<string, GraphEdge[]>;
}

// GTFS pathways.txt pathway_mode enum: 1=walkway, 2=stairs, 3=moving
// sidewalk, 4=escalator, 5=elevator, 6=fare gate, 7=exit gate.
const STAIRS_MODE = 2;

function addEdge(adjacency: Map<string, GraphEdge[]>, from: string, to: string, mode: number): void {
  const list = adjacency.get(from);
  const edge: GraphEdge = { to, mode };
  if (list) list.push(edge);
  else adjacency.set(from, [edge]);
}

/** Irányított gráf építése a pathways.txt rekordokból — is_bidirectional esetén mindkét irányban felvesszük az edge-et. */
export function buildPathwayGraph(pathways: PathwayGraphEdgeInput[]): PathwayGraph {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const p of pathways) {
    addEdge(adjacency, p.fromStopId, p.toStopId, p.pathwayMode);
    if (p.isBidirectional) {
      addEdge(adjacency, p.toStopId, p.fromStopId, p.pathwayMode);
    }
  }
  return { adjacency };
}

function bfsReachable(graph: PathwayGraph, from: string, to: string, allowStairs: boolean): boolean {
  if (from === to) return true;
  const visited = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const edges = graph.adjacency.get(current) ?? [];
    for (const edge of edges) {
      if (!allowStairs && edge.mode === STAIRS_MODE) continue;
      if (edge.to === to) return true;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return false;
}

/**
 * Egy adott (from,to) stop-pár közötti station-belüli kapcsolat
 * lépcsőmentességi minősítése (spec 12/13. pont):
 *   - ha van út, ami NEM használ stairs (pathway_mode=2) edge-et -> a
 *     komponens KNOWN_ACCESSIBLE (de ez ÖNMAGÁBAN nem teszi az egész
 *     journey-t automatikusan accessible-é — a többi komponens is számít,
 *     lásd accessibility.ts combineJourneyAccessibility()).
 *   - ha VAN út, de az KIZÁRÓLAG stairs edge-eken keresztül teljesíthető ->
 *     KNOWN_NOT_ACCESSIBLE.
 *   - ha a két pont között a gráfban EGYÁLTALÁN nincs bizonyítható
 *     kapcsolat (nincs adat/diszjunkt) -> UNKNOWN.
 */
export function classifyPathwayConnection(graph: PathwayGraph, fromStopId: string, toStopId: string): AccessibilityStatus {
  if (fromStopId === toStopId) return "KNOWN_ACCESSIBLE"; // nincs szükség tényleges station-belüli mozgásra
  const nonStairsReachable = bfsReachable(graph, fromStopId, toStopId, false);
  if (nonStairsReachable) return "KNOWN_ACCESSIBLE";
  const anyReachable = bfsReachable(graph, fromStopId, toStopId, true);
  if (anyReachable) return "KNOWN_NOT_ACCESSIBLE";
  return "UNKNOWN";
}
