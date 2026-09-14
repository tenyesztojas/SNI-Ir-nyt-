import type { CarRouteGeometry, LngLat } from "../types.ts";

export type CarRestStopType = "FUEL" | "RESTAURANT" | "PUBLIC_TOILET";

export type CarRestStopSource = "MAPBOX" | "OSM" | "VEDETT_SAROK";

export type CarRestStopCandidate = {
  id: string;
  type: CarRestStopType;
  name: string;
  location: LngLat;
  source: CarRestStopSource;
  address?: string;
  mapboxId?: string;
  categoryIds?: string[];
};

export type CarRestStopOnRoute = CarRestStopCandidate & {
  routePositionMeters: number;
  distanceFromRouteMeters: number;
};

export type CarRestStopCorridorOptions = {
  maxDistanceFromRouteMeters: number;
  maxResults: number;
};

export type CarRestStopSearchContext = {
  route: CarRouteGeometry;
  candidates: CarRestStopCandidate[];
};

export type CarRestStopSearchOptions = {
  country?: string;
  language?: string;
  maxResultsPerCategory?: number;
  maxDistanceFromRouteMeters?: number;
  maxResults?: number;
  timeDeviationMinutes?: number;
};

export type CarRestStopSearchResult = {
  candidates: CarRestStopOnRoute[];
  diagnostics: {
    provider: "MAPBOX_SEARCH_BOX";
    categoriesRequested: string[];
    publicToiletCategoryId: string | null;
    rawCandidateCount: number;
    filteredCandidateCount: number;
  };
};

export type CarRestStopDetour = {
  baselineDurationSeconds: number;
  baselineDistanceMeters: number;
  viaDurationSeconds: number;
  viaDistanceMeters: number;
  signedDurationDeltaSeconds: number;
  signedDistanceDeltaMeters: number;
  detourDurationSeconds: number;
  detourDistanceMeters: number;
};

export type CarRestStopWithDetour = CarRestStopOnRoute & {
  detour: CarRestStopDetour;
};

export type CarRestStopDetourOptions = {
  /** Maximum number of paid Directions requests for one ranking pass. */
  maxCandidates?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
};

export type CarRestStopDetourResult = {
  candidates: CarRestStopWithDetour[];
  unpricedCandidateIds: string[];
  diagnostics: {
    provider: "MAPBOX_DIRECTIONS";
    profile: "driving-traffic";
    attemptedCount: number;
    pricedCount: number;
    failedCount: number;
    maxCandidates: number;
  };
};

export type CarRestStopSearchWithDetourResult = {
  candidates: CarRestStopWithDetour[];
  unpricedCandidateIds: string[];
  diagnostics: {
    search: CarRestStopSearchResult["diagnostics"];
    detour: CarRestStopDetourResult["diagnostics"];
  };
};
