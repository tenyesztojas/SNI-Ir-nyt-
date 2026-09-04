/**
 * Védett Karrier – Employer Domain Types
 * Sprint 4
 *
 * KRITIKUS HATÁROK:
 * - Employer NEM lát user career_profile_dimensions / user_skills / career_interests adatot
 * - Nincs compatibility score, suitability, inkluzivitási pontszám
 * - Nincs autizmusbarát / ADHD-barát / neurodivergens-barát minősítés
 * - EmployerDimensionValue NEM user preference – a munkakör TÉNYLEGES értéke
 */

// ─────────────────────────────────────────────────────────────────────────────
// Employer (reusing VM employers table – only technical fields)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployerRow {
  id: string
  user_id: string
  company_name: string
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended'
  website: string | null
  contact_name: string | null
  contact_email: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Workplace Location
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkplaceRow {
  id: string
  employer_id: string
  name_hu: string
  description_hu: string | null
  city: string | null
  address_line: string | null
  district: string | null
  country_code: string
  workplace_type: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateWorkplaceInput {
  name_hu: string
  city?: string
  address_line?: string
  district?: string
  workplace_type?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Role
// ─────────────────────────────────────────────────────────────────────────────

export type JobRoleStatus = 'draft' | 'active' | 'archived'

export interface JobRoleRow {
  id: string
  employer_id: string
  workplace_id: string | null
  title_hu: string
  description_hu: string | null
  employment_type: string | null
  status: JobRoleStatus
  job_family_slug: string | null
  industry_slug: string | null
  summary_hu: string | null
  main_tasks_json: string[]
  profile_completion_pct: number
  profile_version_hash: string | null
  last_saved_step: number
  published_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateJobRoleInput {
  title_hu: string
  workplace_id?: string
  job_family_slug?: string
  industry_slug?: string
  summary_hu?: string
  main_tasks_json?: string[]
  employment_type?: string
}

export interface UpdateJobRoleBasicsInput {
  title_hu?: string
  workplace_id?: string | null
  job_family_slug?: string | null
  industry_slug?: string | null
  summary_hu?: string | null
  main_tasks_json?: string[]
  employment_type?: string | null
  last_saved_step?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Employer VKMM Dimension Values
// Sprint 4: employer csak a munkakör TÉNYLEGES értékét adja meg.
// NEM user preference. NEM preferred_max. NEM acceptable range.
// ─────────────────────────────────────────────────────────────────────────────

export type DataSource = 'SELF_REPORTED' | 'CONFIRMED'

export interface OrdinalEmployerValue {
  type: 'ordinal'
  value: number          // 1–5 (or seed range)
  dataSource: DataSource
}

export interface CategoricalEmployerValue {
  type: 'categorical'
  value: string          // must be in categorical_options_json
  dataSource: DataSource
}

export interface BooleanEmployerValue {
  type: 'boolean'
  value: boolean         // false IS a valid value — never treat as missing
  dataSource: DataSource
}

export interface FrequencyEmployerValue {
  type: 'frequency'
  value: string          // must be in frequency_options_json
  dataSource: DataSource
}

export type EmployerDimensionValue =
  | OrdinalEmployerValue
  | CategoricalEmployerValue
  | BooleanEmployerValue
  | FrequencyEmployerValue

// ─────────────────────────────────────────────────────────────────────────────
// Job Role Env Value (DB row)
// ─────────────────────────────────────────────────────────────────────────────

export interface JobRoleEnvValueRow {
  id: string
  job_role_id: string
  sub_dimension_code: string
  ordinal_value: number | null
  categorical_value: string | null
  boolean_value: boolean | null    // false IS valid (never null-check as falsy)
  frequency_value: string | null
  data_source: DataSource
  employer_note: string | null     // NEVER public
  public_context_note: string | null
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface SaveDimensionValueInput {
  jobRoleId: string
  subDimensionCode: string
  value: EmployerDimensionValue
  employerNote?: string
  publicContextNote?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation Gate
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivationGateResult {
  canActivate: boolean
  missingItems: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard step map (UX grouping – does NOT change VKMM taxonomy)
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_STEP_LABELS: Record<number, string> = {
  1: 'Munkakör alapadatai',
  2: 'Környezet és ingerek',
  3: 'Kommunikáció és emberek',
  4: 'Feladatok és kiszámíthatóság',
  5: 'Munkarend, tempó és önállóság',
  6: 'Támogatás és fizikai feltételek',
  7: 'Ellenőrzés és Munkakör-térkép',
}

// UX-only grouping: dimension_code arrays per step
export const WIZARD_STEP_DIMENSIONS: Record<number, string[]> = {
  2: ['env'],
  3: ['comm', 'social'],
  4: ['task_struct', 'task_dyn'],
  5: ['time', 'autonomy'],
  6: ['support', 'physical', 'location'],
}

export const WIZARD_TOTAL_STEPS = 7
