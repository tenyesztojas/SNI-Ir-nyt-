/**
 * Védett Karrier – Munkaprofil Wizard Types
 * Sprint 2 – Munkaprofil
 *
 * Ezek a típusok a wizard kliensoldalon lévő állapotát írják le.
 * A DB row típusok: lib/vedett-karrier/types/index.ts – CareerProfileRow, career_profile_dimensions
 */

import type { ImportanceLevel, VkmmDimension, VkmmSubDimension } from '../types/index'

// ─────────────────────────────────────────────────────────────────────────────
// Wizard input értékek – comparison_type alapján különböző struktúra
// ─────────────────────────────────────────────────────────────────────────────

/** HI: max-only input (preferred_max, acceptable_max) */
export interface HiInput {
  type: 'hi'
  preferred_max_value: number | null
  acceptable_max_value: number | null
}

/** RP: four-bound range (acceptable_min ≤ preferred_min ≤ preferred_max ≤ acceptable_max) */
export interface RpInput {
  type: 'rp'
  preferred_min_value: number | null
  preferred_max_value: number | null
  acceptable_min_value: number | null
  acceptable_max_value: number | null
}

/** SM: two sets (preferred ⊆ acceptable) */
export interface SmInput {
  type: 'sm'
  preferred_categories: string[]
  acceptable_categories: string[]
}

/**
 * BP: four explicit states
 * preferred_boolean = true  → Igen, ezt preferálom
 * preferred_boolean = false → Nem ezt preferálom (de acceptable_boolean_values meghatározza)
 * preferred_boolean = null  → Mindegy (indifferent → ACCEPTABLE)
 *
 * KRITIKUS: false ≠ null!
 */
export interface BpInput {
  type: 'bp'
  preferred_boolean: boolean | null
  acceptable_boolean_values: boolean[]
}

/** FR: ordered domain range (min/max from frequency_options order) */
export interface FrInput {
  type: 'fr'
  preferred_min_frequency: string | null
  preferred_max_frequency: string | null
  acceptable_min_frequency: string | null
  acceptable_max_frequency: string | null
}

export type DimensionValueInput = HiInput | RpInput | SmInput | BpInput | FrInput

// ─────────────────────────────────────────────────────────────────────────────
// Wizard sub-dimension state
// ─────────────────────────────────────────────────────────────────────────────

export interface SubDimState {
  subDimensionCode: string
  importanceLevel: ImportanceLevel
  unknown: boolean            // "Nem tudom / még nincs tapasztalatom"
  userNote: string            // privát – nem employer-visible, nem AI prompt
  value: DimensionValueInput
  /** true ha dirty (lokálisan módosult, de még nincs mentve) */
  dirty: boolean
  /** true ha sikeresen mentve a DB-be */
  saved: boolean
  saveError: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard globális állapot
// ─────────────────────────────────────────────────────────────────────────────

export interface WizardState {
  careerProfileId: string
  currentDimensionIndex: number   // 0–9
  /** sub_dimension_code → SubDimState */
  subDimStates: Record<string, SubDimState>
  completionPct: number           // 0–100
  isSaving: boolean
  lastSavedAt: Date | null
  showSummary: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Page props típusok (Server Component → Client Component átadás)
// ─────────────────────────────────────────────────────────────────────────────

/** A DB-ből visszatöltött mentett preferencia (career_profile_dimensions row alakja) */
export interface SavedDimensionRow {
  sub_dimension_code: string
  importance_level: ImportanceLevel
  is_unknown: boolean
  user_note: string | null
  preferred_max_value: number | null
  acceptable_max_value: number | null
  preferred_min_value: number | null
  acceptable_min_value: number | null
  preferred_categories_json: string[] | null
  acceptable_categories_json: string[] | null
  preferred_boolean: boolean | null
  acceptable_boolean_json: boolean[] | null
  preferred_min_frequency: string | null
  preferred_max_frequency: string | null
  acceptable_min_frequency: string | null
  acceptable_max_frequency: string | null
}

/** Wizard inicializáláshoz szükséges szerver adat */
export interface WizardInitData {
  careerProfileId: string
  dimensions: VkmmDimension[]
  subDimensions: VkmmSubDimension[]
  savedRows: SavedDimensionRow[]
  completionPct: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Action payload
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveDimensionPayload {
  careerProfileId: string
  subDimensionCode: string
  importanceLevel: ImportanceLevel
  unknown: boolean
  userNote: string | null
  // typed value fields (exactly the ones relevant for the comparison_type)
  preferred_max_value?: number | null
  acceptable_max_value?: number | null
  preferred_min_value?: number | null
  acceptable_min_value?: number | null
  preferred_categories_json?: string[] | null
  acceptable_categories_json?: string[] | null
  preferred_boolean?: boolean | null
  acceptable_boolean_json?: boolean[] | null
  preferred_min_frequency?: string | null
  preferred_max_frequency?: string | null
  acceptable_min_frequency?: string | null
  acceptable_max_frequency?: string | null
}

export interface SaveDimensionResult {
  ok: boolean
  error?: string
  completionPct?: number
  versionHash?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile summary sentence types
// ─────────────────────────────────────────────────────────────────────────────

export interface SummaryItem {
  dimensionCode: string
  dimensionName: string
  sentences: string[]
}

export interface ProfileSummaryData {
  items: SummaryItem[]
  completionPct: number
  answeredCount: number
  totalCount: number
}
