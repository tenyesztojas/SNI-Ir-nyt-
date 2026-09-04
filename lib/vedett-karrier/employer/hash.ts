/**
 * Védett Karrier – Job Role Profile Version Hash
 * Sprint 4
 *
 * Determinisztikus: ugyanaz a szemantikai profil → ugyanaz a hash.
 * NE kerüljön hashbe: created_at, updated_at, UUID, nem-szemantikai metadata.
 * A hash alapja: sub_dimension_code (rendezett) + typed értékek stabil sorrendben.
 *
 * Node.js 22+ crypto.createHash('sha256') vagy Web Crypto API.
 * Tesztelhetőség érdekében a hash input string is exportált.
 */

import type { JobRoleEnvValueRow } from '../types/employer.js'

export interface HashableJobRoleProfile {
  /** job_role alapadatok */
  title_hu: string
  job_family_slug: string | null
  industry_slug: string | null
  employment_type: string | null
  /** VKMM értékek */
  envValues: JobRoleEnvValueRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Build canonical hash input string
// ─────────────────────────────────────────────────────────────────────────────

export function buildHashInput(profile: HashableJobRoleProfile): string {
  // Stable basic fields
  const basics = [
    `title:${profile.title_hu.trim()}`,
    `family:${profile.job_family_slug ?? ''}`,
    `industry:${profile.industry_slug ?? ''}`,
    `employment:${profile.employment_type ?? ''}`,
  ].join('|')

  // Sort env values by sub_dimension_code (stable)
  const sorted = [...profile.envValues].sort((a, b) =>
    a.sub_dimension_code.localeCompare(b.sub_dimension_code)
  )

  const values = sorted.map(ev => {
    let typedPart: string
    if (ev.ordinal_value !== null)        typedPart = `ordinal:${ev.ordinal_value}`
    else if (ev.categorical_value !== null) typedPart = `categorical:${ev.categorical_value}`
    else if (ev.boolean_value !== null)   typedPart = `boolean:${ev.boolean_value}`
    else if (ev.frequency_value !== null) typedPart = `frequency:${ev.frequency_value}`
    else                                  typedPart = 'empty'

    return `${ev.sub_dimension_code}=${typedPart}`
  }).join(';')

  return `vk_role_v1|${basics}|${values}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute SHA-256 hash (hex, first 16 chars for readability)
// ─────────────────────────────────────────────────────────────────────────────

export async function computeRoleProfileHash(profile: HashableJobRoleProfile): Promise<string> {
  const input = buildHashInput(profile)

  // Use Web Crypto API (available in Next.js Edge and Node 22)
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
