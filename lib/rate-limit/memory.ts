/**
 * In-memory rate limiter adapter
 *
 * Kizárólag DEV / TEST környezetben használható.
 * Serverless / multi-instance productionben NEM megfelelő:
 * minden instance saját állapotot vezet.
 *
 * FAIL-SAFE: production env-ben a factory SOHA nem escolja ezt vissza
 * silently – startup error-t dob.
 */

import type { RateLimiter, RateLimitResult } from './types.js'

interface Window {
  count: number
  resetAt: number
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, Window>()
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
