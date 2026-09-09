// Kedvenc útvonalak — típusok. Lásd
// supabase/migrations/20260909_vedett_route_favorites.sql a séma pontos
// definíciójáért. Ugyanazt a mintát követi, mint lib/rest-points/types.ts
// (Row <-> domain típus + mapper, hogy a snake_case/camelCase határ egy
// helyen legyen kezelve).

import type { PersonalizationWeights } from "@/lib/vedett-route/types";

export type FavoriteOriginMode = "MANUAL" | "CURRENT_LOCATION";
export type FavoriteDestinationMode = "MANUAL" | "KNOWN_PLACE";

export interface FavoriteStructuredAddress {
  city: string;
  districtOrPostalCode: string;
  street: string;
}

export interface FavoriteKnownPlace {
  name: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
}

export interface FavoriteRoute {
  id: string;
  userId: string;
  name: string;
  originMode: FavoriteOriginMode;
  // CURRENT_LOCATION esetén MINDIG null — lásd a migráció GPS PRIVACY
  // megjegyzését: nincs is olyan DB-oszlop, amiben egy pillanatnyi
  // koordináta elférne.
  originManual: FavoriteStructuredAddress | null;
  destinationMode: FavoriteDestinationMode;
  destinationManual: FavoriteStructuredAddress | null;
  destinationKnownPlace: FavoriteKnownPlace | null;
  // A MEGLÉVŐ PersonalizationWeights típust használjuk (nem hozunk létre
  // párhuzamos modellt) — a mentéskor a favoriteWeightsSchema garantálja,
  // hogy mind a 6 kulcs pontosan 0/1/2 egész érték.
  weights: PersonalizationWeights;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteRouteRow {
  id: string;
  user_id: string;
  name: string;
  origin_mode: FavoriteOriginMode;
  origin_city: string | null;
  origin_district_or_postal_code: string | null;
  origin_street: string | null;
  destination_mode: FavoriteDestinationMode;
  destination_city: string | null;
  destination_district_or_postal_code: string | null;
  destination_street: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_label: string | null;
  destination_place_id: string | null;
  weights: PersonalizationWeights;
  created_at: string;
  updated_at: string;
}

export function mapFavoriteRouteRow(row: FavoriteRouteRow): FavoriteRoute {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    originMode: row.origin_mode,
    originManual:
      row.origin_mode === "MANUAL" && row.origin_city !== null && row.origin_district_or_postal_code !== null && row.origin_street !== null
        ? { city: row.origin_city, districtOrPostalCode: row.origin_district_or_postal_code, street: row.origin_street }
        : null,
    destinationMode: row.destination_mode,
    destinationManual:
      row.destination_mode === "MANUAL" && row.destination_city !== null && row.destination_district_or_postal_code !== null && row.destination_street !== null
        ? { city: row.destination_city, districtOrPostalCode: row.destination_district_or_postal_code, street: row.destination_street }
        : null,
    destinationKnownPlace:
      row.destination_mode === "KNOWN_PLACE" && row.destination_latitude !== null && row.destination_longitude !== null && row.destination_label !== null
        ? { name: row.destination_label, latitude: row.destination_latitude, longitude: row.destination_longitude, placeId: row.destination_place_id }
        : null,
    weights: row.weights,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
