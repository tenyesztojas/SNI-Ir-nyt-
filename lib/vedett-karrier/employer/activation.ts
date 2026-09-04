/**
 * Védett Karrier – Employer Activation Gate
 *
 * Tiszta szinkron domain helper – NEM Server Action.
 * Importálható kliensről és szerverről egyaránt.
 *
 * Az aktivációs invariánsok:
 *   - cím megadva
 *   - telephely kiválasztva
 *   - munkakörcsalád kiválasztva
 *   - tényszerű összefoglaló megadva
 *   - legalább 1 fő feladat megadva
 *   - VKMM profil legalább 80%-os kitöltöttség
 */

import type { ActivationGateResult } from '../types/employer'

export function checkActivationGate(role: {
  title_hu: string
  workplace_id: string | null
  job_family_slug: string | null
  summary_hu: string | null
  main_tasks_json: string[]
  profile_completion_pct: number
  status: string
}): ActivationGateResult {
  const missing: string[] = []

  if (!role.title_hu?.trim()) missing.push('Munkakör megnevezése')
  if (!role.workplace_id) missing.push('Telephely')
  if (!role.job_family_slug) missing.push('Munkakörcsalád')
  if (!role.summary_hu?.trim()) missing.push('Tényszerű összefoglaló')
  if (!role.main_tasks_json || role.main_tasks_json.length === 0) missing.push('Fő feladatok')
  if (role.profile_completion_pct < 80) {
    missing.push(`VKMM profil kitöltése (jelenlegi: ${role.profile_completion_pct}%, minimum: 80%)`)
  }

  return { canActivate: missing.length === 0, missingItems: missing }
}
