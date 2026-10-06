// VÉDETT ÚTVONAL — HISTORICAL SENSORY LOAD ENGINE — központi konstansok (2026-10-06).
//
// Determinisztikus, statisztikai (nem ML) modell. Minden küszöb és súly ITT,
// indoklással. Az értékek szándékosan óvatosak: kevés adatból nem állítunk
// magabiztos predikciót.

import type { RealtimeStateKind } from "./realtimeConfig.ts";

export const HISTORICAL_MODEL_VERSION = 1;
export const HISTORICAL_SOURCE = "community" as const;

/** Profil-hatókör: vonal+szakasz (elsődleges) vagy teljes vonal (fallback). */
export const LOAD_SCOPE_TYPES = ["route_segment", "route"] as const;
export type LoadScopeType = (typeof LOAD_SCOPE_TYPES)[number];

/**
 * Naptípus. Hétköznap, szombat, vasárnap KÜLÖN — sosem keverjük. (Ünnepnap-
 * naptár jelenleg nincs; egy ünnepi hétköznap hétköznapként számít — ismert korlát.)
 */
export const DAY_TYPES = ["workday", "saturday", "sunday"] as const;
export type DayType = (typeof DAY_TYPES)[number];
export function dayTypeOfWeekday(isoWeekday: number): DayType {
  if (isoWeekday === 6) return "saturday";
  if (isoWeekday === 7) return "sunday";
  return "workday";
}

/**
 * Historikus hozzájárulás súlya egy (deduplikált) megfigyelésre:
 *   w = context_confidence * scopeQuality * (legacy ? LEGACY_WEIGHT : 1)
 * Az érték (0..1) a realtime motorral közös súlyosság-skála (intenzitás /
 * típus-alapérték); "Nyugodt" ellen-bizonyítékként 0 értékű minta a
 * COUNTER_EVIDENCE szerinti fajtákban (zsúfoltság, zaj) — közlekedési
 * hibát SOHA nem csökkent.
 */
export const HISTORICAL_WEIGHTS = {
  /** Token nélküli (v1 / dedup nélküli) sor: nem tudjuk kizárni az ismétlést. */
  legacyWeight: 0.5,
  /** A vonal-szintű profil egy szakasz-jelzésből gyengébb tanulságot kap. */
  scopeQuality: { route_segment: 1, route: 0.7 } as Record<LoadScopeType, number>,
  /** Hiányzó context_confidence esetén (nem fordulhat elő v2 sornál). */
  defaultContextConfidence: 0.2,
} as const;

/**
 * Lassú historikus decay a szolgáltatási nap kora szerint:
 *   w_age = 0.5 ^ (napok / 28)
 * 1 hét ≈ 0.84, 4 hét = 0.5, 3 hónap ≈ 0.11, 6 hónap ≈ 0.01. Így néhány napos
 * adat erős, néhány hetes releváns, több hónapos fokozatosan elhalványul.
 * A HISTORY_WINDOW_DAYS-nél régebbi napi aggregátum nem kerül a profilba.
 */
export const HISTORICAL_DECAY = {
  halfLifeDays: 28,
  historyWindowDays: 182,
} as const;

/**
 * Minta-elégségesség és confidence.
 *   confidence = maxConfidence * S/(S + K) * min(1, napok / fullConfidenceDays)
 * ahol S a decayed effektív mintaerősség, "napok" a független szolgáltatási
 * napok száma (egy egyszeri esemény tíz jelzése NEM heti mintázat).
 */
export const HISTORICAL_CONFIDENCE = {
  maxConfidence: 0.85,
  strengthSaturation: 4,
  fullConfidenceDays: 4,
  /** Alatta: insufficient (nincs használható predikció). */
  minSampleCount: 3,
  minDistinctDays: 2,
  minEffectiveStrength: 1,
  /** Minőségi sávok a confidence alapján. */
  usableMinConfidence: 0.35,
  strongMinConfidence: 0.6,
  strongMinDistinctDays: 4,
} as const;

export const DATA_QUALITY_LEVELS = ["insufficient", "low", "usable", "strong"] as const;
export type DataQuality = (typeof DATA_QUALITY_LEVELS)[number];

/**
 * Időbeli fallback (mindig CSÖKKENTI a confidence-t, sosem lép át naptípust,
 * sosem tágít ±1 sávnál — azaz 45 percnél — szélesebbre, így a reggeli csúcs
 * nem keveredik az esti időszakkal, a hétköznap sem a hétvégével).
 */
export const TIME_FALLBACK_LEVELS = [
  "exact", // vonal+szakasz, ugyanaz a hét napja, ugyanaz a 15 perces sáv
  "adjacent_time", // vonal+szakasz, ugyanaz a nap, ±1 sáv (szomszéd 0.6 súllyal)
  "day_type", // vonal+szakasz, azonos naptípus (pl. bármely hétköznap), ±1 sáv
  "route_adjacent_time", // teljes vonal, ugyanaz a nap, ±1 sáv
  "route_day_type", // teljes vonal, azonos naptípus, ±1 sáv
] as const;
export type TimeFallbackLevel = (typeof TIME_FALLBACK_LEVELS)[number];

export const TIME_FALLBACK_CONFIDENCE_FACTOR: Record<TimeFallbackLevel, number> = {
  exact: 1,
  adjacent_time: 0.85,
  day_type: 0.7,
  route_adjacent_time: 0.55,
  route_day_type: 0.45,
};
export const ADJACENT_BUCKET_WEIGHT = 0.6;
export const ADJACENT_BUCKET_RADIUS = 1;

/**
 * Vonal-szintű fallback csak ott, ahol szemantikailag értelmes: a zsúfoltság,
 * zaj, jármű-jellemzők és vonal-szintű zavarok a vonalra is jellemzők; a dugó
 * és a megállt jármű HELYHEZ kötött -> nincs vonal-szintű fallback.
 */
export const ROUTE_FALLBACK_KINDS: readonly RealtimeStateKind[] = [
  "crowding",
  "noisy",
  "bright_light",
  "vibration",
  "too_hot",
  "service_problem",
];

/** Realtime + historikus kombináció. */
export const LOAD_COMBINER_CONFIG = {
  /** Ennél távolabbi indulásnál csak historikus baseline (a realtime állapot addigra érvénytelen). */
  realtimeHorizonMinutes: 30,
  /** Ennél gyengébb realtime jelzés nem korrigál. */
  minRealtimeConfidence: 0.25,
  /** A friss adat erősebb: a realtime súly szorzója a historikushoz képest. */
  realtimeWeightBoost: 1.5,
  maxCombinedConfidence: 0.9,
  /** Combined penalty csak e confidence felett nem nulla. */
  minCombinedConfidenceForPenalty: 0.45,
} as const;

/** Expected-load API: batch korlát és rate limit. */
export const EXPECTED_LOAD_API = {
  maxContexts: 12,
  rateLimit: { limit: 6, windowMs: 60_000 },
  /** Jövőbeli lekérdezés legfeljebb ennyi nappal előre. */
  maxFutureDays: 14,
} as const;

/** Aggregációs job. */
export const AGGREGATION_JOB = {
  /** Alapfutás: az utolsó ennyi LEZÁRT szolgáltatási nap mindig újraépül. */
  rebuildCompleteDays: 3,
  /** Ennyi napra visszamenőleg a még nem aggregált napokat pótolja. */
  catchUpDays: 30,
  /** Egy futás maximum ennyi napot dolgoz fel (backfill-nél is). */
  maxDaysPerRun: 31,
  /**
   * A reporter tokent csak olyan napokra nullázzuk, amelyek már aggregálva
   * vannak ÉS kívül esnek a jövőbeli újraépítési ablakon (így egy újraépítés
   * mindig ugyanazzal a dedup-inputtal fut -> idempotens).
   */
  tokenPurgeAfterCompleteDays: 3,
  pageSize: 1000,
} as const;
