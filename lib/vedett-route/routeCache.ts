// Opcionális útvonal-lekérdezés cache — Sprint 2, 25. pont.
//
// FONTOS KORLÁT (dokumentált, nem elhallgatott): ez egy egyszerű,
// folyamaton belüli (in-memory) cache. Ha az alkalmazás több szerver
// példányon fut (pl. szerverless/több worker), a cache PÉLDÁNYONKÉNT
// külön van — ez nem egy megosztott, elosztott cache. Production, több
// instance-os környezetben egy megosztott store (pl. Redis) javasolt, ha a
// terhelés indokolja — lásd PRODUCTION_DEPLOYMENT.md.
//
// A cache-kulcs a kérés MINDEN, az eredményt befolyásoló mezőjét
// tartalmazza (from/to koordináta, indulási idő percre kerekítve,
// személyre szabási súlyok) — soha nem ad vissza egy más paraméterekkel
// kért választ.

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function buildRouteCacheKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts, Object.keys(parts).sort());
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Kizárólag teszteléshez / diagnosztikához. */
export function clearRouteCache(): void {
  store.clear();
}
