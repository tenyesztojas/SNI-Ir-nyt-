"use client";

// Védett Útvonal — MapLibre GL JS térkép.
//
// Miért MapLibre és nem Google Maps SDK: explicit projektdöntés (Map/GPS/
// Rest Points sprint, F. pont) — nyílt forráskódú, nincs fizetős
// map-provider függőség jóváhagyás nélkül. MEGJEGYZÉS: a projekt más
// részein (pl. kozosseg/terkep) már használ Leaflet + react-leaflet-et —
// ez a komponens szándékosan MapLibre-t használ, mert a feladat kifejezetten
// ezt kérte ehhez a modulhoz; a két térkép-megoldás egymás mellett élhet,
// nem kell a meglévő Leaflet-es oldalakat átírni.
//
// Geometria forrás: KIZÁRÓLAG a MOTIS válaszból ténylegesen visszakapott
// legGeometry (encoded polyline) és koordináták — lásd lib/vedett-route/geometry.ts
// fejléce. NINCS második street-routing motor.
//
// ALAPTÉRKÉP (2026-09-08, valódi utcai alaptérkép feladat): a style URL
// KIZÁRÓLAG a lib/vedett-route/mapStyle.ts-ben van definiálva — lásd ott a
// teljes indoklást (miért nem demotiles.maplibre.org, miért OpenFreeMap
// Liberty, hogyan cserélhető env-vezérelten). Ez a fájl NEM hardcode-ol
// semmilyen style URL-t vagy tile-hosztot.

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { journeyLegsToGeoJson, type JourneyLegForGeometry } from "@/lib/vedett-route/geometry";
import { MAP_STYLE_URL, MAP_ATTRIBUTION_FALLBACK } from "@/lib/vedett-route/mapStyle";

const MODE_COLOR: Record<string, string> = {
  WALK: "#6b7280",
  SUBWAY: "#22c55e",
  TRAM: "#eab308",
  BUS: "#3b82f6",
  RAIL: "#6366f1",
  COACH: "#6366f1",
};

export interface RestPointMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface VedettUtvonalMapProps {
  legs: JourneyLegForGeometry[];
  fromName?: string;
  toName?: string;
  currentPosition?: { latitude: number; longitude: number } | null;
  restPoints?: RestPointMarker[];
  className?: string;
}

// Egyedi MapLibre control gomb — a NavigationControl (zoom +/-) mellé, a
// meglévő "top-right" csoportba illeszkedve (saját maplibregl-ctrl* CSS
// osztályokkal, hogy vizuálisan egységes maradjon a zoom-gombokkal, NEM új
// Tailwind/redesign elem). Kattintásra az AKTUÁLIS GPS-pozícióra repít —
// a pozíciót egy külső ref-ből olvassa (lásd currentPositionRef lent), hogy
// mindig a legfrissebb értéket használja anélkül, hogy a control-t újra
// kellene létrehozni minden pozícióváltáskor.
class CurrentLocationControl implements maplibregl.IControl {
  private map?: maplibregl.Map;
  private container: HTMLDivElement;
  private getPosition: () => { latitude: number; longitude: number } | null;

  constructor(getPosition: () => { latitude: number; longitude: number } | null) {
    this.getPosition = getPosition;
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "maplibregl-ctrl-icon";
    button.setAttribute("aria-label", "Ugrás a jelenlegi helyhez");
    button.title = "Ugrás a jelenlegi helyhez";
    button.style.fontSize = "16px";
    button.style.lineHeight = "29px";
    button.textContent = "◎";
    button.addEventListener("click", () => {
      const position = this.getPosition();
      if (!position || !this.map) return;
      this.map.flyTo({ center: [position.longitude, position.latitude], zoom: 16 });
    });
    this.container.appendChild(button);
    return this.container;
  }

  onRemove(): void {
    this.container.parentNode?.removeChild(this.container);
    this.map = undefined;
  }
}

export default function VedettUtvonalMap({ legs, fromName, toName, currentPosition, restPoints = [], className }: VedettUtvonalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentPosMarkerRef = useRef<maplibregl.Marker | null>(null);
  const restPointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const currentPositionRef = useRef<{ latitude: number; longitude: number } | null>(currentPosition ?? null);
  const [mapReady, setMapReady] = useState(false);

  // A GPS-gomb mindig ezt a ref-et olvassa — nem hoz létre új GPS-watch-ot,
  // nem perzisztálja/logolja a koordinátát (lásd useGeolocation.ts
  // fejléce), csak a props-ból már amúgy is kapott pozíciót tükrözi.
  useEffect(() => {
    currentPositionRef.current = currentPosition ?? null;
  }, [currentPosition]);

  // Térkép inicializálása egyszer.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [19.0402, 47.4979], // Budapest, csak alapértelmezett kezdőnézet
      zoom: 12,
      // Saját, NEM összecsukható (compact: false) AttributionControl — a
      // "ne rejtsd el" követelmény miatt explicit, nem a MapLibre alapértelmezett
      // (esetenként ikonra összecsukott) attribution viselkedésére hagyatkozunk.
      // A style.json forrásainak saját attribution mezője (OpenStreetMap +
      // OpenFreeMap) emellé/ebbe automatikusan bekerül a MapLibre GL JS által;
      // a customAttribution egy garantált, kódból ellenőrizhető minimum,
      // hogy ez sose maradjon el akkor sem, ha egy jövőbeli alternatív style
      // esetleg hiányos attribution-t adna.
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: MAP_ATTRIBUTION_FALLBACK }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new CurrentLocationControl(() => currentPositionRef.current), "top-right");
    map.on("load", () => setMapReady(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Útvonal-geometria rajzolása/frissítése.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const geojson = journeyLegsToGeoJson(legs);
    const sourceId = "vedett-route-legs";

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      // MEGJEGYZÉS: nincs beforeId megadva az addLayer() hívásokban — a
      // MapLibre GL JS ez esetben a réteget a stílus rétegsorának LEGTETEJÉRE
      // teszi, tehát az OpenFreeMap Liberty alaptérkép ÖSSZES rétege
      // (utak, épületek, feliratok stb.) fölé kerül. Ez szándékos és
      // KÖTELEZŐ (lásd MAP_RENDERING_FIX task 4. pontja) — a saját
      // útvonal-rétegeknek mindig jól láthatónak kell maradniuk az utcai
      // alaptérképen is. Lásd a hozzá tartozó regresszió-tesztet is.
      map.addSource(sourceId, { type: "geojson", data: geojson });

      // MEGJEGYZÉS (2026-09-08, line-dasharray hiba javítás): a MapLibre
      // GL JS a "line-dasharray" paint tulajdonságnál NEM támogat
      // adat-vezérelt ("data expression", pl. ["match", ["get", ...], ...])
      // kifejezést — csak kamera-kifejezést (zoom-alapú interpolate/step)
      // vagy statikus konstans értéket. Az eredeti kód egyetlen layerben,
      // egy ["match", ["get","mode"], ...] kifejezéssel próbálta módonként
      // eltérő szaggatást beállítani -> ez futásidejű hibát dobott
      // (map.addLayer() szinkron validációja: "data expressions not
      // supported"), ami megakasztotta a teljes útvonal-layer felépítését
      // (a "-stops" layer és a fitBounds() SEM futott le utána).
      //
      // JAVÍTÁS: külön layer minden szaggatás-mintához, statikus
      // line-dasharray értékkel, filter-rel elválasztva mód szerint — ez a
      // MapLibre style-spec szerint támogatott megoldás.
      //
      // MEGJEGYZÉS (2026-09-08, "Could not parse color from value '#'"
      // hiba javítása): a line-color korábban ["concat", "#", ["get",
      // "routeColor"]]-t használt — ha a GTFS routeColor üres string volt,
      // ez egy érvénytelen, csupasz "#" színt eredményezett. A GYÖKÉROK
      // JAVÍTÁSA: a routeColor normalizálása MOST a geometry.ts
      // journeyLegsToGeoJson()-jában történik (lásd
      // normalizeRouteColor() ott) — a GeoJSON feature properties csak
      // AKKOR kapja meg a "routeColor" kulcsot, ha az egy validált,
      // teljes "#RRGGBB" hex szín. Emiatt itt már nincs szükség
      // "concat"-ra: ha a kulcs jelen van, az érték már garantáltan
      // érvényes CSS szín, közvetlenül használható ["get", "routeColor"]-lal.
      // Ha nincs jelen (hiányzó/üres/érvénytelen GTFS routeColor), az
      // explicit alkalmazás-default a mód szerinti MODE_COLOR — WALK
      // lábaknál MODE_COLOR.WALK, tömegközlekedési lábaknál a
      // transitMode szerinti szín (vagy MODE_COLOR.RAIL, ha a transitMode
      // nem szerepel a listában).
      map.addLayer({
        id: `${sourceId}-lines-walk`,
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "mode"], "WALK"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["case", ["has", "routeColor"], ["get", "routeColor"], MODE_COLOR.WALK],
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      // Tömegközlekedési lábak — folytonos vonal (nincs line-dasharray
      // tulajdonság megadva, ami a MapLibre alapértelmezése: folytonos).
      map.addLayer({
        id: `${sourceId}-lines-transit`,
        type: "line",
        source: sourceId,
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "mode"], "WALK"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "case",
            ["has", "routeColor"],
            ["get", "routeColor"],
            ["match", ["get", "transitMode"], "SUBWAY", MODE_COLOR.SUBWAY, "TRAM", MODE_COLOR.TRAM, "BUS", MODE_COLOR.BUS, MODE_COLOR.RAIL],
          ],
          "line-width": 5,
        },
      });

      map.addLayer({
        id: `${sourceId}-stops`,
        type: "circle",
        source: sourceId,
        filter: ["==", ["get", "kind"], "stop"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#374151",
          "circle-stroke-width": 2,
        },
      });
    }

    // Nézet ráigazítása az útvonal teljes kiterjedésére.
    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;
    for (const feature of geojson.features) {
      if (feature.geometry.type === "LineString") {
        for (const coord of feature.geometry.coordinates as [number, number][]) {
          bounds.extend(coord);
          hasCoords = true;
        }
      } else if (feature.geometry.type === "Point") {
        bounds.extend(feature.geometry.coordinates as [number, number]);
        hasCoords = true;
      }
    }
    if (hasCoords) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 300 });
    }
  }, [legs, mapReady]);

  // Aktuális GPS-pozíció marker — csak a jelenlegi renderben él, nincs
  // perzisztálás (lásd lib/hooks/useGeolocation.ts fejléce).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (currentPosMarkerRef.current) {
      currentPosMarkerRef.current.remove();
      currentPosMarkerRef.current = null;
    }
    if (currentPosition) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.background = "#2563eb";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 0 2px #2563eb55";
      currentPosMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([currentPosition.longitude, currentPosition.latitude])
        .addTo(map);
    }
  }, [currentPosition, mapReady]);

  // Saját pihenőpontok.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    for (const marker of restPointMarkersRef.current) marker.remove();
    restPointMarkersRef.current = restPoints.map((rp) =>
      new maplibregl.Marker({ color: "#16a34a" })
        .setLngLat([rp.longitude, rp.latitude])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(rp.name))
        .addTo(map)
    );
  }, [restPoints, mapReady]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={fromName && toName ? `Térkép: útvonal ${fromName} és ${toName} között` : "Útvonal térkép"}
      className={className ?? "h-80 w-full rounded border border-gray-200"}
    />
  );
}
