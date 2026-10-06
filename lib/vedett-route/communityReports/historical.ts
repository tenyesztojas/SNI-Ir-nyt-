// VÉDETT ÚTVONAL — SENSORY & TRAFFIC INTELLIGENCE — historikus profil (előkészítés).
//
// A `vedett_route_traffic_profile_buckets` tábla soraira képez le. Forrás-
// tudatos (source mező), így később BKK realtime/historikus/APC és
// járműprofil is ugyanebbe a modellbe írható. v1-ben NINCS cron/ütemezett
// feltöltés — csak a tiszta service-határ és a sor-építő függvény.
//
// PRIVACY: a profil soha nem tartalmaz user-, trip- vagy jármű-azonosítót —
// csak route + irány + szakasz + hét napja + 15 perces sáv aggregátumot.

import { aggregateTrafficObservations } from "./aggregation.ts";
import { buildSegmentKey, computeCommunityReportTimeKeys } from "./context.ts";
import type { TrafficObservation, TrafficObservationSource } from "./observation.ts";

export interface TrafficProfileBucketKey {
  source: TrafficObservationSource;
  routeId: string;
  directionId: 0 | 1 | null;
  segmentKey: string | null;
  /** ISO 1..7 */
  weekday: number;
  /** 0..95 */
  timeBucket: number;
}

export interface TrafficProfileBucket extends TrafficProfileBucketKey {
  crowdingScore: number | null;
  noiseScore: number | null;
  lightScore: number | null;
  vibrationScore: number | null;
  temperatureDiscomfortScore: number | null;
  trafficDisruptionScore: number | null;
  sampleCount: number;
  confidence: number;
}

export function trafficProfileBucketKeyOf(observation: TrafficObservation): TrafficProfileBucketKey | null {
  if (!observation.context.routeId) return null; // route nélkül nincs értelmes historikus kulcs
  const keys = computeCommunityReportTimeKeys(new Date(observation.observedAt));
  return {
    source: observation.source,
    routeId: observation.context.routeId,
    directionId: observation.context.directionId,
    segmentKey: buildSegmentKey(observation.context.fromStopId, observation.context.toStopId),
    weekday: keys.weekday,
    timeBucket: keys.timeBucket,
  };
}

function keyString(key: TrafficProfileBucketKey): string {
  return [key.source, key.routeId, key.directionId ?? "", key.segmentKey ?? "", key.weekday, key.timeBucket].join("|");
}

/**
 * Megfigyelések -> historikus bucket sorok. A historikus nézetben nincs
 * frissességi lecsengés (minden megfigyelés a saját bucketjében egyenlő
 * súlyú), és nincs TTL-szűrés (lejárt rekordok is számítanak).
 */
export function buildTrafficProfileBuckets(observations: readonly TrafficObservation[]): TrafficProfileBucket[] {
  const groups = new Map<string, { key: TrafficProfileBucketKey; items: TrafficObservation[] }>();
  for (const observation of observations) {
    const key = trafficProfileBucketKeyOf(observation);
    if (!key) continue;
    const id = keyString(key);
    const group = groups.get(id) ?? { key, items: [] };
    group.items.push({ ...observation, expiresAt: null });
    groups.set(id, group);
  }
  return [...groups.values()].map(({ key, items }) => {
    const latest = items.reduce((max, o) => Math.max(max, new Date(o.observedAt).getTime()), 0);
    const aggregate = aggregateTrafficObservations(items, { now: new Date(latest), halfLifeMinutes: Number.POSITIVE_INFINITY });
    return {
      ...key,
      crowdingScore: aggregate.dimensions.crowding.score,
      noiseScore: aggregate.dimensions.noise.score,
      lightScore: aggregate.dimensions.light.score,
      vibrationScore: aggregate.dimensions.vibration.score,
      temperatureDiscomfortScore: aggregate.dimensions.temperature.score,
      trafficDisruptionScore: aggregate.dimensions.traffic_disruption.score,
      sampleCount: aggregate.sampleCount,
      confidence: aggregate.confidence,
    };
  });
}
