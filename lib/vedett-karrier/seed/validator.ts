/**
 * Védett Karrier – VKMM Seed Validator
 * 17 FAIL FAST ellenőrzés – ha bármelyik false, kivétel dobva.
 *
 * Forrás: docs/vedett-karrier/SEED_VALIDATOR_SPEC.md
 * Az exportált validateVkmmSeed() PASS után szabad a seed-et DB-be tölteni.
 */

import type { VkmmSeedData, VkmmSubDimension } from '../types/index'

const EXPECTED_DIMENSION_CODES = [
  'env', 'comm', 'social', 'task_struct', 'task_dyn',
  'time', 'autonomy', 'support', 'physical', 'location',
] as const

const EXPECTED_COMPARISON_TYPE_VALUE_TYPE: Record<string, string> = {
  HIGHER_IS_MORE_DEMANDING: 'ordinal',
  RANGE_PREFERENCE: 'ordinal',
  SET_MEMBERSHIP: 'categorical',
  BOOLEAN_PREFERENCE: 'boolean',
  FREQUENCY_RANGE: 'frequency',
}

const VALID_COMPARISON_TYPES = new Set([
  'HIGHER_IS_MORE_DEMANDING',
  'RANGE_PREFERENCE',
  'SET_MEMBERSHIP',
  'BOOLEAN_PREFERENCE',
  'FREQUENCY_RANGE',
])

const VALID_VALUE_TYPES = new Set(['ordinal', 'categorical', 'boolean', 'frequency'])

function fail(check: string, detail: string): never {
  throw new Error(`[VKMM Seed Validator] FAIL – ${check}: ${detail}`)
}

function assert(check: string, condition: boolean, detail: string): void {
  if (!condition) fail(check, detail)
}

export function validateVkmmSeed(seed: VkmmSeedData): void {
  const { dimensions, subDimensions } = seed

  // ── CHECK 1: Pontosan 10 fődimenzió ────────────────────────────────────
  assert(
    'CHECK-01: dimension count',
    dimensions.length === 10,
    `Expected 10 dimensions, got ${dimensions.length}`
  )

  // ── CHECK 2: Pontosan 51 aldimenzió ────────────────────────────────────
  assert(
    'CHECK-02: sub-dimension count',
    subDimensions.length === 51,
    `Expected 51 sub-dimensions, got ${subDimensions.length}`
  )

  // ── CHECK 3: Dimension kódok pontosan egyeznek az elvárt listával ───────
  const dimCodes = new Set(dimensions.map(d => d.code))
  for (const expected of EXPECTED_DIMENSION_CODES) {
    assert(
      'CHECK-03: expected dimension code present',
      dimCodes.has(expected),
      `Missing dimension code: '${expected}'`
    )
  }
  assert(
    'CHECK-03: no extra dimension codes',
    dimCodes.size === EXPECTED_DIMENSION_CODES.length,
    `Extra dimension codes found. Got: ${[...dimCodes].join(', ')}`
  )

  // ── CHECK 4: Nincs duplikált dimension kód ──────────────────────────────
  assert(
    'CHECK-04: no duplicate dimension codes',
    dimCodes.size === dimensions.length,
    'Duplicate dimension code detected'
  )

  // ── CHECK 5: Nincs duplikált aldimenzió kód ─────────────────────────────
  const subCodes = subDimensions.map(s => s.code)
  const uniqueSubCodes = new Set(subCodes)
  assert(
    'CHECK-05: no duplicate sub-dimension codes',
    uniqueSubCodes.size === subDimensions.length,
    `Duplicate sub-dimension codes: ${subCodes.filter((c, i) => subCodes.indexOf(c) !== i).join(', ')}`
  )

  // ── CHECK 6: Minden aldimenzió dimension_code-ja érvényes fődimenzióra mutat
  for (const sub of subDimensions) {
    assert(
      'CHECK-06: dimension_code valid',
      dimCodes.has(sub.dimension_code),
      `sub_dimension '${sub.code}' has invalid dimension_code: '${sub.dimension_code}'`
    )
  }

  // ── CHECK 7: Minden fődimenziónak van legalább 1 aldimenziója ───────────
  for (const dim of dimensions) {
    const count = subDimensions.filter(s => s.dimension_code === dim.code).length
    assert(
      'CHECK-07: dimension has sub-dimensions',
      count >= 1,
      `Dimension '${dim.code}' has no sub-dimensions`
    )
  }

  // ── CHECK 8: value_type érvényes értéket vesz fel ───────────────────────
  for (const sub of subDimensions) {
    assert(
      'CHECK-08: valid value_type',
      VALID_VALUE_TYPES.has(sub.value_type),
      `sub_dimension '${sub.code}' has invalid value_type: '${sub.value_type}'`
    )
  }

  // ── CHECK 9: comparison_type érvényes értéket vesz fel ──────────────────
  for (const sub of subDimensions) {
    assert(
      'CHECK-09: valid comparison_type',
      VALID_COMPARISON_TYPES.has(sub.comparison_type),
      `sub_dimension '${sub.code}' has invalid comparison_type: '${sub.comparison_type}'`
    )
  }

  // ── CHECK 10: comparison_type ↔ value_type konzisztens ──────────────────
  for (const sub of subDimensions) {
    const expectedVt = EXPECTED_COMPARISON_TYPE_VALUE_TYPE[sub.comparison_type]
    assert(
      'CHECK-10: comparison_type matches value_type',
      sub.value_type === expectedVt,
      `sub_dimension '${sub.code}': comparison_type '${sub.comparison_type}' requires value_type '${expectedVt}', got '${sub.value_type}'`
    )
  }

  // ── CHECK 11: ordinal típusoknál ordinal_min, ordinal_max, ordinal_labels megvan
  for (const sub of subDimensions) {
    if (sub.value_type === 'ordinal') {
      assert(
        'CHECK-11: ordinal fields present',
        typeof sub.ordinal_min === 'number' && typeof sub.ordinal_max === 'number',
        `sub_dimension '${sub.code}' (ordinal) missing ordinal_min/ordinal_max`
      )
      assert(
        'CHECK-11: ordinal_labels present',
        Array.isArray(sub.ordinal_labels) && sub.ordinal_labels!.length > 0,
        `sub_dimension '${sub.code}' (ordinal) missing or empty ordinal_labels`
      )
      const range = sub.ordinal_max! - sub.ordinal_min! + 1
      assert(
        'CHECK-11: ordinal_labels count matches range',
        sub.ordinal_labels!.length === range,
        `sub_dimension '${sub.code}' (ordinal): ${sub.ordinal_labels!.length} labels for range ${range}`
      )
    }
  }

  // ── CHECK 12: categorical típusoknál categorical_options, categorical_labels megvan
  for (const sub of subDimensions) {
    if (sub.value_type === 'categorical') {
      assert(
        'CHECK-12: categorical_options present',
        Array.isArray(sub.categorical_options) && sub.categorical_options!.length >= 2,
        `sub_dimension '${sub.code}' (categorical) needs at least 2 categorical_options`
      )
      assert(
        'CHECK-12: categorical_labels present',
        typeof sub.categorical_labels === 'object' && sub.categorical_labels !== null,
        `sub_dimension '${sub.code}' (categorical) missing categorical_labels`
      )
      // Every option has a label
      for (const opt of sub.categorical_options!) {
        assert(
          'CHECK-12: every option has label',
          typeof sub.categorical_labels![opt] === 'string',
          `sub_dimension '${sub.code}' categorical_labels missing key: '${opt}'`
        )
      }
    }
  }

  // ── CHECK 13: frequency típusoknál frequency_options, frequency_labels megvan
  for (const sub of subDimensions) {
    if (sub.value_type === 'frequency') {
      assert(
        'CHECK-13: frequency_options present',
        Array.isArray(sub.frequency_options) && sub.frequency_options!.length >= 2,
        `sub_dimension '${sub.code}' (frequency) needs at least 2 frequency_options`
      )
      assert(
        'CHECK-13: frequency_labels present',
        typeof sub.frequency_labels === 'object' && sub.frequency_labels !== null,
        `sub_dimension '${sub.code}' (frequency) missing frequency_labels`
      )
      for (const opt of sub.frequency_options!) {
        assert(
          'CHECK-13: every option has label',
          typeof sub.frequency_labels![opt] === 'string',
          `sub_dimension '${sub.code}' frequency_labels missing key: '${opt}'`
        )
      }
    }
  }

  // ── CHECK 14: boolean típusnál NEM kell ordinal/categorical/frequency mező
  for (const sub of subDimensions) {
    if (sub.value_type === 'boolean') {
      assert(
        'CHECK-14: boolean has no ordinal fields',
        sub.ordinal_min === undefined && sub.ordinal_max === undefined,
        `sub_dimension '${sub.code}' (boolean) should not have ordinal fields`
      )
      assert(
        'CHECK-14: boolean has no categorical fields',
        sub.categorical_options === undefined,
        `sub_dimension '${sub.code}' (boolean) should not have categorical_options`
      )
    }
  }

  // ── CHECK 15: Minden aldimenziónak van user_question_hu és employer_question_hu
  for (const sub of subDimensions) {
    assert(
      'CHECK-15: user_question_hu present',
      typeof sub.user_question_hu === 'string' && sub.user_question_hu.length > 0,
      `sub_dimension '${sub.code}' missing user_question_hu`
    )
    assert(
      'CHECK-15: employer_question_hu present',
      typeof sub.employer_question_hu === 'string' && sub.employer_question_hu.length > 0,
      `sub_dimension '${sub.code}' missing employer_question_hu`
    )
  }

  // ── CHECK 16: sensitive_risk érvényes értéket vesz fel ──────────────────
  const validRisk = new Set(['low', 'medium', 'high'])
  for (const sub of subDimensions) {
    assert(
      'CHECK-16: sensitive_risk valid',
      validRisk.has(sub.sensitive_risk),
      `sub_dimension '${sub.code}' has invalid sensitive_risk: '${sub.sensitive_risk}'`
    )
  }

  // ── CHECK 17: display_order-ek egyediek dimenzión belül ─────────────────
  for (const dimCode of dimCodes) {
    const subs = subDimensions.filter(s => s.dimension_code === dimCode)
    const orders = subs.map(s => s.display_order)
    const uniqueOrders = new Set(orders)
    assert(
      'CHECK-17: display_order unique within dimension',
      uniqueOrders.size === orders.length,
      `Dimension '${dimCode}' has duplicate display_order values: ${orders.join(', ')}`
    )
  }
}
