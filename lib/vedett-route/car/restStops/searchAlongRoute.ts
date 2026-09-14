import type { CarRouteGeometry } from "../types.ts";
import { filterAndRankCarRestStops } from "./corridor.ts";
import { fetchMapboxRestStopsAlongRoute } from "./mapboxSearchAlongRoute.ts";
import type {
  CarRestStopSearchOptions,
  CarRestStopSearchResult,
} from "./types.ts";

export async function searchCarRestStopsAlongRoute(
  route: CarRouteGeometry,
  accessToken: string,
  options: CarRestStopSearchOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<CarRestStopSearchResult> {
  const providerResult = await fetchMapboxRestStopsAlongRoute(
    route,
    accessToken,
    options,
    fetchImpl,
  );

  const filtered = filterAndRankCarRestStops(route, providerResult.candidates, {
    maxDistanceFromRouteMeters: options.maxDistanceFromRouteMeters ?? 1500,
    maxResults: options.maxResults ?? 12,
  });

  return {
    candidates: filtered,
    diagnostics: {
      provider: "MAPBOX_SEARCH_BOX",
      categoriesRequested: providerResult.categoriesRequested,
      publicToiletCategoryId: providerResult.publicToiletCategoryId,
      rawCandidateCount: providerResult.candidates.length,
      filteredCandidateCount: filtered.length,
    },
  };
}
