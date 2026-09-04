/**
 * Védett Karrier – Profile Validation Unit Tests
 * Sprint 2
 *
 * Futtatás: node --experimental-strip-types __tests__/vedett-karrier/profile-validation.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  HiSchema, RpSchema, SmSchema, BpSchema, FrSchema,
  validateCategoriesAgainstDomain, validateFrequencyAgainstDomain,
} from '../../lib/vedett-karrier/profile/validation.ts'
import { computeCompletionPct, isAnswered } from '../../lib/vedett-karrier/profile/completion.ts'
import { computeProfileVersionHash } from '../../lib/vedett-karrier/profile/hash.server.ts'
import type { SavedDimensionRow } from '../../lib/vedett-karrier/profile/types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE = {
  careerProfileId: '00000000-0000-0000-0000-000000000001',
  subDimensionCode: 'env_noise',
  importanceLevel: 'medium' as const,
  unknown: false,
  userNote: null,
}

function emptyRow(): SavedDimensionRow {
  return {
    sub_dimension_code: 'env_noise',
    importance_level: 'medium',
    is_unknown: false,
    user_note: null,
    preferred_max_value: null, acceptable_max_value: null,
    preferred_min_value: null, acceptable_min_value: null,
    preferred_categories_json: null, acceptable_categories_json: null,
    preferred_boolean: null, acceptable_boolean_json: null,
    preferred_min_frequency: null, preferred_max_frequency: null,
    acceptable_min_frequency: null, acceptable_max_frequency: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HI validation
// ─────────────────────────────────────────────────────────────────────────────

describe('HI validation', () => {
  it('preferred_max <= acceptable_max → PASS', () => {
    const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', preferred_max_value: 3, acceptable_max_value: 4 })
    assert.ok(r.success)
  })

  it('preferred_max > acceptable_max → FAIL', () => {
    const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', preferred_max_value: 5, acceptable_max_value: 3 })
    assert.ok(!r.success)
    assert.match(r.error.errors[0].message, /preferred_max_value/)
  })

  it('unknown=true bypasses range check', () => {
    const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', unknown: true, preferred_max_value: 5, acceptable_max_value: 1 })
    assert.ok(r.success)
  })

  it('null values are allowed (not yet filled)', () => {
    const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', preferred_max_value: null, acceptable_max_value: null })
    assert.ok(r.success)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RP validation
// ─────────────────────────────────────────────────────────────────────────────

describe('RP validation', () => {
  it('valid four-bound: 1 ≤ 2 ≤ 4 ≤ 5 → PASS', () => {
    const r = RpSchema.safeParse({ ...BASE, comparisonType: 'RANGE_PREFERENCE', acceptable_min_value: 1, preferred_min_value: 2, preferred_max_value: 4, acceptable_max_value: 5 })
    assert.ok(r.success)
  })

  it('preferred_min > preferred_max → FAIL', () => {
    const r = RpSchema.safeParse({ ...BASE, comparisonType: 'RANGE_PREFERENCE', acceptable_min_value: 1, preferred_min_value: 4, preferred_max_value: 2, acceptable_max_value: 5 })
    assert.ok(!r.success)
  })

  it('acceptable_min > preferred_min → FAIL', () => {
    const r = RpSchema.safeParse({ ...BASE, comparisonType: 'RANGE_PREFERENCE', acceptable_min_value: 3, preferred_min_value: 2, preferred_max_value: 4, acceptable_max_value: 5 })
    assert.ok(!r.success)
  })

  it('unknown=true bypasses range check', () => {
    const r = RpSchema.safeParse({ ...BASE, comparisonType: 'RANGE_PREFERENCE', unknown: true, acceptable_min_value: 5, preferred_min_value: 1, preferred_max_value: 1, acceptable_max_value: 1 })
    assert.ok(r.success)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SM: preferred ⊆ acceptable
// ─────────────────────────────────────────────────────────────────────────────

describe('SM preferred subset acceptable', () => {
  it('preferred ⊆ acceptable → PASS', () => {
    const r = SmSchema.safeParse({ ...BASE, comparisonType: 'SET_MEMBERSHIP', preferred_categories_json: ['cold'], acceptable_categories_json: ['cold', 'comfortable'] })
    assert.ok(r.success)
  })

  it('preferred NOT ⊆ acceptable → FAIL', () => {
    const r = SmSchema.safeParse({ ...BASE, comparisonType: 'SET_MEMBERSHIP', preferred_categories_json: ['cold', 'warm'], acceptable_categories_json: ['cold'] })
    assert.ok(!r.success)
    assert.match(r.error.errors[0].message, /subset/)
  })

  it('empty preferred → PASS', () => {
    const r = SmSchema.safeParse({ ...BASE, comparisonType: 'SET_MEMBERSHIP', preferred_categories_json: [], acceptable_categories_json: ['cold'] })
    assert.ok(r.success)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BP: boolean false handling + null indifferent
// ─────────────────────────────────────────────────────────────────────────────

describe('BP boolean false handling', () => {
  it('preferred_boolean = false, acceptable includes false → PASS', () => {
    const r = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: false, acceptable_boolean_json: [true, false] })
    assert.ok(r.success)
    assert.equal(r.data.preferred_boolean, false)
  })

  it('preferred_boolean = false is NOT null (explicit)', () => {
    const r = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: false, acceptable_boolean_json: [false] })
    assert.ok(r.success)
    assert.notEqual(r.data.preferred_boolean, null)
  })

  it('preferred_boolean = false, NOT in acceptable → FAIL', () => {
    const r = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: false, acceptable_boolean_json: [true] })
    assert.ok(!r.success)
  })
})

describe('BP indifferent null handling', () => {
  it('preferred_boolean = null (indifferent) → PASS', () => {
    const r = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: null, acceptable_boolean_json: [true, false] })
    assert.ok(r.success)
    assert.equal(r.data.preferred_boolean, null)
  })

  it('null ≠ false: null is indifferent, false is explicit preference', () => {
    const rNull = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: null, acceptable_boolean_json: [] })
    const rFalse = BpSchema.safeParse({ ...BASE, comparisonType: 'BOOLEAN_PREFERENCE', preferred_boolean: false, acceptable_boolean_json: [false] })
    // Both valid
    assert.ok(rNull.success)
    assert.ok(rFalse.success)
    // But different values
    assert.notEqual(rNull.data.preferred_boolean, rFalse.data.preferred_boolean)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FR: ordered domain
// ─────────────────────────────────────────────────────────────────────────────

describe('FR ordering', () => {
  const domain = ['none', 'rare', 'regular', 'central']

  it('valid domain values → PASS', () => {
    const r = FrSchema.safeParse({ ...BASE, comparisonType: 'FREQUENCY_RANGE', preferred_min_frequency: 'none', preferred_max_frequency: 'regular', acceptable_min_frequency: 'none', acceptable_max_frequency: 'central', frequencyOptions: domain })
    assert.ok(r.success)
  })

  it('value not in domain → FAIL', () => {
    const r = FrSchema.safeParse({ ...BASE, comparisonType: 'FREQUENCY_RANGE', preferred_min_frequency: 'INVALID', preferred_max_frequency: null, acceptable_min_frequency: null, acceptable_max_frequency: null, frequencyOptions: domain })
    assert.ok(!r.success)
  })

  it('validateFrequencyAgainstDomain: invalid value → error', () => {
    const err = validateFrequencyAgainstDomain(['INVALID', null], domain)
    assert.ok(err !== null)
    assert.match(err!, /INVALID/)
  })

  it('validateFrequencyAgainstDomain: valid values → null', () => {
    const err = validateFrequencyAgainstDomain(['none', 'regular', null], domain)
    assert.equal(err, null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Invalid category reject
// ─────────────────────────────────────────────────────────────────────────────

describe('invalid category reject', () => {
  it('valid category → null', () => {
    const err = validateCategoriesAgainstDomain(['cold', 'warm'], ['cold', 'warm', 'comfortable', 'variable'])
    assert.equal(err, null)
  })

  it('invalid category → error string', () => {
    const err = validateCategoriesAgainstDomain(['INVALID'], ['cold', 'warm'])
    assert.ok(err !== null)
    assert.match(err!, /INVALID/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Unknown semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('unknown semantics', () => {
  it('unknown=true counts as answered', () => {
    const row: SavedDimensionRow = { ...emptyRow(), is_unknown: true }
    assert.ok(isAnswered(row))
  })

  it('empty row (all null, unknown=false) is not answered', () => {
    assert.ok(!isAnswered(emptyRow()))
  })

  it('row with preferred_max_value is answered', () => {
    const row: SavedDimensionRow = { ...emptyRow(), preferred_max_value: 3 }
    assert.ok(isAnswered(row))
  })

  it('row with preferred_boolean = false is answered (false IS valid!)', () => {
    const row: SavedDimensionRow = { ...emptyRow(), preferred_boolean: false }
    assert.ok(isAnswered(row))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Importance persistence (schema accepts all valid values)
// ─────────────────────────────────────────────────────────────────────────────

describe('importance persistence', () => {
  const levels = ['low', 'medium', 'high', 'essential'] as const
  for (const level of levels) {
    it(`importance=${level} → valid`, () => {
      const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', importanceLevel: level, preferred_max_value: null, acceptable_max_value: null })
      assert.ok(r.success)
    })
  }
  it('invalid importance → FAIL', () => {
    const r = HiSchema.safeParse({ ...BASE, comparisonType: 'HIGHER_IS_MORE_DEMANDING', importanceLevel: 'critical', preferred_max_value: null, acceptable_max_value: null })
    assert.ok(!r.success)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// completion_pct
// ─────────────────────────────────────────────────────────────────────────────

describe('completion_pct', () => {
  it('0 rows, 51 total → 0%', () => {
    assert.equal(computeCompletionPct([], 51), 0)
  })

  it('51 answered rows, 51 total → 100%', () => {
    const rows: SavedDimensionRow[] = Array.from({ length: 51 }, (_, i) => ({
      ...emptyRow(),
      sub_dimension_code: `sub_${i}`,
      preferred_max_value: 3,
    }))
    assert.equal(computeCompletionPct(rows, 51), 100)
  })

  it('unknown=true counts as answered', () => {
    const rows: SavedDimensionRow[] = [{ ...emptyRow(), is_unknown: true }]
    assert.equal(computeCompletionPct(rows, 4), 25)
  })

  it('boolean false counts as answered', () => {
    const rows: SavedDimensionRow[] = [{ ...emptyRow(), preferred_boolean: false }]
    assert.equal(computeCompletionPct(rows, 1), 100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic version hash
// ─────────────────────────────────────────────────────────────────────────────

describe('deterministic version hash', () => {
  const rows: SavedDimensionRow[] = [
    { ...emptyRow(), sub_dimension_code: 'env_noise', preferred_max_value: 3 },
    { ...emptyRow(), sub_dimension_code: 'env_light', preferred_max_value: 2 },
  ]

  it('same rows → same hash', () => {
    assert.equal(computeProfileVersionHash(rows), computeProfileVersionHash(rows))
  })

  it('hash is 64 char hex', () => {
    assert.match(computeProfileVersionHash(rows), /^[0-9a-f]{64}$/)
  })

  it('different rows → different hash', () => {
    const modified = [{ ...rows[0], preferred_max_value: 5 }, rows[1]]
    assert.notEqual(computeProfileVersionHash(rows), computeProfileVersionHash(modified))
  })

  it('order independent (sorted by code)', () => {
    const reversed = [rows[1], rows[0]]
    assert.equal(computeProfileVersionHash(rows), computeProfileVersionHash(reversed))
  })
})
