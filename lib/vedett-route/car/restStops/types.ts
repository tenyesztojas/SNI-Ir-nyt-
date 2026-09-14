import type { CarRouteGeometry, LngLat } from "../types.ts";

export type CarRestStopType = "FUEL" | "RESTAURANT" | "PUBLIC_TOILET";

export type CarRestStopCandidate = {
  id: string;
  type: CarRestStopType;
  name: string;
  location: LngLat;
  source: "MAPBOX" | "OSM" | "VEDETT_SAROK";
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
