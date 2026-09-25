// VPS ACCESSIBILITY SIDECAR — NÉV ALAPÚ ÁLLOMÁS/MEGÁLLÓ KERESÉS
// (Station Name Search backend sprint, 2026-09-24).
//
// CÉL: egy szabad szöveges keresési stringhez (pl. "Martonvásár") a MÁR
// MEMÓRIÁBAN lévő AccessibilityIndex stopsById-jából NÉV szerint illesztett
// (NEM koordináta-alapú) candidate-listát ad vissza — ezt a server.ts
// POST /station-search route-ja szolgálja ki.
//
// EZ A MODUL NEM ismer semmilyen magyar szinonima-szót (vasútállomás,
// pályaudvar, stb.) — az a szó-eltávolítás a Next.js oldalon,
// lib/vedett-route/stationNameSearch.ts normalizeStationQuery()/
// STATION_SYNONYM_WORDS-jében történik, MIELŐTT a "mag" helynév ide,
// a `query` mezőben megérkezik. Ez a modul KIZÁRÓLAG a kapott string
// és a tényleges GTFS stop_name mezők egyezését vizsgálja.
//
// Ugyanazt az AccessibilityIndex/StopAccessibilityIndexEntry típust és
// betöltött-index infrastruktúrát (activeIndexStore.ts) használja, mint a
// MEGLÉVŐ nearbyStops.ts — a station-szintű dedup kulcsa (parent_station,
// fallback stopId) is UGYANAZ az elv, mint ott (clusterKeyFor()).

import type { AccessibilityIndex, StopAccessibilityIndexEntry } from "./lib/accessibilityIndex.js";

// Szigorúan bounded default/max értékek — ugyanaz a minta, mint
// nearbyStops.ts DEFAULT_NEARBY_LIMIT/MAX_NEARBY_LIMIT-je.
export const DEFAULT_STATION_SEARCH_LIMIT = 8;
export const MAX_STATION_SEARCH_LIMIT = 20;
export const MIN_STATION_SEARCH_QUERY_LENGTH = 2;

// --- Magyar ékezet-eltávolítás (generikus, NEM helynév-specifikus) ------

const HUNGARIAN_DIACRITIC_FOLD_MAP: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ö: "o",
  ő: "o",
  ú: "u",
  ü: "u",
  ű: "u",
  Á: "a",
  É: "e",
  Í: "i",
  Ó: "o",
  Ö: "o",
  Ő: "o",
  Ú: "u",
  Ü: "u",
  Ű: "u",
};

const HUNGARIAN_DIACRITIC_PATTERN = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g;

/**
 * Generikus magyar ékezet-eltávolítás (á/é/í/ó/ö/ő/ú/ü/ű -> a/e/i/o/o/o/u/u/u).
 * NEM tartalmaz semmilyen helynév-specifikus szótárat/kivételt — kizárólag
 * a karakterek betű szerinti leképezése.
 */
export function foldHungarianDiacritics(input: string): string {
  return input.replace(HUNGARIAN_DIACRITIC_PATTERN, (ch) => HUNGARIAN_DIACRITIC_FOLD_MAP[ch] ?? ch);
}

/** Ékezet- és kis-/nagybetű-toleráns, whitespace-normalizált alak név-egyezéshez. */
export function normalizeStationSearchText(input: string): string {
  return foldHungarianDiacritics(input.trim().toLowerCase()).replace(/\s+/g, " ");
}

// --- Request body validáció ---------------------------------------------
//
// UGYANAZ a defenzív minta, mint nearbyStops.ts parseNearbyStopsRequest()-je
// és server.ts parseLookupRequest()-je: SOHA nem dob, minden hibaeset
// egyértelmű hibakóddal elutasítva. A body-alak (egyetlen `dataset: string`
// mező + a kérdés-specifikus mezők) a MEGLÉVŐ /nearby-stops konvenciót
// követi (nem egy új, tömb-alapú multi-dataset alakot vezet be — a
// Next.js oldali kliens egy-egy hívást indít minden releváns dataset felé,
// lásd accessibilityLookupClient.ts).

export interface StationSearchRequestBody {
  dataset?: unknown;
  query?: unknown;
  limit?: unknown;
}

export interface ParsedStationSearchRequest {
  dataset: string;
  query: string;
  limit: number;
}

export type StationSearchParseError = "MISSING_DATASET" | "INVALID_QUERY" | "INVALID_LIMIT" | "MALFORMED_BODY";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseStationSearchRequest(raw: unknown): ParsedStationSearchRequest | { error: StationSearchParseError } {
  if (!raw || typeof raw !== "object") return { error: "MALFORMED_BODY" };
  const body = raw as StationSearchRequestBody;

  if (typeof body.dataset !== "string" || body.dataset.length === 0) return { error: "MISSING_DATASET" };

  if (typeof body.query !== "string") return { error: "INVALID_QUERY" };
  const trimmedQuery = body.query.trim();
  if (trimmedQuery.length < MIN_STATION_SEARCH_QUERY_LENGTH) return { error: "INVALID_QUERY" };

  const limit = body.limit === undefined ? DEFAULT_STATION_SEARCH_LIMIT : body.limit;
  if (!isFiniteNumber(limit) || !Number.isInteger(limit) || limit <= 0 || limit > MAX_STATION_SEARCH_LIMIT) {
    return { error: "INVALID_LIMIT" };
  }

  return { dataset: body.dataset, query: trimmedQuery, limit };
}

// --- Illesztés + station-szintű dedup -----------------------------------

export type StationSearchMatchRank = "exact" | "partial";

const STATION_SEARCH_RANK_ORDER: Record<StationSearchMatchRank, number> = { exact: 0, partial: 1 };

interface RankedStop extends StopAccessibilityIndexEntry {
  matchRank: StationSearchMatchRank;
}

/**
 * Station-szintű dedup kulcs — UGYANAZ az elv, mint nearbyStops.ts
 * clusterKeyFor()-je: parent_station, ha van, egyébként a stopId maga.
 */
function clusterKeyFor(stop: StopAccessibilityIndexEntry): string {
  return stop.parentStation && stop.parentStation.length > 0 ? stop.parentStation : stop.stopId;
}

/**
 * Egy klaszteren (parent_station, fallback stopId) belüli reprezentáns-
 * választás rangazonosság esetén. A nearbyStops.ts-ben a reprezentáns-
 * választás a (koordináta-alapú kereséshez releváns) legkisebb távolságot
 * részesíti előnyben — itt, NÉV-alapú keresésnél nincs "távolság", ezért a
 * GTFS location_type szemantikát használjuk (location_type=1 a hivatalos
 * GTFS "station" szint, lásd accessibilityIndex.ts fejléce és a spec
 * "preferring a parent/station-level record over a bare platform" pontja):
 * egy station-szintű rekord előnyt élvez egy peron/platform (location_type
 * hiányzik vagy 0) rekorddal szemben. Ha egyik oldal sem station-szintű
 * (vagy mindkettő az), a döntés determinisztikus: rövidebb/lexikografikusan
 * korábbi stop_name, végső döntőbíróként a stopId.
 */
function isBetterRepresentative(candidate: RankedStop, current: RankedStop): boolean {
  const rankDiff = STATION_SEARCH_RANK_ORDER[candidate.matchRank] - STATION_SEARCH_RANK_ORDER[current.matchRank];
  if (rankDiff !== 0) return rankDiff < 0;

  const candidateIsStation = candidate.locationType === 1;
  const currentIsStation = current.locationType === 1;
  if (candidateIsStation !== currentIsStation) return candidateIsStation;

  const candidateName = candidate.stopName ?? "";
  const currentName = current.stopName ?? "";
  if (candidateName.length !== currentName.length) return candidateName.length < currentName.length;
  const nameCompare = candidateName.localeCompare(currentName);
  if (nameCompare !== 0) return nameCompare < 0;
  return candidate.stopId < current.stopId;
}

export interface StationSearchCandidate {
  stopId: string;
  name?: string;
  lat: number;
  lon: number;
  dataset: string;
  parentStation?: string;
  locationType?: number;
}

/**
 * Név-alapú állomás/megálló keresés egy MÁR BETÖLTÖTT AccessibilityIndex
 * stop-jai között. Accent- és case-insensitive (normalizeStationSearchText),
 * exact-match preferálva a partial (substring) találatok elé,
 * determinisztikus sorrenddel (exact előbb, majd rövidebb/lexikografikusan
 * korábbi név, végső döntőbíróként stopId — SOSEM az objektum beszúrási
 * sorrendjére hagyatkozva), station-szintű dedup-pal, és `limit`-re vágva.
 */
export function findStationsByName(
  index: AccessibilityIndex,
  dataset: string,
  query: string,
  limit: number,
): StationSearchCandidate[] {
  const normalizedQuery = normalizeStationSearchText(query);
  if (!normalizedQuery) return [];

  const matches: RankedStop[] = [];
  for (const stop of Object.values(index.stopsById)) {
    if (!stop.stopName) continue;
    if (typeof stop.latitude !== "number" || typeof stop.longitude !== "number") continue;
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    // LOCATION_TYPE JAVÍTÁS (2026-09-25, célzott regressziós teszt által
    // reprodukált hiba): a GTFS spec szerint egy location_type=2 sor egy
    // állomás-bejárat/kijárat, SOSEM önálló utazási cél -- a spec ehhez
    // KÖTELEZŐ parent_station-t írna elő, de a parser (accessibilityIndex.ts)
    // ezt nem kényszeríti ki, így egy hiányos/hibás feed-sor (parent_station
    // nélküli location_type=2 bejegyzés) a station-szintű (parent_station
    // alapú) dedup alól kibújva külön candidate-ként jelenhetne meg. Ezért
    // a location_type=2 rekordokat MINDIG kizárjuk a névillesztésből,
    // FÜGGETLENÜL attól, hogy van-e parent_station-juk -- nincs
    // entrance/exit-specifikus UI, egyszerűen sosem önálló találat.
    if (stop.locationType === 2) continue;

    const normalizedName = normalizeStationSearchText(stop.stopName);
    if (!normalizedName) continue;

    if (normalizedName === normalizedQuery) {
      matches.push({ ...stop, matchRank: "exact" });
    } else if (normalizedName.includes(normalizedQuery)) {
      matches.push({ ...stop, matchRank: "partial" });
    }
  }

  const bestByCluster = new Map<string, RankedStop>();
  for (const stop of matches) {
    const key = clusterKeyFor(stop);
    const current = bestByCluster.get(key);
    if (!current || isBetterRepresentative(stop, current)) {
      bestByCluster.set(key, stop);
    }
  }

  return Array.from(bestByCluster.values())
    .sort((a, b) => {
      const rankDiff = STATION_SEARCH_RANK_ORDER[a.matchRank] - STATION_SEARCH_RANK_ORDER[b.matchRank];
      if (rankDiff !== 0) return rankDiff;
      const aName = a.stopName ?? "";
      const bName = b.stopName ?? "";
      if (aName.length !== bName.length) return aName.length - bName.length;
      const nameCompare = aName.localeCompare(bName);
      if (nameCompare !== 0) return nameCompare;
      return a.stopId.localeCompare(b.stopId);
    })
    .slice(0, limit)
    .map((stop) => ({
      stopId: stop.stopId,
      name: stop.stopName,
      lat: stop.latitude as number,
      lon: stop.longitude as number,
      dataset,
      parentStation: stop.parentStation,
      locationType: stop.locationType,
    }));
}
