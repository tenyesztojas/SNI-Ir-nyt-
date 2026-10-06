// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 (2026-10-06) — KÖZPONTI KONFIGURÁCIÓ
//
// Egyetlen forrás a report típusokhoz, kategóriákhoz, UI-címkékhez, TTL-ekhez
// és a típus -> intelligence-dimenzió leképezéshez. Sehol máshol ne legyen
// report-típus magic string — mindenki innen importál.
//
// PRIVACY: a report KIZÁRÓLAG közlekedési kontextust hordoz (járat, trip,
// megálló-szakasz, járműtípus). Nincs user_id, nincs koordináta, nincs
// origin/destination, nincs szabad szöveg.

export const COMMUNITY_REPORT_TYPES = [
  "crowded",
  "very_crowded",
  "quiet",
  "noisy",
  "bright_light",
  "vibration",
  "too_hot",
  "traffic_jam",
  "vehicle_stopped",
  "service_problem",
] as const;
export type CommunityReportType = (typeof COMMUNITY_REPORT_TYPES)[number];

export const COMMUNITY_REPORT_CATEGORIES = ["transport", "sensory"] as const;
export type CommunityReportCategory = (typeof COMMUNITY_REPORT_CATEGORIES)[number];

export function isCommunityReportType(value: unknown): value is CommunityReportType {
  return typeof value === "string" && (COMMUNITY_REPORT_TYPES as readonly string[]).includes(value);
}

/** Intelligence-dimenziók — forrásfüggetlenek (community, BKK realtime/APC, járműprofil). */
export const TRAFFIC_DIMENSIONS = ["crowding", "noise", "light", "vibration", "temperature", "traffic_disruption"] as const;
export type TrafficDimension = (typeof TRAFFIC_DIMENSIONS)[number];
export const SENSORY_DIMENSIONS = ["noise", "light", "vibration", "temperature"] as const satisfies readonly TrafficDimension[];

export interface CommunityReportTypeDefinition {
  type: CommunityReportType;
  category: CommunityReportCategory;
  label: string;
  emoji: string;
  /** Mennyi ideig "aktív" a report (perc). */
  ttlMinutes: number;
  /** A report jelzése dimenziónként, 0..1 skálán (0 = nincs terhelés, 1 = maximális). */
  signals: Partial<Record<TrafficDimension, number>>;
}

// A sorrend egyben a UI-sorrend is (kategórián belül).
export const COMMUNITY_REPORT_DEFINITIONS: Record<CommunityReportType, CommunityReportTypeDefinition> = {
  crowded: { type: "crowded", category: "transport", label: "Zsúfolt", emoji: "👥", ttlMinutes: 30, signals: { crowding: 0.7 } },
  very_crowded: { type: "very_crowded", category: "transport", label: "Nagyon zsúfolt", emoji: "👥", ttlMinutes: 30, signals: { crowding: 1 } },
  traffic_jam: { type: "traffic_jam", category: "transport", label: "Dugó / fennakadás", emoji: "🚧", ttlMinutes: 30, signals: { traffic_disruption: 0.8 } },
  vehicle_stopped: { type: "vehicle_stopped", category: "transport", label: "Jármű megállt", emoji: "⏸", ttlMinutes: 15, signals: { traffic_disruption: 1 } },
  service_problem: { type: "service_problem", category: "transport", label: "Közlekedési probléma", emoji: "⚠️", ttlMinutes: 30, signals: { traffic_disruption: 0.7 } },
  noisy: { type: "noisy", category: "sensory", label: "Hangos", emoji: "🔊", ttlMinutes: 30, signals: { noise: 1 } },
  bright_light: { type: "bright_light", category: "sensory", label: "Zavaró fény", emoji: "💡", ttlMinutes: 30, signals: { light: 1 } },
  vibration: { type: "vibration", category: "sensory", label: "Erős rázkódás", emoji: "〰️", ttlMinutes: 30, signals: { vibration: 1 } },
  too_hot: { type: "too_hot", category: "sensory", label: "Túl meleg", emoji: "🌡️", ttlMinutes: 30, signals: { temperature: 1 } },
  // "Nyugodt": egyszerre jelez alacsony zsúfoltságot és alacsony szenzoros terhelést —
  // így természetes ellenpontja (ellentmondó jelzése) a zsúfolt/hangos reportoknak.
  quiet: { type: "quiet", category: "sensory", label: "Nyugodt", emoji: "😌", ttlMinutes: 25, signals: { crowding: 0, noise: 0, light: 0, vibration: 0, temperature: 0 } },
};

export const COMMUNITY_REPORT_UI_GROUPS: { category: CommunityReportCategory; title: string; types: CommunityReportType[] }[] = [
  { category: "transport", title: "Közlekedés", types: ["crowded", "very_crowded", "traffic_jam", "vehicle_stopped", "service_problem"] },
  { category: "sensory", title: "Szenzoros", types: ["noisy", "bright_light", "vibration", "too_hot", "quiet"] },
];

export function getCommunityReportCategory(type: CommunityReportType): CommunityReportCategory {
  return COMMUNITY_REPORT_DEFINITIONS[type].category;
}

/** Aggregációs paraméterek — egyszerű, determinisztikus, később hangolható. */
export const COMMUNITY_AGGREGATION_CONFIG = {
  /** Frissességi súly felezési ideje (perc): egy 10 perces report fele annyit ér, mint egy friss. */
  freshnessHalfLifeMinutes: 10,
  /** Bizonyíték-telítési konstans: confidence_base = E / (E + K). 1 friss report -> 0.33. */
  evidenceSaturation: 2,
  /** Ellentmondás-büntetés erőssége (0..1): maximális szórásnál ennyivel csökken a confidence. */
  disagreementPenalty: 0.8,
  /** Felső korlát — a közösségi adat sosem "biztos". */
  maxConfidence: 0.95,
  /** Alapértelmezett időablak (perc) a friss állapothoz. */
  defaultWindowMinutes: 45,
} as const;

/** Routing-penalty őrkorlátok — v1-ben a penalty NINCS bekötve a rankingbe. */
export const COMMUNITY_ROUTING_PENALTY_CONFIG = {
  minConfidence: 0.6,
  minSampleCount: 3,
  maxPenaltyMinutes: 3,
} as const;

/** API rate limit (per user vagy per IP; a kulcs SOHA nem kerül DB-be). */
export const COMMUNITY_REPORT_RATE_LIMITS = {
  burst: { limit: 4, windowMs: 60_000 },
  sustained: { limit: 30, windowMs: 60 * 60_000 },
  /** Ugyanaz a szereplő ugyanarra a típusra + tripre/route-ra ennyi időn belül csak egyszer számít. */
  duplicateWindowMs: 10 * 60_000,
} as const;

export const COMMUNITY_REPORT_TIME_ZONE = "Europe/Budapest";
export const TIME_BUCKET_MINUTES = 15;
