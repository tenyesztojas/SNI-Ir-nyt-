import type { CarRouteGeometry, LngLat } from "../types.ts";
import type {
  CarRestStopCandidate,
  CarRestStopSearchOptions,
  CarRestStopType,
} from "./types.ts";
import { encodePolyline6 } from "./polyline.ts";

const SEARCH_BOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const CATEGORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const CONFIRMED_CATEGORY_IDS: Record<Exclude<CarRestStopType, "PUBLIC_TOILET">, string> = {
  FUEL: "gas_station",
  RESTAURANT: "restaurant",
};

type FetchLike = typeof fetch;

type MapboxFeatureCollection = {
  type?: unknown;
  features?: unknown;
};

type CachedToiletCategory = {
  value: string | null;
  expiresAt: number;
};

let cachedPublicToiletCategory: CachedToiletCategory | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length > 0 ? values : undefined;
}

function readLngLat(feature: Record<string, unknown>): LngLat | null {
  const geometry = feature.geometry;
  if (!isRecord(geometry) || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const [lon, lat] = geometry.coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

  return [lon, lat];
}

function normalizeFeature(
  feature: unknown,
  type: CarRestStopType,
  fallbackId: string,
): CarRestStopCandidate | null {
  if (!isRecord(feature)) return null;

  const location = readLngLat(feature);
  if (!location) return null;

  const properties = isRecord(feature.properties) ? feature.properties : {};
  const mapboxId = asString(properties.mapbox_id) ?? asString(feature.id);
  const name =
    asString(properties.name) ??
    asString(properties.full_address) ??
    asString(properties.address) ??
    (type === "FUEL"
      ? "Benzinkút"
      : type === "RESTAURANT"
        ? "Étterem"
        : "Nyilvános WC");

  const address =
    asString(properties.full_address) ??
    asString(properties.address) ??
    asString(properties.place_formatted);

  return {
    id: mapboxId ? `mapbox:${mapboxId}` : fallbackId,
    type,
    name,
    location,
    source: "MAPBOX",
    ...(address ? { address } : {}),
    ...(mapboxId ? { mapboxId } : {}),
    ...(asStringArray(properties.poi_category_ids)
      ? { categoryIds: asStringArray(properties.poi_category_ids) }
      : {}),
  };
}

function categoryLooksLikePublicToilet(canonicalId: string, name: string): boolean {
  const haystack = `${canonicalId} ${name}`.toLocaleLowerCase("en");
  const positive = ["public toilet", "public restroom", "restroom", "toilet", "lavatory", "wc"];
  const negative = ["portable", "plumbing", "bathroom supply", "toilet supply"];

  return positive.some((token) => haystack.includes(token)) &&
    !negative.some((token) => haystack.includes(token));
}

export async function resolvePublicToiletCategoryId(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const now = Date.now();
  if (cachedPublicToiletCategory && cachedPublicToiletCategory.expiresAt > now) {
    return cachedPublicToiletCategory.value;
  }

  const params = new URLSearchParams({
    access_token: accessToken,
    language: "en",
  });

  const response = await fetchImpl(`${SEARCH_BOX_BASE}/list/category?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`mapbox_category_list_${response.status}`);
  }

  const data: unknown = await response.json();
  const listItems = isRecord(data) && Array.isArray(data.listItems) ? data.listItems : [];

  let resolved: string | null = null;

  for (const item of listItems) {
    if (!isRecord(item)) continue;
    const canonicalId = asString(item.canonical_id);
    const name = asString(item.name) ?? "";
    if (!canonicalId) continue;

    if (categoryLooksLikePublicToilet(canonicalId, name)) {
      resolved = canonicalId;
      break;
    }
  }

  cachedPublicToiletCategory = {
    value: resolved,
    expiresAt: now + CATEGORY_CACHE_TTL_MS,
  };

  return resolved;
}

async function searchCategoryAlongRoute(
  route: CarRouteGeometry,
  categoryId: string,
  type: CarRestStopType,
  accessToken: string,
  options: Required<Pick<CarRestStopSearchOptions, "country" | "language" | "maxResultsPerCategory" | "timeDeviationMinutes">>,
  fetchImpl: FetchLike,
): Promise<CarRestStopCandidate[]> {
  const encodedRoute = encodePolyline6(route);
  const params = new URLSearchParams({
    access_token: accessToken,
    language: options.language,
    country: options.country,
    limit: String(options.maxResultsPerCategory),
    sar_type: "isochrone",
    route_geometry: "polyline6",
    time_deviation: String(options.timeDeviationMinutes),
    show_closed_pois: "false",
    exclude_fields: "photos,reviews",
    route: encodedRoute,
  });

  const response = await fetchImpl(
    `${SEARCH_BOX_BASE}/category/${encodeURIComponent(categoryId)}?${params.toString()}`,
    {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`mapbox_category_search_${categoryId}_${response.status}`);
  }

  const data: unknown = await response.json();
  const collection = isRecord(data) ? (data as MapboxFeatureCollection) : null;
  const features = collection && Array.isArray(collection.features) ? collection.features : [];

  return features
    .map((feature, index) => normalizeFeature(feature, type, `mapbox:${categoryId}:${index}`))
    .filter((candidate): candidate is CarRestStopCandidate => candidate !== null);
}

function dedupeCandidates(candidates: CarRestStopCandidate[]): CarRestStopCandidate[] {
  const seen = new Set<string>();
  const output: CarRestStopCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.mapboxId
      ? `mapbox:${candidate.mapboxId}:${candidate.type}`
      : `${candidate.type}:${candidate.location[0].toFixed(6)}:${candidate.location[1].toFixed(6)}:${candidate.name.toLocaleLowerCase("hu")}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }

  return output;
}

export async function fetchMapboxRestStopsAlongRoute(
  route: CarRouteGeometry,
  accessToken: string,
  options: CarRestStopSearchOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<{
  candidates: CarRestStopCandidate[];
  categoriesRequested: string[];
  publicToiletCategoryId: string | null;
}> {
  if (!accessToken) {
    throw new Error("mapbox_access_token_missing");
  }

  if (route.coordinates.length < 2) {
    return {
      candidates: [],
      categoriesRequested: [],
      publicToiletCategoryId: null,
    };
  }

  const normalizedOptions = {
    country: options.country ?? "HU",
    language: options.language ?? "hu",
    maxResultsPerCategory: Math.min(10, Math.max(1, options.maxResultsPerCategory ?? 10)),
    timeDeviationMinutes: Math.min(30, Math.max(1, options.timeDeviationMinutes ?? 10)),
  };

  const publicToiletCategoryId = await resolvePublicToiletCategoryId(accessToken, fetchImpl);

  const categories: Array<{ type: CarRestStopType; id: string }> = [
    { type: "FUEL", id: CONFIRMED_CATEGORY_IDS.FUEL },
    { type: "RESTAURANT", id: CONFIRMED_CATEGORY_IDS.RESTAURANT },
    ...(publicToiletCategoryId
      ? [{ type: "PUBLIC_TOILET" as const, id: publicToiletCategoryId }]
      : []),
  ];

  const results = await Promise.all(
    categories.map(({ type, id }) =>
      searchCategoryAlongRoute(route, id, type, accessToken, normalizedOptions, fetchImpl),
    ),
  );

  return {
    candidates: dedupeCandidates(results.flat()),
    categoriesRequested: categories.map((category) => category.id),
    publicToiletCategoryId,
  };
}
