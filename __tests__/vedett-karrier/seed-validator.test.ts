/**
 * Védett Karrier – Seed Validator Unit Tests
 * Forrás: docs/vedett-karrier/UNIT_TEST_MATRIX.md
 *
 * Futtatás: node --experimental-strip-types __tests__/vedett-karrier/seed-validator.test.ts
 * (Node.js 22 native TypeScript support)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateVkmmSeed } from '../../lib/vedett-karrier/seed/validator.ts'
import { computeVkmmSeedHash } from '../../lib/vedett-karrier/seed/hash.ts'
import { VKMM_SEED } from '../../lib/vedett-karrier/seed/vkmm-seed.ts'
import type { VkmmSeedData } from '../../lib/vedett-karrier/types/index.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cloneSeed(overrides?: Partial<VkmmSeedData>): VkmmSeedData {
  return {
    dimensions: VKMM_SEED.dimensions.map(d => ({ ...d })),
    subDimensions: VKMM_SEED.subDimensions.map(s => ({ ...s })),
    schemaVersion: VKMM_SEED.schemaVersion,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O.1 – Érvényes seed PASS
// ─────────────────────────────────────────────────────────────────────────────

describe('O.1 – érvényes seed PASS', () => {
  it('validateVkmmSeed nem dob hibát az érvényes seedre', () => {
    assert.doesNotThrow(() => validateVkmmSeed(VKMM_SEED))
  })

  it('pontosan 10 dimenzió van', () => {
    assert.equal(VKMM_SEED.dimensions.length, 10)
  })

  it('pontosan 51 aldimenzió van', () => {
    assert.equal(VKMM_SEED.subDimensions.length, 51)
  })

  it('minden dimension_code egyedi', () => {
    const codes = VKMM_SEED.dimensions.map(d => d.code)
    assert.equal(new Set(codes).size, codes.length)
  })

  it('minden sub_dimension code egyedi', () => {
    const codes = VKMM_SEED.subDimensions.map(s => s.code)
    assert.equal(new Set(codes).size, codes.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O.2 – CHECK-01/02: helytelen darabszám FAIL
// ─────────────────────────────────────────────────────────────────────────────

describe('O.2 – helytelen darabszám FAIL', () => {
  it('CHECK-01: 9 dimenzió esetén FAIL', () => {
    const seed = cloneSeed({ dimensions: VKMM_SEED.dimensions.slice(0, 9) })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-01/)
  })

  it('CHECK-02: 50 aldimenzió esetén FAIL', () => {
    const seed = cloneSeed({ subDimensions: VKMM_SEED.subDimensions.slice(0, 50) })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-02/)
  })

  it('CHECK-02: 52 aldimenzió esetén FAIL', () => {
    const extra = { ...VKMM_SEED.subDimensions[0], code: 'extra_test_001' }
    const seed = cloneSeed({ subDimensions: [...VKMM_SEED.subDimensions, extra] })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-02/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O.3 – CHECK-05: duplikált aldimenzió kód FAIL
// ─────────────────────────────────────────────────────────────────────────────

describe('O.3 – duplikált aldimenzió kód FAIL', () => {
  it('CHECK-05: duplikált code esetén FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map((s, i) =>
      i === VKMM_SEED.subDimensions.length - 1
        ? { ...s, code: VKMM_SEED.subDimensions[0].code }
        : { ...s }
    )
    // First fails CHECK-02 (no longer 51 unique → but still 51 entries) → actually hits CHECK-05
    // since total count is still 51 but a code is duplicated
    const seed = cloneSeed({ subDimensions: subs })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-05/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O.4 – CHECK-10: comparison_type ↔ value_type konzisztencia FAIL
// ─────────────────────────────────────────────────────────────────────────────

describe('O.4 – comparison_type ↔ value_type mismatch FAIL', () => {
  it('CHECK-10: boolean value_type + HI comparison FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map(s =>
      s.value_type === 'boolean'
        ? { ...s, comparison_type: 'HIGHER_IS_MORE_DEMANDING' as const }
        : s
    )
    const seed = cloneSeed({ subDimensions: subs })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-10/)
  })

  it('CHECK-10: ordinal value_type + SET_MEMBERSHIP comparison FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map(s =>
      s.value_type === 'ordinal'
        ? { ...s, comparison_type: 'SET_MEMBERSHIP' as const }
        : s
    )
    const seed = cloneSeed({ subDimensions: subs })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-10/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O.5 – CHECK-11/12/13/14: typed metadata validáció
// ─────────────────────────────────────────────────────────────────────────────

describe('O.5 – typed metadata validáció', () => {
  it('CHECK-11: ordinal mezők nélküli ordinal sub_dim FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map(s =>
      s.value_type === 'ordinal'
        ? { ...s, ordinal_min: undefined, ordinal_max: undefined, ordinal_labels: undefined }
        : s
    )
    const seed = cloneSeed({ subDimensions: subs as typeof VKMM_SEED.subDimensions })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-11/)
  })

  it('CHECK-12: categorical_options nélküli categorical sub_dim FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map(s =>
      s.value_type === 'categorical'
        ? { ...s, categorical_options: undefined }
        : s
    )
    const seed = cloneSeed({ subDimensions: subs as typeof VKMM_SEED.subDimensions })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-12/)
  })

  it('CHECK-13: frequency_options nélküli frequency sub_dim FAIL', () => {
    const subs = VKMM_SEED.subDimensions.map(s =>
      s.value_type === 'frequency'
        ? { ...s, frequency_options: undefined }
        : s
    )
    const seed = cloneSeed({ subDimensions: subs as typeof VKMM_SEED.subDimensions })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-13/)
  })

  it('CHECK-14: boolean sub_dim-nek nincs ordinal_min mezője', () => {
    // A VKMM_SEED boolean sub_dim-jeiben nem szerepelnek ordinal mezők → PASS
    const boolSubs = VKMM_SEED.subDimensions.filter(s => s.value_type === 'boolean')
    assert.ok(boolSubs.length > 0, 'Kell legalább egy boolean sub_dim')
    for (const s of boolSubs) {
      assert.equal(s.ordinal_min, undefined)
      assert.equal(s.ordinal_max, undefined)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O.6 – Determinisztikus hash
// ─────────────────────────────────────────────────────────────────────────────

describe('O.6 – hash stabilitás', () => {
  it('azonos seed-re ugyanazt a hash-t adja', () => {
    const h1 = computeVkmmSeedHash(VKMM_SEED)
    const h2 = computeVkmmSeedHash(VKMM_SEED)
    assert.equal(h1, h2)
  })

  it('hash SHA-256 hex formátumban van (64 karakter)', () => {
    const h = computeVkmmSeedHash(VKMM_SEED)
    assert.match(h, /^[0-9a-f]{64}$/)
  })

  it('módosított seed más hash-t ad', () => {
    const original = computeVkmmSeedHash(VKMM_SEED)
    const modified = cloneSeed()
    modified.subDimensions[0] = { ...modified.subDimensions[0], name_user_hu: 'MODIFIED' }
    const h2 = computeVkmmSeedHash(modified)
    assert.notEqual(original, h2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility invariants (állapot-ellenőrzés a típusrendszeren)
// ─────────────────────────────────────────────────────────────────────────────

describe('Kompatibilitás – type guard invariánsok', () => {
  it('isEmployerValuePresent: null → false', async () => {
    const { isEmployerValuePresent } = await import('../../lib/vedett-karrier/types/index.ts')
    assert.equal(isEmployerValuePresent(null), false)
  })

  it('isEmployerValuePresent: boolean false → true (nem missing)', async () => {
    const { isEmployerValuePresent } = await import('../../lib/vedett-karrier/types/index.ts')
    const val = { type: 'boolean' as const, value: false, dataConfidence: 'CONFIRMED' as const }
    assert.equal(isEmployerValuePresent(val), true)
  })

  it('isBooleanValueMissing: null → true', async () => {
    const { isBooleanValueMissing } = await import('../../lib/vedett-karrier/types/index.ts')
    assert.equal(isBooleanValueMissing(null), true)
  })

  it('isBooleanValueMissing: undefined → true', async () => {
    const { isBooleanValueMissing } = await import('../../lib/vedett-karrier/types/index.ts')
    assert.equal(isBooleanValueMissing(undefined), true)
  })

  it('isBooleanValueMissing: false → false (false is valid!)', async () => {
    const { isBooleanValueMissing } = await import('../../lib/vedett-karrier/types/index.ts')
    assert.equal(isBooleanValueMissing(false), false)
  })

  it('isBooleanValueMissing: true → false', async () => {
    const { isBooleanValueMissing } = await import('../../lib/vedett-karrier/types/index.ts')
    assert.equal(isBooleanValueMissing(true), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CHECK-17: display_order egyediség dimenzión belül
// ─────────────────────────────────────────────────────────────────────────────

describe('CHECK-17 – display_order egyediség', () => {
  it('minden dimenzión belül egyediek a display_order értékek', () => {
    const dimCodes = new Set(VKMM_SEED.dimensions.map(d => d.code))
    for (const dimCode of dimCodes) {
      const subs = VKMM_SEED.subDimensions.filter(s => s.dimension_code === dimCode)
      const orders = subs.map(s => s.display_order)
      assert.equal(
        new Set(orders).size,
        orders.length,
        `Dimension '${dimCode}' has duplicate display_order: ${orders.join(', ')}`
      )
    }
  })

  it('CHECK-17: duplikált display_order FAIL', () => {
    const subs = [...VKMM_SEED.subDimensions]
    // set display_order of second env sub to same as first
    const firstEnvIdx = subs.findIndex(s => s.dimension_code === 'env')
    const secondEnvIdx = subs.findIndex((s, i) => s.dimension_code === 'env' && i > firstEnvIdx)
    subs[secondEnvIdx] = { ...subs[secondEnvIdx], display_order: subs[firstEnvIdx].display_order }
    const seed = cloneSeed({ subDimensions: subs })
    assert.throws(() => validateVkmmSeed(seed), /CHECK-17/)
  })
})
