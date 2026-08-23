// Védett Útvonal — közös típusok és a Transit Provider absztrakció.
//
// Cél (lásd docs/vedett-route.md "Architecture" fejezet): a BKK csak EGY
// megvalósítása ennek az interfésznek. A Fázis 2-ben ide csatlakozik majd
// a MÁV (vasút) és a MÁV/Volán (autóbusz) provider, anélkül hogy a routing
// réteget vagy a UI-t újra kellene írni.

export type TransitProviderId = "BKK" | "MAV_RAIL" | "MAV_BUS";

export interface ServiceAlert {
  id: string;
  header: string;
  description?: string;
  severity?: "info" | "warning" | "severe";
  affectedRouteIds?: string[];
  affectedStopIds?: string[];
  url?: string;
}

export interface TripUpdate {
  tripId: string;
  routeId?: string;
  delayMinutes?: number;
  cancelled?: boolean;
}

export interface VehiclePosition {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  timestamp?: string;
}

export interface ProviderConnectionStatus {
  provider: TransitProviderId;
  configured: boolean;
  reachable: boolean;
  realtime: boolean;
  error?: string;
}

export interface StaticGtfsStatus {
  provider: TransitProviderId;
  available: boolean;
  lastUpdated: string | null;
  feedVersion?: string | null;
}

/**
 * Minden tömegközlekedési adatforrás (BKK, később MÁV/Volán) ezt az
 * interfészt valósítja meg. A routing engine (és a Sensory Engine, később)
 * kizárólag ezen keresztül fér hozzá az adatokhoz — sosem közvetlenül egy
 * konkrét provider kliensen keresztül.
 */
export interface TransitProvider {
  readonly id: TransitProviderId;

  /** Kapcsolat-teszt: kulcs beállítva? elérhető az API? van realtime? */
  checkConnection(): Promise<ProviderConnectionStatus>;

  /** Statikus GTFS állapota (letöltve-e, mikor frissült). */
  getStaticDataStatus(): Promise<StaticGtfsStatus>;

  /** Statikus GTFS letöltése/frissítése (admin által indított, 10. pont). */
  refreshStaticData(): Promise<StaticGtfsStatus>;

  getServiceAlerts(): Promise<ServiceAlert[]>;
  getTripUpdates(): Promise<TripUpdate[]>;
  getVehiclePositions(): Promise<VehiclePosition[]>;
}

// --- Routing engine felé néző típusok (Route Normalizer kimenete) ---

export interface JourneyLeg {
  mode: "WALK" | "TRANSIT";
  routeShortName?: string;
  routeLongName?: string;
  fromName: string;
  toName: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes: number;
  realtime: boolean; // true = valós idejű adaton alapul, false = csak menetrendi
  delayMinutes?: number;
}

export interface Journey {
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  walkingMinutes: number;
  waitingMinutes: number;
  transfers: number;
  legs: JourneyLeg[];
  alerts: ServiceAlert[];
  realtimeAvailable: boolean;
}

export interface JourneySearchRequest {
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  departAt: string; // ISO timestamp
}

export type JourneySearchResult =
  | { ok: true; journeys: Journey[] }
  | { ok: false; reason: "routing_engine_unavailable" | "no_route_found" | "invalid_request"; message: string };
