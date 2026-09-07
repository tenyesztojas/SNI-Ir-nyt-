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

export interface JourneyLegForGeometry {
  mode: "WALK" | "TRANSIT";
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
      features.push({
        type: "Feature",
        properties: {
          legIndex: i,
          mode: leg.mode,
          transitMode: leg.transitMode ?? null,
          routeColor: leg.routeColor ?? null,
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
