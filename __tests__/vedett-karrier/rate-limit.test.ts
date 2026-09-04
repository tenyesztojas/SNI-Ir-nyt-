/**
 * Rate Limiter Tests – Phase 3 (Pre-Production Hardening)
 *
 * node:test runner — nincs Jest dependency.
 *
 * A MemoryRateLimiter implementációját inlineoljuk (ugyanúgy, ahogy a security
 * regression tesztek is re-definiálják az escapeHtml-t), mert a node:test
 * --experimental-strip-types runner .js importokat nem old fel .ts fájlokra.
 *
 * Tesztek:
 *   1. MemoryRateLimiter – allowed/blocked logika
 *   2. MemoryRateLimiter – key izoláció
 *   3. MemoryRateLimiter – window reset (valódi idő, 50ms ablak)
 *   4. Factory invariant – production + Upstash hiányzik → fail-closed Error
 *   5. RateLimitResult shape – minden mező megvan
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// Inline MemoryRateLimiter – source: lib/rate-limit/memory.ts
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number }

interface RlWindow { count: number; resetAt: number }

class MemoryRateLimiter {
  private readonly store = new Map<string, RlWindow>()
  private lastCleanup = Date.now()

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    this.maybeCleanup()
    const now = Date.now()
    const win = this.store.get(key)

    if (!win || now >= win.resetAt) {
      const resetAt = now + windowMs
      this.store.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: limit - 1, resetAt }
    }

    win.count++
    const allowed = win.count <= limit
    return {
      allowed,
      remaining: Math.max(0, limit - win.count),
      resetAt: win.resetAt,
    }
  }

  private maybeCleanup() {
    const now = Date.now()
    if (now - this.lastCleanup < 5 * 60_000) return
    this.lastCleanup = now
    for (const [k, w] of this.store) {
      if (now >= w.resetAt) this.store.delete(k)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Alapvető allowed/blocked logika
// ─────────────────────────────────────────────────────────────────────────────

describe('MemoryRateLimiter – alapvető logika', () => {
  it('első kérés: allowed=true, remaining=limit-1', async () => {
    const rl = new MemoryRateLimiter()
    const r = await rl.check('k1', 5, 60_000)
    assert.equal(r.allowed, true)
    assert.equal(r.remaining, 4)
  })

  it('limitig minden kérés allowed=true', async () => {
    const rl = new MemoryRateLimiter()
    for (let i = 0; i < 5; i++) {
      const r = await rl.check('k2', 5, 60_000)
      assert.equal(r.allowed, true)
    }
  })

  it('limit+1. kérésnél allowed=false, remaining=0', async () => {
    const rl = new MemoryRateLimiter()
    for (let i = 0; i < 5; i++) await rl.check('k3', 5, 60_000)
    const blocked = await rl.check('k3', 5, 60_000)
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.remaining, 0)
  })

  it('resetAt a jövőben van', async () => {
    const before = Date.now()
    const rl = new MemoryRateLimiter()
    const r = await rl.check('k4', 5, 60_000)
    assert.ok(r.resetAt > before)
  })

  it('limit=1 → második kérés blocked', async () => {
    const rl = new MemoryRateLimiter()
    assert.equal((await rl.check('k5', 1, 60_000)).allowed, true)
    assert.equal((await rl.check('k5', 1, 60_000)).allowed, false)
  })

  it('remaining csökken kérésenként', async () => {
    const rl = new MemoryRateLimiter()
    const r1 = await rl.check('k6', 3, 60_000)
    const r2 = await rl.check('k6', 3, 60_000)
    const r3 = await rl.check('k6', 3, 60_000)
    assert.equal(r1.remaining, 2)
    assert.equal(r2.remaining, 1)
    assert.equal(r3.remaining, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Key izoláció
// ─────────────────────────────────────────────────────────────────────────────

describe('MemoryRateLimiter – key izoláció', () => {
  it('különböző key-ek nem interferálnak', async () => {
    const rl = new MemoryRateLimiter()
    for (let i = 0; i < 3; i++) await rl.check('ip-A', 3, 60_000)
    assert.equal((await rl.check('ip-A', 3, 60_000)).allowed, false)
    assert.equal((await rl.check('ip-B', 3, 60_000)).allowed, true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Window reset (valódi idő, 50ms)
// ─────────────────────────────────────────────────────────────────────────────

describe('MemoryRateLimiter – window reset', () => {
  it('lejárt window után új window nyílik', async () => {
    const WINDOW_MS = 50
    const rl = new MemoryRateLimiter()
    await rl.check('reset', 2, WINDOW_MS)
    await rl.check('reset', 2, WINDOW_MS)
    assert.equal((await rl.check('reset', 2, WINDOW_MS)).allowed, false)
    await new Promise<void>(res => setTimeout(res, WINDOW_MS + 10))
    const fresh = await rl.check('reset', 2, WINDOW_MS)
    assert.equal(fresh.allowed, true)
    assert.equal(fresh.remaining, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Factory invariant – production + Upstash hiányzik → fail-closed
//    (a tényleges factory importját nem cache-busting-oljuk node:test-ben,
//     de a belső logikát unit-teszteljük)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limit factory – production fail-closed invariant', () => {
  it('ha NODE_ENV=production és Upstash env hiányzik, Error-t dob', () => {
    // Inline factory logika (copy from lib/rate-limit/index.ts)
    function createRateLimiterForTest(env: Record<string, string | undefined>) {
      if (env.NODE_ENV === 'production') {
        const hasUpstash =
          Boolean(env.UPSTASH_REDIS_REST_URL) &&
          Boolean(env.UPSTASH_REDIS_REST_TOKEN)
        if (!hasUpstash) {
          throw new Error(
            '[RateLimit] Production environment detected but Upstash Redis credentials are missing.'
          )
        }
      }
      return 'ok'
    }

    // Production + nincs Upstash → Error
    assert.throws(
      () => createRateLimiterForTest({ NODE_ENV: 'production' }),
      /Production environment detected but Upstash Redis credentials are missing/
    )

    // Production + van Upstash → OK
    assert.doesNotThrow(() =>
      createRateLimiterForTest({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL:   'https://fake.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'fake-token',
      })
    )

    // Dev → OK
    assert.doesNotThrow(() =>
      createRateLimiterForTest({ NODE_ENV: 'development' })
    )

    // Test → OK
    assert.doesNotThrow(() =>
      createRateLimiterForTest({ NODE_ENV: 'test' })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. RateLimitResult shape – minden mező megvan és helyes típusú
// ─────────────────────────────────────────────────────────────────────────────

describe('RateLimitResult – shape validáció', () => {
  it('minden mező megvan, típusok helyesek', async () => {
    const rl = new MemoryRateLimiter()
    const r = await rl.check('shape-test', 5, 60_000)
    assert.equal(typeof r.allowed,   'boolean')
    assert.equal(typeof r.remaining, 'number')
    assert.equal(typeof r.resetAt,   'number')
    assert.ok(Number.isFinite(r.remaining))
    assert.ok(Number.isFinite(r.resetAt))
  })

  it('blocked esetén is minden mező megvan', async () => {
    const rl = new MemoryRateLimiter()
    await rl.check('shape-blocked', 1, 60_000)
    const r = await rl.check('shape-blocked', 1, 60_000)
    assert.equal(r.allowed, false)
    assert.equal(typeof r.remaining, 'number')
    assert.equal(typeof r.resetAt,   'number')
  })
})
