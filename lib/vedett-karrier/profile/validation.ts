/**
 * Védett Karrier – Munkaprofil Zod Validation
 * Sprint 2 – comparison_type-aware Zod schemas
 *
 * Szabály: invalid input NEM normalizálódik csendben valid értékké.
 * KRITIKUS: boolean false ≠ null
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Base fields (minden comparison_type-nál)
// ─────────────────────────────────────────────────────────────────────────────

const BaseSchema = z.object({
  careerProfileId: z.string().uuid('careerProfileId must be UUID'),
  subDimensionCode: z.string().min(1).max(100),
  importanceLevel: z.enum(['low', 'medium', 'high', 'essential']),
  unknown: z.boolean(),
  userNote: z.string().max(2000).nullable(),
})

// ─────────────────────────────────────────────────────────────────────────────
// HI: Higher-is-more-demanding → max-only
// ─────────────────────────────────────────────────────────────────────────────

export const HiSchema = BaseSchema.extend({
  comparisonType: z.literal('HIGHER_IS_MORE_DEMANDING'),
  preferred_max_value: z.number().int().min(1).max(10).nullable(),
  acceptable_max_value: z.number().int().min(1).max(10).nullable(),
  // These MUST NOT be present for HI
  preferred_min_value: z.null().optional(),
  acceptable_min_value: z.null().optional(),
}).refine(
  data => {
    if (data.unknown) return true
    if (data.preferred_max_value == null || data.acceptable_max_value == null) return true
    return data.preferred_max_value <= data.acceptable_max_value
  },
  { message: 'HI: preferred_max_value > acceptable_max_value', path: ['preferred_max_value'] }
)

// ─────────────────────────────────────────────────────────────────────────────
// RP: Range-preference → four-bound
// ─────────────────────────────────────────────────────────────────────────────

export const RpSchema = BaseSchema.extend({
  comparisonType: z.literal('RANGE_PREFERENCE'),
  preferred_min_value: z.number().int().min(1).max(10).nullable(),
  preferred_max_value: z.number().int().min(1).max(10).nullable(),
  acceptable_min_value: z.number().int().min(1).max(10).nullable(),
  acceptable_max_value: z.number().int().min(1).max(10).nullable(),
}).refine(
  data => {
    if (data.unknown) return true
    const { preferred_min_value: pmin, preferred_max_value: pmax,
            acceptable_min_value: amin, acceptable_max_value: amax } = data
    if (pmin == null || pmax == null || amin == null || amax == null) return true
    return amin <= pmin && pmin <= pmax && pmax <= amax
  },
  {
    message: 'RP: acceptable_min ≤ preferred_min ≤ preferred_max ≤ acceptable_max required',
    path: ['preferred_min_value'],
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// SM: Set-membership → preferred ⊆ acceptable
// ─────────────────────────────────────────────────────────────────────────────

export const SmSchema = BaseSchema.extend({
  comparisonType: z.literal('SET_MEMBERSHIP'),
  preferred_categories_json: z.array(z.string().min(1).max(100)).nullable(),
  acceptable_categories_json: z.array(z.string().min(1).max(100)).nullable(),
}).refine(
  data => {
    if (data.unknown) return true
    const pref = data.preferred_categories_json
    const acc = data.acceptable_categories_json
    if (!pref || !acc) return true
    const accSet = new Set(acc)
    return pref.every(p => accSet.has(p))
  },
  { message: 'SM: preferred_categories must be a subset of acceptable_categories', path: ['preferred_categories_json'] }
)

// ─────────────────────────────────────────────────────────────────────────────
// BP: Boolean-preference
// KRITIKUS: preferred_boolean = false IS VALID (nem hiányzó érték!)
// preferred_boolean = null → indifferent → ACCEPTABLE
// ─────────────────────────────────────────────────────────────────────────────

export const BpSchema = BaseSchema.extend({
  comparisonType: z.literal('BOOLEAN_PREFERENCE'),
  /** null = indifferent, true/false = preference */
  preferred_boolean: z.boolean().nullable(),
  acceptable_boolean_json: z.array(z.boolean()).nullable(),
}).refine(
  data => {
    if (data.unknown) return true
    if (data.preferred_boolean === null) return true  // indifferent OK
    const acc = data.acceptable_boolean_json
    if (!acc) return true
    return acc.includes(data.preferred_boolean)
  },
  { message: 'BP: preferred_boolean must be in acceptable_boolean_json if set', path: ['preferred_boolean'] }
)

// ─────────────────────────────────────────────────────────────────────────────
// FR: Frequency-range → ordered domain
// ─────────────────────────────────────────────────────────────────────────────

export const FrSchema = BaseSchema.extend({
  comparisonType: z.literal('FREQUENCY_RANGE'),
  preferred_min_frequency: z.string().max(100).nullable(),
  preferred_max_frequency: z.string().max(100).nullable(),
  acceptable_min_frequency: z.string().max(100).nullable(),
  acceptable_max_frequency: z.string().max(100).nullable(),
  /** ordered domain for validation (passed from seed metadata) */
  frequencyOptions: z.array(z.string()),
}).refine(
  data => {
    if (data.unknown) return true
    const opts = data.frequencyOptions
    const idx = (v: string | null) => v == null ? -1 : opts.indexOf(v)
    const pmin = idx(data.preferred_min_frequency)
    const pmax = idx(data.preferred_max_frequency)
    const amin = idx(data.acceptable_min_frequency)
    const amax = idx(data.acceptable_max_frequency)
    // If any value is set, it must be in the domain
    if (data.preferred_min_frequency && pmin === -1) return false
    if (data.preferred_max_frequency && pmax === -1) return false
    if (data.acceptable_min_frequency && amin === -1) return false
    if (data.acceptable_max_frequency && amax === -1) return false
    return true
  },
  { message: 'FR: frequency value not in allowed domain', path: ['preferred_min_frequency'] }
)

// ─────────────────────────────────────────────────────────────────────────────
// Union schema for the server action input
// ─────────────────────────────────────────────────────────────────────────────

export type HiInput = z.infer<typeof HiSchema>
export type RpInput = z.infer<typeof RpSchema>
export type SmInput = z.infer<typeof SmSchema>
export type BpInput = z.infer<typeof BpSchema>
export type FrInput = z.infer<typeof FrSchema>

// Note: z.discriminatedUnion requires ZodObject, not ZodEffects (produced by .refine()).
// Using z.union preserves the same runtime behaviour with full refinement support.
export const SaveDimensionSchema = z.union([
  HiSchema,
  RpSchema,
  SmSchema,
  BpSchema,
  FrSchema,
])

export type SaveDimensionInput = z.infer<typeof SaveDimensionSchema>

/** Validates allowed categories against seed domain. Call after Zod parse. */
export function validateCategoriesAgainstDomain(
  values: string[],
  allowedOptions: string[]
): string | null {
  const allowed = new Set(allowedOptions)
  const invalid = values.filter(v => !allowed.has(v))
  if (invalid.length > 0) return `Érvénytelen kategória: ${invalid.join(', ')}`
  return null
}

/** Validates frequency values against seed domain. Call after Zod parse. */
export function validateFrequencyAgainstDomain(
  values: (string | null)[],
  allowedOptions: string[]
): string | null {
  const allowed = new Set(allowedOptions)
  for (const v of values) {
    if (v !== null && !allowed.has(v)) return `Érvénytelen frekvencia érték: ${v}`
  }
  return null
}
