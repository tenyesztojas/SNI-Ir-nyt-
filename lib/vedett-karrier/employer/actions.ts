'use server'
/**
 * Védett Karrier – Employer Server Actions
 * Sprint 4
 *
 * Authorization sorrend minden write action-ben:
 * 1. auth check
 * 2. employer record + ownership
 * 3. employer approval (ahol szükséges)
 * 4. Zod validation
 * 5. DB write (RLS backstop)
 * 6. completion + hash újraszámítás
 *
 * TILOS: service_role key kliensoldalon, RLS kikapcsolás,
 * user career profile adatok olvasása employer action-ből.
 */

import { z } from 'zod'
import { createClient } from '../../supabase/server.js'
import {
  getEmployerByUserId,
  isEmployerApproved,
  getJobRoleByIdForEmployer,
  getEnvValuesByJobRoleId,
  createJobRole as dbCreateJobRole,
  updateJobRoleBasics as dbUpdateJobRoleBasics,
  upsertEnvValue as dbUpsertEnvValue,
  activateJobRole as dbActivateJobRole,
  updateJobRoleCompletionAndHash,
  createWorkplace as dbCreateWorkplace,
} from './data.js'
import { computeProfileCompletionPct } from './completion.js'
import { computeRoleProfileHash } from './hash.js'
import type {
  CreateJobRoleInput,
  UpdateJobRoleBasicsInput,
  EmployerDimensionValue,
  ActivationGateResult,
} from '../types/employer.js'

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const CreateJobRoleSchema = z.object({
  title_hu: z.string().min(2).max(200),
  workplace_id: z.string().uuid().optional(),
  job_family_slug: z.string().max(100).optional(),
  industry_slug: z.string().max(100).optional(),
  summary_hu: z.string().max(1000).optional(),
  main_tasks_json: z.array(z.string().max(300)).max(20).optional(),
  employment_type: z.string().max(50).optional(),
})

const UpdateBasicsSchema = z.object({
  roleId: z.string().uuid(),
  title_hu: z.string().min(2).max(200).optional(),
  workplace_id: z.string().uuid().nullable().optional(),
  job_family_slug: z.string().max(100).nullable().optional(),
  industry_slug: z.string().max(100).nullable().optional(),
  summary_hu: z.string().max(1000).nullable().optional(),
  main_tasks_json: z.array(z.string().max(300)).max(20).optional(),
  employment_type: z.string().max(50).nullable().optional(),
  last_saved_step: z.number().int().min(0).max(7).optional(),
})

// Ordinal: 1–5 (seed range; DB trigger validates exact range)
const OrdinalValueSchema = z.object({ type: z.literal('ordinal'), value: z.number().int().min(1).max(5), dataSource: z.enum(['SELF_REPORTED','CONFIRMED']) })
const CategoricalValueSchema = z.object({ type: z.literal('categorical'), value: z.string().min(1).max(100), dataSource: z.enum(['SELF_REPORTED','CONFIRMED']) })
const BooleanValueSchema = z.object({ type: z.literal('boolean'), value: z.boolean(), dataSource: z.enum(['SELF_REPORTED','CONFIRMED']) })
const FrequencyValueSchema = z.object({ type: z.literal('frequency'), value: z.string().min(1).max(100), dataSource: z.enum(['SELF_REPORTED','CONFIRMED']) })
const EmployerDimensionValueSchema = z.union([OrdinalValueSchema, CategoricalValueSchema, BooleanValueSchema, FrequencyValueSchema])

const SaveDimensionSchema = z.object({
  roleId: z.string().uuid(),
  subDimensionCode: z.string().min(2).max(100),
  value: EmployerDimensionValueSchema,
  employerNote: z.string().max(500).optional(),
  publicContextNote: z.string().max(500).optional(),
})

const CreateWorkplaceSchema = z.object({
  name_hu: z.string().min(2).max(200),
  city: z.string().max(100).optional(),
  address_line: z.string().max(200).optional(),
  district: z.string().max(100).optional(),
  workplace_type: z.string().max(50).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

async function getAuthAndEmployer(): Promise<
  { ok: true; userId: string; employerId: string; approved: boolean } |
  { ok: false; error: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }

  const employer = await getEmployerByUserId(user.id)
  if (!employer) return { ok: false, error: 'Nem találtunk munkáltatói fiókot.' }

  return { ok: true, userId: user.id, employerId: employer.id, approved: isEmployerApproved(employer) }
}

async function refreshCompletionAndHash(roleId: string, employerId: string): Promise<void> {
  const role = await getJobRoleByIdForEmployer(roleId, employerId)
  if (!role) return
  const envValues = await getEnvValuesByJobRoleId(roleId)
  const pct = computeProfileCompletionPct(envValues)
  const hash = await computeRoleProfileHash({
    title_hu: role.title_hu,
    job_family_slug: role.job_family_slug,
    industry_slug: role.industry_slug,
    employment_type: role.employment_type,
    envValues,
  })
  await updateJobRoleCompletionAndHash(roleId, employerId, pct, hash)
}

// ─────────────────────────────────────────────────────────────────────────────
// Workplace actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createWorkplace(
  raw: unknown
): Promise<ActionResult<{ id: string; name_hu: string }>> {
  const auth = await getAuthAndEmployer()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.approved) return { ok: false, error: 'A munkáltatói fiók még nincs jóváhagyva.' }

  const parsed = CreateWorkplaceSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.' }

  try {
    const wp = await dbCreateWorkplace(auth.employerId, parsed.data)
    return { ok: true, data: { id: wp.id, name_hu: wp.name_hu } }
  } catch (e) {
    return { ok: false, error: 'Telephely létrehozása sikertelen.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Role actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createJobRole(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await getAuthAndEmployer()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.approved) return { ok: false, error: 'A munkáltatói fiók még nincs jóváhagyva.' }

  const parsed = CreateJobRoleSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.' }

  try {
    const role = await dbCreateJobRole(auth.employerId, parsed.data as CreateJobRoleInput)
    return { ok: true, data: { id: role.id } }
  } catch (e) {
    return { ok: false, error: 'Munkakör létrehozása sikertelen.' }
  }
}

export async function updateJobRoleBasics(
  raw: unknown
): Promise<ActionResult<void>> {
  const auth = await getAuthAndEmployer()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.approved) return { ok: false, error: 'A munkáltatói fiók még nincs jóváhagyva.' }

  const parsed = UpdateBasicsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.' }

  const { roleId, ...update } = parsed.data

  try {
    await dbUpdateJobRoleBasics(roleId, auth.employerId, update as UpdateJobRoleBasicsInput)
    // refresh hash after basics change
    await refreshCompletionAndHash(roleId, auth.employerId)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Mentés sikertelen.' }
  }
}

export async function saveJobRoleDimension(
  raw: unknown
): Promise<ActionResult<{ completionPct: number }>> {
  const auth = await getAuthAndEmployer()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.approved) return { ok: false, error: 'A munkáltatói fiók még nincs jóváhagyva.' }

  const parsed = SaveDimensionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Érvénytelen adat.' }

  const { roleId, subDimensionCode, value, employerNote, publicContextNote } = parsed.data

  // Typed null routing
  let ordinalValue: number | null = null
  let categoricalValue: string | null = null
  let booleanValue: boolean | null = null
  let frequencyValue: string | null = null

  if (value.type === 'ordinal')      ordinalValue = value.value
  if (value.type === 'categorical')  categoricalValue = value.value
  if (value.type === 'boolean')      booleanValue = value.value  // false IS valid
  if (value.type === 'frequency')    frequencyValue = value.value

  try {
    await dbUpsertEnvValue(
      roleId, auth.employerId, subDimensionCode,
      ordinalValue, categoricalValue, booleanValue, frequencyValue,
      value.dataSource,
      employerNote ?? null,
      publicContextNote ?? null
    )
    // Recompute completion + hash
    await refreshCompletionAndHash(roleId, auth.employerId)
    const envValues = await getEnvValuesByJobRoleId(roleId)
    return { ok: true, data: { completionPct: computeProfileCompletionPct(envValues) } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // surface DB trigger error if it's about validation
    if (msg.includes('job_role_env_values:')) {
      return { ok: false, error: `Érvénytelen érték: ${msg.split(':').pop()?.trim() ?? 'ismeretlen hiba'}` }
    }
    return { ok: false, error: 'Mentés sikertelen.' }
  }
}

export async function activateJobRole(
  roleId: string
): Promise<ActionResult<void>> {
  const auth = await getAuthAndEmployer()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.approved) return { ok: false, error: 'A munkáltatói fiók még nincs jóváhagyva.' }

  const role = await getJobRoleByIdForEmployer(roleId, auth.employerId)
  if (!role) return { ok: false, error: 'Munkakör nem található.' }

  const gate = checkActivationGate(role)
  if (!gate.canActivate) {
    return { ok: false, error: `Még hiányzik: ${gate.missingItems.join(', ')}` }
  }

  try {
    await dbActivateJobRole(roleId, auth.employerId)
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Aktiválás sikertelen.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation gate (server-side ellenőrzés)
// ─────────────────────────────────────────────────────────────────────────────

export function checkActivationGate(role: {
  title_hu: string
  workplace_id: string | null
  job_family_slug: string | null
  summary_hu: string | null
  main_tasks_json: string[]
  profile_completion_pct: number
  status: string
}): ActivationGateResult {
  const missing: string[] = []

  if (!role.title_hu?.trim()) missing.push('Munkakör megnevezése')
  if (!role.workplace_id) missing.push('Telephely')
  if (!role.job_family_slug) missing.push('Munkakörcsalád')
  if (!role.summary_hu?.trim()) missing.push('Tényszerű összefoglaló')
  if (!role.main_tasks_json || role.main_tasks_json.length === 0) missing.push('Fő feladatok')
  if (role.profile_completion_pct < 80) {
    missing.push(`VKMM profil kitöltése (jelenlegi: ${role.profile_completion_pct}%, minimum: 80%)`)
  }

  return { canActivate: missing.length === 0, missingItems: missing }
}
