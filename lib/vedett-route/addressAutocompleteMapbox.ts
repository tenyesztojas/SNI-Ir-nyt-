export type AddressAutocompleteSuggestion = {
  id?: string;
  label: string;
  name?: string;
  city?: string;
  postcode?: string;
  district?: string;
  lat?: number;
  lon?: number;
  sessionToken?: string;
};

export type MapboxGeocodingFeature = {
  id?: string;
  geometry?: { coordinates?: unknown };
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    full_address?: string;
    coordinates?: {
      longitude?: unknown;
      latitude?: unknown;
      routable_points?: Array<{ name?: string; longitude?: unknown; latitude?: unknown }>;
    };
    context?: {
      postcode?: { name?: string };
      place?: { name?: string };
      district?: { name?: string };
      locality?: { name?: string };
    };
  };
};

export type MapboxSearchBoxSuggestion = {
  name?: string;
  name_preferred?: string;
  mapbox_id?: string;
  feature_type?: string;
  address?: string;
  full_address?: string;
  place_formatted?: string;
  context?: {
    postcode?: { name?: string };
    place?: { name?: string };
    district?: { name?: string };
    locality?: { name?: string };
  };
};

export function normalizeForPrefixMatch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function matchesQueryPrefix(query: string, candidateText: string | undefined): boolean {
  const q = normalizeForPrefixMatch(query);
  if (!q) return true;
  if (!candidateText) return false;
  const candidate = normalizeForPrefixMatch(candidateText);
  return candidate.startsWith(q) || candidate.split(/\s+/).some((token) => token.startsWith(q));
}

function sameNormalized(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeForPrefixMatch(a) === normalizeForPrefixMatch(b);
}

function structuredCityFromContext(
  context:
    | {
        place?: { name?: string };
        locality?: { name?: string };
      }
    | undefined,
): string | undefined {
  return context?.place?.name ?? context?.locality?.name;
}

function contextHasExactCity(
  context:
    | {
        place?: { name?: string };
        locality?: { name?: string };
      }
    | undefined,
  wantedCity: string,
): boolean {
  return (
    sameNormalized(context?.place?.name, wantedCity) ||
    sameNormalized(context?.locality?.name, wantedCity)
  );
}

function featureCity(feature: MapboxGeocodingFeature): string | undefined {
  return structuredCityFromContext(feature.properties?.context);
}

function featurePostcode(feature: MapboxGeocodingFeature): string | undefined {
  return feature.properties?.context?.postcode?.name;
}

function featureDistrict(feature: MapboxGeocodingFeature): string | undefined {
  return feature.properties?.context?.district?.name;
}

function featureCoordinates(feature: MapboxGeocodingFeature): { lat: number; lon: number } | null {
  const p = feature.properties?.coordinates;
  if (typeof p?.latitude === "number" && typeof p?.longitude === "number") {
    return { lat: p.latitude, lon: p.longitude };
  }

  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
    return { lon: coords[0], lat: coords[1] };
  }

  return null;
}


/**
 * A felhasználónak szánt címke szándékosan rövid és determinisztikus.
 * Nem használjuk közvetlenül a Mapbox full_address/place_formatted szövegét,
 * mert egyes magyar street találatoknál ugyanaz az utcanév kétszer is
 * megjelenhet a szolgáltatói formázásban. Autizmusbarát UI-ban ez különösen
 * zavaró, ezért csak: cím/utca, település, irányítószám jelenik meg.
 */
export function buildAccessibleAddressLabel(
  primary: string | undefined,
  city?: string,
  postcode?: string,
): string {
  const parts = [primary?.trim(), city?.trim(), postcode?.trim()].filter(
    (value): value is string => Boolean(value),
  );
  const seen = new Set<string>();
  return parts
    .filter((part) => {
      const key = normalizeForPrefixMatch(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/**
 * Magyar címmezőből a végén álló házszámot választja le.
 * Példák: "Kőszikla utca 12", "Fő út 12/A", "Petőfi utca 4-6".
 * Ha nincs egyértelmű, sorvégi házszám, null-t ad: POI/utcanév keresést
 * nem próbálunk címként kitalálni.
 */
export function parseStreetAndHouseNumber(
  value: string,
): { street: string; addressNumber: string } | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.+?)\s+(\d+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]?(?:[/-]\d*[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]?)?\.?)$/u);
  if (!match) return null;
  const street = match[1]?.trim();
  const addressNumber = match[2]?.replace(/\.$/, "").trim();
  if (!street || !addressNumber) return null;
  return { street, addressNumber };
}

function structuredAddressCoordinates(feature: MapboxGeocodingFeature): { lat: number; lon: number } | null {
  const routablePoints = feature.properties?.coordinates?.routable_points;
  if (Array.isArray(routablePoints)) {
    const preferred =
      routablePoints.find((point) => point?.name === "default") ?? routablePoints[0];
    if (typeof preferred?.latitude === "number" && typeof preferred?.longitude === "number") {
      return { lat: preferred.latitude, lon: preferred.longitude };
    }
  }
  return featureCoordinates(feature);
}

export function processStructuredAddressFeatures(
  features: MapboxGeocodingFeature[],
  street: string,
  addressNumber: string,
  city?: string,
  postalOrDistrict?: string,
  limit = 5,
): AddressAutocompleteSuggestion[] {
  const wantedCity = city?.trim();
  const wantedPostcode = postalOrDistrict?.trim();
  const out: AddressAutocompleteSuggestion[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const p = feature.properties;
    if (!p || p.feature_type !== "address") continue;
    if (wantedCity && !contextHasExactCity(p.context, wantedCity)) continue;
    if (wantedPostcode && /^\d{4}$/.test(wantedPostcode) && featurePostcode(feature) !== wantedPostcode) continue;

    // Címnél a navigációhoz optimalizált routable point az elsődleges;
    // csak ennek hiányában használjuk az objektum általános koordinátáját.
    const coords = structuredAddressCoordinates(feature);
    if (!coords) continue;

    // Structured Input már külön street/address_number mezőkkel kérdez,
    // ezért itt nem futtatjuk a régi prefix-filtert a teljes "utca 12"
    // queryre. Ez volt a házszámos találatok elvesztésének egyik oka.
    const returnedName = p.name_preferred ?? p.name;
    const primary = returnedName?.trim() || `${street} ${addressNumber}`;
    const label = buildAccessibleAddressLabel(primary, featureCity(feature) ?? wantedCity, featurePostcode(feature));
    if (!label) continue;

    const key = normalizeForPrefixMatch(label);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: p.mapbox_id ?? feature.id,
      label,
      name: primary,
      city: featureCity(feature) ?? wantedCity,
      postcode: featurePostcode(feature),
      district: featureDistrict(feature),
      lat: coords.lat,
      lon: coords.lon,
    });
    if (out.length >= limit) break;
  }

  return out;
}

export function processMapboxSearchBoxSuggestions(
  suggestions: MapboxSearchBoxSuggestion[],
  query: string,
  city?: string,
  postalOrDistrict?: string,
  limit = 5,
): AddressAutocompleteSuggestion[] {
  const wantedCity = city?.trim();
  const wantedPostcode = postalOrDistrict?.trim();

  let candidates = suggestions.filter((suggestion) => {
    if (suggestion.feature_type !== "street" && suggestion.feature_type !== "address") return false;
    if (!suggestion.mapbox_id) return false;

    const name = suggestion.name_preferred ?? suggestion.name ?? suggestion.address;
    if (!matchesQueryPrefix(query, name)) return false;

    // KRITIKUS: a várost KIZÁRÓLAG strukturált place/locality contextből
    // ellenőrizzük. full_address/place_formatted soha nem számít városmatchnek.
    if (wantedCity && !contextHasExactCity(suggestion.context, wantedCity)) return false;

    if (
      wantedPostcode &&
      /^\d{4}$/.test(wantedPostcode) &&
      suggestion.context?.postcode?.name !== wantedPostcode
    ) {
      return false;
    }

    return true;
  });

  if (wantedPostcode && !/^\d{4}$/.test(wantedPostcode)) {
    candidates = candidates.sort((a, b) => {
      const am = sameNormalized(a.context?.district?.name, wantedPostcode) ? 0 : 1;
      const bm = sameNormalized(b.context?.district?.name, wantedPostcode) ? 0 : 1;
      return am - bm;
    });
  }

  const seen = new Set<string>();
  const out: AddressAutocompleteSuggestion[] = [];

  for (const suggestion of candidates) {
    const name =
      suggestion.name_preferred?.trim() ||
      suggestion.name?.trim() ||
      suggestion.address?.trim() ||
      "";

    const label = buildAccessibleAddressLabel(
      name,
      structuredCityFromContext(suggestion.context),
      suggestion.context?.postcode?.name,
    );

    if (!name || !label) continue;

    const key = normalizeForPrefixMatch(`${suggestion.mapbox_id}|${label}`);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: suggestion.mapbox_id,
      label,
      name,
      city: structuredCityFromContext(suggestion.context),
      postcode: suggestion.context?.postcode?.name,
      district: suggestion.context?.district?.name,
    });

    if (out.length >= limit) break;
  }

  return out;
}

export function processMapboxGeocodingFeatures(
  features: MapboxGeocodingFeature[],
  query: string,
  city?: string,
  postalOrDistrict?: string,
  limit = 5
): AddressAutocompleteSuggestion[] {
  const wantedCity = city?.trim();
  const wantedPostcode = postalOrDistrict?.trim();

  let candidates = features.filter((feature) => {
    const p = feature.properties;
    if (!p || (p.feature_type !== "street" && p.feature_type !== "address")) return false;

    const name = p.name_preferred ?? p.name;
    if (!matchesQueryPrefix(query, name)) return false;

    if (wantedCity && !contextHasExactCity(p.context, wantedCity)) return false;

    if (
      wantedPostcode &&
      /^\d{4}$/.test(wantedPostcode) &&
      featurePostcode(feature) !== wantedPostcode
    ) {
      return false;
    }

    return featureCoordinates(feature) !== null;
  });

  if (wantedPostcode && !/^\d{4}$/.test(wantedPostcode)) {
    candidates = candidates.sort((a, b) => {
      const am = sameNormalized(featureDistrict(a), wantedPostcode) ? 0 : 1;
      const bm = sameNormalized(featureDistrict(b), wantedPostcode) ? 0 : 1;
      return am - bm;
    });
  }

  const seen = new Set<string>();
  const out: AddressAutocompleteSuggestion[] = [];

  for (const feature of candidates) {
    const p = feature.properties!;
    const coordinates = featureCoordinates(feature)!;
    const label = buildAccessibleAddressLabel(
      p.name_preferred ?? p.name,
      featureCity(feature),
      featurePostcode(feature),
    );

    if (!label) continue;

    const key = normalizeForPrefixMatch(label);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: p.mapbox_id ?? feature.id,
      label,
      name: p.name_preferred ?? p.name,
      city: featureCity(feature),
      postcode: featurePostcode(feature),
      district: featureDistrict(feature),
      lat: coordinates.lat,
      lon: coordinates.lon,
    });

    if (out.length >= limit) break;
  }

  return out;
}
