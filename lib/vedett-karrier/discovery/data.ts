/**
 * Védett Karrier – Career Discovery data assembly
 * Sprint 3
 *
 * Assembles DiscoveryInput from DB for a given user.
 * user_skills and career_interests: user-only (RLS enforced).
 * job_families and job_family_env_profile: public reference data.
 */

import { createClient } from '@/lib/supabase/server'
import { getAllJobFamilies } from '../families/data'
import { loadUserSkills } from '../skills/data'
import { loadCareerInterests } from '../interests/data'
import type { DiscoveryInput } from './engine'
import type { JobFamilyEnvProfileRow } from '../types/discovery'

/**
 * Assembles all discovery input for a user.
 * env overlap computation is lightweight — just counts matching ordinal buckets.
 */
export async function assembleDiscoveryInput(userId: string): Promise<DiscoveryInput> {
  const [families, userSkills, careerInterests] = await Promise.all([
    getAllJobFamilies(),
    loadUserSkills(userId),
    loadCareerInterests(userId),
  ])

  // Load env profiles for overlap computation
  const supabase = await createClient()
  const { data: envProfiles } = await supabase
    .from('job_family_env_profile')
    .select('job_family_id, profile_entries')

  const envProfileMap = new Map<string, JobFamilyEnvProfileRow>()
  for (const p of (envProfiles ?? [])) {
    envProfileMap.set(p.job_family_id, {
      ...p,
      profile_entries: Array.isArray(p.profile_entries) ? p.profile_entries : [],
    } as JobFamilyEnvProfileRow)
  }

  // Compute env overlap counts per family slug
  // (simplified: count env_profile entries that exist — full VKMM overlap
  //  would require career_profile_dimensions join, out of scope for Sprint 3 UI)
  const familyEnvOverlapCounts: Record<string, number> = {}
  for (const family of families) {
    const envProfile = envProfileMap.get(family.id)
    familyEnvOverlapCounts[family.slug] = envProfile?.profile_entries.length ?? 0
  }

  return { families, userSkills, careerInterests, familyEnvOverlapCounts }
}
