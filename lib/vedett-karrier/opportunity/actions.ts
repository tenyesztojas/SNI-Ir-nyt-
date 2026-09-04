'use server'
/**
 * Védett Karrier – Opportunity Server Actions
 * Sprint 6
 *
 * Authorization sorrend minden write action-ben:
 * 1. auth check
 * 2. employer record + ownership (approved státusz ellenőrzése)
 * 3. Zod validation
 * 4. DB write (RLS backstop)
 *
 * TILOS:
 * - service_role key kliensoldalon
 * - RLS kikapcsolás
 * - user career profile adatok olvasása employer action-ből
 * - Jelöltrangsor, pontszám, alkalmassági értékelés
 */

import { z } from 'zod'
import { createClient } from '../../supabase/server'
import { getEmployerByUserId, isEmployerApproved, getJobRoleByIdForEmployer } from '../employer/data'
import {
  createOpportunity as dbCreate,
  updateOpportunity as dbUpdate,
  activateOpportunity as dbActivate,
  closeOpportunity as dbClose,
  getOpportunityByIdForEmployer,
} from './data'
import type {
  OpportunityActionResult,
  CreateOpportunityInput,
  UpdateOpportunityInput,
} from '../types/opportunity'

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const ApplicationMethodSchema = z.enum(['EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS'])

const CreateOpportunitySchema = z.object({
  job_role_id:                 z.string().uuid(),
  title_override_hu:           z.string().max(300).nullish(),
  description_hu:              z.string().min(10).max(5000),
  requirements_hu:             z.string().max(3000).nullish(),
  application_method:          ApplicationMethodSchema,
  application_url:             z.string().url().max(2000)
                                 .refine(
                                   u => u.startsWith('https://') || u.startsWith('http://'),
                                   { message: 'Az alkalmazási URL csak http:// vagy https:// protokollal kezdődhet.' }
                                 ).nullish(),
  application_email:           z.string().email().max(300).nullish(),
  application_instructions_hu: z.string().max(2000).nullish(),
  contact_person_name:         z.string().max(200).nullish(),
  contact_person_title:        z.string().max(200).nullish(),
  valid_from:                  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  valid_until:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
})

const UpdateOpportunitySchema = CreateOpportunitySchema
  .omit({ job_role_id: true })
  .partial()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveApprovedEmployer(userId: string) {
  const employer = await getEmployerByUserId(userId)
  if (!employer) return { employer: null, error: 'Munkáltatói profil nem található.' }
  if (!isEmployerApproved(employer)) return { employer: null, error: 'A munkáltatói profil még nem jóváhagyott.' }
  return { employer, error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// createJobOpportunity
// ─────────────────────────────────────────────────────────────────────────────

export async function createJobOpportunity(
  rawInput: CreateOpportunityInput,
): Promise<OpportunityActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  const { employer, error: empErr } = await resolveApprovedEmployer(user.id)
  if (empErr || !employer) return { ok: false, error: empErr ?? 'Ismeretlen hiba.' }

  const parsed = CreateOpportunitySchema.safeParse(rawInput)
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join('; ')
    return { ok: false, error: `Érvénytelen adat: ${msg}` }
  }

  // Ownership: a job role az employer-hez tartozik-e?
  const role = await getJobRoleByIdForEmployer(parsed.data.job_role_id, employer.id)
  if (!role) return { ok: false, error: 'A munkakör nem található vagy nincs jogosultság.' }
  if (role.status !== 'active') return { ok: false, error: 'Lehetőség csak aktív munkakörre hozható létre.' }

  try {
    const data = await dbCreate(employer.id, parsed.data as CreateOpportunityInput)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Adatbázis hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateJobOpportunity
// ─────────────────────────────────────────────────────────────────────────────

export async function updateJobOpportunity(
  opportunityId: string,
  rawInput: UpdateOpportunityInput,
): Promise<OpportunityActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  const { employer, error: empErr } = await resolveApprovedEmployer(user.id)
  if (empErr || !employer) return { ok: false, error: empErr ?? 'Ismeretlen hiba.' }

  const parsed = UpdateOpportunitySchema.safeParse(rawInput)
  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => e.message).join('; ')
    return { ok: false, error: `Érvénytelen adat: ${msg}` }
  }

  // Ownership check
  const existing = await getOpportunityByIdForEmployer(opportunityId, employer.id)
  if (!existing) return { ok: false, error: 'A lehetőség nem található vagy nincs jogosultság.' }
  if (existing.status === 'closed') return { ok: false, error: 'Lezárt lehetőség nem szerkeszthető.' }

  try {
    const data = await dbUpdate(opportunityId, employer.id, parsed.data as UpdateOpportunityInput)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Adatbázis hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// activateJobOpportunity
// ─────────────────────────────────────────────────────────────────────────────

export async function activateJobOpportunity(
  opportunityId: string,
): Promise<OpportunityActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  const { employer, error: empErr } = await resolveApprovedEmployer(user.id)
  if (empErr || !employer) return { ok: false, error: empErr ?? 'Ismeretlen hiba.' }

  const existing = await getOpportunityByIdForEmployer(opportunityId, employer.id)
  if (!existing) return { ok: false, error: 'A lehetőség nem található vagy nincs jogosultság.' }
  if (existing.status !== 'draft') return { ok: false, error: 'Csak piszkozat státuszú lehetőség aktiválható.' }

  // Aktiválás előtt: description_hu és application_method kötelező
  if (!existing.description_hu?.trim()) return { ok: false, error: 'A leírás kitöltése kötelező az aktiváláshoz.' }
  if (!existing.application_method) return { ok: false, error: 'A kapcsolatfelvétel módjának megadása kötelező az aktiváláshoz.' }

  try {
    const data = await dbActivate(opportunityId, employer.id)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Adatbázis hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// closeJobOpportunity
// ─────────────────────────────────────────────────────────────────────────────

export async function closeJobOpportunity(
  opportunityId: string,
): Promise<OpportunityActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  const { employer, error: empErr } = await resolveApprovedEmployer(user.id)
  if (empErr || !employer) return { ok: false, error: empErr ?? 'Ismeretlen hiba.' }

  const existing = await getOpportunityByIdForEmployer(opportunityId, employer.id)
  if (!existing) return { ok: false, error: 'A lehetőség nem található vagy nincs jogosultság.' }
  if (existing.status !== 'active') return { ok: false, error: 'Csak aktív lehetőség zárható le.' }

  try {
    const data = await dbClose(opportunityId, employer.id)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Adatbázis hiba.' }
  }
}
