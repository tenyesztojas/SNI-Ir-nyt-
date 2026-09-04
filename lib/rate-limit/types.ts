/**
 * Védett Karrier – Rate Limiter Interface
 * Pre-Production Hardening
 *
 * Absztrakció a rate limiter implementációk felett.
 * Dev: memory adapter
 * Production: Upstash Redis adapter (megosztott state)
 */

export interface RateLimitResult {
  /** A kérés engedélyezett-e */
  allowed: boolean
  /** Hány kérés maradt az ablakban */
  remaining: number
  /** Unix ms, mikor resettel az ablak */
  resetAt: number
}

export interface RateLimiter {
  /**
   * Ellenőrzi és növeli a számlálót.
   * @param key       egyedi kulcs (pl. "ip:route")
   * @param limit     max. kérés az ablakban
   * @param windowMs  ablak hossza milliszekundumban
   */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
}
