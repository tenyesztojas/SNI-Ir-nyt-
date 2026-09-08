/**
 * Rate Limiter – environment detection regressziós tesztek
 * (2026-09-08 audit + 2026-09-08 hardening, MIDDLEWARE_INVOCATION_FAILED fix)
 *
 * node:test runner — nincs Jest dependency.
 *
 * A factory döntési logikáját (lib/rate-limit/index.ts) inline másoljuk ide,
 * ugyanazt a mintát követve, mint __tests__/vedett-karrier/rate-limit.test.ts
 * már meglévő 4. tesztje (node --test --experimental-strip-types nem oldja
 * fel a lib/rate-limit/index.ts extensionless './memory' / './upstash'
 * importjait, ezért a tényleges factory modult itt nem lehet közvetlenül
 * importálni). A logika 1:1 másolata a valós fájlnak – ha az implementáció
 * módosul, ezt a másolatot is frissíteni kell.
 *
 * Detektálási sorrend (lib/rate-limit/index.ts):
 *   1. RATE_LIMIT_ENV (explicit, project-controlled override)
 *   2. VERCEL_ENV (Vercel System Environment Variable)
 *   3. NODE_ENV (biztonsági fallback – ismeretlen környezet + NODE_ENV=
 *      production → FAIL CLOSED; ismeretlen környezetet SOHA nem
 *      tekintünk automatikusan Previewnak)
 *
 * Fedett forgatókönyvek (a felhasználó explicit kérése szerint, 2026-09-08
 * hardening kör):
 *   1. RATE_LIMIT_ENV=production + Redis secret hiányzik      → throw
 *   2. RATE_LIMIT_ENV=preview + NODE_ENV=production + hiányzik → no throw
 *   3. RATE_LIMIT_ENV=development                              → no throw
 *   4. RATE_LIMIT_ENV hiányzik + VERCEL_ENV=preview             → no throw
 *   5. mindkettő (RATE_LIMIT_ENV, VERCEL_ENV) hiányzik +
 *      NODE_ENV=production                                     → throw
 *   6. Preview + Redis                                         → támogatott adapter (upstash)
 *   7. Production + Redis                                      → Upstash
 *
 * Korábbi (első audit körös) forgatókönyvek is megmaradnak lent, VERCEL_ENV
 * alapon, hogy a detektálási sorrend 2. lépése (VERCEL_ENV, RATE_LIMIT_ENV
 * override nélkül) is expliciten fedett legyen.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// Inline factory logika – forrás: lib/rate-limit/index.ts
// ─────────────────────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>

function isStrictProductionEnvironmentFor(env: Env): boolean {
  const explicitEnv = env.RATE_LIMIT_ENV

  if (explicitEnv === 'production') return true
  if (explicitEnv === 'preview' || explicitEnv === 'development') return false

  const vercelEnv = env.VERCEL_ENV

  if (vercelEnv === 'production') return true
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false

  // Biztonságos default: ismeretlen környezet + NODE_ENV=production →
  // fail closed. Soha nem tekintjük automatikusan Previewnak.
  return env.NODE_ENV === 'production'
}

function hasUpstashCredentialsFor(env: Env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN)
}

type LimiterKind = 'upstash' | 'memory'

function createRateLimiterFor(env: Env): LimiterKind {
  if (isStrictProductionEnvironmentFor(env)) {
    if (!hasUpstashCredentialsFor(env)) {
      throw new Error(
        '[RateLimit] Production environment detected but Upstash Redis credentials are missing.'
      )
    }
    return 'upstash'
  }

  if (hasUpstashCredentialsFor(env)) {
    return 'upstash'
  }

  return 'memory'
}

// ─────────────────────────────────────────────────────────────────────────────
// 1–7. A felhasználó által explicit kért forgatókönyvek (RATE_LIMIT_ENV
//      hardening kör, 2026-09-08)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limit factory – RATE_LIMIT_ENV explicit override (hardening)', () => {
  it('1) RATE_LIMIT_ENV=production + Redis secret hiányzik → throw', () => {
    assert.throws(
      () =>
        createRateLimiterFor({
          RATE_LIMIT_ENV: 'production',
          NODE_ENV: 'production',
        }),
      /Production environment detected but Upstash Redis credentials are missing/
    )
  })

  it('2) RATE_LIMIT_ENV=preview + NODE_ENV=production + Redis secret hiányzik → no throw', () => {
    assert.doesNotThrow(() =>
      createRateLimiterFor({
        RATE_LIMIT_ENV: 'preview',
        VERCEL_ENV: 'production', // szándékosan ellentmondó – RATE_LIMIT_ENV élvez elsőbbséget
        NODE_ENV: 'production',
      })
    )
    assert.equal(
      createRateLimiterFor({
        RATE_LIMIT_ENV: 'preview',
        VERCEL_ENV: 'production',
        NODE_ENV: 'production',
      }),
      'memory'
    )
  })

  it('3) RATE_LIMIT_ENV=development → no throw', () => {
    assert.doesNotThrow(() =>
      createRateLimiterFor({ RATE_LIMIT_ENV: 'development', NODE_ENV: 'production' })
    )
    assert.equal(
      createRateLimiterFor({ RATE_LIMIT_ENV: 'development', NODE_ENV: 'production' }),
      'memory'
    )
  })

  it('4) RATE_LIMIT_ENV hiányzik + VERCEL_ENV=preview → no throw', () => {
    assert.doesNotThrow(() =>
      createRateLimiterFor({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })
    )
    assert.equal(
      createRateLimiterFor({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }),
      'memory'
    )
  })

  it('5) mindkettő (RATE_LIMIT_ENV, VERCEL_ENV) hiányzik + NODE_ENV=production → throw', () => {
    // Ez a szándékos, konzervatív biztonsági fallback: ismeretlen környezetet
    // soha nem tekintünk automatikusan Previewnak. Vercel Preview
    // deploymenten ezért a RATE_LIMIT_ENV=preview (vagy a VERCEL_ENV
    // helyes beállítása) a támogatott, dokumentált út.
    assert.throws(
      () => createRateLimiterFor({ NODE_ENV: 'production' }),
      /Production environment detected but Upstash Redis credentials are missing/
    )
  })

  it('6) Preview (RATE_LIMIT_ENV=preview) + Redis credential → támogatott adapter (upstash)', () => {
    const kind = createRateLimiterFor({
      RATE_LIMIT_ENV: 'preview',
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://fake-preview.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'fake-preview-token',
    })
    assert.equal(kind, 'upstash')
  })

  it('7) Production (RATE_LIMIT_ENV=production) + Redis credential → Upstash', () => {
    const kind = createRateLimiterFor({
      RATE_LIMIT_ENV: 'production',
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://fake-prod.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'fake-prod-token',
    })
    assert.equal(kind, 'upstash')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8–13. Első audit körös forgatókönyvek – VERCEL_ENV alapon, explicit
//       RATE_LIMIT_ENV override NÉLKÜL (detektálási sorrend 2–3. lépése)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limit factory – VERCEL_ENV alapú environment detection (override nélkül)', () => {
  it('8) VERCEL_ENV=production + Redis secret hiányzik → FAIL CLOSED', () => {
    assert.throws(
      () => createRateLimiterFor({ VERCEL_ENV: 'production', NODE_ENV: 'production' }),
      /Production environment detected but Upstash Redis credentials are missing/
    )
  })

  it('9) VERCEL_ENV=preview + Redis secret hiányzik → middleware NEM crash-el', () => {
    assert.doesNotThrow(() =>
      createRateLimiterFor({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })
    )
    assert.equal(
      createRateLimiterFor({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }),
      'memory'
    )
  })

  it('10) VERCEL_ENV=development + Redis secret hiányzik → middleware NEM crash-el', () => {
    assert.doesNotThrow(() =>
      createRateLimiterFor({ VERCEL_ENV: 'development', NODE_ENV: 'development' })
    )
    assert.equal(
      createRateLimiterFor({ VERCEL_ENV: 'development', NODE_ENV: 'development' }),
      'memory'
    )
  })

  it('11) Preview (VERCEL_ENV) + Redis secret RENDELKEZÉSRE ÁLL → a rate limiter működhet (Upstash)', () => {
    const kind = createRateLimiterFor({
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://fake-preview.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'fake-preview-token',
    })
    assert.equal(kind, 'upstash')
  })

  it('12) Nem-Vercel host (sem RATE_LIMIT_ENV, sem VERCEL_ENV) + NODE_ENV=production + secret hiányzik → FAIL CLOSED', () => {
    assert.throws(
      () => createRateLimiterFor({ NODE_ENV: 'production' }),
      /Production environment detected but Upstash Redis credentials are missing/
    )
  })

  it('13) Nem-Vercel host + NODE_ENV!==production → nem dob (dev/test host)', () => {
    assert.doesNotThrow(() => createRateLimiterFor({ NODE_ENV: 'test' }))
    assert.equal(createRateLimiterFor({ NODE_ENV: 'test' }), 'memory')
  })
})
