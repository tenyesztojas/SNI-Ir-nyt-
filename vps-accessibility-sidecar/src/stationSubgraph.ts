// VPS ACCESSIBILITY SIDECAR — station-cluster alapú pathway subgraph
// kiválasztás (Task C3, spec 17/18. pont).
//
// A cél: egy lookup request NÉHÁNY konkrét (fromStopId,toStopId) pathway
// kérdésére NE a teljes globális pathways.txt-et adjuk vissza, hanem CSAK
// azt a részgráfot, ami a kérdéshez ténylegesen releváns állomás-
// klaszter(ek)hez tartozik — a kliens (Next.js, lib/vedett-route/
// pathwayGraph.ts, MÁR MEGLÉVŐ, változatlan C2 logika) ebből a részgráfból
// építi fel a BFS-t és dönti el a stairs-free elérhetőséget.
//
// "Állomás-klaszter" = egy stop_id + a GTFS parent_station-je + az ugyanazon
// parent_station alá tartozó ÖSSZES testvér-stop — ez pontosan az a kör,
// amin belül egy pathways.txt rekord értelmes lehet (peron<->peron,
// szint<->szint, ugyanazon az állomáson). Ez NEM névegyezésen alapuló
// következtetés (spec 18. pont TILALMA) — kizárólag a GTFS stops.txt
// bizonyított parent_station ID-mezőjén.
//
// FONTOS: szándékosan "VAGY" (nem "ÉS") logikával választjuk ki az edge-eket
// (egy edge bekerül, ha a from VAGY a to node a releváns klaszterben van) —
// ez enyhén BŐKEZŰBB a szükségesnél (néhány irreleváns edge is bekerülhet),
// de garantálja, hogy a kliens BFS-e SOHA nem veszít el egy valódi,
// bizonyított kapcsolatot a válasz méretének minimalizálása miatt. A
// pathways.txt jelenlegi mérete (477 sor) mellett ez elhanyagolható
// többletköltség.

import type { AccessibilityIndex, PathwayAccessibilityIndexEntry } from "./lib/accessibilityIndex.js";

export interface PathwayQuery {
  fromStopId: string;
  toStopId: string;
}

function buildStationClusterIndex(index: AccessibilityIndex): {
  parentOf: Map<string, string>;
  childrenOf: Map<string, Set<string>>;
} {
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, Set<string>>();
  for (const stop of Object.values(index.stopsById)) {
    if (!stop.parentStation) continue;
    parentOf.set(stop.stopId, stop.parentStation);
    const siblings = childrenOf.get(stop.parentStation) ?? new Set<string>();
    siblings.add(stop.stopId);
    childrenOf.set(stop.parentStation, siblings);
  }
  return { parentOf, childrenOf };
}

function clusterOf(stopId: string, parentOf: Map<string, string>, childrenOf: Map<string, Set<string>>): Set<string> {
  const cluster = new Set<string>([stopId]);
  const parent = parentOf.get(stopId);
  if (parent) {
    cluster.add(parent);
    for (const sibling of childrenOf.get(parent) ?? []) cluster.add(sibling);
  }
  // stopId lehet MAGA is egy parent station (pl. a MOTIS parentId,
  // "bkkgtfs_CS056215" jellegű klaszter-azonosító, lásd
  // motisIdNormalization.ts fejléce) — ilyenkor a saját gyerekei is a
  // klaszter részei.
  for (const child of childrenOf.get(stopId) ?? []) cluster.add(child);
  return cluster;
}

/**
 * A megadott pathway-kérdésekhez (from/to stopId párok) releváns, SZŰKÍTETT
 * pathway-edge-halmaz kiválasztása a teljes indexből. SOSEM dob hibát —
 * ismeretlen/nem-létező stopId-kra egyszerűen üres klasztert (csak
 * önmagát) ad, ami a végén egyszerűen kevesebb (vagy nulla) edge-et
 * eredményez, sosem hibát.
 */
export function selectPathwaySubgraph(
  index: AccessibilityIndex,
  queries: PathwayQuery[]
): PathwayAccessibilityIndexEntry[] {
  if (queries.length === 0) return [];
  const { parentOf, childrenOf } = buildStationClusterIndex(index);

  const relevantNodes = new Set<string>();
  for (const q of queries) {
    for (const node of clusterOf(q.fromStopId, parentOf, childrenOf)) relevantNodes.add(node);
    for (const node of clusterOf(q.toStopId, parentOf, childrenOf)) relevantNodes.add(node);
  }

  return index.pathways.filter((p) => relevantNodes.has(p.fromStopId) || relevantNodes.has(p.toStopId));
}
