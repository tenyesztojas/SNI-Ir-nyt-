/**
 * Védett Karrier – Compatibility Engine
 * Sprint 5
 *
 * Determinisztikus, NOT AI.
 * Input: user karrierprofil sorok + employer env value sorok + VKMM aldimenziók
 * Output: CompatibilityResult[] minden aktív aldimenzióra
 *
 * KRITIKUS:
 * - Nincs overall score, nincs percentage, nincs rank, nincs suitability
 * - employer_note NEM kerül a kimenetbe
 * - user_note NEM kerül ki (privát)
 * - boolean false IS valid data (=== null check)
 */

import type {
  CompatibilityResult,
  EmployerDimensionValue,
  OrdinalEmployerValue,
  CategoricalEmployerValue,
  BooleanEmployerValue,
  FrequencyEmployerValue,
  OrdinalUserPreference,
  SetUserPreference,
  BooleanUserPreference,
  FrequencyUserPreference,
  UserDimensionPreference,
  VkmmSubDimension,
  JobRoleEnvValueRow,
} from '../types/index.js'
import type { SavedDimensionRow } from '../profile/types.js'
import {
  handleHI,
  handleRP,
  handleSM,
  handleBP,
  handleFR,
  ExplKey,
} from './handlers.js'

export const COMPATIBILITY_ENGINE_VERSION = '1.0.0'

// ─────────────────────────────────────────────────────────────────────────────
// DB sor → EmployerDimensionValue
// KRITIKUS: boolean_value === null check (false IS valid)
// ─────────────────────────────────────────────────────────────────────────────

function toEmployerValue(row: JobRoleEnvValueRow, sub: VkmmSubDimension): EmployerDimensionValue {
  const dc = row.data_source
  if (sub.value_type === 'ordinal' && row.ordinal_value !== null) {
    return { type: 'ordinal', value: row.ordinal_value, dataConfidence: dc }
  }
  if (sub.value_type === 'categorical' && row.categorical_value !== null) {
    return { type: 'categorical', value: row.categorical_value, dataConfidence: dc }
  }
  // boolean false IS valid – explicit === null check, SOHA nem falsy
  if (sub.value_type === 'boolean' && row.boolean_value !== null) {
    return { type: 'boolean', value: row.boolean_value, dataConfidence: dc }
  }
  if (sub.value_type === 'frequency' && row.frequency_value !== null) {
    return { type: 'frequency', value: row.frequency_value, dataConfidence: dc }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// SavedDimensionRow → UserDimensionPreference
// comparison_type alapján diszpatchol
// ─────────────────────────────────────────────────────────────────────────────

function toUserPreference(row: SavedDimensionRow, sub: VkmmSubDimension): UserDimensionPreference {
  const base = {
    subDimensionCode: row.sub_dimension_code,
    importanceLevel:  row.importance_level,
    unknown:          row.is_unknown,
    userNote:         row.user_note ?? undefined,
  }

  switch (sub.comparison_type) {
    case 'HIGHER_IS_MORE_DEMANDING':
      return {
        ...base,
        type: 'ordinal',
        comparisonType: 'HIGHER_IS_MORE_DEMANDING',
        preferred_max_value: row.preferred_max_value,
        acceptable_max_value: row.acceptable_max_value,
        preferred_min_value: row.preferred_min_value,
        acceptable_min_value: row.acceptable_min_value,
      } satisfies OrdinalUserPreference

    case 'RANGE_PREFERENCE':
      return {
        ...base,
        type: 'ordinal',
        comparisonType: 'RANGE_PREFERENCE',
        preferred_max_value: row.preferred_max_value,
        acceptable_max_value: row.acceptable_max_value,
        preferred_min_value: row.preferred_min_value,
        acceptable_min_value: row.acceptable_min_value,
      } satisfies OrdinalUserPreference

    case 'SET_MEMBERSHIP':
      return {
        ...base,
        type: 'categorical',
        // DB: preferred_categories_json (jsonb array)
        preferred_categories: row.preferred_categories_json ?? [],
        acceptable_categories: row.acceptable_categories_json ?? [],
      } satisfies SetUserPreference

    case 'BOOLEAN_PREFERENCE':
      return {
        ...base,
        type: 'boolean',
        // KRITIKUS: preferred_boolean === null → indifferent; false → valid false preference
        preferred_boolean: row.preferred_boolean,
        acceptable_boolean_values: row.acceptable_boolean_json ?? [],
      } satisfies BooleanUserPreference

    case 'FREQUENCY_RANGE':
      return {
        ...base,
        type: 'frequency',
        preferred_min_frequency: row.preferred_min_frequency,
        preferred_max_frequency: row.preferred_max_frequency,
        acceptable_min_frequency: row.acceptable_min_frequency,
        acceptable_max_frequency: row.acceptable_max_frequency,
      } satisfies FrequencyUserPreference
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fő engine: compatibility kiszámítása minden aktív aldimenzióra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute compatibility results for all provided sub-dimensions.
 * Pure function – no DB access, no AI, no score.
 * Partial data (missing user or employer row) → UNKNOWN (nem bukás).
 *
 * @param savedRows     User career_profile_dimensions sorai
 * @param envValues     Employer job_role_env_values sorai
 * @param subDimensions Aktív VKMM aldimenziók (seedből)
 */
export function computeCompatibility(
  savedRows: SavedDimensionRow[],
  envValues: JobRoleEnvValueRow[],
  subDimensions: VkmmSubDimension[],
): CompatibilityResult[] {
  const rowByCode = new Map<string, SavedDimensionRow>(
    savedRows.map(r => [r.sub_dimension_code, r]),
  )
  const envByCode = new Map<string, JobRoleEnvValueRow>(
    envValues.map(e => [e.sub_dimension_code, e]),
  )

  return subDimensions.map(sub => {
    const envRow  = envByCode.get(sub.code)
    const userRow = rowByCode.get(sub.code)

    // Employer nem töltötte ki ezt az aldimenziót
    if (!envRow) {
      return {
        subDimensionCode: sub.code,
        status:           'UNKNOWN' as const,
        dataConfidence:   'MISSING' as const,
        explanationKey:   ExplKey.EMPLOYER_MISSING,
        employerValue:    null,
      }
    }

    const empVal = toEmployerValue(envRow, sub)

    // User nem töltötte ki ezt az aldimenziót (nincs mentett sor)
    if (!userRow) {
      return {
        subDimensionCode: sub.code,
        status:           'UNKNOWN' as const,
        dataConfidence:   empVal !== null ? envRow.data_source : 'MISSING',
        explanationKey:   ExplKey.USER_PREF_MISSING,
        employerValue:    empVal,
      }
    }

    const userPref = toUserPreference(userRow, sub)

    // Type-safe dispatch – exhaustive switch, compile-time guard
    switch (sub.comparison_type) {
      case 'HIGHER_IS_MORE_DEMANDING':
        return handleHI(
          sub.code,
          empVal as OrdinalEmployerValue | null,
          userPref as OrdinalUserPreference,
        )

      case 'RANGE_PREFERENCE':
        return handleRP(
          sub.code,
          empVal as OrdinalEmployerValue | null,
          userPref as OrdinalUserPreference,
        )

      case 'SET_MEMBERSHIP':
        return handleSM(
          sub.code,
          empVal as CategoricalEmployerValue | null,
          userPref as SetUserPreference,
        )

      case 'BOOLEAN_PREFERENCE':
        return handleBP(
          sub.code,
          empVal as BooleanEmployerValue | null,
          userPref as BooleanUserPreference,
        )

      case 'FREQUENCY_RANGE':
        return handleFR(
          sub.code,
          empVal as FrequencyEmployerValue | null,
          userPref as FrequencyUserPreference,
          sub.frequency_options ?? [],
        )
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary – darabszám alapú összegzés (NEM percentage, NEM score)
// ─────────────────────────────────────────────────────────────────────────────

export interface CompatibilitySummary {
  strong_fit:  number
  acceptable:  number
  clarify:     number
  load_point:  number
  unknown:     number
  total:       number
}

export function buildCompatibilitySummary(results: CompatibilityResult[]): CompatibilitySummary {
  const counts = { strong_fit: 0, acceptable: 0, clarify: 0, load_point: 0, unknown: 0 }
  for (const r of results) {
    switch (r.status) {
      case 'STRONG_FIT': counts.strong_fit++;  break
      case 'ACCEPTABLE': counts.acceptable++;  break
      case 'CLARIFY':    counts.clarify++;     break
      case 'LOAD_POINT': counts.load_point++;  break
      case 'UNKNOWN':    counts.unknown++;     break
    }
  }
  return { ...counts, total: results.length }
}
