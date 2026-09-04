/**
 * Védett Karrier – Employer Data Access
 * Sprint 4
 *
 * Server-only. Minden függvény server component-ből vagy server action-ből hívható.
 * Soha ne kerüljön kliensoldalra.
 *
 * Authorization réteg:
 * 1. auth check (caller felelőssége)
 * 2. employer ownership (ez a réteg ellenőrzi)
 * 3. RLS backstop (Supabase policy szinten is)
 */

import { createClient } from '../../supabase/server'
import type {
  EmployerRow,
  WorkplaceRow,
  JobRoleRow,
  JobRoleEnvValueRow,
  CreateWorkplaceInput,
  CreateJobRoleInput,
  UpdateJobRoleBasicsInput,
} from '../types/employer'

// ─────────────────────────────────────────────────────────────────────────────
// Employer lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Visszaadja a bejelentkezett user employer rekordját (VM employers tábla). */
export async function getEmployerByUserId(userId: string): Promise<EmployerRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('employers')
    .select('id, user_id, company_name, status, website, contact_name, contact_email, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getEmployerByUserId: ${error.message}`)
  return data as EmployerRow | null
}

/** Ellenőrzi, hogy az employer approved státuszban van-e. */
export function isEmployerApproved(employer: EmployerRow | null): boolean {
  return employer?.status === 'approved'
}

// ─────────────────────────────────────────────────────────────────────────────
// Workplace locations
// ─────────────────────────────────────────────────────────────────────────────

export async function getWorkplacesByEmployerId(employerId: string): Promise<WorkplaceRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_employer_workplaces')
    .select('*')
    .eq('employer_id', employerId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`getWorkplacesByEmployerId: ${error.message}`)
  return (data ?? []) as WorkplaceRow[]
}

export async function createWorkplace(
  employerId: string,
  input: CreateWorkplaceInput
): Promise<WorkplaceRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_employer_workplaces')
    .insert({
      employer_id: employerId,
      name_hu: input.name_hu,
      city: input.city ?? null,
      address_line: input.address_line ?? null,
      district: input.district ?? null,
      workplace_type: input.workplace_type ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`createWorkplace: ${error.message}`)
  return data as WorkplaceRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Roles
// ─────────────────────────────────────────────────────────────────────────────

export async function getJobRolesByEmployerId(employerId: string): Promise<JobRoleRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .select('*')
    .eq('employer_id', employerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getJobRolesByEmployerId: ${error.message}`)
  return (data ?? []) as JobRoleRow[]
}

export async function getJobRoleById(roleId: string): Promise<JobRoleRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .select('*')
    .eq('id', roleId)
    .maybeSingle()
  if (error) throw new Error(`getJobRoleById: ${error.message}`)
  return data as JobRoleRow | null
}

/** Csak saját role visszaadása (ownership check). */
export async function getJobRoleByIdForEmployer(
  roleId: string,
  employerId: string
): Promise<JobRoleRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .select('*')
    .eq('id', roleId)
    .eq('employer_id', employerId)
    .maybeSingle()
  if (error) throw new Error(`getJobRoleByIdForEmployer: ${error.message}`)
  return data as JobRoleRow | null
}

export async function createJobRole(
  employerId: string,
  input: CreateJobRoleInput
): Promise<JobRoleRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .insert({
      employer_id: employerId,
      title_hu: input.title_hu,
      workplace_id: input.workplace_id ?? null,
      job_family_slug: input.job_family_slug ?? null,
      industry_slug: input.industry_slug ?? null,
      summary_hu: input.summary_hu ?? null,
      main_tasks_json: input.main_tasks_json ?? [],
      employment_type: input.employment_type ?? null,
      status: 'draft',
    })
    .select()
    .single()
  if (error) throw new Error(`createJobRole: ${error.message}`)
  return data as JobRoleRow
}

export async function updateJobRoleBasics(
  roleId: string,
  employerId: string,
  input: UpdateJobRoleBasicsInput
): Promise<JobRoleRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .update({
      ...(input.title_hu !== undefined && { title_hu: input.title_hu }),
      ...(input.workplace_id !== undefined && { workplace_id: input.workplace_id }),
      ...(input.job_family_slug !== undefined && { job_family_slug: input.job_family_slug }),
      ...(input.industry_slug !== undefined && { industry_slug: input.industry_slug }),
      ...(input.summary_hu !== undefined && { summary_hu: input.summary_hu }),
      ...(input.main_tasks_json !== undefined && { main_tasks_json: input.main_tasks_json }),
      ...(input.employment_type !== undefined && { employment_type: input.employment_type }),
      ...(input.last_saved_step !== undefined && { last_saved_step: input.last_saved_step }),
    })
    .eq('id', roleId)
    .eq('employer_id', employerId)   // ownership check
    .select()
    .single()
  if (error) throw new Error(`updateJobRoleBasics: ${error.message}`)
  return data as JobRoleRow
}

export async function updateJobRoleCompletionAndHash(
  roleId: string,
  employerId: string,
  completionPct: number,
  versionHash: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('vk_job_roles')
    .update({ profile_completion_pct: completionPct, profile_version_hash: versionHash })
    .eq('id', roleId)
    .eq('employer_id', employerId)
  if (error) throw new Error(`updateJobRoleCompletionAndHash: ${error.message}`)
}

export async function activateJobRole(roleId: string, employerId: string): Promise<JobRoleRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vk_job_roles')
    .update({ status: 'active', published_at: new Date().toISOString() })
    .eq('id', roleId)
    .eq('employer_id', employerId)
    .eq('status', 'draft')           // csak draft → active
    .select()
    .single()
  if (error) throw new Error(`activateJobRole: ${error.message}`)
  return data as JobRoleRow
}

// ─────────────────────────────────────────────────────────────────────────────
// VKMM Env Values
// ─────────────────────────────────────────────────────────────────────────────

export async function getEnvValuesByJobRoleId(roleId: string): Promise<JobRoleEnvValueRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_role_env_values')
    .select('*')
    .eq('job_role_id', roleId)
    .order('sub_dimension_code', { ascending: true })
  if (error) throw new Error(`getEnvValuesByJobRoleId: ${error.message}`)
  return (data ?? []) as JobRoleEnvValueRow[]
}

/** Upsert egy sub_dimension értéket. Ellenőrzi az ownership-et a join-on keresztül. */
export async function upsertEnvValue(
  jobRoleId: string,
  employerId: string,
  subDimensionCode: string,
  ordinalValue: number | null,
  categoricalValue: string | null,
  booleanValue: boolean | null,
  frequencyValue: string | null,
  dataSource: 'SELF_REPORTED' | 'CONFIRMED',
  employerNote: string | null,
  publicContextNote: string | null
): Promise<JobRoleEnvValueRow> {
  // Ownership check: verify job role belongs to employer before upsert
  const role = await getJobRoleByIdForEmployer(jobRoleId, employerId)
  if (!role) throw new Error('upsertEnvValue: job role nem található vagy nincs jogosultság')

  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_role_env_values')
    .upsert(
      {
        job_role_id: jobRoleId,
        sub_dimension_code: subDimensionCode,
        ordinal_value: ordinalValue,
        categorical_value: categoricalValue,
        boolean_value: booleanValue,
        frequency_value: frequencyValue,
        data_source: dataSource,
        employer_note: employerNote,
        public_context_note: publicContextNote,
        last_reviewed_at: new Date().toISOString(),
      },
      {
        onConflict: 'job_role_id,sub_dimension_code',
      }
    )
    .select()
    .single()
  if (error) throw new Error(`upsertEnvValue: ${error.message}`)
  return data as JobRoleEnvValueRow
}
