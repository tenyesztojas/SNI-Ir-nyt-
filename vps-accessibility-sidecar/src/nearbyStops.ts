// VPS ACCESSIBILITY SIDECAR — NEARBY STOP DISCOVERY (Nearby Transit Access
// Backend sprint, 2026-09-17).
//
// CÉL: egy GPS-koordinátához (lat/lon) a MÁR MEMÓRIÁBAN lévő
// AccessibilityIndex stopsById-jából (lásd lib/accessibilityIndex.ts, MOST
// kibővítve latitude/longitude/stopName/locationType mezőkkel) NÉHÁNY
// releváns, STATION SZINTEN deduplikált közeli stop-candidate-et ad
// vissza — ez a réteget a server.ts POST /nearby-stops route-ja szolgálja
// ki.
//
// KŐKEMÉNY SZABÁLY (spec): a Haversine itt KIZÁRÓLAG candidate discovery/
// szűrés céljára szolgál — SOHA nem valódi gyaloglási távolság/idő. A
// valódi gyaloglási hozzáférés egy KÜLÖN, jövőbeli körben a MOTIS
// POST /api/route (profile:"foot") segítségével történik — EZ A MODUL AZT
// NEM HÍVJA, NEM HELYETTESÍTI, és a válasz semelyik mezője nem
// interpretálható gyaloglási időként/távolságként.
//
// Ez a réteg NEM egy spatial index (kd-tree/geohash/PostGIS/Redis geo) —
// V1-ben egyetlen dataset stopsById-ja egyszerű lineáris scan-nel járható
// körbe, ugyanabban a memória-scope-ban, mint a meglévő /lookup endpoint
// (a teljes index amúgy is memóriában van, lásd activeIndexStore.ts).

import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "./lib/accessibilityIndex.js";

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/**
 * Nagy-kör (great-circle) távolság méterben. KIZÁRÓLAG candidate
 * discovery/szűrés célra — SOSEM tényleges gyaloglási távolság (lásd a
 * modul fejlécét).
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Szigorúan bounded default/max értékek (spec 7/9. pont) — ENGINEERING
// DEFAULT-ok, nem GTFS/MOTIS-bizonyított konstansok, és SZÁNDÉKOSAN NEM
// env-konfigurálhatók (a feladat explicit tiltja új env változó
// bevezetését ebben a sprintben).
export const DEFAULT_NEARBY_RADIUS_METERS = 500;
export const MAX_NEARBY_RADIUS_METERS = 2_000;
export const DEFAULT_NEARBY_LIMIT = 3;
export const MAX_NEARBY_LIMIT = 10;

export interface NearbyStopsRequestBody {
  dataset?: unknown;
  lat?: unknown;
  lon?: unknown;
  radiusMeters?: unknown;
  limit?: unknown;
}

export interface ParsedNearbyStopsRequest {
  dataset: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  limit: number;
}

export type NearbyStopsParseError = "MISSING_DATASET" | "INVALID_COORDINATES" | "INVALID_RADIUS" | "INVALID_LIMIT" | "MALFORMED_BODY";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Body-validáció ugyanazzal a defenzív mintával, mint server.ts
 * parseLookupRequest()-je: SOHA nem dob, NaN/Infinity/tartományon-kívüli
 * érték egyértelmű hibakóddal elutasítva (spec 6. pont).
 */
export function parseNearbyStopsRequest(raw: unknown): ParsedNearbyStopsRequest | { error: NearbyStopsParseError } {
  if (!raw || typeof raw !== "object") return { error: "MALFORMED_BODY" };
  const body = raw as NearbyStopsRequestBody;

  if (typeof body.dataset !== "string" || body.dataset.length === 0) return { error: "MISSING_DATASET" };

  if (!isFiniteNumber(body.lat) || !isFiniteNumber(body.lon)) return { error: "INVALID_COORDINATES" };
  if (body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180) return { error: "INVALID_COORDINATES" };

  const radiusMeters = body.radiusMeters === undefined ? DEFAULT_NEARBY_RADIUS_METERS : body.radiusMeters;
  if (!isFiniteNumber(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_NEARBY_RADIUS_METERS) {
    return { error: "INVALID_RADIUS" };
  }

  const limit = body.limit === undefined ? DEFAULT_NEARBY_LIMIT : body.limit;
  if (!isFiniteNumber(limit) || !Number.isInteger(limit) || limit <= 0 || limit > MAX_NEARBY_LIMIT) {
    return { error: "INVALID_LIMIT" };
  }

  return { dataset: body.dataset, lat: body.lat, lon: body.lon, radiusMeters, limit };
}

export interface NearbyStopCandidate {
  stopId: string;
  parentStation?: string;
  name?: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  /**
   * IDEIGLENES DIAGNOSZTIKAI MEZŐ (NEARBY TRANSIT ACCESS, 3. kör,
   * 2026-09-18) — a nyers GTFS location_type, változatlanul átemelve az
   * indexből (lásd accessibilityIndex.ts StopAccessibilityIndexEntry.
   * locationType). Ez a modul (findNearbyStops) EZ a mező hozzáadása
   * ELŐTT sem SZŰRT rá — ez itt KIZÁRÓLAG megfigyelhetőséget ad hozzá
   * (a hívó eldöntheti, hogy egy discovery-találat station/platform
   * location_type=0/1, vagy entrance/generic-node/boarding-area
   * location_type=2/3/4, esetleg hiányzó location_type — ez utóbbi kettő
   * GTFS szerint SOHA nem önálló boarding point). NEM változtatja meg a
   * findNearbyStops() meglévő discovery/dedup/limit viselkedését.
   */
  locationType?: number;
}

/**
 * Station-szintű dedup kulcs (spec 5. pont): parent_station, ha van; ha
 * nincs, a stopId maga (fallback) — UGYANAZ az elv, mint
 * stationSubgraph.ts buildStationClusterIndex()-ében, itt csak a
 * cluster-KULCS kiválasztásához, nem a pathway-gráfhoz.
 */
function clusterKeyFor(stop: StopAccessibilityIndexEntry): string {
  return stop.parentStation && stop.parentStation.length > 0 ? stop.parentStation : stop.stopId;
}

interface StopWithDistance extends StopAccessibilityIndexEntry {
  distanceMeters: number;
}

/**
 * Lineáris scan + Haversine (spec 4/7. pont: V1-ben NINCS spatial index).
 *
 * Lépések:
 *  1. Minden, latitude/longitude-dal rendelkező stopra kiszámoljuk a
 *     Haversine-távolságot; a hiányzó lat/lon GTFS-rekordok (pl.
 *     régebbi/hiányos feed-sor) KIHAGYÁSRA kerülnek — SOHA nem dobunk
 *     hibát egy hiányos stop-rekord miatt.
 *  2. A radiusMeters-en KÍVÜLI stopokat elvetjük.
 *  3. Station-klaszterenként (parent_station, fallback stopId)
 *     DETERMINISZTIKUSAN kiválasztjuk a legközelebbi konkrét
 *     platform-stopId-t reprezentánsnak (holtverseny esetén a
 *     lexikografikusan kisebb stopId nyer) — spec 5. pont: "egy station
 *     clusterből determinisztikusan válassz reprezentatív konkrét
 *     stopId-t", "ne találj ki stopId-t" (a reprezentáns MINDIG egy
 *     ténylegesen létező, a GTFS-ből származó stopId).
 *  4. Távolság szerint növekvő sorrendbe rendezzük (holtverseny esetén
 *     stopId szerint), és `limit`-re vágjuk.
 */
export function findNearbyStops(index: AccessibilityIndex, lat: number, lon: number, radiusMeters: number, limit: number): NearbyStopCandidate[] {
  const withinRadius: StopWithDistance[] = [];

  for (const stop of Object.values(index.stopsById)) {
    if (typeof stop.latitude !== "number" || typeof stop.longitude !== "number") continue;
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    const distanceMeters = haversineMeters(lat, lon, stop.latitude, stop.longitude);
    if (distanceMeters > radiusMeters) continue;
    withinRadius.push({ ...stop, distanceMeters });
  }

  const bestByCluster = new Map<string, StopWithDistance>();
  for (const stop of withinRadius) {
    const key = clusterKeyFor(stop);
    const current = bestByCluster.get(key);
    if (!current || stop.distanceMeters < current.distanceMeters || (stop.distanceMeters === current.distanceMeters && stop.stopId < current.stopId)) {
      bestByCluster.set(key, stop);
    }
  }

  return Array.from(bestByCluster.values())
    .sort((a, b) => (a.distanceMeters !== b.distanceMeters ? a.distanceMeters - b.distanceMeters : a.stopId.localeCompare(b.stopId)))
    .slice(0, limit)
    .map((stop) => ({
      stopId: stop.stopId,
      parentStation: stop.parentStation,
      name: stop.stopName,
      lat: stop.latitude as number,
      lon: stop.longitude as number,
      distanceMeters: Math.round(stop.distanceMeters),
      locationType: stop.locationType,
    }));
}
