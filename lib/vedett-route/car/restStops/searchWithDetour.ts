import type { CarNavigationRoute } from "../types.ts";
import { rankCarRestStopsByDetour } from "./detour.ts";
import { searchCarRestStopsAlongRoute } from "./searchAlongRoute.ts";
import type {
  CarRestStopDetourOptions,
  CarRestStopSearchOptions,
  CarRestStopSearchWithDetourResult,
} from "./types.ts";

type FetchLike = typeof fetch;

export async function searchCarRestStopsWithDetour(
  route: CarNavigationRoute,
  accessToken: string,
  searchOptions: CarRestStopSearchOptions = {},
  detourOptions: CarRestStopDetourOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<CarRestStopSearchWithDetourResult> {
  const search = await searchCarRestStopsAlongRoute(
    route.geometry,
    accessToken,
    searchOptions,
    fetchImpl,
  );

  const detour = await rankCarRestStopsByDetour(
    route,
    search.candidates,
    accessToken,
    detourOptions,
    fetchImpl,
  );

  return {
    candidates: detour.candidates,
    unpricedCandidateIds: detour.unpricedCandidateIds,
    diagnostics: {
      search: search.diagnostics,
      detour: detour.diagnostics,
    },
  };
}
