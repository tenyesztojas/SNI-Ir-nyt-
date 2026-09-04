/**
 * Védett Karrier – Munkaprofil Completion
 * Sprint 2
 *
 * completion_pct: determinisztikusan számolódik.
 * NEM időből, NEM oldalak látogatásából, NEM interakcióból.
 * Csak ténylegesen kitöltött aldimenziók alapján.
 *
 * unknown = true: megválaszolt dimenziónak számít (ha tudatosan választotta).
 *
 * KLIENS-SAFE: NEM importál Node.js-only modult.
 * Version hash (node:crypto) → lib/vedett-karrier/profile/hash.server.ts
 */

import type { SavedDimensionRow } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Completion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a value between 0 and 100.
 * A dimension is "answered" if:
 *   - unknown = true (tudatosan választott)
 *   - OR at least one typed value field is non-null
 */
export function computeCompletionPct(
  savedRows: SavedDimensionRow[],
  totalSubDimCount: number
): number {
  if (totalSubDimCount === 0) return 0
  const answered = savedRows.filter(isAnswered).length
  return Math.round((answered / totalSubDimCount) * 100)
}

export function isAnswered(row: SavedDimensionRow): boolean {
  if (row.is_unknown) return true
  if (row.preferred_max_value !== null) return true
  if (row.preferred_min_value !== null) return true
  if (row.preferred_categories_json !== null && row.preferred_categories_json.length > 0) return true
  if (row.acceptable_categories_json !== null && row.acceptable_categories_json.length > 0) return true
  // boolean: false IS valid!
  if (row.preferred_boolean !== null) return true
  if (row.acceptable_boolean_json !== null && row.acceptable_boolean_json.length > 0) return true
  if (row.preferred_min_frequency !== null) return true
  if (row.preferred_max_frequency !== null) return true
  return false
}
