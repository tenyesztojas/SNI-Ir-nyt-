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

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { journeyLegsToGeoJson, type JourneyLegForGeometry } from "@/lib/vedett-route/geometry";

// Ingyenes, kulcs nélküli demo stílus (MapLibre saját demo tiles-e) — VPS/
// éles környezetben cserélhető saját/ingyenes tile-forrásra (lásd
// docs/vedett-route/VPS_MOTIS_HANDOFF.md). Szándékosan nincs fizetős
// provider (Mapbox/Google) API kulcs nélküli jóváhagyás nélkül.
//
// TECHNICAL DEBT (2026-09-08, CSP audit a Sprint E Preview staging teszt
// során talált üres térkép hibából): a demotiles.maplibre.org KIZÁRÓLAG
// staging/demo célra elfogadható — NEM production tile-infrastruktúra
// (nincs SLA-ja, nincs rá szerződéses jogosultság, bármikor
// megváltozhat/leállhat). A middleware.ts CSP connect-src direktívája
// jelenleg explicit ezt a hostot engedélyezi — Budapest béta előtt egy
// production-suitable tile source/hosting kiválasztása és a CSP
// megfelelő frissítése szükséges (lásd
// docs/vedett-route/MAP_GPS_RESTPOINT_SPRINT.md "CSP audit" szakasza).
const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

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

export default function VedettUtvonalMap({ legs, fromName, toName, currentPosition, restPoints = [], className }: VedettUtvonalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentPosMarkerRef = useRef<maplibregl.Marker | null>(null);
  const restPointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Térkép inicializálása egyszer.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [19.0402, 47.4979], // Budapest, csak alapértelmezett kezdőnézet
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
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
      map.addSource(sourceId, { type: "geojson", data: geojson });
      map.addLayer({
        id: `${sourceId}-lines`,
        type: "line",
        source: sourceId,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": [
            "case",
            ["has", "routeColor"],
            ["concat", "#", ["get", "routeColor"]],
            ["match", ["get", "transitMode"], "SUBWAY", MODE_COLOR.SUBWAY, "TRAM", MODE_COLOR.TRAM, "BUS", MODE_COLOR.BUS, MODE_COLOR.RAIL],
          ],
          "line-width": ["match", ["get", "mode"], "WALK", 3, 5],
          "line-dasharray": ["match", ["get", "mode"], "WALK", ["literal", [2, 2]], ["literal", [1, 0]]],
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
