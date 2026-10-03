// Mentett hely <-> a MEGLÉVŐ útvonaltervező feloldott helyszín-struktúrája.
// A mentett hely MAP_PICKED-ként megy be: koordinátaként utazik a szerverre,
// nincs újra-geokódolás.

import type { SavedPlace } from "@/lib/vedett-route/savedPlaces/types";

export interface SavedPlaceRouteLocation {
  type: "MAP_PICKED";
  name: string;
  latitude: number;
  longitude: number;
}

export function savedPlaceToRouteLocation(place: Pick<SavedPlace, "address" | "latitude" | "longitude">): SavedPlaceRouteLocation {
  return { type: "MAP_PICKED", name: place.address, latitude: place.latitude, longitude: place.longitude };
}

interface ResolvedLike {
  type: string;
  name?: string;
  latitude?: number;
  longitude?: number;
}

// Csak már feloldott (koordinátás) helyszín menthető — második geokóder nincs.
export function routeLocationToSavable(
  loc: ResolvedLike | null | undefined
): { address: string; latitude: number; longitude: number } | null {
  if (!loc) return null;
  if (loc.type !== "MAP_PICKED" && loc.type !== "KNOWN_PLACE") return null;
  if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;
  const address = (loc.name ?? "").trim();
  if (!address) return null;
  return { address, latitude: loc.latitude, longitude: loc.longitude };
}
