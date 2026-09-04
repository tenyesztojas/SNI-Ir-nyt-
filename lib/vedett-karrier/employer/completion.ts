/**
 * Védett Karrier – Job Role Profile Completion
 * Sprint 4
 *
 * A completion kizárólag a ténylegesen kitöltött aktív VKMM dimenziók alapján
 * számítódik. NEM page visit. NEM time spent.
 */

import { VKMM_SUB_DIMENSIONS } from '../seed/vkmm-seed'
import type { JobRoleEnvValueRow } from '../types/employer'

/** Az aktív sub_dimension-ök száma (51) */
export const TOTAL_ACTIVE_SUB_DIMENSIONS = VKMM_SUB_DIMENSIONS.filter(s => s.is_active).length

/**
 * Kiszámolja a kitöltési százalékot.
 * Feltétel: legalább egy typed oszlop nem-null (boolean_value = false IS valid).
 */
export function computeProfileCompletionPct(envValues: JobRoleEnvValueRow[]): number {
  if (TOTAL_ACTIVE_SUB_DIMENSIONS === 0) return 0

  const filledCodes = new Set<string>()
  for (const ev of envValues) {
    const isFilled =
      ev.ordinal_value !== null ||
      ev.categorical_value !== null ||
      ev.boolean_value !== null ||  // false IS valid
      ev.frequency_value !== null
    if (isFilled) filledCodes.add(ev.sub_dimension_code)
  }

  return Math.round((filledCodes.size / TOTAL_ACTIVE_SUB_DIMENSIONS) * 100)
}

/** Minimális szükséges completion aktiváláshoz */
export const MIN_COMPLETION_FOR_ACTIVATION = 80

/** Minimálisan kitöltendő step-ek száma az aktiváláshoz (steps 1-6) */
export const MIN_STEPS_FOR_ACTIVATION = 6

export function isCompletionSufficientForActivation(pct: number): boolean {
  return pct >= MIN_COMPLETION_FOR_ACTIVATION
}
