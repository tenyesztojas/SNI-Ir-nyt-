"use client";

// Védett Útvonal — Térképes célpont-kijelölő (Geocoding hardening, 2026-09-10,
// 11-13. pont).
//
// MIKOR jelenik meg: amikor a szerver (route.ts) egy ADDRESS_APPROXIMATE
// geokódolási eredményt adott a célhelyre — a település/utca igazolható,
// de a konkrét házszám nem (pl. Nominatim csak road/highway szintű
// találatot adott, ahogy az Alacskai út 63 production hiba esetén
// bizonyítottan történt, lásd geocode.ts fejléce). Egy ilyen közelítő
// koordinátát a szerver SOHA nem enged tovább a routingnak pontos célként
// — ez a komponens adja a felhasználónak a lehetőséget, hogy MAGA
// pontosítsa a helyet egy térképen, ahelyett hogy a rendszer találgatna.
//
// TÉRKÉP-INFRASTRUKTÚRA: szándékosan a MEGLÉVŐ MapLibre + OpenFreeMap
// beállítást használja (lib/vedett-route/mapStyle.ts, UGYANAZ a style URL/
// attribution, mint VedettUtvonalMap.tsx) — nincs második térképrendszer,
// nincs Google Maps (11. pont). Ez egy ÖNÁLLÓ, saját MapLibre instance —
// NEM osztja meg állapotot a fő útvonal-térképpel (VedettUtvonalMap), és
// nem remounteli azt; a kettő teljesen független életciklusú (a picker
// csak addig él, amíg a felhasználó a célt pontosítja, a fő térkép
// eközben változatlan marad).
//
// PRIVACY (16. pont): a kijelölt koordináta KIZÁRÓLAG a szülő komponens
// (VedettUtvonalSearchForm.tsx) React state-jébe kerül (destination:
// MAP_PICKED), amíg a felhasználó újra nem keres — nincs localStorage,
// nincs adatbázis-mentés, nincs analytics, nincs reverse geocode hívás.

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL, MAP_ATTRIBUTION_FALLBACK } from "@/lib/vedett-route/mapStyle";

export interface DestinationMapPickerProps {
  initialLat: number;
  initialLon: number;
  onConfirm: (lat: number, lon: number) => void;
  onCancel: () => void;
}

export default function DestinationMapPicker({ initialLat, initialLon, onConfirm, onCancel }: DestinationMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // A JELENLEGI kijelölt pozíció — a marker drag/kattintás mindig ezt
  // frissíti, a "Ez legyen a cél" gomb ezt olvassa ki jóváhagyáskor.
  const [pickedPosition, setPickedPosition] = useState<{ lat: number; lon: number }>({ lat: initialLat, lon: initialLon });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [initialLon, initialLat],
      zoom: 16,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: MAP_ATTRIBUTION_FALLBACK }), "top-left");
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
      .setLngLat([initialLon, initialLat])
      .addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      setPickedPosition({ lat, lon: lng });
    });
    markerRef.current = marker;

    // Térkép-kattintás is áthelyezi a markert (nem csak drag) — mobil
    // touch-on ez a legkönnyebben elérhető interakció (12. pont: "rábök /
    // kattint a kívánt pontra").
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      setPickedPosition({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    map.on("click", handleMapClick);

    mapRef.current = map;

    return () => {
      map.off("click", handleMapClick);
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label="Célpont kijelölése a térképen">
      <div className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-medium text-gray-700">Jelöld meg a pontos célt a térképen</p>
      </div>
      <div ref={containerRef} className="flex-1" role="img" aria-label="Térkép — koppints vagy húzd a markert a pontos célra" />
      <div className="flex gap-2 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700"
        >
          Mégse
        </button>
        <button
          type="button"
          onClick={() => onConfirm(pickedPosition.lat, pickedPosition.lon)}
          className="min-h-[44px] flex-1 rounded-lg bg-sni-primary px-4 text-sm font-semibold text-white"
        >
          Ez legyen a cél
        </button>
      </div>
    </div>
  );
}
