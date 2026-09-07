// Pihenőpontok — típusok. Lásd supabase/migrations/20260907_rest_points.sql
// a séma pontos definíciójáért. SZÁNDÉKOSAN külön a VédettSarok "places"
// típusaitól (lásd a migráció fejléce).

export type RestPointSource = "USER" | "VEDETT_SAROK" | "OSM";
export type RestPointVisibility = "PRIVATE" | "CONNECTIONS" | "PUBLIC";

export interface RestPoint {
  id: string;
  createdBy: string;
  name: string;
  latitude: number;
  longitude: number;
  source: RestPointSource;
  visibility: RestPointVisibility;
  toilet: boolean | null;
  seating: boolean | null;
  quietSpace: boolean | null;
  indoors: boolean | null;
  outdoors: boolean | null;
  purchaseRequired: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestPointRow {
  id: string;
  created_by: string;
  name: string;
  latitude: number;
  longitude: number;
  source: RestPointSource;
  visibility: RestPointVisibility;
  toilet: boolean | null;
  seating: boolean | null;
  quiet_space: boolean | null;
  indoors: boolean | null;
  outdoors: boolean | null;
  purchase_required: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function mapRestPointRow(row: RestPointRow): RestPoint {
  return {
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source,
    visibility: row.visibility,
    toilet: row.toilet,
    seating: row.seating,
    quietSpace: row.quiet_space,
    indoors: row.indoors,
    outdoors: row.outdoors,
    purchaseRequired: row.purchase_required,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
