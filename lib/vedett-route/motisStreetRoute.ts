// VÉDETT ÚTVONAL — MOTIS STREET/WALKING ROUTING (Nearby Transit Access
// Backend sprint, folytatás, 2026-09-17).
//
// Ez a modul a MOTIS 2.11.2 VALÓS, VPS E2E teszttel BIZONYÍTOTT
// POST /api/route (gyalogos street-routing) végpontjának üzleti-logikai
// rétege: bemenet-validáció, válasz-alak runtime validáció, és a
// FeatureCollection LineString-jeinek egyetlen geometry-vé fűzése.
//
// SZÁNDÉKOSAN NEM ez a fájl végzi a HTTP hívást — az a MEGLÉVŐ
// lib/vedett-route/motisClient.ts fetchMotisWalkingRoute()-ja, ami a
// MÁR MEGLÉVŐ route-service/legacy-direct base-URL feloldást, auth-ot,
// timeoutot és retry-mintát használja (nincs duplikált MOTIS
// config/base-URL logika). Ez a modul itt KIZÁRÓLAG tiszta, hálózat-
// mentes függvényeket tartalmaz — pontosan azért külön fájlban, mert a
// motisClient.ts eddig SOHA nem végzett mélyreható válasz-validációt
// vagy geometria-feldolgozást (a /api/v6/plan válaszra is csak
// típusösszerendelés történik, nem runtime alak-ellenőrzés) — ez egy ÚJ,
// önálló felelősség, aminek nem a HTTP-transport fájl a helye.
//
// KŐKEMÉNY SZABÁLY (spec 7. pont): a flattenStreetRouteGeometry() SOSEM
// talál ki hiányzó pontot, és SOSEM használ Haversine-t/interpolációt a
// tényleges MOTIS geometria helyettesítésére — kizárólag a MOTIS által
// tényleg visszaadott koordinátákat fűzi össze, a szomszédos
// LineString-határokon lévő pontos duplikátumokat deduplikálva.
//
// PRODUCTION BEKÖTÉS: ez a modul (és a rá épülő motisClient.ts
// fetchMotisWalkingRoute()) ebben a sprintben SEHOL nincs meghívva az
// orchestrator.ts route-search flow-jából, és NEM kombinálódik a Nearby
// Stop Discovery réteggel (lookupNearbyStops()) — kizárólag önállóan
// tesztelt, jövőbeli bekötésre előkészített építőkocka.

/** A /api/route request-jének EGY pontja (start VAGY destination) — a MOTIS wire-formátummal EGYEZŐ mezőnevekkel (lat/lng, nem lat/lon). */
export interface StreetRoutePoint {
  lat: number;
  lng: number;
  level: number;
}

/**
 * Bemenet-validáció (spec 5. pont): lat/lng/level mind finite szám, lat
 * [-90,90], lng [-180,180]. `level`-re a GTFS/MOTIS "level" mezőnek NINCS
 * hasonlóan szigorú, dokumentált tartománya (lehet negatív, pl. aluljáró),
 * ezért csak a finite-séget követeljük meg rá.
 */
export function isValidStreetRoutePoint(point: unknown): point is StreetRoutePoint {
  if (!point || typeof point !== "object") return false;
  const p = point as Record<string, unknown>;
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat)) return false;
  if (typeof p.lng !== "number" || !Number.isFinite(p.lng)) return false;
  if (typeof p.level !== "number" || !Number.isFinite(p.level)) return false;
  if (p.lat < -90 || p.lat > 90) return false;
  if (p.lng < -180 || p.lng > 180) return false;
  return true;
}

/** A /api/route válasz `metadata` mezője (spec 2. pont: duration/distance/usesElevator). */
export interface StreetRouteMetadata {
  duration: number;
  distance: number;
  usesElevator: boolean;
}

// A MOTIS koordináta-sorrendje [lon, lat] — EZ MEGEGYEZIK a VédettÚtvonal
// navigációs belső reprezentációjával (lib/vedett-route/navigation/types.ts
// NavigationCoordinate = readonly [longitude, latitude]), tehát ITT
// SZÁNDÉKOSAN NINCS átrendezés/konverzió — a koordináták úgy kerülnek
// tárolásra, ahogy a MOTIS adta őket. Ez a modul mégsem importálja
// magát a NavigationCoordinate típust (a navigáció-specifikus modult),
// hogy izolált maradjon, amíg egy jövőbeli kör tényleg JourneyLeg-et épít
// belőle (lásd a modul fejlécének "PRODUCTION BEKÖTÉS" szakaszát).
export type StreetRouteCoordinate = readonly [lon: number, lat: number];

/** Egyetlen GeoJSON Feature (LineString) a MOTIS válaszból, a jövőbeli WALK-leg-előálltáshoz szükséges minimális mezőkkel (spec 2. pont). */
export interface StreetRouteFeature {
  coordinates: readonly StreetRouteCoordinate[];
  level?: number;
  way?: number;
}

export interface StreetRoute {
  metadata: StreetRouteMetadata;
  features: StreetRouteFeature[];
}

export type StreetRouteParseError =
  | "MALFORMED_TYPE"
  | "MALFORMED_METADATA"
  | "MALFORMED_FEATURES"
  | "MALFORMED_GEOMETRY"
  | "MALFORMED_COORDINATES";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidLon(value: number): boolean {
  return value >= -180 && value <= 180;
}

function isValidLat(value: number): boolean {
  return value >= -90 && value <= 90;
}

/**
 * Egyetlen [lon, lat] koordináta-pár validálása (spec 4. pont: "koordináták
 * finite-ek és földrajzilag érvényesek").
 */
function isValidCoordinatePair(pair: unknown): pair is StreetRouteCoordinate {
  if (!Array.isArray(pair) || pair.length !== 2) return false;
  const [lon, lat] = pair as [unknown, unknown];
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return false;
  return isValidLon(lon) && isValidLat(lat);
}

/**
 * A MOTIS POST /api/route NYERS válaszának runtime validációja (spec 4.
 * pont — "ne bízz vakon a JSON-ban"). Minden ellenőrzés explicit; egy
 * malformed mező a TELJES válasz elutasítását okozza (nincs "részleges
 * elfogadás") — ugyanaz a defenzív elv, mint a sidecar
 * parseLookupRequest()/parseNearbyStopsRequest()-jénél: SOHA nem dob
 * kivételt, mindig egy explicit hibakódot ad vissza.
 */
export function parseMotisStreetRouteResponse(raw: unknown): StreetRoute | { error: StreetRouteParseError } {
  if (!raw || typeof raw !== "object") return { error: "MALFORMED_TYPE" };
  const body = raw as Record<string, unknown>;
  if (body.type !== "FeatureCollection") return { error: "MALFORMED_TYPE" };

  const metadataRaw = body.metadata;
  if (!metadataRaw || typeof metadataRaw !== "object") return { error: "MALFORMED_METADATA" };
  const m = metadataRaw as Record<string, unknown>;
  if (!isFiniteNumber(m.duration) || m.duration < 0) return { error: "MALFORMED_METADATA" };
  if (!isFiniteNumber(m.distance) || m.distance < 0) return { error: "MALFORMED_METADATA" };
  if (typeof m.uses_elevator !== "boolean") return { error: "MALFORMED_METADATA" };

  if (!Array.isArray(body.features)) return { error: "MALFORMED_FEATURES" };

  const features: StreetRouteFeature[] = [];
  for (const rawFeature of body.features) {
    if (!rawFeature || typeof rawFeature !== "object") return { error: "MALFORMED_FEATURES" };
    const feature = rawFeature as Record<string, unknown>;
    if (feature.type !== "Feature") return { error: "MALFORMED_FEATURES" };

    const geometry = feature.geometry;
    if (!geometry || typeof geometry !== "object") return { error: "MALFORMED_GEOMETRY" };
    const g = geometry as Record<string, unknown>;
    if (g.type !== "LineString") return { error: "MALFORMED_GEOMETRY" };
    if (!Array.isArray(g.coordinates)) return { error: "MALFORMED_COORDINATES" };

    const coordinates: StreetRouteCoordinate[] = [];
    for (const pair of g.coordinates) {
      if (!isValidCoordinatePair(pair)) return { error: "MALFORMED_COORDINATES" };
      coordinates.push([pair[0], pair[1]]);
    }

    const properties = feature.properties;
    let level: number | undefined;
    let way: number | undefined;
    if (properties && typeof properties === "object") {
      const p = properties as Record<string, unknown>;
      if (p.level !== undefined) {
        if (!isFiniteNumber(p.level)) return { error: "MALFORMED_GEOMETRY" };
        level = p.level;
      }
      if (p.way !== undefined) {
        if (!isFiniteNumber(p.way)) return { error: "MALFORMED_GEOMETRY" };
        way = p.way;
      }
    }

    features.push({ coordinates, level, way });
  }

  return {
    metadata: { duration: m.duration, distance: m.distance, usesElevator: m.uses_elevator },
    features,
  };
}

/**
 * A validált StreetRoute ÖSSZES feature-jének LineString-koordinátáit
 * egyetlen, szekvenciális gyalogos geometry-vé fűzi össze (spec 7. pont).
 *
 * - A feature-ök tömb-sorrendjét követi (nincs átrendezés/optimalizálás).
 * - Egymást követő, PONTOSAN azonos [lon,lat] pontokat deduplikál — akár
 *   egy feature-ön belül, akár két egymást követő feature határán (pl.
 *   amikor a MOTIS az utolsó pontot megismétli a következő szakasz első
 *   pontjaként).
 * - SOSEM talál ki/interpolál hiányzó pontot, és SOSEM használ
 *   Haversine-t — ez KIZÁRÓLAG a MOTIS által tényleg visszaadott
 *   koordináták összefűzése.
 * - Ha nincs használható geometria (nincs feature, vagy az összefűzés
 *   után 2-nél kevesebb pont marad — egy egyetlen pontból nem áll elő
 *   vonal), `null`-t ad — FAIL-SAFE, sosem dob kivételt.
 */
export function flattenStreetRouteGeometry(route: StreetRoute): readonly StreetRouteCoordinate[] | null {
  const flattened: StreetRouteCoordinate[] = [];
  for (const feature of route.features) {
    for (const coordinate of feature.coordinates) {
      const previous = flattened[flattened.length - 1];
      if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) continue;
      flattened.push(coordinate);
    }
  }
  return flattened.length >= 2 ? flattened : null;
}

export type MotisStreetRouteResult =
  | { ok: true; data: StreetRoute }
  | { ok: false; reason: "invalid_input" | "routing_engine_unavailable" | "routing_error" | "timeout"; message: string; status?: number };
