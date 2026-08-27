"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ROLE_LABELS, CONNECTION_GOAL_OPTIONS, type CommunityRole } from "@/lib/community/types";

interface MapMember {
  id: string;
  display_name: string;
  role: CommunityRole;
  city?: string | null;
  district?: string | null;
  intro_text?: string | null;
  connection_goals?: string[] | null;
  lat: number;
  lng: number;
}

interface Props {
  members: MapMember[];
}

export default function CommunityMap({ members }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<MapMember | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapLoaded) return;

    // Leaflet betöltése CDN-ről
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as unknown as { L: typeof import("leaflet") }).L;
      if (!mapRef.current) return;

      const map = L.map(mapRef.current).setView([47.4979, 19.0402], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // Marker ikon
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#0d9488;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">👤</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      // Azonos koordinátájú markereket szétválasztjuk kis jitterrel
      const coordCount: Record<string, number> = {};
      members.forEach((m) => {
        const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
        coordCount[key] = (coordCount[key] ?? 0) + 1;
      });
      const coordIndex: Record<string, number> = {};

      members.forEach((m) => {
        const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
        const total = coordCount[key] ?? 1;
        const idx = coordIndex[key] ?? 0;
        coordIndex[key] = idx + 1;

        // Spirál-szerű elrendezés ha több marker ugyanazon a ponton
        const angle = (2 * Math.PI * idx) / total;
        const radius = total > 1 ? 0.008 : 0;
        const jLat = m.lat + radius * Math.cos(angle);
        const jLng = m.lng + radius * Math.sin(angle);

        const marker = L.marker([jLat, jLng], { icon }).addTo(map);
        marker.on("click", () => {
          setSelected(m);
        });
      });

      setMapLoaded(true);
    };
    document.head.appendChild(script);
  }, [members, mapLoaded]);

  return (
    <div className="relative" style={{ height: "calc(100vh - 120px)" }}>
      <div ref={mapRef} className="h-full w-full" />

      {/* Info kártya */}
      {selected && (
        <div className="absolute bottom-6 left-4 right-4 z-[1000] rounded-2xl bg-white shadow-xl border border-gray-200 p-4 sm:left-auto sm:right-6 sm:w-80">
          <button
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            onClick={() => setSelected(null)}
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-sni-brand-teal/20 flex items-center justify-center text-sni-brand-teal font-bold text-lg">
              {selected.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-sni-text">{selected.display_name}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[selected.role]}</p>
            </div>
          </div>

          {(selected.city || selected.district) && (
            <p className="mt-2 text-xs text-gray-400">
              📍 {selected.city}{selected.district ? `, ${selected.district}` : ""}
            </p>
          )}

          {selected.intro_text && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">{selected.intro_text}</p>
          )}

          {(selected.connection_goals?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.connection_goals!.slice(0, 2).map((g) => (
                <span key={g} className="rounded-full bg-sni-brand-teal/10 px-2 py-0.5 text-[11px] text-sni-brand-teal font-medium">
                  {CONNECTION_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g}
                </span>
              ))}
            </div>
          )}

          <Link
            href={`/kozosseg/tag/${selected.id}`}
            className="mt-3 block w-full rounded-xl bg-sni-brand-teal py-2 text-center text-sm font-semibold text-white hover:bg-sni-brand-blue transition"
          >
            Profil megtekintése
          </Link>
        </div>
      )}

      {/* Térkép jelmagyarázat */}
      <div className="absolute left-4 top-4 z-[1000] rounded-xl bg-white px-3 py-2 shadow text-xs text-gray-500">
        {members.length} tag a térképen
      </div>
    </div>
  );
}
