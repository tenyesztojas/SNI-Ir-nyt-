'use server'
/**
 * Védett Karrier – User Skills Server Actions
 * Sprint 3
 *
 * acquisition_note: privát, nem logoljuk, nem kerül employer elé.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { upsertUserSkill, deleteUserSkill } from './data.js'
import type { SaveUserSkillResult } from '../types/discovery.js'

const SaveSkillSchema = z.object({
  skillCode: z.string().min(1).max(100),
  proficiency: z.enum(['learning', 'basic', 'intermediate', 'advanced']),
  isConfident: z.boolean(),
  enjoysIt: z.boolean(),
  experienceYears: z.number().min(0).max(60).nullable().optional(),
  acquisitionNote: z.string().max(500).nullable().optional(),
})

export async function saveUserSkill(rawInput: unknown): Promise<SaveUserSkillResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nem vagy bejelentkezve.' }

  const parsed = SaveSkillSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: 'Érvénytelen adat.' }
  }

  return upsertUserSkill(user.id, parsed.data)
}

export async function removeUserSkill(skillCode: string): Promise<SaveUserSkillResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nem vagy bejelentkezve.' }

  if (!skillCode || typeof skillCode !== 'string') {
    return { ok: false, error: 'Érvénytelen készség kód.' }
  }

  return deleteUserSkill(user.id, skillCode)
}
