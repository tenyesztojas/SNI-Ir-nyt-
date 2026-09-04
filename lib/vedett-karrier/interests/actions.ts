'use server'
/**
 * Védett Karrier – Career Interests Server Actions
 * Sprint 3
 *
 * Az érdeklődés NEM alkalmassági adat.
 * Employer NEM látja.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { upsertCareerInterest, deleteCareerInterest } from './data'
import type { SaveCareerInterestResult } from '../types/discovery'

const SaveInterestSchema = z.object({
  jobFamilySlug: z.string().min(1).max(100),
  interestLevel: z.enum(['curious', 'interested', 'strong']),
  hasExperience: z.boolean(),
})

export async function saveCareerInterest(rawInput: unknown): Promise<SaveCareerInterestResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nem vagy bejelentkezve.' }

  const parsed = SaveInterestSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: 'Érvénytelen adat.' }
  }

  return upsertCareerInterest(user.id, parsed.data)
}

export async function removeCareerInterest(jobFamilySlug: string): Promise<SaveCareerInterestResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nem vagy bejelentkezve.' }

  if (!jobFamilySlug || typeof jobFamilySlug !== 'string') {
    return { ok: false, error: 'Érvénytelen munkakörcsalád.' }
  }

  return deleteCareerInterest(user.id, jobFamilySlug)
}
