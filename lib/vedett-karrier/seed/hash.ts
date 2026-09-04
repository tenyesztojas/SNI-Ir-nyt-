/**
 * Védett Karrier – Deterministic VKMM Seed Hash
 * SHA-256 a seed kanonikus JSON-jén (stable serialization, no timestamps/UUIDs).
 *
 * Forrás: docs/vedett-karrier/SEED_VALIDATOR_SPEC.md §Deterministic version hash
 */

import { createHash } from 'node:crypto'
import type { VkmmSeedData } from '../types/index.js'

/**
 * Returns a stable hex SHA-256 of the seed data.
 * Keys are sorted recursively; timestamps and random IDs are excluded.
 * The hash changes only if dimension/sub-dimension definitions change.
 */
export function computeVkmmSeedHash(seed: VkmmSeedData): string {
  const stable = {
    schemaVersion: seed.schemaVersion,
    dimensions: seed.dimensions
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(d => ({
        code: d.code,
        name_hu: d.name_hu,
        display_order: d.display_order,
        is_active: d.is_active,
      })),
    subDimensions: seed.subDimensions
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(s => sortKeysDeep(s)),
  }

  const json = JSON.stringify(stable)
  return createHash('sha256').update(json, 'utf8').digest('hex')
}

/** Recursively sorts object keys for stable JSON serialization. */
function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep)
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}
