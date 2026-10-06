// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE — központi konstansok (2026-10-06).
//
// Minden realtime súlyozási, decay-, matching-, megerősítési, figyelmeztetési és
// routing-penalty konstans ITT él. A számok szándékosan konzervatívak: a
// célközönség miatt a kiszámíthatóság fontosabb, mint a gyors reakció.

import type { CommunityReportType } from "./config.ts";

/**
 * Állapot-fajta: amelyik report-típusok UGYANAZT a jelenséget írják le,
 * azok egymást erősítik (Zsúfolt + Nagyon zsúfolt = zsúfoltság).
 */
export const REALTIME_STATE_KINDS = [
  "crowding",
  "traffic_jam",
  "vehicle_stopped",
  "service_problem",
  "noisy",
  "bright_light",
  "vibration",
  "too_hot",
] as const;
export type RealtimeStateKind = (typeof REALTIME_STATE_KINDS)[number];

/** report-típus -> állapot-fajta. A "quiet" nem önálló állapot, hanem ellen-bizonyíték. */
export const REPORT_TYPE_TO_STATE_KIND: Record<CommunityReportType, RealtimeStateKind | null> = {
  crowded: "crowding",
  very_crowded: "crowding",
  traffic_jam: "traffic_jam",
  vehicle_stopped: "vehicle_stopped",
  service_problem: "service_problem",
  noisy: "noisy",
  bright_light: "bright_light",
  vibration: "vibration",
  too_hot: "too_hot",
  quiet: null,
};

/** Ellen-bizonyíték: egy friss "Nyugodt" jelzés gyengíti a zsúfoltság/zaj állapot confidence-ét. */
export const COUNTER_EVIDENCE: Partial<Record<RealtimeStateKind, CommunityReportType[]>> = {
  crowding: ["quiet"],
  noisy: ["quiet"],
};

/**
 * Freshness decay felezési idő (perc), típusonként. Indoklás:
 *  - vehicle_stopped: egy álló jármű jellemzően percek alatt elindul -> gyors avulás;
 *  - traffic_jam: a dugó dinamikus, de nem percek alatt oszlik -> közepes;
 *  - crowding: járművön belül, az utazás idejére jellemző -> közepes;
 *  - service_problem / szenzoros (pl. hibás klíma, zajos jármű): tartósabb -> lassabb.
 * A súly 0.5^(kor / felezési idő), és a report expires_at-jakor 0 (TTL a config.ts-ben).
 */
export const FRESHNESS_HALF_LIFE_MINUTES: Record<RealtimeStateKind | "quiet", number> = {
  vehicle_stopped: 4,
  traffic_jam: 8,
  crowding: 10,
  quiet: 10,
  service_problem: 15,
  noisy: 15,
  bright_light: 15,
  vibration: 15,
  too_hot: 15,
};

export const REALTIME_MATCH_LEVELS = ["trip_segment", "trip", "route_segment", "route", "area"] as const;
export type RealtimeMatchLevel = (typeof REALTIME_MATCH_LEVELS)[number];

/** Egyezés minősége -> súlyszorzó (a legerősebb a trip+szakasz). */
export const MATCH_LEVEL_FACTOR: Record<RealtimeMatchLevel, number> = {
  trip_segment: 1,
  trip: 0.8,
  route_segment: 0.55,
  route: 0.35,
  area: 0.25,
};

/**
 * Szemantikailag helyes fallback-szintek állapot-fajtánként.
 *  - Járműhöz kötött jelenségek (zsúfoltság, szenzoros) CSAK ugyanarra a tripre
 *    érvényesek: egy másik jármű ugyanazon a vonalon NEM ugyanaz a probléma.
 *  - Útszakaszhoz kötött jelenségek (dugó, megállt jármű) ugyanazon vonal
 *    ugyanazon megállópárjára is kiterjeszthetők (a következő járat is érintett).
 *  - Vonalszintű zavar (service_problem) a teljes vonalra is.
 *  - "area" (geo_cell) KIZÁRÓLAG akkor, ha a lekérdezés maga csak földrajzi
 *    (nincs trip/route), és csak útszakasz-jellegű fajtákra.
 */
export const ALLOWED_MATCH_LEVELS: Record<RealtimeStateKind, readonly RealtimeMatchLevel[]> = {
  crowding: ["trip_segment", "trip"],
  noisy: ["trip_segment", "trip"],
  bright_light: ["trip_segment", "trip"],
  vibration: ["trip_segment", "trip"],
  too_hot: ["trip_segment", "trip"],
  traffic_jam: ["trip_segment", "trip", "route_segment", "area"],
  vehicle_stopped: ["trip_segment", "trip", "route_segment"],
  service_problem: ["trip_segment", "trip", "route_segment", "route", "area"],
};

/** Súlyosság (0..1), ha a report nem hordoz intenzitást. Intenzitással: 1 -> 0.4, 2 -> 0.7, 3 -> 1. */
export const DEFAULT_SEVERITY: Record<CommunityReportType, number> = {
  crowded: 0.7,
  very_crowded: 1,
  traffic_jam: 0.8,
  vehicle_stopped: 1,
  service_problem: 0.7,
  noisy: 0.7,
  bright_light: 0.7,
  vibration: 0.7,
  too_hot: 0.7,
  quiet: 0,
};
export const INTENSITY_SEVERITY: Record<1 | 2 | 3, number> = { 1: 0.4, 2: 0.7, 3: 1 };

export const REALTIME_CONFIDENCE_CONFIG = {
  /** A base_confidence ehhez viszonyítva skáláz (a v2 alapérték). */
  referenceBaseConfidence: 0.333,
  /** confidence = cap * E / (E + K) — E: független bizonyíték-összeg. */
  evidenceSaturation: 1.2,
  /** Abszolút felső korlát: a közösségi adat sosem "biztos". */
  maxConfidence: 0.9,
  /** Egyetlen független jelzés (bármilyen erős) legfeljebb ennyi. */
  singleReporterMaxConfidence: 0.45,
  /** Ennél kisebb bizonyítékú csoport nem számít "független megerősítésnek". */
  minEvidenceForIndependence: 0.05,
  /** Ellen-bizonyíték hatása: conf *= E / (E + counterWeight * Ecounter). */
  counterEvidenceWeight: 1,
} as const;

/** Navigációs figyelmeztetés: megjelenítési / elrejtési küszöb (hiszterézis a villogás ellen). */
export const NAVIGATION_WARNING_CONFIG = {
  showMinConfidence: 0.5,
  hideBelowConfidence: 0.38,
  minIndependentReports: 2,
  allowedMatchLevels: ["trip_segment", "trip", "route_segment"] as readonly RealtimeMatchLevel[],
} as const;

/** Routing penalty kimenet (normalizált 0..1; v1-ben NINCS bekötve a rankingbe). */
export const REALTIME_ROUTING_PENALTY_CONFIG = {
  minConfidence: 0.55,
  minIndependentReports: 2,
  /** Lépcsőzés a stabilitásért: ugyanaz az input -> ugyanaz, kis zaj -> nem ugrál. */
  quantizationStep: 0.05,
  /** Típusonkénti routing-relevancia (0..1). */
  kindWeight: {
    traffic_jam: 1,
    vehicle_stopped: 0.8,
    service_problem: 0.9,
    crowding: 0.6,
    noisy: 0.4,
    bright_light: 0.3,
    vibration: 0.4,
    too_hot: 0.4,
  } as Record<RealtimeStateKind, number>,
} as const;

/** Realtime lekérdezés ablaka — a leghosszabb TTL (30 perc) + tartalék. */
export const REALTIME_QUERY_WINDOW_MINUTES = 45;

/** Realtime state API rate limit (per user vagy per IP). */
export const COMMUNITY_STATE_RATE_LIMIT = { limit: 12, windowMs: 60_000 } as const;
/** Kliens polling (navigáció közben). */
export const COMMUNITY_STATE_POLL_INTERVAL_MS = 60_000;
