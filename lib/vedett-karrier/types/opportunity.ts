/**
 * Védett Karrier – Job Opportunity Types
 * Sprint 6
 *
 * JobOpportunity = egy aktív munkakörre feladott, időhöz kötött lehetőség.
 * Elkülönül a JobRole-tól: a munkakör permanens VKMM-leírás,
 * a lehetőség időhöz kötött hirdetés.
 *
 * KRITIKUS:
 * - Nincs belső ATS / jelöltpipeline
 * - Nincs suitability score, ranking, jelöltszűrés
 * - User NEM küld profiladatot a munkáltatónak implicit módon
 * - Kapcsolatfelvétel KÜLSŐ (URL / email / utasítás)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type OpportunityStatus = 'draft' | 'active' | 'closed'

export type ApplicationMethod =
  | 'EXTERNAL_URL'
  | 'EMAIL'
  | 'CONTACT_INSTRUCTIONS'

// ─────────────────────────────────────────────────────────────────────────────
// DB row
// ─────────────────────────────────────────────────────────────────────────────

export interface JobOpportunityRow {
  id:                          string
  employer_id:                 string
  job_role_id:                 string
  status:                      OpportunityStatus
  title_override_hu:           string | null
  description_hu:              string
  requirements_hu:             string | null
  application_method:          ApplicationMethod
  application_url:             string | null
  application_email:           string | null
  application_instructions_hu: string | null
  contact_person_name:         string | null
  contact_person_title:        string | null
  valid_from:                  string | null  // ISO date
  valid_until:                 string | null  // ISO date
  created_at:                  string
  updated_at:                  string
}

// ─────────────────────────────────────────────────────────────────────────────
// Input types for create / update
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateOpportunityInput {
  job_role_id:                 string
  title_override_hu?:          string | null
  description_hu:              string
  requirements_hu?:            string | null
  application_method:          ApplicationMethod
  application_url?:            string | null
  application_email?:          string | null
  application_instructions_hu?: string | null
  contact_person_name?:        string | null
  contact_person_title?:       string | null
  valid_from?:                 string | null
  valid_until?:                string | null
}

export interface UpdateOpportunityInput {
  title_override_hu?:          string | null
  description_hu?:             string
  requirements_hu?:            string | null
  application_method?:         ApplicationMethod
  application_url?:            string | null
  application_email?:          string | null
  application_instructions_hu?: string | null
  contact_person_name?:        string | null
  contact_person_title?:       string | null
  valid_from?:                 string | null
  valid_until?:                string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Action result wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunityActionResult {
  ok:       boolean
  error?:   string
  data?:    JobOpportunityRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Public-safe view (strip internal employer fields if any future ones exist)
// Currently JobOpportunityRow is already public-safe – no private employer_note
// ─────────────────────────────────────────────────────────────────────────────

export type PublicOpportunityRow = JobOpportunityRow
