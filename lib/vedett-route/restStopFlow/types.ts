// Sprint E — "Pihenőre van szükségem" folyamat típusai.
//
// A Sprint E Preparation Gate (2026-09-07) itt hozta létre az állapotgép,
// a rangsorolás és a láthatóság ALAP típusait. A Sprint E teljes
// implementációja (2026-09-08) ezt a modult EVOLVÁLTA (nem duplikálta):
//  - bekerült a spec 2. pontja által megkövetelt ROUTING_TO_REST_POINT
//    köztes állapot (a REST_POINT_SELECTED és a NAVIGATING_TO_REST_POINT
//    között — amíg a route-service hívás fut, a felhasználó még nem
//    "navigál", csak vár az útvonaltervre),
//  - az eddigi szabad szöveges errorReason helyett egy zárt,
//    a spec 9. pontjában felsorolt kódokból álló RestStopFlowErrorReason
//    típus (lásd lent) — ez teszi lehetővé, hogy minden hibaágat
//    EXPLICIT módon, végigkövethetően kezeljünk, ne csak egy általános
//    "hiba történt" szöveggel.

import type { RestPoint } from "../../rest-points/types.ts";

// --- Állapotgép ---

// A spec (Sprint E Preparation Gate + Sprint E teljes implementáció, 2.
// pont) által megkövetelt állapotok, szó szerint — a ROUTING_TO_REST_POINT
// hozzáadva a Sprint E implementáció során (lásd fenti fejléc).
export type RestStopFlowState =
  | "ROUTE_ACTIVE"
  | "REST_REQUESTED"
  | "REST_POINTS_LOADING"
  | "REST_POINTS_READY"
  | "REST_POINT_SELECTED"
  | "ROUTING_TO_REST_POINT"
  | "NAVIGATING_TO_REST_POINT"
  | "AT_REST_POINT"
  | "RESUME_REQUESTED"
  | "REROUTING_TO_ORIGINAL_DESTINATION"
  | "ROUTE_RESUMED"
  | "ERROR";

// A Sprint E spec 9. pontjában felsorolt, explicit kezelendő hibakódok —
// szó szerint. Az állapotgép ERROR állapotában az errorReason MINDIG ezek
// egyike, SOHA nem szabad szöveg — a szabad szöveges részletek az
// errorMessage mezőben élnek (lásd lent).
export type RestStopFlowErrorReason =
  | "GPS_PERMISSION_DENIED"
  | "GPS_UNAVAILABLE"
  | "GPS_TIMEOUT"
  | "NO_REST_POINTS_FOUND"
  // Sprint E.1 — nulla találat, DE legalább egy felfedezési forrás
  // (USER/VEDETT_SAROK/OSM) nem volt elérhető, tehát nem tudjuk
  // biztosan, hogy tényleg nincs a közelben semmi (lásd
  // app/api/vedett-route/rest-stops/nearby/route.ts fejléce, PARTIAL
  // FAILURE / ZERO RESULTS szakasz, 3. eset). Szándékosan külön kód a
  // NO_REST_POINTS_FOUND-tól, hogy a UI ezt is külön, őszinte szöveggel
  // jelezhesse.
  | "REST_POINTS_PARTIALLY_UNAVAILABLE"
  | "REST_POINT_LOAD_FAILED"
  | "REST_POINT_NO_ROUTE"
  | "ROUTE_SERVICE_TIMEOUT"
  | "ROUTE_SERVICE_UNAVAILABLE"
  | "ROUTE_SERVICE_AUTH_FAILURE"
  | "MALFORMED_ROUTE_RESPONSE"
  | "NETWORK_LOST"
  | "REROUTE_FAILED"
  | "ORIGINAL_DESTINATION_MISSING"
  | "INVALID_STATE_TRANSITION";

// Az EREDETI úti cél — ez a mező a teljes folyamat alatt VÁLTOZATLAN
// marad. A pihenőpont csak egy IDEIGLENES köztes cél, sosem írja felül
// ezt. Lásd stateMachine.ts — egyetlen reducer ág sem módosítja az
// originalDestination mezőt, ezt teszt is védi
// (rest-stop-flow-state-machine.test.ts, "originalDestination megőrzése"
// csoport).
export interface OriginalDestination {
  name: string;
  lat: number;
  lon: number;
}

export interface RestStopFlowContext {
  state: RestStopFlowState;
  // SOHA nem módosul semmilyen átmenet során — lásd fenti komment.
  readonly originalDestination: OriginalDestination;
  // Az eredeti keresés indulási ideje — csak referenciának/naplózásnak,
  // NEM a rerouting tényleges időpontja (azt mindig "most" alapján
  // számítjuk, lásd rerouteRequest.ts).
  readonly originalDepartAt: string;
  rankedRestPoints?: RankedRestPoint[];
  // Sprint E.1 (Real Rest Point Discovery) — az aggregator.ts diszkusszió-
  // metaadata, KIZÁRÓLAG a UI szöveges visszajelzéséhez (spec 10./11. pont):
  // expandedSearch = a sugár 800m->1500m bővült (nulla első-körös találat
  // miatt); discoveryPartial = legalább egy forrás (USER/VEDETT_SAROK/OSM)
  // nem volt elérhető ennél a keresésnél. Egyik sem befolyásolja az
  // állapotgép ÁTMENETEIT, csak a REST_POINTS_READY állapot melletti
  // opcionális magyarázó szöveget (lásd RestStopFlowPanel.tsx).
  expandedSearch?: boolean;
  discoveryPartial?: boolean;
  // Sprint E.1 hotfix (2026-09-08) — per-provider (USER/VEDETT_SAROK/OSM)
  // diagnosztikai pillanatkép az UTOLSÓ /nearby hívásból, KIZÁRÓLAG
  // admin/preview debug célra (lásd RestStopFlowPanel.tsx "Diagnosztika
  // (admin)" blokkja). SOHA nem befolyásolja az állapotgép átmeneteit, és
  // SOHA nem jelenik meg a polírozott, végfelhasználói banner-szövegben —
  // az továbbra is technikai provider-név nélküli marad. Koordinátát vagy
  // nyers Overpass query-t SOSEM tartalmaz (lásd aggregator.ts
  // DiscoverySourceStatus / osmProvider.ts OsmProviderErrorCode).
  discoverySources?: {
    user: { ok: boolean; reason?: string; errorCode?: string };
    vedettSarok: { ok: boolean; reason?: string; errorCode?: string };
    osm: { ok: boolean; reason?: string; errorCode?: string };
  };
  selectedRestPoint?: RestPoint;
  errorReason?: RestStopFlowErrorReason;
  errorMessage?: string;
}

export type RestStopFlowEvent =
  | { type: "REQUEST_REST" }
  | { type: "START_LOADING_REST_POINTS" }
  | {
      type: "REST_POINTS_LOADED";
      restPoints: RankedRestPoint[];
      expandedSearch?: boolean;
      discoveryPartial?: boolean;
      // Sprint E.1 hotfix (2026-09-08) — lásd RestStopFlowContext.discoverySources kommentje.
      sources?: RestStopFlowContext["discoverySources"];
    }
  | {
      type: "REST_POINTS_LOAD_FAILED";
      reason: RestStopFlowErrorReason;
      message?: string;
      // Sprint E.1 hotfix (2026-09-08) — a nulla-találatos hibaágakban (NO_REST_POINTS_FOUND /
      // REST_POINTS_PARTIALLY_UNAVAILABLE) is elérhető, admin/preview debug célra.
      sources?: RestStopFlowContext["discoverySources"];
    }
  | { type: "SELECT_REST_POINT"; restPoint: RestPoint }
  // A pihenőponthoz vezető útvonal megtervezésének indítása — a
  // route-service/MOTIS hívás EZUTÁN indul (lásd
  // app/api/vedett-route/rest-stops/route-to-rest-point/route.ts), amíg
  // fut, az állapot ROUTING_TO_REST_POINT (a felhasználó még nem navigál,
  // csak vár az eredményre).
  | { type: "START_ROUTE_TO_REST_POINT" }
  | { type: "ROUTE_TO_REST_POINT_READY" }
  | { type: "ROUTE_TO_REST_POINT_FAILED"; reason: RestStopFlowErrorReason; message?: string }
  | { type: "ARRIVED_AT_REST_POINT" }
  | { type: "REQUEST_RESUME" }
  | { type: "START_REROUTE" }
  | { type: "REROUTE_SUCCEEDED" }
  | { type: "REROUTE_FAILED"; reason: RestStopFlowErrorReason; message?: string }
  // Bármikor, amíg a felhasználó fizikailag még nem indult el a pihenőpont
  // felé (lásd stateMachine.ts CANCELLABLE_STATES), megszakíthatja és
  // visszatérhet a normál aktív útvonalhoz — az eredeti cél soha nem
  // veszik el, mert sosem volt felülírva.
  | { type: "CANCEL_REST_STOP" }
  // ERROR állapotból explicit, felhasználó által kezdeményezett újrapróbálás
  // — mindig egy konkrét, biztonságos állapotra tér vissza (sosem
  // találgatunk, hogy "hol tartott" a felhasználó).
  | { type: "RESET_TO_ROUTE_ACTIVE" };

export type RestStopFlowTransitionResult =
  | { ok: true; context: RestStopFlowContext }
  | { ok: false; reason: "invalid_transition"; message: string; context: RestStopFlowContext };

// --- Determinisztikus pihenőpont-rangsorolás ---

export type RestPointRankingFactorKey =
  | "distance"
  | "seating"
  | "toilet"
  | "quietSpace"
  | "shelter" // indoors/outdoors preferencia egy faktorba összevonva
  | "purchaseRequired"
  | "openingHours" // JELENLEG MINDIG unavailable — nincs ilyen mező a sémában (lásd ranking.ts)
  | "userPreference"; // csak akkor available, ha a hívó ténylegesen adott át preferencia-súlyokat

export interface RestPointRankingFactorResult {
  key: RestPointRankingFactorKey;
  available: boolean;
  rawValue?: number | boolean;
  normalizedScore?: number; // 0-100, MAGASABB = jobban megfelel pihenésre, csak ha available
  weight: number;
  reasonUnavailable?: string;
}

export interface RestPointRankingScore {
  score: number; // 0-100, magasabb = jobb pihenőpont-jelölt
  confidence: number; // 0-1, elérhető faktorok súlyaránya
  availableFactors: RestPointRankingFactorKey[];
  missingFactors: RestPointRankingFactorKey[];
  factors: RestPointRankingFactorResult[];
}

export interface RankedRestPoint {
  restPoint: RestPoint;
  ranking: RestPointRankingScore;
  distanceMeters?: number; // csak akkor, ha volt ismert aktuális pozíció
}

export interface RestPointRankingWeights {
  distance: number;
  seating: number;
  toilet: number;
  quietSpace: number;
  shelter: number;
  purchaseRequired: number;
  openingHours: number;
  userPreference: number;
}

export const DEFAULT_REST_POINT_RANKING_WEIGHTS: RestPointRankingWeights = {
  distance: 3,
  seating: 2,
  toilet: 2,
  quietSpace: 1.5,
  shelter: 1,
  purchaseRequired: 1,
  openingHours: 1,
  userPreference: 1,
};

// Opcionális, tényleges felhasználói preferencia — CSAK akkor számít bele
// a "userPreference" faktorba, ha a hívó ténylegesen átadja (nem
// feltételezünk soha rejtett/alapértelmezett preferenciát adatként).
export interface RestPointUserPreference {
  preferQuiet?: boolean;
  preferIndoors?: boolean;
  avoidPurchaseRequired?: boolean;
}
