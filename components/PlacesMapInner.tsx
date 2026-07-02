"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import { Place, Category } from "@/lib/types";

// Magyarország közelítő középpontja — ez az alapnézet, ha nincs szűrés.
const HUNGARY_CENTER: [number, number] = [47.1625, 19.5033];

type PlaceWithCoords = Place & { latitude: number; longitude: number };

function categoryIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:36px;height:36px;
      background:#0a4a6e;
      border:2px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
    ">
      <span style="transform:rotate(45deg);font-size:17px;line-height:1;">${emoji}</span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });
}

export default function PlacesMapInner({
  places,
  categories,
}: {
  places: Place[];
  categories: Category[];
}) {
  const categoryBySlug = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);

  const withCoords = useMemo(
    () =>
      places.filter(
        (p): p is PlaceWithCoords => typeof p.latitude === "number" && typeof p.longitude === "number"
      ),
    [places]
  );

  return (
    <MapContainer
      center={HUNGARY_CENTER}
      zoom={7}
      scrollWheelZoom
      className="h-[28rem] w-full rounded-xl2"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködői'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map((p) => {
        const icon = categoryBySlug.get(p.category)?.icon ?? "📍";
        return (
          <Marker key={p.id} position={[p.latitude, p.longitude]} icon={categoryIcon(icon)}>
            <Popup>
              <div className="min-w-[10rem]">
                <p className="font-semibold text-sni-text">{p.name}</p>
                <p className="text-sm text-gray-500">
                  {icon} {p.city}
                </p>
                <Link href={`/helyek/${p.slug}`} className="mt-1 inline-block text-sm text-sni-brand-blue underline">
                  Részletek →
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
