/**
 * Védett Karrier – Domain Types
 * Forrás: Technical Implementation Plan V1.1 FINAL + errata
 * Sprint 1 – Foundation
 *
 * FONTOS:
 * - Nincs `any` a core VKMM domainben
 * - boolean false = valid employer érték (soha nem falsy-check)
 * - Discriminated union minden typed value-hoz
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums / literal unions
// ─────────────────────────────────────────────────────────────────────────────

export type ComparisonType =
  | 'HIGHER_IS_MORE_DEMANDING'
  | 'RANGE_PREFERENCE'
  | 'SET_MEMBERSHIP'
  | 'BOOLEAN_PREFERENCE'
  | 'FREQUENCY_RANGE'

export type ValueType = 'ordinal' | 'categorical' | 'boolean' | 'frequency'

export type DataConfidence = 'CONFIRMED' | 'SELF_REPORTED' | 'MISSING'

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'essential'

export type CompatibilityStatus =
  | 'STRONG_FIT'
  | 'ACCEPTABLE'
  | 'CLARIFY'
  | 'LOAD_POINT'
  | 'UNKNOWN'

// ─────────────────────────────────────────────────────────────────────────────
// VKMM reference types
// ─────────────────────────────────────────────────────────────────────────────

export interface VkmmDimension {
  code: string
  name_hu: string
  display_order: number
  is_active: boolean
}

export interface OrdinalLabel {
  v: number
  label: string
}

export interface VkmmSubDimension {
  code: string
  dimension_code: string
  name_user_hu: string
  name_employer_hu: string
  display_order: number
  value_type: ValueType
  comparison_type: ComparisonType
  // ordinal (HI / RP)
  ordinal_min?: number
  ordinal_max?: number
  ordinal_labels?: OrdinalLabel[]
  // categorical (SM)
  categorical_options?: string[]
  categorical_labels?: Record<string, string>
  // frequency (FR)
  frequency_options?: string[]
  frequency_labels?: Record<string, string>
  // metadata
  user_question_hu: string
  employer_question_hu: string
  clarification_key?: string
  sensitive_risk: 'low' | 'medium' | 'high'
  default_importance: ImportanceLevel
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Employer dimension values – discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export interface OrdinalEmployerValue {
  type: 'ordinal'
  value: number
  dataConfidence: DataConfidence
}

export interface CategoricalEmployerValue {
  type: 'categorical'
  value: string
  dataConfidence: DataConfidence
}

/** boolean false IS a valid employer value – never treat as missing */
export interface BooleanEmployerValue {
  type: 'boolean'
  value: boolean
  dataConfidence: DataConfidence
}

export interface FrequencyEmployerValue {
  type: 'frequency'
  value: string
  dataConfidence: DataConfidence
}

export type EmployerDimensionValue =
  | OrdinalEmployerValue
  | CategoricalEmployerValue
  | BooleanEmployerValue
  | FrequencyEmployerValue
  | null  // null = missing → UNKNOWN

// ─────────────────────────────────────────────────────────────────────────────
// User dimension preferences – discriminated union
// ─────────────────────────────────────────────────────────────────────────────

interface BaseUserPreference {
  subDimensionCode: string
  importanceLevel: ImportanceLevel
  unknown: boolean
  userNote?: string
}

/** HI: only max thresholds; RP: full 4-field range */
export interface OrdinalUserPreference extends BaseUserPreference {
  type: 'ordinal'
  comparisonType: 'HIGHER_IS_MORE_DEMANDING' | 'RANGE_PREFERENCE'
  /** HI: comfortable up to this level */
  preferred_max_value: number | null
  /** HI: can stretch to this level */
  acceptable_max_value: number | null
  /** RP only */
  preferred_min_value: number | null
  /** RP only */
  acceptable_min_value: number | null
}

export interface SetUserPreference extends BaseUserPreference {
  type: 'categorical'
  preferred_categories: string[]
  acceptable_categories: string[]
}

/**
 * null = indifferent → ACCEPTABLE (never STRONG_FIT)
 * boolean false IS a valid preference
 */
export interface BooleanUserPreference extends BaseUserPreference {
  type: 'boolean'
  preferred_boolean: boolean | null
  acceptable_boolean_values: boolean[]
}

export interface FrequencyUserPreference extends BaseUserPreference {
  type: 'frequency'
  preferred_min_frequency: string | null
  preferred_max_frequency: string | null
  acceptable_min_frequency: string | null
  acceptable_max_frequency: string | null
}

export type UserDimensionPreference =
  | OrdinalUserPreference
  | SetUserPreference
  | BooleanUserPreference
  | FrequencyUserPreference

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility result
// ─────────────────────────────────────────────────────────────────────────────

export interface CompatibilityResult {
  subDimensionCode: string
  status: CompatibilityStatus
  dataConfidence: DataConfidence
  explanationKey: string
  clarificationKey?: string
  /** Employer value as typed union (for UI display only) */
  employerValue: EmployerDimensionValue
}

// ─────────────────────────────────────────────────────────────────────────────
// Career profile
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerProfileRow {
  id: string
  user_id: string
  display_name: string | null
  is_active: boolean
  profile_version_hash: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Job role env value (DB row shape)
// ─────────────────────────────────────────────────────────────────────────────

/** Exactly one of the typed columns is non-null. boolean_value=false IS valid. */
export interface JobRoleEnvValueRow {
  id: string
  job_role_id: string
  sub_dimension_code: string
  ordinal_value: number | null
  categorical_value: string | null
  boolean_value: boolean | null   // false is valid!
  frequency_value: string | null
  data_source: DataConfidence
  employer_note: string | null
  public_context_note: string | null
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guard helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safely checks if employer value is present (boolean false IS present) */
export function isEmployerValuePresent(
  val: EmployerDimensionValue
): val is Exclude<EmployerDimensionValue, null> {
  return val !== null
}

/** Safely checks boolean_value (false is NOT missing) */
export function isBooleanValueMissing(booleanValue: boolean | null | undefined): boolean {
  return booleanValue === null || booleanValue === undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed types
// ─────────────────────────────────────────────────────────────────────────────

export interface VkmmSeedData {
  dimensions: VkmmDimension[]
  subDimensions: VkmmSubDimension[]
  schemaVersion: string
}
