// Mentett helyek — kliensnek visszaadott típus. A user_id SZÁNDÉKOSAN nem
// kerül ki az API-ból.

export interface SavedPlaceRow {
  id: string;
  user_id: string;
  display_name: string;
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}

export interface SavedPlace {
  id: string;
  displayName: string;
  address: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export function mapSavedPlaceRow(row: SavedPlaceRow): SavedPlace {
  return {
    id: row.id,
    displayName: row.display_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
