/**
 * Rate limiter factory
 *
 * Automatikusan kiválasztja a megfelelő adaptert:
 *   NODE_ENV === 'production' AND Upstash env van → UpstashRateLimiter
 *   NODE_ENV === 'production' AND Upstash env HIÁNYZIK → startup ERROR (fail-closed, nem silent fallback)
 *   NODE_ENV !== 'production' → MemoryRateLimiter (dev/test)
 *
 * DESIGN DÖNTÉS:
 *   Production envben soha ne essen vissza silently memory limiterre.
 *   Ha a Redis config hiányzik, a szerver startup-kor erroroljon,
 *   ne csak az első rate-limitelt kéréskor.
 */

import { MemoryRateLimiter } from './memory.js'
import { UpstashRateLimiter } from './upstash.js'
import type { RateLimiter } from './types.js'

function createRateLimiter(): RateLimiter {
  if (process.env.NODE_ENV === 'production') {
    const hasUpstash =
      Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)

    if (!hasUpstash) {
      // Fail-closed: production envben nem engedjük meg a memory fallbacket.
      // Ez a startup ponton dobódik, nem a kérés kiszolgálásakor.
      throw new Error(
        '[RateLimit] Production environment detected but Upstash Redis credentials are missing.\n' +
        'Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN\n' +
        'These must be server-only (no NEXT_PUBLIC_ prefix).\n' +
        'Set them in your deployment environment before going live.'
      )
    }

    return new UpstashRateLimiter()
  }

  // Dev / test / CI: memory adapter
  return new MemoryRateLimiter()
}

export const rateLimiter: RateLimiter = createRateLimiter()
export type { RateLimiter, RateLimitResult } from './types.js'
