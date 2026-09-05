/**
 * Védett Karrier – Opportunity Data Access
 * Sprint 6
 *
 * Server-only. Hívható server component-ből vagy server action-ből.
 *
 * Authorization réteg:
 * 1. auth check (caller felelőssége)
 * 2. employer ownership (ez a réteg ellenőrzi)
 * 3. RLS backstop (Supabase policy szinten is)
 *
 * KRITIKUS:
 * - Employer csak saját lehetőségeit érheti el
 * - Publikus lista: csak status='active' (RLS backstop)
 * - User NEM küld profiladatot munkáltatónak
 * - Nincs belső ATS / jelöltpipeline
 */

import { createClient } from '../../supabase/server'
import type {
  JobOpportunityRow,
  CreateOpportunityInput,
  UpdateOpportunityInput,
} from '../types/opportunity'

// ─────────────────────────────────────────────────────────────────────────────
// Publikus lista (user / anon)
// ─────────────────────────────────────────────────────────────────────────────

/** Aktív lehetőségek listája (publikusan elérhető). */
export async function getActiveOpportunities(): Promise<JobOpportunityRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getActiveOpportunities: ${error.message}`)
  return (data ?? []) as JobOpportunityRow[]
}

/** Egy aktív lehetőség részletei (publikusan elérhető). */
export async function getOpportunityById(id: string): Promise<JobOpportunityRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getOpportunityById: ${error.message}`)
  return data as JobOpportunityRow | null
}

/** Lehetőségek egy adott munkakör alatt (publikusan elérhető, csak active). */
export async function getActiveOpportunitiesByJobRole(
  jobRoleId: string,
): Promise<JobOpportunityRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .select('*')
    .eq('job_role_id', jobRoleId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getActiveOpportunitiesByJobRole: ${error.message}`)
  return (data ?? []) as JobOpportunityRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Employer oldal (saját lehetőségek)
// ─────────────────────────────────────────────────────────────────────────────

/** Employer saját lehetőségei (minden státusz). Ownership: employer_id check. */
export async function getOpportunitiesByEmployerId(
  employerId: string,
): Promise<JobOpportunityRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .select('*')
    .eq('employer_id', employerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getOpportunitiesByEmployerId: ${error.message}`)
  return (data ?? []) as JobOpportunityRow[]
}

/** Employer egy saját lehetősége (ownership check: employer_id egyezés). */
export async function getOpportunityByIdForEmployer(
  id: string,
  employerId: string,
): Promise<JobOpportunityRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .select('*')
    .eq('id', id)
    .eq('employer_id', employerId)
    .maybeSingle()
  if (error) throw new Error(`getOpportunityByIdForEmployer: ${error.message}`)
  return data as JobOpportunityRow | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes (employer)
// ─────────────────────────────────────────────────────────────────────────────

export async function createOpportunity(
  employerId: string,
  input: CreateOpportunityInput,
): Promise<JobOpportunityRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .insert({
      employer_id:                 employerId,
      job_role_id:                 input.job_role_id,
      status:                      'draft',
      title_override_hu:           input.title_override_hu ?? null,
      description_hu:              input.description_hu,
      requirements_hu:             input.requirements_hu ?? null,
      application_method:          input.application_method,
      application_url:             input.application_url ?? null,
      application_email:           input.application_email ?? null,
      application_instructions_hu: input.application_instructions_hu ?? null,
      contact_person_name:         input.contact_person_name ?? null,
      contact_person_title:        input.contact_person_title ?? null,
      valid_from:                  input.valid_from ?? null,
      valid_until:                 input.valid_until ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`createOpportunity: ${error.message}`)
  return data as JobOpportunityRow
}

export async function updateOpportunity(
  id: string,
  employerId: string,
  input: UpdateOpportunityInput,
): Promise<JobOpportunityRow> {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {}
  if (input.title_override_hu           !== undefined) patch.title_override_hu           = input.title_override_hu
  if (input.description_hu              !== undefined) patch.description_hu              = input.description_hu
  if (input.requirements_hu             !== undefined) patch.requirements_hu             = input.requirements_hu
  if (input.application_method          !== undefined) patch.application_method          = input.application_method
  if (input.application_url             !== undefined) patch.application_url             = input.application_url
  if (input.application_email           !== undefined) patch.application_email           = input.application_email
  if (input.application_instructions_hu !== undefined) patch.application_instructions_hu = input.application_instructions_hu
  if (input.contact_person_name         !== undefined) patch.contact_person_name         = input.contact_person_name
  if (input.contact_person_title        !== undefined) patch.contact_person_title        = input.contact_person_title
  if (input.valid_from                  !== undefined) patch.valid_from                  = input.valid_from
  if (input.valid_until                 !== undefined) patch.valid_until                 = input.valid_until

  const { data, error } = await supabase
    .from('vk_opportunities')
    .update(patch)
    .eq('id', id)
    .eq('employer_id', employerId)   // ownership check
    .select()
    .single()
  if (error) throw new Error(`updateOpportunity: ${error.message}`)
  return data as JobOpportunityRow
}

/** draft → active (csak draft állapotból). */
export async function activateOpportunity(
  id: string,
  employerId: string,
): Promise<JobOpportunityRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .update({ status: 'active' })
    .eq('id', id)
    .eq('employer_id', employerId)
    .eq('status', 'draft')           // csak draft → active
    .select()
    .single()
  if (error) throw new Error(`activateOpportunity: ${error.message}`)
  return data as JobOpportunityRow
}

/** active → closed (visszafordíthatatlan státuszváltás; NEM törlés). */
export async function closeOpportunity(
  id: string,
  employerId: string,
): Promise<JobOpportunityRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_opportunities')
    .update({ status: 'closed' })
    .eq('id', id)
    .eq('employer_id', employerId)
    .eq('status', 'active')          // csak active → closed
    .select()
    .single()
  if (error) throw new Error(`closeOpportunity: ${error.message}`)
  return data as JobOpportunityRow
}
