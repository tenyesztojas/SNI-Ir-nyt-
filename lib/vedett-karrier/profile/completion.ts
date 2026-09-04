/**
 * Védett Karrier – Munkaprofil Completion + Version Hash
 * Sprint 2
 *
 * completion_pct: determinisztikusan számolódik.
 * NEM időből, NEM oldalak látogatásából, NEM interakcióból.
 * Csak ténylegesen kitöltött aldimenziók alapján.
 *
 * unknown = true: megválaszolt dimenziónak számít (ha tudatosan választotta).
 * version hash: SHA-256, canonical serialization, stabil sort, no timestamps.
 */

import { createHash } from 'node:crypto'
import type { SavedDimensionRow } from './types.js'

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

// ─────────────────────────────────────────────────────────────────────────────
// Version Hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determinisztikus SHA-256 hash a profil jelenlegi állapotáról.
 * Stabil sort: sub_dimension_code szerint.
 * No timestamps, no UUIDs.
 * Ugyanaz a profil → ugyanaz a hash.
 */
export function computeProfileVersionHash(savedRows: SavedDimensionRow[]): string {
  const stable = savedRows
    .slice()
    .sort((a, b) => a.sub_dimension_code.localeCompare(b.sub_dimension_code))
    .map(row => ({
      code: row.sub_dimension_code,
      importance: row.importance_level,
      unknown: row.is_unknown,
      preferred_max_value: row.preferred_max_value,
      acceptable_max_value: row.acceptable_max_value,
      preferred_min_value: row.preferred_min_value,
      acceptable_min_value: row.acceptable_min_value,
      // Arrays: sorted for stability
      preferred_categories: row.preferred_categories_json
        ? [...row.preferred_categories_json].sort()
        : null,
      acceptable_categories: row.acceptable_categories_json
        ? [...row.acceptable_categories_json].sort()
        : null,
      // boolean false IS valid – explicit null distinction
      preferred_boolean: row.preferred_boolean,
      acceptable_boolean: row.acceptable_boolean_json
        ? [...row.acceptable_boolean_json].sort()
        : null,
      preferred_min_freq: row.preferred_min_frequency,
      preferred_max_freq: row.preferred_max_frequency,
      acceptable_min_freq: row.acceptable_min_frequency,
      acceptable_max_freq: row.acceptable_max_frequency,
      // user_note intentionally excluded (private, not part of compatibility identity)
    }))

  const json = JSON.stringify(stable)
  return createHash('sha256').update(json, 'utf8').digest('hex')
}
