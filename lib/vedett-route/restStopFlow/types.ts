// Sprint E Preparation Gate (2026-09-07) — "Pihenőre van szükségem" folyamat.
//
// FONTOS: ez a modul KIZÁRÓLAG a folyamat ELŐKÉSZÍTÉSE — a típusok, az
// állapotgép és a determinisztikus rangsorolás itt készül el, de a
// tényleges UI-bekötés (gomb, navigáció, élő route service hívás) NEM
// része ennek a gate-nek (lásd docs/vedett-route/SPRINT_E_PREPARATION_GATE.md
// "Mi maradt szándékosan blokkolva" szakasza). A VEDETT_ROUTE_ENABLED
// feature flag és a route-service security architektúra változatlan.

import type { RestPoint } from "../../rest-points/types.ts";

// --- Állapotgép ---

// A spec által megkövetelt MINIMUM állapotok, szó szerint.
export type RestStopFlowState =
  | "ROUTE_ACTIVE"
  | "REST_REQUESTED"
  | "REST_POINTS_LOADING"
  | "REST_POINTS_READY"
  | "REST_POINT_SELECTED"
  | "NAVIGATING_TO_REST_POINT"
  | "AT_REST_POINT"
  | "RESUME_REQUESTED"
  | "REROUTING_TO_ORIGINAL_DESTINATION"
  | "ROUTE_RESUMED"
  | "ERROR";

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
  selectedRestPoint?: RestPoint;
  errorReason?: string;
  errorMessage?: string;
}

export type RestStopFlowEvent =
  | { type: "REQUEST_REST" }
  | { type: "START_LOADING_REST_POINTS" }
  | { type: "REST_POINTS_LOADED"; restPoints: RankedRestPoint[] }
  | { type: "REST_POINTS_LOAD_FAILED"; reason: string }
  | { type: "SELECT_REST_POINT"; restPoint: RestPoint }
  | { type: "START_NAVIGATION_TO_REST_POINT" }
  | { type: "ARRIVED_AT_REST_POINT" }
  | { type: "REQUEST_RESUME" }
  | { type: "START_REROUTE" }
  | { type: "REROUTE_SUCCEEDED" }
  | { type: "REROUTE_FAILED"; reason: string }
  // Bármikor, amíg a folyamat nem érte el ROUTE_RESUMED-et, a felhasználó
  // megszakíthatja és visszatérhet a normál aktív útvonalhoz — az eredeti
  // cél soha nem veszik el, mert sosem volt felülírva.
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
