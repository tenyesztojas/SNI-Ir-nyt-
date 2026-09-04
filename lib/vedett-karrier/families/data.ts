/**
 * Védett Karrier – Job Families data access
 * Sprint 3 – Server-side only
 */

import { createClient } from '@/lib/supabase/server'
import type { JobFamilyRow, JobFamilyEnvProfileRow } from '../types/discovery'

export async function getAllJobFamilies(): Promise<JobFamilyRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_families')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  if (error) return []
  return (data ?? []).map((row: any) => ({
    ...row,
    typical_tasks_json:    Array.isArray(row.typical_tasks_json)    ? row.typical_tasks_json    : [],
    core_skills_json:      Array.isArray(row.core_skills_json)      ? row.core_skills_json      : [],
    trainable_skills_json: Array.isArray(row.trainable_skills_json) ? row.trainable_skills_json : [],
    example_roles_json:    Array.isArray(row.example_roles_json)    ? row.example_roles_json    : [],
    growth_paths_json:     Array.isArray(row.growth_paths_json)     ? row.growth_paths_json     : [],
  })) as JobFamilyRow[]
}

export async function getJobFamilyBySlug(slug: string): Promise<JobFamilyRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_families')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  if (error || !data) return null
  return {
    ...data,
    typical_tasks_json:    Array.isArray(data.typical_tasks_json)    ? data.typical_tasks_json    : [],
    core_skills_json:      Array.isArray(data.core_skills_json)      ? data.core_skills_json      : [],
    trainable_skills_json: Array.isArray(data.trainable_skills_json) ? data.trainable_skills_json : [],
    example_roles_json:    Array.isArray(data.example_roles_json)    ? data.example_roles_json    : [],
    growth_paths_json:     Array.isArray(data.growth_paths_json)     ? data.growth_paths_json     : [],
  } as JobFamilyRow
}

export async function getJobFamilyEnvProfile(jobFamilyId: string): Promise<JobFamilyEnvProfileRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_family_env_profile')
    .select('*')
    .eq('job_family_id', jobFamilyId)
    .single()
  if (error || !data) return null
  return {
    ...data,
    profile_entries: Array.isArray(data.profile_entries) ? data.profile_entries : [],
  } as JobFamilyEnvProfileRow
}

export async function getJobFamilySkillCodes(jobFamilyId: string): Promise<{ code: string; relevance: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_family_skills')
    .select('relevance, skills!inner(code)')
    .eq('job_family_id', jobFamilyId)
  if (error || !data) return []
  return (data as any[]).map(row => ({
    code: row.skills.code,
    relevance: row.relevance,
  }))
}
