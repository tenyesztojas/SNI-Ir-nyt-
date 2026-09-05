/**
 * Védett Karrier – Compatibility Results DB Data Access
 * Sprint 5
 *
 * User csak saját eredményét érheti el (RLS backstop).
 * Employer NEM fér hozzá – nincs employer policy a táblán.
 * service_role key NEM kerül kliensre.
 */

import { createClient } from '@/lib/supabase/server'
import type { CompatibilityResult } from '../types/index'

export const COMPATIBILITY_ENGINE_VERSION = '1.0.0'

// ─────────────────────────────────────────────────────────────────────────────
// DB sor típusa
// ─────────────────────────────────────────────────────────────────────────────

export interface CompatibilityResultRow {
  id:                             string
  user_id:                        string
  career_profile_id:              string
  career_profile_version_hash:    string
  job_role_id:                    string
  job_role_profile_version_hash:  string
  compatibility_engine_version:   string
  dimension_results:              CompatibilityResult[]
  created_at:                     string
  updated_at:                     string
}

// ─────────────────────────────────────────────────────────────────────────────
// Tárolt eredmény betöltése (lehet elavult)
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCompatibilityResult(
  userId: string,
  jobRoleId: string,
): Promise<CompatibilityResultRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vk_compatibility_results')
    .select('*')
    .eq('user_id', userId)
    .eq('job_role_id', jobRoleId)
    .maybeSingle()

  if (error) {
    console.error('[VK] loadCompatibilityResult error:', error.message)
    return null
  }
  if (!data) return null

  return {
    ...data,
    dimension_results: data.dimension_results as CompatibilityResult[],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale detection
// Ha bármelyik hash eltér, vagy engine version változott → stale
// ─────────────────────────────────────────────────────────────────────────────

export function isResultStale(
  stored: CompatibilityResultRow,
  currentCareerHash: string | null,
  currentJobRoleHash: string | null,
): boolean {
  if (!currentCareerHash || !currentJobRoleHash) return true
  return (
    stored.career_profile_version_hash   !== currentCareerHash ||
    stored.job_role_profile_version_hash !== currentJobRoleHash ||
    stored.compatibility_engine_version  !== COMPATIBILITY_ENGINE_VERSION
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Eredmény mentése / frissítése (upsert user+role kombinációra)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertCompatibilityResult(input: {
  userId:                      string
  careerProfileId:             string
  careerProfileVersionHash:    string
  jobRoleId:                   string
  jobRoleProfileVersionHash:   string
  dimensionResults:            CompatibilityResult[]
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('vk_compatibility_results')
    .upsert(
      {
        user_id:                        input.userId,
        career_profile_id:              input.careerProfileId,
        career_profile_version_hash:    input.careerProfileVersionHash,
        job_role_id:                    input.jobRoleId,
        job_role_profile_version_hash:  input.jobRoleProfileVersionHash,
        compatibility_engine_version:   COMPATIBILITY_ENGINE_VERSION,
        dimension_results:              input.dimensionResults,
      },
      { onConflict: 'user_id,job_role_id' },
    )

  if (error) {
    console.error('[VK] upsertCompatibilityResult error:', error.message)
    return { error: 'Mentési hiba. Kérjük, próbáld újra.' }
  }
  return { error: null }
}
