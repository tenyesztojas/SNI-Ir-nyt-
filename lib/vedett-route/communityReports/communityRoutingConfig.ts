// VÉDETT ÚTVONAL — PERSONALIZED SENSORY ROUTING — központi konstansok (2026-10-06).
//
// A pontskála a meglévő Sensory Engine skálája (sensory.score: 0..100, több =
// megterhelőbb). A közösségi hatás felülről korlátos, így gyenge/bizonytalan
// adat soha nem írhat felül nagy menetidő- vagy átszállás-különbséget.

import type { RealtimeStateKind } from "./realtimeConfig.ts";

/** Közösségi fajta -> routing dimenzió. A közlekedési zavar NEM szenzoros terhelés. */
export const COMMUNITY_SENSORY_DIMENSIONS = ["crowding", "noise", "light", "vibration", "temperature"] as const;
export type CommunitySensoryDimension = (typeof COMMUNITY_SENSORY_DIMENSIONS)[number];

export const KIND_TO_ROUTING_DIMENSION: Record<RealtimeStateKind, { group: "sensory"; dimension: CommunitySensoryDimension } | { group: "disruption" }> = {
  crowding: { group: "sensory", dimension: "crowding" },
  noisy: { group: "sensory", dimension: "noise" },
  bright_light: { group: "sensory", dimension: "light" },
  vibration: { group: "sensory", dimension: "vibration" },
  too_hot: { group: "sensory", dimension: "temperature" },
  traffic_jam: { group: "disruption" },
  vehicle_stopped: { group: "disruption" },
  service_problem: { group: "disruption" },
};

/**
 * Személyes közösségi érzékenység (0..2; 1 = semleges). A jelenlegi profilban
 * NINCS zsúfoltság/zaj/fény/rázkódás/hőmérséklet preferencia (csak a 6
 * strukturális csúszka), ezért ma mindenki a semleges 1-et kapja. Később egy-egy
 * csúszka DB-migráció nélkül is bekerülhet a keresési kérésbe (ugyanaz a 0..2
 * skála, mint a meglévő PersonalizationWeights).
 */
export type CommunitySensitivity = Record<CommunitySensoryDimension, number>;
export const NEUTRAL_COMMUNITY_SENSITIVITY: CommunitySensitivity = { crowding: 1, noise: 1, light: 1, vibration: 1, temperature: 1 };

export const COMMUNITY_ROUTING_CONFIG = {
  /**
   * Confidence-sávok (a kombinált historikus+realtime confidence-re):
   *   < minConfidence  -> 0 (nincs hatás),
   *   < fullConfidence -> partialFactor (mérsékelt hatás),
   *   egyébként       -> 1 (teljes, de korlátos hatás).
   */
  minConfidence: 0.45,
  fullConfidence: 0.6,
  partialFactor: 0.5,
  /**
   * Szakasz -> út aggregáció: peakWeight * max + (1 - peakWeight) * időarányos átlag
   * (csak bizonyítékkal rendelkező szakaszokon). Egyetlen nagyon rossz szakasz így
   * legalább peakWeight súllyal megmarad; a zavarnál a csúcs még fontosabb.
   */
  sensoryPeakWeight: 0.5,
  disruptionPeakWeight: 0.7,
  /** Maximális közösségi pontok a 0..100-as sensory skálán. */
  maxCommunitySensoryPoints: 15,
  maxCommunityDisruptionPoints: 15,
  /** A végső pontszám lépcsője (stabilitás). */
  finalScoreStep: 0.5,
  /** Ennyi pont javulás kell, hogy a közösségi adat megváltoztassa a "Legnyugodtabb" választást (hiszterézis). */
  switchMarginPoints: 3,
  /** A közösségi adat nem választhat olyan utat, amely ennyivel hosszabb / több átszállásos. */
  maxExtraDurationMinutes: 20,
  maxExtraTransfers: 1,
  /** Batch: a community-load API maximuma, ehhez igazodva darabolunk. */
  maxContextsPerChunk: 12,
  /** Ennyi kontextus felett nem gazdagítunk (védő korlát, nem csendes eldobás: jelezzük). */
  maxContextsPerSearch: 60,
  /** A közösségi gazdagítás teljes időkerete; túllépéskor fail-open (régi ranking). */
  enrichmentTimeoutMs: 800,
  /** Útközbeni (reroute-előkészítő) érdemi változás küszöbe a 0..1 személyes penaltyn. */
  materialChangeThreshold: 0.2,
} as const;
