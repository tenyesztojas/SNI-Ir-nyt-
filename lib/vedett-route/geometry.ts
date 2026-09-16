// Védett Útvonal — MOTIS útvonal-geometria dekódolása térkép-megjelenítéshez.
//
// A MOTIS /api/v6/plan válasz minden nem-gyaloglós ÉS gyaloglós lábon is
// tartalmazhat egy legGeometry.points mezőt (Google encoded-polyline
// formátum, "precision" mezővel — jellemzően 6). Ezt egy VALÓS, futó
// MOTIS válaszban ellenőriztük (2026-09-06), nem feltételezés — lásd
// docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md.
//
// FONTOS: nem vezetünk be második street-routing motort vagy külön
// geometria-forrást — kizárólag azt jelenítjük meg, amit a MOTIS
// ténylegesen visszaadott. Ha egy lábhoz nincs geometria, csak a
// végpontok (fromLat/fromLon -> toLat/toLon) közötti egyenes vonalat
// rajzoljuk, world és sosem generálunk kitalált útvonal-alakot.

import type { NavigationCoordinate } from "./navigation/types";

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Google encoded-polyline algoritmus dekódolása. A MOTIS "precision" mezője
 * adja meg a skálázást (10^precision) — jellemzően 6, de a függvény
 * bármilyen precision értékkel helyesen működik.
 *
 * Malformed / üres input esetén SOHA nem dob kivételt — üres tömböt ad
 * vissza, hogy egy hibás geometria ne akassza meg a térkép renderelését
 * (lásd "REALTIME FAILURE" filozófia: egy adatforrás hibája nem dönthet
 * romba egy másik, működő funkciót).
 */
export function decodePolyline(encoded: string | undefined | null, precision = 6): LatLon[] {
  if (!encoded || typeof encoded !== "string") return [];

  const factor = Math.pow(10, precision);
  const coordinates: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  try {
    while (index < encoded.length) {
      let result = 1;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63 - 1;
        result += b << shift;
        shift += 5;
      } while (b >= 0x1f);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      result = 1;
      shift = 0;
      do {
        b = encoded.charCodeAt(index++) - 63 - 1;
        result += b << shift;
        shift += 5;
      } while (b >= 0x1f);
      lon += result & 1 ? ~(result >> 1) : result >> 1;

      const decodedLat = lat / factor;
      const decodedLon = lon / factor;
      if (Number.isFinite(decodedLat) && Number.isFinite(decodedLon)) {
        coordinates.push({ lat: decodedLat, lon: decodedLon });
      }
    }
  } catch {
    // Malformed encoding — az eddig sikeresen dekódolt pontokat visszaadjuk,
    // vagy üres tömböt, ha semmi sem sikerült. Sosem dobunk tovább hibát.
    return coordinates;
  }

  return coordinates;
}

// GTFS route_color normalizálása (2026-09-08, MapLibre "Could not parse
// color from value '#'" hiba javítása).
//
// GYÖKÉROK: a MOTIS GTFS route_color mezője (leg.routeColor) NEM
// garantáltan tiszta 6 karakteres hex string — lehet üres string (""),
// hiányzó/undefined, vagy akár már "#"-fel kezdődő. A korábbi kód
// (VedettUtvonalMap.tsx) feltétlenül "#"-et fűzött elé
// (["concat", "#", ["get", "routeColor"]]), ami üres string esetén egy
// érvénytelen, csupasz "#" MapLibre színt eredményezett ("Could not parse
// color from value '#'").
//
// JAVÍTÁS: a normalizálás egyetlen, determinisztikus helyen történik —
// itt, a GeoJSON építésekor — SOHA nem a rétegdefiníciós (paint)
// kifejezésekben. Csak PONTOSAN 6 hexadecimális karaktert tartalmazó,
// (opcionálisan "#" előtaggal ellátott) bemenetet fogad el érvényesnek;
// minden más (üres string, csak "#", hiányzó, rossz hosszúságú, nem-hex
// karakter) esetén undefined-ot ad vissza — ez esetben a hívó oldal
// (VedettUtvonalMap.tsx) explicit, mód szerinti alkalmazás-defaultot
// (MODE_COLOR) használ, SOHA nem kitalált vagy hiányos színt.
const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;

export function normalizeRouteColor(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!HEX_COLOR_RE.test(withoutHash)) return undefined;
  return `#${withoutHash.toUpperCase()}`;
}

export interface JourneyLegForGeometry {
  // MOL BUBI FRONTEND/ROUTING INTEGRÁCIÓ, PHASE 1 (2026-09-13) — "RENTAL"
  // hozzáadva, hogy a VedettUtvonalMap.tsx a MOL Bubi lábakat is meg tudja
  // rajzolni (lásd ott az új, "mode === RENTAL" szerinti szín/vonal-réteg).
  // A geometria FORRÁSA VÁLTOZATLAN — ugyanaz a legGeometry/fromLat-fromLon
  // fallback minden módnál, RENTAL esetén sincs második útvonal-forrás.
  mode: "WALK" | "TRANSIT" | "RENTAL";
  transitMode?: string;
  routeColor?: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  geometryEncoded?: string;
  geometryPrecision?: number;
  intermediateStops?: { name: string; lat?: number; lon?: number }[];
}

/**
 * Egy Journey lábjaiból GeoJSON FeatureCollection-t épít: LineString minden
 * lábhoz (valós MOTIS geometriából, ha van, különben a két végpont közti
 * egyenes), Point minden megállóhoz. Ez adja a MapLibre forrás-adatát.
 */
export function journeyLegsToGeoJson(legs: JourneyLegForGeometry[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const [i, leg] of legs.entries()) {
    const decoded = decodePolyline(leg.geometryEncoded, leg.geometryPrecision ?? 6);
    const coords: [number, number][] =
      decoded.length > 0
        ? decoded.map((p) => [p.lon, p.lat])
        : leg.fromLat !== undefined && leg.fromLon !== undefined && leg.toLat !== undefined && leg.toLon !== undefined
          ? [
              [leg.fromLon, leg.fromLat],
              [leg.toLon, leg.toLat],
            ]
          : [];

    if (coords.length >= 2) {
      const normalizedColor = normalizeRouteColor(leg.routeColor);
      features.push({
        type: "Feature",
        properties: {
          legIndex: i,
          mode: leg.mode,
          transitMode: leg.transitMode ?? null,
          // A "routeColor" kulcs CSAK akkor kerül be, ha van érvényes,
          // normalizált "#RRGGBB" szín — így a MapLibre paint kifejezés
          // ["has", "routeColor"] ellenőrzése SOHA nem talál üres/érvénytelen
          // értéket (lásd normalizeRouteColor() fejléce fent).
          ...(normalizedColor ? { routeColor: normalizedColor } : {}),
          hasRealGeometry: decoded.length > 0,
        },
        geometry: { type: "LineString", coordinates: coords },
      });
    }

    for (const stop of leg.intermediateStops ?? []) {
      if (stop.lat !== undefined && stop.lon !== undefined) {
        features.push({
          type: "Feature",
          properties: { kind: "stop", name: stop.name, legIndex: i },
          geometry: { type: "Point", coordinates: [stop.lon, stop.lat] },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

// NAVIGATION INSTRUCTIONS SPRINT 2 (2026-09-16) — a route-progress motor
// (lib/vedett-route/navigation/routeProgress.ts) és a navigációs
// utasítás-modell (lib/vedett-route/navigation/instructions.ts) EGYETLEN,
// KÖZÖS geometria-normalizáláson kell dolgozzon, különben a
// matchedSegmentIndex és a leg-határok két KÜLÖNBÖZŐ koordinátalistára
// mutatnának. Ez a függvény pontosan azt a flatten+dedup logikát végzi el,
// amit korábban a VedettUtvonalSearchForm.tsx `navigationRouteCoordinates`
// useMemo-ja inline tartalmazott (journeyLegsToGeoJson() feature-jeinek
// egyetlen koordinátatömbbé fűzése, szomszédos duplikátum-pontok
// kiszűrésével) — MOST ez az EGYETLEN hely, ahol ez történik.
//
// A `legRanges` minden, LineString-et adó leghez (lásd fent: coords.length
// >= 2) egy [startSegmentIndex, endSegmentIndex] tartományt rendel, ahol a
// "segmentIndex" UGYANAZT jelenti, mint
// lib/vedett-route/navigation/geometry.ts projectPointToRoute()
// segmentIndex mezője (a `coordinates` tömb i. és i+1. pontja közötti
// szakasz). A tartományok EGYMÁST NEM METSZŐ, FOLYTONOS particionálást
// adnak: ha egy leg (A) az előző leg (B) utolsó pontjával MEGEGYEZŐ ponton
// kezdődik (a duplikátum ezért kiszűrődik), a megosztott pont KIMENŐ
// szegmense (index = B utolsó koordináta-indexe) mindig A-hoz tartozik, B
// befejező szegmense pedig eggyel korábban ér véget — tehát a közös pont
// SOSEM okoz átfedést vagy duplikált tulajdonlást.
//
// KORLÁTOZÁS: ha egy leg a dedup után NEM ad hozzá legalább egy ÚJ,
// egyedi koordinátát (pl. nulla hosszúságú vagy teljesen degenerált leg),
// akkor ehhez a leghez NEM készül range — ez a leg emiatt SOHA nem
// válhat aktívvá kizárólag matchedSegmentIndex alapján. Ez egy explicit,
// dokumentált korlátozás, NEM hiba — nincs kitalálva/becsülve semmi.
// SPRINT 3 (2026-09-16) — a `legCoordinates` a leg SAJÁT, LOKÁLIS
// koordinátalistája (pontosan az, amit journeyLegsToGeoJson ehhez a leghez
// LineString-ként épített: valós MOTIS legGeometry dekódolva, vagy
// fromLat/fromLon -> toLat/toLon egyenes fallback) — MIELŐTT a globális,
// több lábból összefűzött dedup megtörténne. Ez teszi lehetővé, hogy egy
// köztes megállót KIZÁRÓLAG a SAJÁT legjére vetítsünk (lásd
// lib/vedett-route/navigation/instructions.ts projectStopToLegGeometry()),
// NE a teljes, összefűzött route-ra — egy adott utca/vonal máshol is
// előfordulhat a Journeyben, ezért egy globális legközelebbi-pont keresés
// rossz leget találhatna.
export interface NavigationLegGeometryRange {
  legIndex: number;
  startSegmentIndex: number;
  endSegmentIndex: number;
  legCoordinates: NavigationCoordinate[];
}

export interface NavigationRouteGeometry {
  coordinates: NavigationCoordinate[];
  legRanges: NavigationLegGeometryRange[];
}

export function journeyLegsToNavigationRoute(legs: JourneyLegForGeometry[]): NavigationRouteGeometry {
  const geojson = journeyLegsToGeoJson(legs);
  const coordinates: NavigationCoordinate[] = [];
  const legRanges: NavigationLegGeometryRange[] = [];

  for (const feature of geojson.features) {
    if (feature.geometry.type !== "LineString") continue;
    const legIndex = feature.properties && typeof feature.properties.legIndex === "number" ? feature.properties.legIndex : null;
    if (legIndex === null) continue;

    const entryIndex = coordinates.length - 1;
    for (const coordinate of feature.geometry.coordinates) {
      const lon = coordinate[0];
      const lat = coordinate[1];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const previous = coordinates[coordinates.length - 1];
      if (previous && previous[0] === lon && previous[1] === lat) continue;
      coordinates.push([lon, lat]);
    }
    const exitIndex = coordinates.length - 1;

    const startSegmentIndex = Math.max(0, entryIndex);
    const endSegmentIndex = exitIndex - 1;
    if (endSegmentIndex >= startSegmentIndex) {
      legRanges.push({
        legIndex,
        startSegmentIndex,
        endSegmentIndex,
        legCoordinates: feature.geometry.coordinates.map(([lon, lat]) => [lon, lat] as NavigationCoordinate),
      });
    }
  }

  return { coordinates, legRanges };
}
