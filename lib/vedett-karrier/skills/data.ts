/**
 * Védett Karrier – User Skills data access
 * Sprint 3 – Server-side only
 *
 * user_skills: user-only. Employer NEM érheti el.
 */

import { createClient } from '@/lib/supabase/server'
import type { UserSkillRow, SkillRow, SaveUserSkillPayload, SaveUserSkillResult } from '../types/discovery'

/**
 * Loads all skills reference data (public).
 */
export async function getAllSkills(): Promise<SkillRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  if (error) return []
  return data as SkillRow[]
}

/**
 * Loads the authenticated user's saved skills.
 * RLS enforces ownership — service_role not used.
 */
export async function loadUserSkills(userId: string): Promise<UserSkillRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_skills')
    .select(`
      id,
      user_id,
      skill_id,
      proficiency,
      is_confident,
      enjoys_it,
      experience_years,
      acquisition_note,
      skills!inner(code, name_hu, category)
    `)
    .eq('user_id', userId)
  if (error) return []
  return (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    skill_id: row.skill_id,
    skill_code: row.skills.code,
    skill_name_hu: row.skills.name_hu,
    skill_category: row.skills.category,
    proficiency: row.proficiency,
    is_confident: row.is_confident,
    enjoys_it: row.enjoys_it,
    experience_years: row.experience_years,
    acquisition_note: row.acquisition_note,
  }))
}

/**
 * Upserts a user skill. Validates skill code exists first.
 * NEM logol acquisition_note tartalmát.
 */
export async function upsertUserSkill(
  userId: string,
  payload: SaveUserSkillPayload
): Promise<SaveUserSkillResult> {
  const supabase = await createClient()

  // Look up skill id from code
  const { data: skillRow, error: skillErr } = await supabase
    .from('skills')
    .select('id')
    .eq('code', payload.skillCode)
    .eq('is_active', true)
    .single()

  if (skillErr || !skillRow) {
    return { ok: false, error: 'Érvénytelen készség kód.' }
  }

  const { error } = await supabase
    .from('user_skills')
    .upsert({
      user_id: userId,
      skill_id: skillRow.id,
      proficiency: payload.proficiency,
      is_confident: payload.isConfident,
      enjoys_it: payload.enjoysIt,
      experience_years: payload.experienceYears ?? null,
      acquisition_note: payload.acquisitionNote ?? null,
    }, { onConflict: 'user_id,skill_id' })

  if (error) {
    return { ok: false, error: 'A készség mentése nem sikerült.' }
  }
  return { ok: true }
}

/**
 * Removes a user skill.
 */
export async function deleteUserSkill(
  userId: string,
  skillCode: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: skillRow } = await supabase
    .from('skills')
    .select('id')
    .eq('code', skillCode)
    .single()

  if (!skillRow) return { ok: false, error: 'Ismeretlen készség.' }

  const { error } = await supabase
    .from('user_skills')
    .delete()
    .eq('user_id', userId)
    .eq('skill_id', skillRow.id)

  if (error) return { ok: false, error: 'Törlés nem sikerült.' }
  return { ok: true }
}
