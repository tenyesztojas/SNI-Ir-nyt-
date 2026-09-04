/**
 * Upstash Redis rate limiter adapter (production)
 *
 * Megosztott state az összes serverless instance között.
 * Upstash REST API-t használ – nincs npm csomag szükséges.
 *
 * Szükséges env változók (server-only, NE kerüljön NEXT_PUBLIC_ prefix):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Algoritmus: Fixed window
 *   SET key 0 NX EX windowSeconds   ← létrehozás csak ha nincs (NX), TTL beállítása
 *   INCR key                         ← növelés (meglévő TTL megmarad)
 * Ez atomi pipeline-ban küldve, a sorrend garantálja a helyes TTL kezelést.
 */

import type { RateLimiter, RateLimitResult } from './types.js'

function getEnv() {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      '[RateLimit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. ' +
      'Set them as server-only environment variables. ' +
      'NE használj NEXT_PUBLIC_ prefixet!'
    )
  }
  return { url, token }
}

export class UpstashRateLimiter implements RateLimiter {
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const { url, token } = getEnv()
    const windowSeconds = Math.ceil(windowMs / 1000)

    // Pipeline: SET NX EX (create if absent) + INCR (atomic window counter)
    // A SET NX nem nullázza az INCR értéket – ha kulcs már létezik, SET NX nem csinál semmit.
    const pipeline: unknown[] = [
      ['SET', key, '0', 'NX', 'EX', String(windowSeconds)],
      ['INCR', key],
      ['TTL',  key],
    ]

    let pipelineResult: unknown[]
    try {
      const resp = await fetch(`${url}/pipeline`, {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body:    JSON.stringify(pipeline),
        // Nem cache-elünk rate limit statust
        cache:   'no-store',
      })

      if (!resp.ok) {
        // Redis nem elérhető → fail-closed (biztonságos irány kritikus endpointoknál)
        throw new Error(`Upstash HTTP ${resp.status}`)
      }

      pipelineResult = await resp.json() as unknown[]
    } catch (err) {
      // Redis failure: fail-closed
      console.error('[RateLimit] Upstash unreachable, failing closed:', err instanceof Error ? err.message : err)
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs }
    }

    // pipelineResult[0] = SET result, pipelineResult[1] = {result: count}, pipelineResult[2] = {result: ttl}
    const incrEntry = pipelineResult[1] as { result: number }
    const ttlEntry  = pipelineResult[2] as { result: number }

    const count     = incrEntry?.result ?? limit + 1
    const ttlSecs   = ttlEntry?.result  ?? windowSeconds
    const resetAt   = Date.now() + ttlSecs * 1000
    const allowed   = count <= limit
    const remaining = Math.max(0, limit - count)

    return { allowed, remaining, resetAt }
  }
}
