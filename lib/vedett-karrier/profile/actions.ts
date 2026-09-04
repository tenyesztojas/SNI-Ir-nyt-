'use server'
/**
 * Védett Karrier – Munkaprofil Server Actions
 * Sprint 2
 *
 * Mentési pipeline:
 * 1. auth
 * 2. ownership (career_profile.user_id = authenticated user)
 * 3. Zod parsing (comparison_type-aware)
 * 4. subdimension metadata lookup (allowed categories / frequency_options)
 * 5. typed validation
 * 6. allowed-domain validation
 * 7. preference-range validation (Zod refine)
 * 8. DB write (upsert)
 * 9. completion recalculation
 * 10. version hash recalculation
 *
 * DB trigger (validate_career_profile_dimension_type) fut minden INSERT/UPDATE-n.
 */

import { createClient } from '@/lib/supabase/server'
import { SaveDimensionSchema, validateCategoriesAgainstDomain, validateFrequencyAgainstDomain } from './validation.js'
import { upsertDimensionPreference, loadSavedDimensions, updateProfileVersionHash } from './data.js'
import { computeCompletionPct } from './completion.js'
import { VKMM_SEED } from '../seed/vkmm-seed.js'
import type { SaveDimensionResult } from './types.js'

const TOTAL_SUB_DIM_COUNT = VKMM_SEED.subDimensions.length

// ─────────────────────────────────────────────────────────────────────────────
// saveDimensionPreference
// ─────────────────────────────────────────────────────────────────────────────

export async function saveDimensionPreference(
  rawInput: unknown
): Promise<SaveDimensionResult> {
  // 1. Auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nincs bejelentkezve.' }

  // 3. Zod parse (comparison_type-aware discriminated union)
  const parsed = SaveDimensionSchema.safeParse(rawInput)
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? 'Érvénytelen adat.'
    return { ok: false, error: firstError }
  }
  const data = parsed.data

  // 2. Ownership check (career_profile.user_id == authenticated user)
  const { data: profile, error: profileErr } = await supabase
    .from('career_profiles')
    .select('user_id')
    .eq('id', data.careerProfileId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (profileErr || !profile) {
    return { ok: false, error: 'A profil nem található vagy nincs hozzáférésed.' }
  }

  // 4. Sub-dimension metadata lookup
  const sub = VKMM_SEED.subDimensions.find(s => s.code === data.subDimensionCode)
  if (!sub) return { ok: false, error: 'Ismeretlen aldimenzió.' }

  // 5–6. Allowed-domain validation
  if (data.comparisonType === 'SET_MEMBERSHIP') {
    const pref = data.preferred_categories_json ?? []
    const acc = data.acceptable_categories_json ?? []
    const domain = sub.categorical_options ?? []
    const prefErr = validateCategoriesAgainstDomain(pref, domain)
    if (prefErr) return { ok: false, error: prefErr }
    const accErr = validateCategoriesAgainstDomain(acc, domain)
    if (accErr) return { ok: false, error: accErr }
  }

  if (data.comparisonType === 'FREQUENCY_RANGE') {
    const domain = sub.frequency_options ?? []
    const freqErr = validateFrequencyAgainstDomain(
      [
        data.preferred_min_frequency ?? null,
        data.preferred_max_frequency ?? null,
        data.acceptable_min_frequency ?? null,
        data.acceptable_max_frequency ?? null,
      ],
      domain
    )
    if (freqErr) return { ok: false, error: freqErr }
  }

  // 8. DB write
  const upsertResult = await upsertDimensionPreference({
    career_profile_id: data.careerProfileId,
    sub_dimension_code: data.subDimensionCode,
    importance_level: data.importanceLevel,
    is_unknown: data.unknown,
    user_note: data.userNote,
    // typed fields – only relevant ones for this comparison_type
    preferred_max_value: data.comparisonType === 'HIGHER_IS_MORE_DEMANDING' || data.comparisonType === 'RANGE_PREFERENCE'
      ? (data as { preferred_max_value?: number | null }).preferred_max_value ?? null
      : null,
    acceptable_max_value: data.comparisonType === 'HIGHER_IS_MORE_DEMANDING' || data.comparisonType === 'RANGE_PREFERENCE'
      ? (data as { acceptable_max_value?: number | null }).acceptable_max_value ?? null
      : null,
    preferred_min_value: data.comparisonType === 'RANGE_PREFERENCE'
      ? (data as { preferred_min_value?: number | null }).preferred_min_value ?? null
      : null,
    acceptable_min_value: data.comparisonType === 'RANGE_PREFERENCE'
      ? (data as { acceptable_min_value?: number | null }).acceptable_min_value ?? null
      : null,
    preferred_categories_json: data.comparisonType === 'SET_MEMBERSHIP'
      ? (data as { preferred_categories_json?: string[] | null }).preferred_categories_json ?? null
      : null,
    acceptable_categories_json: data.comparisonType === 'SET_MEMBERSHIP'
      ? (data as { acceptable_categories_json?: string[] | null }).acceptable_categories_json ?? null
      : null,
    preferred_boolean: data.comparisonType === 'BOOLEAN_PREFERENCE'
      ? (data as { preferred_boolean: boolean | null }).preferred_boolean
      : null,
    acceptable_boolean_json: data.comparisonType === 'BOOLEAN_PREFERENCE'
      ? (data as { acceptable_boolean_json?: boolean[] | null }).acceptable_boolean_json ?? null
      : null,
    preferred_min_frequency: data.comparisonType === 'FREQUENCY_RANGE'
      ? (data as { preferred_min_frequency?: string | null }).preferred_min_frequency ?? null
      : null,
    preferred_max_frequency: data.comparisonType === 'FREQUENCY_RANGE'
      ? (data as { preferred_max_frequency?: string | null }).preferred_max_frequency ?? null
      : null,
    acceptable_min_frequency: data.comparisonType === 'FREQUENCY_RANGE'
      ? (data as { acceptable_min_frequency?: string | null }).acceptable_min_frequency ?? null
      : null,
    acceptable_max_frequency: data.comparisonType === 'FREQUENCY_RANGE'
      ? (data as { acceptable_max_frequency?: string | null }).acceptable_max_frequency ?? null
      : null,
  })

  if (upsertResult.error) return { ok: false, error: upsertResult.error }

  // 9. Completion recalculation
  const allRows = await loadSavedDimensions(data.careerProfileId)
  const completionPct = computeCompletionPct(allRows, TOTAL_SUB_DIM_COUNT)

  // 10. Version hash recalculation
  await updateProfileVersionHash(data.careerProfileId, allRows)
  const { computeProfileVersionHash } = await import('./completion.js')
  const versionHash = computeProfileVersionHash(allRows)

  return { ok: true, completionPct, versionHash }
}
