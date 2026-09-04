/**
 * Védett Karrier – Career Interests data access
 * Sprint 3 – Server-side only
 *
 * career_interests: user-only. Employer NEM érheti el.
 * Az érdeklődés NEM alkalmassági adat.
 */

import { createClient } from '@/lib/supabase/server'
import type { CareerInterestRow, SaveCareerInterestPayload, SaveCareerInterestResult } from '../types/discovery.js'

/**
 * Loads all career interests for the authenticated user.
 */
export async function loadCareerInterests(userId: string): Promise<CareerInterestRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('career_interests')
    .select(`
      id,
      user_id,
      job_family_id,
      interest_level,
      has_experience,
      job_families!inner(slug)
    `)
    .eq('user_id', userId)

  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    job_family_id: row.job_family_id,
    job_family_slug: row.job_families.slug,
    interest_level: row.interest_level,
    has_experience: row.has_experience,
  }))
}

/**
 * Upserts a career interest for a job family.
 */
export async function upsertCareerInterest(
  userId: string,
  payload: SaveCareerInterestPayload
): Promise<SaveCareerInterestResult> {
  const supabase = await createClient()

  const { data: familyRow, error: familyErr } = await supabase
    .from('job_families')
    .select('id')
    .eq('slug', payload.jobFamilySlug)
    .eq('is_active', true)
    .single()

  if (familyErr || !familyRow) {
    return { ok: false, error: 'Ismeretlen munkakörcsalád.' }
  }

  const { error } = await supabase
    .from('career_interests')
    .upsert({
      user_id: userId,
      job_family_id: familyRow.id,
      interest_level: payload.interestLevel,
      has_experience: payload.hasExperience,
    }, { onConflict: 'user_id,job_family_id' })

  if (error) {
    return { ok: false, error: 'Az érdeklődés mentése nem sikerült.' }
  }
  return { ok: true }
}

/**
 * Removes a career interest.
 */
export async function deleteCareerInterest(
  userId: string,
  jobFamilySlug: string
): Promise<SaveCareerInterestResult> {
  const supabase = await createClient()

  const { data: familyRow } = await supabase
    .from('job_families')
    .select('id')
    .eq('slug', jobFamilySlug)
    .single()

  if (!familyRow) return { ok: false, error: 'Ismeretlen munkakörcsalád.' }

  const { error } = await supabase
    .from('career_interests')
    .delete()
    .eq('user_id', userId)
    .eq('job_family_id', familyRow.id)

  if (error) return { ok: false, error: 'Törlés nem sikerült.' }
  return { ok: true }
}
