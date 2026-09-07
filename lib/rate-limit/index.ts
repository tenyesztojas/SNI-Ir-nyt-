/**
 * Rate limiter factory
 *
 * Környezetfüggően választ adaptert:
 *
 *   Vercel Production + Upstash env van
 *     → UpstashRateLimiter
 *
 *   Vercel Production + Upstash env HIÁNYZIK
 *     → startup ERROR
 *     → fail-closed, nincs silent memory fallback
 *
 *   Vercel Preview / Development
 *     → MemoryRateLimiter
 *
 *   Nem-Vercel környezetben:
 *     NODE_ENV === 'production'
 *       → productionként kezeljük, Upstash kötelező
 *
 *     NODE_ENV !== 'production'
 *       → MemoryRateLimiter
 *
 * FONTOS:
 * Vercel Preview deployment alatt a NODE_ENV is "production",
 * ezért önmagában a NODE_ENV nem alkalmas annak eldöntésére,
 * hogy valódi production deployment fut-e.
 *
 * SECURITY:
 * Valódi production környezetben továbbra is fail-closed működés van.
 * Redis konfiguráció hiányában nem engedjük a memory fallbacket.
 */

import { MemoryRateLimiter } from './memory'
import { UpstashRateLimiter } from './upstash'
import type { RateLimiter } from './types'

/**
 * Eldönti, hogy valódi, szigorú production környezetben futunk-e.
 *
 * Vercelen a VERCEL_ENV az elsődleges:
 * - production  → strict production
 * - preview     → non-production
 * - development → non-production
 *
 * Nem-Vercel környezetben visszaesünk a NODE_ENV vizsgálatára,
 * így egy másik production hostingon sem gyengül a védelem.
 */
function isStrictProductionEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === 'production') {
    return true
  }

  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return false
  }

  // Nem-Vercel vagy ismeretlen környezet:
  // production NODE_ENV esetén biztonsági okból továbbra is fail-closed.
  return process.env.NODE_ENV === 'production'
}

function createRateLimiter(): RateLimiter {
  if (isStrictProductionEnvironment()) {
    const hasUpstash =
      Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)

    if (!hasUpstash) {
      // Fail-closed: valódi production környezetben
      // nem engedjük meg a memory fallbacket.
      throw new Error(
        '[RateLimit] Production environment detected but Upstash Redis credentials are missing.\n' +
          'Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN\n' +
          'These must be server-only (no NEXT_PUBLIC_ prefix).\n' +
          'Set them in your deployment environment before going live.'
      )
    }

    return new UpstashRateLimiter()
  }

  // Preview / Development / Test / CI
  return new MemoryRateLimiter()
}

export const rateLimiter: RateLimiter = createRateLimiter()

export type { RateLimiter, RateLimitResult } from './types'