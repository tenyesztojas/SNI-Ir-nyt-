/**
 * Védett Karrier – Munkaprofil Version Hash (SERVER ONLY)
 * Sprint 2
 *
 * SHA-256 alapú determinisztikus verzióhash.
 * KIZÁRÓLAG szerveren futhat: node:crypto-t használ.
 * Kliens bundle-be NEM kerülhet.
 *
 * Importálható: server actions, server data, API route-ok.
 * NEM importálható: 'use client' modulokból.
 */

// SERVER ONLY – node:crypto miatt kliensre nem bundlölhető.
// Next.js webpack UnhandledSchemeError-t dob, ha kliens importálja.
import { createHash } from 'node:crypto'
import type { SavedDimensionRow } from './types'

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
