/**
 * Rate limiter factory
 *
 * Környezetfüggően választ adaptert:
 *
 *   Strict production (lásd isStrictProductionEnvironment()) + Upstash env van
 *     → UpstashRateLimiter
 *
 *   Strict production + Upstash env HIÁNYZIK
 *     → startup ERROR
 *     → fail-closed, nincs silent memory fallback
 *
 *   Nem strict production (+ Upstash env VAN)
 *     → UpstashRateLimiter (megengedett, de nem kötelező)
 *
 *   Nem strict production (+ Upstash env HIÁNYZIK)
 *     → MemoryRateLimiter, explicit (secret nélküli) log
 *
 * FONTOS:
 * Vercel Preview deployment alatt a NODE_ENV is "production", ezért
 * önmagában a NODE_ENV nem alkalmas annak eldöntésére, hogy valódi
 * production deployment fut-e.
 *
 * ROOT CAUSE (2026-09-08 audit, MIDDLEWARE_INVOCATION_FAILED Preview-n):
 * A b3a2ce7 javítás bevezette a VERCEL_ENV vizsgálatát, de ha a VERCEL_ENV
 * bármilyen okból undefined maradt, a kód visszaesett a
 * `NODE_ENV === 'production'` ágra, ami Preview alatt is "production" –
 * ez reprodukálta az eredeti hibát. Egy köztes javítás a `process.env.VERCEL`
 * platform-flaget vezette be kapuként ("csak Vercelen fogadjuk el a
 * NODE_ENV fallbacket"), DE a Vercel hivatalos dokumentációja szerint a
 * `VERCEL` env var IS System Environment Variable, tehát ugyanúgy
 * hiányozhat, ha a "System Environment Variables" exposure nincs
 * engedélyezve a projektben – vagyis önmagában NEM tekinthető megbízható,
 * mindig-jelenlévő jelzőnek.
 *
 * HARDENING (jelen verzió): explicit, project-controlled override:
 * `RATE_LIMIT_ENV` ('production' | 'preview' | 'development'). Ezt a
 * deploy-környezet (pl. Vercel Project Settings → Environment Variables,
 * Preview scope-ra állítva) tudja garantáltan beállítani, függetlenül
 * attól, hogy a Vercel System Environment Variables exposure be van-e
 * kapcsolva. Detektálási sorrend:
 *
 *   1. RATE_LIMIT_ENV  – explicit override, ha van, ez dönt
 *   2. VERCEL_ENV       – Vercel System Environment Variable, ha elérhető
 *   3. NODE_ENV          – biztonsági fallback: ismeretlen környezet +
 *                          NODE_ENV=production → FAIL CLOSED
 *
 * Az utolsó (3.) ág szándékosan konzervatív: ismeretlen/nem azonosítható
 * környezetet SOHA nem tekintünk automatikusan Previewnak – ha egy Preview
 * deploymenten sem a RATE_LIMIT_ENV, sem a VERCEL_ENV nem árulja el, hogy
 * nem production, a factory a biztonságos irányba, azaz fail-closedbe téved
 * (ez tudatos trade-off: inkább egy fals-pozitív production-crash egy
 * rosszul konfigurált Previewn, mint egy fals-negatív, ami éles
 * környezetben gyengítené a rate limitinget). Emiatt Preview deploymenteken
 * a RATE_LIMIT_ENV=preview (vagy a VERCEL_ENV helyes beállítása) explicit
 * beállítása a támogatott, dokumentált út a memory fallback engedélyezésére.
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
 * Detektálási sorrend (lásd fenti HARDENING megjegyzés):
 *   1. RATE_LIMIT_ENV (explicit override)
 *   2. VERCEL_ENV (Vercel System Environment Variable)
 *   3. NODE_ENV (biztonsági fallback – ismeretlen környezet + NODE_ENV=
 *      production → FAIL CLOSED, soha nem tekintjük automatikusan
 *      Previewnak)
 */
function isStrictProductionEnvironment(): boolean {
  const explicitEnv = process.env.RATE_LIMIT_ENV

  if (explicitEnv === 'production') {
    return true
  }
  if (explicitEnv === 'preview' || explicitEnv === 'development') {
    return false
  }

  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === 'production') {
    return true
  }
  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return false
  }

  // Biztonságos default: ismeretlen környezet + NODE_ENV=production →
  // fail closed. Ismeretlen környezetet SOHA nem tekintünk automatikusan
  // Previewnak.
  return process.env.NODE_ENV === 'production'
}

function hasUpstashCredentials(): boolean {
  return (
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
  )
}

function createRateLimiter(): RateLimiter {
  if (isStrictProductionEnvironment()) {
    if (!hasUpstashCredentials()) {
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

  // Nem szigorú production (Preview / Development / Test / CI – a fenti
  // detektálási sorrend valamelyik lépése explicit ezt állapította meg).
  if (hasUpstashCredentials()) {
    // Ha a credential mégis konfigurálva van (pl. megosztott preview Redis
    // DB), engedjük a támogatott Upstash-backed limitert – ez nem
    // kötelező, csak megengedett.
    return new UpstashRateLimiter()
  }

  // Upstash credential hiányzik, DE nem vagyunk szigorú productionben:
  // biztonságos, dokumentált non-production fallback – NEM dobunk, a
  // middleware nem omlik össze. Explicit log, secret érték nélkül.
  console.warn(
    '[RateLimit] Non-production environment detected ' +
      '(RATE_LIMIT_ENV=' + String(process.env.RATE_LIMIT_ENV ?? 'unset') +
      ', VERCEL_ENV=' + String(process.env.VERCEL_ENV ?? 'unset') +
      ', NODE_ENV=' + String(process.env.NODE_ENV ?? 'unset') + '): ' +
      'Upstash Redis credentials are not configured. ' +
      'Falling back to in-memory rate limiter (expected on Preview/local; ' +
      'real production requires Upstash and will fail closed instead).'
  )
  return new MemoryRateLimiter()
}

export const rateLimiter: RateLimiter = createRateLimiter()

export type { RateLimiter, RateLimitResult } from './types'
