// Védett Útvonal — közös típusok és a Transit Provider absztrakció.
//
// Cél (lásd docs/vedett-route.md "Architecture" fejezet): a BKK csak EGY
// megvalósítása ennek az interfésznek. A Fázis 2-ben ide csatlakozik majd
// a MÁV (vasút) és a MÁV/Volán (autóbusz) provider, anélkül hogy a routing
// réteget vagy a UI-t újra kellene írni.

import type { AccessibilityResultStatus, AccessibilityStatus } from "./accessibility.ts";

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
  // Menetrend szerinti (statikus GTFS) idők, a MOTIS válasz from/to
  // scheduledDeparture/scheduledArrival mezőiből. Csak akkor kerül
  // kitöltésre, ha a MOTIS válasz ténylegesen tartalmazta ezt az adatot.
  // Ez a mező NEM realtime — a statikus menetrendet tükrözi, akkor is,
  // ha a departureTime/arrivalTime realtime-korrigált.
  scheduledDepartureTime?: string;
  scheduledArrivalTime?: string;
  durationMinutes: number;
  distanceMeters?: number; // csak ha a MOTIS válasz tartalmazta (jellemzően gyaloglásnál)
  realtime: boolean; // true = valós idejű adaton alapul, false = csak menetrendi
  // Csak akkor kerül kitöltésre, ha realtime === true ÉS volt megbízható
  // scheduled*/departureTime-arrivalTime pár, amiből ténylegesen számítható
  // volt egy percre kerekített eltérés. Soha nem becslés vagy alapérték.
  delayMinutes?: number;
  // true, ha a MOTIS ezt a lábat GTFS-RT alapján töröltként (cancelled)
  // vagy kihagyott megállóként (skipped stop) jelezte.
  cancelled?: boolean;
  // Map/GPS/Rest Points sprint (2026-09-07): valós MOTIS koordináták és
  // vonalgeometria a térképes megjelenítéshez. Mindegyik opcionális — csak
  // akkor kerül kitöltésre, ha a MOTIS válasz ténylegesen tartalmazta.
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  // Encoded polyline (Google algoritmus), a MOTIS legGeometry.points mezőjéből.
  geometryEncoded?: string;
  geometryPrecision?: number;
  intermediateStops?: { name: string; lat?: number; lon?: number }[];
  routeColor?: string;
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP — Task C (2026-09-11) örökség, Task C2
  // (2026-09-11) óta NEM HASZNÁLT, SZÁNDÉKOSAN ITT HAGYOTT mezők.
  //
  // Task C idején ezek voltak a tervezett hordozói a megálló/jármű
  // akadálymentességi klasszifikációnak — de Task C2-ben a tényleges
  // klasszifikáció a NYERS MOTIS itinerary legs-eken fut (lásd
  // orchestrator.ts classifyItineraryStepFreeAccessibility() hívása,
  // accessibility.ts StepFreeLegLike), MIELŐTT a mapMotisItineraryToJourney()
  // JourneyLeg-eket készítene belőlük — a JourneyLeg egyszerűen sosem
  // kapja meg ezt az adatot, mert nincs is szüksége rá. Ez a két mező
  // MOSTANTÓL PERMANENSEN kitöltetlen marad — SZÁNDÉKOSAN nem töröltük
  // (kis, biztonságos, opcionális mezők, egy jövőbeli kör esetleg
  // felhasználhatja per-leg diagnosztikára), de az orchestrator.ts SEHOL
  // nem ír vagy olvas belőlük.
  stopAccessibility?: AccessibilityStatus;
  vehicleAccessibility?: AccessibilityStatus;
}

export interface Journey {
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  // VPS → Staging Integration Gate (2026-09-07): a MOTIS itinerary-szintű
  // scheduledStartTime/scheduledEndTime/realTime/cancelled mezőinek
  // átemelése — lásd motisTypes.ts MotisItinerary és
  // docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md "E) Realtime mezők".
  // Csak akkor kerülnek kitöltésre, ha a MOTIS válasz ténylegesen
  // tartalmazta — soha nem feltételezés vagy departureTime/arrivalTime
  // másolata.
  scheduledDepartureTime?: string;
  scheduledArrivalTime?: string;
  // true, ha a MOTIS az itinerary-t ténylegesen realtime-korrigáltként
  // jelezte. Ez KÜLÖNBÖZIK a realtimeAvailable mezőtől (ami leg-szintű
  // aggregátum) — ez a MOTIS saját, itinerary-szintű jelzése.
  realTime?: boolean;
  cancelled?: boolean;
  walkingMinutes: number;
  waitingMinutes: number;
  transfers: number;
  legs: JourneyLeg[];
  alerts: ServiceAlert[];
  realtimeAvailable: boolean;
  fingerprint?: string; // Sprint 2: itinerary-dedup kulcs
  sensory?: SensoryScore; // Sprint 2: Sensory Engine V1 kimenet
  walkingDistanceMeters?: number; // csak akkor, ha MINDEN gyaloglási lábhoz volt valós MOTIS távolság-adat
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C2-től a NYERS MOTIS
  // itinerary legs-ekből számolva, lásd orchestrator.ts
  // classifyItineraryStepFreeAccessibility() hívása és accessibility.ts) —
  // a teljes journey akadálymentességi minősítése, a jármű (MOTIS+GTFS
  // keresztellenőrzés)/megálló/pathway komponensek "leggyengébb bizonyított
  // szakasz" szabály szerinti kombinációja. KIZÁRÓLAG akkor kerül
  // kitöltésre, ha a kérés request.stepFreeRequired === true volt —
  // ez EGY DIMENZIÓ, KÜLÖN a Sensory Engine-től (spec 10. pont), SOHA nem
  // kerül bele a SensoryScore számításába. Hiányában (stepFreeRequired
  // false/hiányzó) a mező egyszerűen undefined — a normál, nem-akadálymentes
  // keresés kimenete emiatt BYTE-RA egyezik a korábbi viselkedéssel.
  accessibilityStatus?: AccessibilityResultStatus;
}

export interface JourneySearchRequest {
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  departAt: string; // ISO timestamp
  // AKADÁLYMENTES / LÉPCSŐMENTES MVP (2026-09-11, Task C) — explicit
  // felhasználói preferencia, NEM marketingcímke/garancia (lásd
  // accessibility.ts fejléce). Alapérték: false. Ha false (vagy hiányzik),
  // a jelenlegi routing működés SEMMILYEN módon nem változik — lásd
  // orchestrator.ts searchVedettRoutes(), a teljes akadálymentességi
  // klasszifikáció/szűrés egyetlen `if (request.stepFreeRequired)` ág
  // mögé van zárva.
  stepFreeRequired?: boolean;
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

export type RankingLabel = "CALMEST" | "FASTEST" | "FEWEST_TRANSFERS" | "LEAST_WALKING";

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
  // BKK Realtime integráció (lásd docs/vedett-route/BKK_REALTIME_INTEGRATION_REPORT.md,
  // 10. pont): a BKK Alerts.pb feedből ténylegesen lekért, valós riasztások.
  // FONTOS: ezek SZÁNDÉKOSAN nincsenek egyes journey-khez/lábakhoz rendelve —
  // a BKK riasztások "affectedRouteIds" mezője a BKK belső route_id-jait
  // tartalmazza, amit a JourneyLeg jelenleg nem tárol (csak routeShortName-t),
  // ezért a pontos leg-szintű párosítás jelenleg találgatás lenne. Amíg ez
  // nincs megbízhatóan megoldva, a riasztásokat csak keresés-szinten, city-wide
  // információként adjuk vissza — SOHA nem állítjuk, hogy egy adott útvonalat
  // érintenek, ha ez nincs bizonyítva. Realtime feed hiba esetén üres tömb.
  serviceAlerts: ServiceAlert[];
  // MOTIS LAST-MILE OFFSET FALLBACK (2026-09-11) — true CSAK akkor, ha az
  // elsődleges (normál) MOTIS keresés 0 itineraryt adott, és az eredmény
  // KIZÁRÓLAG az egyetlen, kontrollált radius=1500 last-mile fallback
  // keresés miatt került elő (lásd orchestrator.ts searchVedettRoutes()).
  // SZÁNDÉKOSAN nem "1500 méteres gyaloglás"-ként elnevezve/leírva — ez egy
  // belső, a tényleges last-mile keresési sugarat NEM felfedő jelző, a
  // konkrét méter-érték a kliens felé SOHA nem jut el ebből a mezőből.
  // Hiányzik (undefined) a normál (fallback nélküli) találatoknál.
  expandedAccessSearch?: boolean;
  // Csak akkor van jelen, ha expandedAccessSearch === true — kulturált,
  // konkrét távolságot NEM tartalmazó felhasználói figyelmeztetés (lásd a
  // hotfix specifikáció 7. pontja). A kliens ezt közvetlenül megjelenítheti,
  // nincs benne semmilyen belső azonosító vagy métert.
  accessWarning?: string;
}
