"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import { Place, Category } from "@/lib/types";

// A Leaflet alapértelmezett marker-ikonjai webpack/Next.js alatt rossz
// útvonalra mutatnak (a becsomagolt kép-assetek nem oldódnak fel
// automatikusan) — ezért CDN-ről töltjük be helyettük.
type IconDefaultPrototype = { _getIconUrl?: unknown };
delete (L.Icon.Default.prototype as IconDefaultPrototype)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Magyarország közelítő középpontja — ez az alapnézet, ha nincs szűrés.
const HUNGARY_CENTER: [number, number] = [47.1625, 19.5033];

type PlaceWithCoords = Place & { latitude: number; longitude: number };

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
      {withCoords.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]}>
          <Popup>
            <div className="min-w-[10rem]">
              <p className="font-semibold text-sni-text">{p.name}</p>
              <p className="text-sm text-gray-500">
                {categoryBySlug.get(p.category)?.icon} {p.city}
              </p>
              <Link href={`/helyek/${p.slug}`} className="mt-1 inline-block text-sm text-sni-brand-blue underline">
                Részletek →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
