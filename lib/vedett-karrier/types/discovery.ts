/**
 * Védett Karrier – Career Discovery Types
 * Sprint 3
 *
 * KRITIKUS: nincs score, percentage, rank, suitability mező a public output-ban.
 * A displayPriorityTuple ephemeral belső fogalom, soha nem kerül DB-be vagy employer elé.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Skill taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export type SkillCategory = 'digital' | 'manual' | 'cognitive' | 'interpersonal' | 'physical'

export type SkillProficiency = 'learning' | 'basic' | 'intermediate' | 'advanced'

export interface SkillRow {
  id: string
  code: string
  name_hu: string
  category: SkillCategory
  is_trainable: boolean
  display_order: number
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Job families
// ─────────────────────────────────────────────────────────────────────────────

export interface JobFamilyRow {
  id: string
  slug: string
  name_hu: string
  description_hu: string
  task_pattern_summary: string
  typical_tasks_json: string[]
  core_skills_json: string[]        // skill codes
  trainable_skills_json: string[]   // skill codes
  example_roles_json: string[]
  entry_threshold_description: string
  growth_paths_json: string[]
  display_order: number
  is_active: boolean
}

export interface JobFamilyEnvProfileRow {
  id: string
  job_family_id: string
  profile_entries: FamilyEnvEntry[]
  notes_hu: string | null
}

export interface FamilyEnvEntry {
  sub_dimension_code: string
  typical_ordinal?: number | null
  typical_category?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// User skill
// ─────────────────────────────────────────────────────────────────────────────

export interface UserSkillRow {
  id: string
  user_id: string
  skill_id: string
  skill_code: string       // joined from skills table
  skill_name_hu: string    // joined
  skill_category: SkillCategory  // joined
  proficiency: SkillProficiency
  is_confident: boolean
  enjoys_it: boolean
  experience_years: number | null
  acquisition_note: string | null
}

export interface SaveUserSkillPayload {
  skillCode: string
  proficiency: SkillProficiency
  isConfident: boolean
  enjoysIt: boolean
  experienceYears?: number | null
  acquisitionNote?: string | null
}

export interface SaveUserSkillResult {
  ok: boolean
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Career interest
// ─────────────────────────────────────────────────────────────────────────────

export type InterestLevel = 'curious' | 'interested' | 'strong'

export interface CareerInterestRow {
  id: string
  user_id: string
  job_family_id: string
  job_family_slug: string   // joined
  interest_level: InterestLevel
  has_experience: boolean
}

export interface SaveCareerInterestPayload {
  jobFamilySlug: string
  interestLevel: InterestLevel
  hasExperience: boolean
}

export interface SaveCareerInterestResult {
  ok: boolean
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Career Discovery Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reason codes – miért mutatjuk ezt a munkakörcsaládot.
 * Frontend fordítja közérthető szövegre.
 */
export type DiscoveryReasonCode =
  | 'has_skills'
  | 'interest_match'
  | 'env_overlap'
  | 'trainable_skills'

/**
 * Public discovery result.
 * NINCS: score, percentage, rank, rank_score, suitability, match_score.
 */
export interface CareerDiscoveryResult {
  jobFamily: JobFamilyRow
  reason_codes: DiscoveryReasonCode[]
  // Accessible summary info (no numbers that feel like scores)
  matchedSkillCodes: string[]     // user skills that connect to this family
  trainableSkillCodes: string[]   // skills user could develop
}

/**
 * Belső prioritás-tuple – ephemeral, soha nem kerül DB-be vagy employer elé.
 * 0 = explicit érdeklődés; 1 = készség-kapcsolat; 2 = env-overlap
 * Alacsonyabb = előrébb kerül.
 */
export type DisplayPriorityTuple = [number, number, number, string]  // [tier, -skillCount, -envCount, slug]

// ─────────────────────────────────────────────────────────────────────────────
// Light Skill Bridge
// ─────────────────────────────────────────────────────────────────────────────

export interface LightSkillBridgeResult {
  alreadyHave: SkillRow[]       // Már megvan
  developNext: SkillRow[]       // Érdemes fejleszteni (trainable, hiányzó)
  nextStepText: string          // Determinisztikus következő lépés szöveg
}

// ─────────────────────────────────────────────────────────────────────────────
// Insufficient data signal
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveryOutput {
  hasEnoughData: boolean
  results: CareerDiscoveryResult[]     // 3–5 db, vagy üres ha nincs elég adat
}
