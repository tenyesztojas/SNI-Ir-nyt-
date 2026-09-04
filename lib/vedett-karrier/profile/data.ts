/**
 * Védett Karrier – Munkaprofil DB Data Access
 * Sprint 2
 *
 * Csak server-side (Server Components + Server Actions).
 * RLS backstop: minden query authenticated user kontextusban fut.
 */

import { createClient } from '@/lib/supabase/server'
import type { SavedDimensionRow } from './types.js'
import { computeCompletionPct, computeProfileVersionHash } from './completion.js'
import { VKMM_SEED } from '../seed/vkmm-seed.js'

const TOTAL_SUB_DIM_COUNT = VKMM_SEED.subDimensions.length // 51

// ─────────────────────────────────────────────────────────────────────────────
// Career profile – get or create
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreateCareerProfile(userId: string): Promise<{
  id: string
  completion_pct: number
  profile_version_hash: string | null
} | null> {
  const supabase = createClient()

  // Aktív profil keresése
  const { data: existing } = await supabase
    .from('career_profiles')
    .select('id, profile_version_hash')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    // completion_pct újraszámolás (runtime)
    const dims = await loadSavedDimensions(existing.id)
    const completion_pct = computeCompletionPct(dims, TOTAL_SUB_DIM_COUNT)
    return { id: existing.id, completion_pct, profile_version_hash: existing.profile_version_hash }
  }

  // Nincs aktív profil → létrehozás
  const { data: created, error } = await supabase
    .from('career_profiles')
    .insert({
      user_id: userId,
      is_active: true,
      profile_version_hash: null,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[VK] career_profile creation failed:', error?.message)
    return null
  }

  return { id: created.id, completion_pct: 0, profile_version_hash: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load saved dimension rows
// ─────────────────────────────────────────────────────────────────────────────

export async function loadSavedDimensions(careerProfileId: string): Promise<SavedDimensionRow[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('career_profile_dimensions')
    .select(`
      sub_dimension_code,
      importance_level,
      is_unknown,
      user_note,
      preferred_max_value,
      acceptable_max_value,
      preferred_min_value,
      acceptable_min_value,
      preferred_categories_json,
      acceptable_categories_json,
      preferred_boolean,
      acceptable_boolean_json,
      preferred_min_frequency,
      preferred_max_frequency,
      acceptable_min_frequency,
      acceptable_max_frequency
    `)
    .eq('career_profile_id', careerProfileId)

  if (error) {
    console.error('[VK] loadSavedDimensions error:', error.message)
    return []
  }

  // Type cast: DB returns jsonb as array already parsed by supabase client
  return (data ?? []).map(row => ({
    sub_dimension_code: row.sub_dimension_code,
    importance_level: row.importance_level as SavedDimensionRow['importance_level'],
    is_unknown: row.is_unknown,
    user_note: row.user_note,
    preferred_max_value: row.preferred_max_value,
    acceptable_max_value: row.acceptable_max_value,
    preferred_min_value: row.preferred_min_value,
    acceptable_min_value: row.acceptable_min_value,
    preferred_categories_json: row.preferred_categories_json as string[] | null,
    acceptable_categories_json: row.acceptable_categories_json as string[] | null,
    // boolean false IS valid – explicit cast
    preferred_boolean: row.preferred_boolean as boolean | null,
    acceptable_boolean_json: row.acceptable_boolean_json as boolean[] | null,
    preferred_min_frequency: row.preferred_min_frequency,
    preferred_max_frequency: row.preferred_max_frequency,
    acceptable_min_frequency: row.acceptable_min_frequency,
    acceptable_max_frequency: row.acceptable_max_frequency,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert single dimension preference
// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertDimensionInput {
  career_profile_id: string
  sub_dimension_code: string
  importance_level: string
  is_unknown: boolean
  user_note: string | null
  preferred_max_value?: number | null
  acceptable_max_value?: number | null
  preferred_min_value?: number | null
  acceptable_min_value?: number | null
  preferred_categories_json?: string[] | null
  acceptable_categories_json?: string[] | null
  preferred_boolean?: boolean | null
  acceptable_boolean_json?: boolean[] | null
  preferred_min_frequency?: string | null
  preferred_max_frequency?: string | null
  acceptable_min_frequency?: string | null
  acceptable_max_frequency?: string | null
}

export async function upsertDimensionPreference(input: UpsertDimensionInput): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('career_profile_dimensions')
    .upsert(
      {
        career_profile_id: input.career_profile_id,
        sub_dimension_code: input.sub_dimension_code,
        importance_level: input.importance_level,
        is_unknown: input.is_unknown,
        user_note: input.user_note,
        preferred_max_value: input.preferred_max_value ?? null,
        acceptable_max_value: input.acceptable_max_value ?? null,
        preferred_min_value: input.preferred_min_value ?? null,
        acceptable_min_value: input.acceptable_min_value ?? null,
        preferred_categories_json: input.preferred_categories_json ?? null,
        acceptable_categories_json: input.acceptable_categories_json ?? null,
        preferred_boolean: input.preferred_boolean ?? null,
        acceptable_boolean_json: input.acceptable_boolean_json ?? null,
        preferred_min_frequency: input.preferred_min_frequency ?? null,
        preferred_max_frequency: input.preferred_max_frequency ?? null,
        acceptable_min_frequency: input.acceptable_min_frequency ?? null,
        acceptable_max_frequency: input.acceptable_max_frequency ?? null,
      },
      { onConflict: 'career_profile_id,sub_dimension_code' }
    )

  if (error) {
    console.error('[VK] upsertDimensionPreference error:', error.message)
    // DB trigger error (validation) – return user-friendly message, not raw SQL
    if (error.message.includes('validate_career_profile')) {
      return { error: 'A megadott értékek nem érvényesek erre a dimenzióra.' }
    }
    return { error: 'Mentési hiba. Kérjük, próbáld újra.' }
  }

  return { error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update career profile version hash + updated_at
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProfileVersionHash(
  careerProfileId: string,
  savedRows: SavedDimensionRow[]
): Promise<void> {
  const supabase = createClient()
  const hash = computeProfileVersionHash(savedRows)

  await supabase
    .from('career_profiles')
    .update({ profile_version_hash: hash })
    .eq('id', careerProfileId)
}
