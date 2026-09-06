// Védett Útvonal — BKK Realtime integráció, 15. pont: "Realtime freshness".
//
// SZABÁLY: minden realtime adatpontnak ellenőrizhető feed timestamp-je és
// kora kell legyen. Ha az adat túl régi, NEM jeleníthető meg frissként.
//
// Ez a modul kizárólag ezt a döntést formalizálja — nem tölt le semmit,
// nem fér hozzá a hálózathoz. A hívó (pl. bkk.ts, orchestrator.ts) adja át
// a feed FeedHeader.timestamp mezőjét (UNIX másodperc), ez a modul pedig
// eldönti, hogy az adat "friss"-nek számít-e a VEDETT_ROUTE_CACHE.realtimeMaxAgeSeconds
// küszöb alapján (lásd config.ts a küszöb megválasztásának indoklásáért).

import { VEDETT_ROUTE_CACHE } from "./config.ts";

export interface RealtimeFreshnessResult {
  ageSeconds: number;
  fresh: boolean;
  thresholdSeconds: number;
  feedTimestampIso: string;
}

/**
 * @param feedTimestampSeconds A GTFS-RT FeedHeader.timestamp mezője (UNIX másodperc, szerver oldali óra).
 * @param nowMs Opcionális, csak teszteléshez — alapból Date.now().
 */
export function evaluateRealtimeFreshness(
  feedTimestampSeconds: number,
  nowMs: number = Date.now()
): RealtimeFreshnessResult {
  const ageSeconds = Math.max(0, Math.round(nowMs / 1000 - feedTimestampSeconds));
  const thresholdSeconds = VEDETT_ROUTE_CACHE.realtimeMaxAgeSeconds;
  return {
    ageSeconds,
    fresh: ageSeconds <= thresholdSeconds,
    thresholdSeconds,
    feedTimestampIso: new Date(feedTimestampSeconds * 1000).toISOString(),
  };
}
