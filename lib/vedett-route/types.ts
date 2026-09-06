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
  transitMode?: string; // a MOTIS nyers módja, pl. SUBWAY/TRAM/BUS/RAIL (Sensory Engine ehhez nyúl)
  routeShortName?: string;
  routeLongName?: string;
  fromName: string;
  toName: string;
  departureTime?: string;
  arrivalTime?: string;
  durationMinutes: number;
  distanceMeters?: number; // csak ha a MOTIS válasz tartalmazta (jellemzően gyaloglásnál)
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
  fingerprint?: string; // Sprint 2: itinerary-dedup kulcs
  sensory?: SensoryScore; // Sprint 2: Sensory Engine V1 kimenet
  walkingDistanceMeters?: number; // csak akkor, ha MINDEN gyaloglási lábhoz volt valós MOTIS távolság-adat
}

export interface JourneySearchRequest {
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  departAt: string; // ISO timestamp
}

export type JourneySearchResult =
  | { ok: true; journeys: Journey[] }
  | { ok: false; reason: "routing_engine_unavailable" | "no_route_found" | "invalid_request"; message: string };

// --- Sensory Engine V1 + rangsorolás + személyre szabás (Sprint 2) ---
//
// SZABÁLY (kőkemény, lásd docs/vedett-route/MOTIS_GO_LIVE_REPORT.md): hiányzó
// adatforrás SOHA nem számít nulla (azaz "nincs terhelés") értékbe. Egy nem
// elérhető faktor kimarad a súlyozott átlag számlálójából ÉS nevezőjéből is,
// és a "missingFactors" listában jelenik meg, csökkentve a "confidence"
// értéket. Ez a viselkedés az egyetlen elfogadható a specifikáció szerint.

export type SensoryFactorKey =
  | "transfers"
  | "modeSwitches"
  | "underground"
  | "walking"
  | "duration"
  | "waiting"
  | "crowding" // jelenleg mindig unavailable — nincs valós idejű foglaltsági adatforrásunk
  | "vehicleAccessibility"; // jelenleg mindig unavailable — nincs jármű-szintű akadálymentességi adat

export interface SensoryFactorResult {
  key: SensoryFactorKey;
  available: boolean;
  rawValue?: number;
  normalizedLoad?: number; // 0-100, csak ha available
  weight: number; // a személyre szabott súly (0 = kikapcsolva)
  reasonUnavailable?: string;
}

export interface SensoryScore {
  score: number; // 0-100, magasabb = nagyobb szenzoros terhelés (nem "jobb")
  confidence: number; // 0-1, az elérhető faktorok súlyaránya az összeshez képest
  availableFactors: SensoryFactorKey[];
  missingFactors: SensoryFactorKey[];
  factors: SensoryFactorResult[];
}

export type RankingLabel = "CALMEST" | "FASTEST" | "FEWEST_TRANSFERS";

export interface PersonalizationWeights {
  transfers: number;
  modeSwitches: number;
  underground: number;
  walking: number;
  duration: number;
  waiting: number;
}

export interface RankedJourney {
  journey: Journey;
  labels: RankingLabel[];
  explanation: string;
}

export interface OrchestratedSearchResult {
  ok: true;
  journeys: RankedJourney[];
  dataCoverage: {
    provider: "BKK";
    sensoryConfidenceAvg: number;
    missingFactorsUnion: SensoryFactorKey[];
    motisImportedAt: string | null;
  };
}
