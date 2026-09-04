'use server'
/**
 * Védett Karrier – Kompatibilitás Server Actions
 * Sprint 5
 *
 * computeAndSaveCompatibility:
 *   auth → profil → aktív munkakör → user dimenziók → employer értékek
 *   → engine → DB mentés (verzióhash-ekhez kötve)
 *
 * KRITIKUS:
 * - User profil adat NEM kerül a munkáltatóhoz
 * - Érzékeny user adat NEM kerül logba
 * - service_role key soha nem kerül kliensre
 * - Employer NEM fér hozzá a compatibility_results táblához (RLS)
 */

import { createClient } from '../../../../lib/supabase/server'
import { loadSavedDimensions } from '../../../../lib/vedett-karrier/profile/data'
import { getJobRoleById, getEnvValuesByJobRoleId } from '../../../../lib/vedett-karrier/employer/data'
import { VKMM_SUB_DIMENSIONS } from '../../../../lib/vedett-karrier/seed/vkmm-seed'
import {
  computeCompatibility,
  buildCompatibilitySummary,
  type CompatibilitySummary,
} from '../../../../lib/vedett-karrier/compatibility/engine'
import {
  upsertCompatibilityResult,
  COMPATIBILITY_ENGINE_VERSION,
} from '../../../../lib/vedett-karrier/compatibility/data'
import type { CompatibilityResult } from '../../../../lib/vedett-karrier/types'

export interface ComputeCompatibilityActionResult {
  ok:                         boolean
  error?:                     string
  results?:                   CompatibilityResult[]
  summary?:                   CompatibilitySummary
  careerProfileVersionHash?:  string | null
  jobRoleProfileVersionHash?: string | null
  engineVersion?:             string
}

export async function computeAndSaveCompatibility(
  jobRoleId: string,
): Promise<ComputeCompatibilityActionResult> {
  const supabase = createClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  // Aktív munkakör betöltése (csak active role → user compatible)
  const role = await getJobRoleById(jobRoleId)
  if (!role) return { ok: false, error: 'A munkakör nem található.' }
  if (role.status !== 'active') return { ok: false, error: 'A munkakör nem aktív – kompatibilitás csak aktív munkakörre számítható.' }

  // User aktív karrierprofil
  const { data: profileData, error: profileErr } = await supabase
    .from('career_profiles')
    .select('id, profile_version_hash')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (profileErr || !profileData) {
    return { ok: false, error: 'Nincs aktív karrierprofil. Töltsd ki a Munkaprofilodat.' }
  }

  const careerProfileId   = profileData.id
  const careerHash        = profileData.profile_version_hash
  const jobRoleHash       = role.profile_version_hash ?? ''

  // User dimenziók betöltése (privát adat – NEM kerül munkáltatóhoz)
  const savedRows   = await loadSavedDimensions(careerProfileId)

  // Employer VKMM értékek
  const envValues   = await getEnvValuesByJobRoleId(jobRoleId)

  const activeSubs  = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)

  // Engine futtatása (determinisztikus, NOT AI)
  const dimensionResults = computeCompatibility(savedRows, envValues, activeSubs)
  const summary          = buildCompatibilitySummary(dimensionResults)

  // Eredmény mentése (verzióhash-ekhez kötve)
  const { error: saveError } = await upsertCompatibilityResult({
    userId:                   user.id,
    careerProfileId,
    careerProfileVersionHash: careerHash ?? '',
    jobRoleId,
    jobRoleProfileVersionHash: jobRoleHash,
    dimensionResults,
  })

  if (saveError) return { ok: false, error: saveError }

  // Csak technikai log – NEM logolunk user preferencia adatot
  console.log('[VK] compatibility computed', {
    role_id: jobRoleId,
    engine_version: COMPATIBILITY_ENGINE_VERSION,
    total: dimensionResults.length,
  })

  return {
    ok: true,
    results: dimensionResults,
    summary,
    careerProfileVersionHash:  careerHash,
    jobRoleProfileVersionHash: jobRoleHash,
    engineVersion: COMPATIBILITY_ENGINE_VERSION,
  }
}
