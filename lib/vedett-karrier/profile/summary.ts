/**
 * Védett Karrier – Munkaprofil Összefoglaló (determinisztikus)
 * Sprint 2
 *
 * SZABÁLYOK:
 * - Kizárólag determinisztikus template-ből generál
 * - NEM AI-val
 * - NEM diagnosztizál
 * - NEM mondja: "autista profil", "ADHD profil", "alkalmas vagy..."
 * - Csak a user saját preferenciáit foglalja össze
 * - Csak ténylegesen kitöltött aldimenziókhoz generál mondatot
 */

import type { SavedDimensionRow } from './types.js'
import type { VkmmSubDimension, VkmmDimension } from '../types/index.js'
import type { ProfileSummaryData, SummaryItem } from './types.js'
import { isAnswered } from './completion.js'

// ─────────────────────────────────────────────────────────────────────────────
// Template-alapú mondatgenerátorok (aldimenzió kódonként)
// ─────────────────────────────────────────────────────────────────────────────

type SentenceGenerator = (row: SavedDimensionRow, sub: VkmmSubDimension) => string | null

const ORDINAL_HI_LABELS: Record<string, Record<number, string>> = {
  env_noise: {
    1: 'nagyon csendes környezetet',
    2: 'többnyire csendes, alkalmian zajos környezetet',
    3: 'mérsékelt zajszintű munkaterületet',
    4: 'zajos munkakörnyezetet',
    5: 'tartósan zajos környezetet',
  },
  env_light: {
    1: 'tompított, kellemes megvilágítást',
    2: 'természetes vagy meleg fényt',
    3: 'közepes irodai megvilágítást',
    4: 'erős megvilágítást',
    5: 'nagyon erős vagy egyenetlen fényt',
  },
}

function ordinalHiSentence(row: SavedDimensionRow, sub: VkmmSubDimension): string | null {
  if (row.is_unknown) return `A ${sub.name_user_hu.toLowerCase()} kapcsán még nincs tapasztalatod.`
  const max = row.preferred_max_value
  if (max == null) return null
  const labels = sub.ordinal_labels as Array<{v: number; label: string}> | undefined
  const label = ORDINAL_HI_LABELS[sub.code]?.[max] ?? labels?.find(l => l.v === max)?.label ?? `${max}. szint`
  return `${sub.name_user_hu} kapcsán kényelmes számodra ${label.toLowerCase()}.`
}

function ordinalRpSentence(row: SavedDimensionRow, sub: VkmmSubDimension): string | null {
  if (row.is_unknown) return `A ${sub.name_user_hu.toLowerCase()} kapcsán még nincs tapasztalatod.`
  const pmin = row.preferred_min_value
  const pmax = row.preferred_max_value
  if (pmin == null && pmax == null) return null
  const labels = sub.ordinal_labels as Array<{v: number; label: string}> | undefined
  const getLabel = (v: number) => labels?.find(l => l.v === v)?.label ?? `${v}. szint`
  if (pmin != null && pmax != null) {
    if (pmin === pmax) return `${sub.name_user_hu} kapcsán a ${getLabel(pmin).toLowerCase()} szintjét preferálod.`
    return `${sub.name_user_hu} kapcsán a ${getLabel(pmin).toLowerCase()}tól a ${getLabel(pmax).toLowerCase()} szintjéig terjedő tartományt preferálod.`
  }
  if (pmax != null) return `${sub.name_user_hu} kapcsán legfeljebb a ${getLabel(pmax).toLowerCase()} szintje illik hozzád.`
  return null
}

function categoricalSentence(row: SavedDimensionRow, sub: VkmmSubDimension): string | null {
  if (row.is_unknown) return `A ${sub.name_user_hu.toLowerCase()} kapcsán még nincs tapasztalatod.`
  const pref = row.preferred_categories_json
  if (!pref || pref.length === 0) return null
  const catLabels = sub.categorical_labels as Record<string, string> | undefined
  const labelList = pref.map(c => catLabels?.[c] ?? c).join(', ')
  return `${sub.name_user_hu} kapcsán a következőket preferálod: ${labelList.toLowerCase()}.`
}

function booleanSentence(row: SavedDimensionRow, sub: VkmmSubDimension): string | null {
  if (row.is_unknown) return `A ${sub.name_user_hu.toLowerCase()} kapcsán még nincs tapasztalatod.`
  const pb = row.preferred_boolean
  if (pb === null) return `${sub.name_user_hu} kapcsán nem jelöltél meg konkrét preferenciát.`
  if (pb === true) return `${sub.name_user_hu}: ezt a munkakörülményt preferálod.`
  if (pb === false) return `${sub.name_user_hu}: ezt a munkakörülményt nem preferálod.`
  return null
}

function frequencySentence(row: SavedDimensionRow, sub: VkmmSubDimension): string | null {
  if (row.is_unknown) return `A ${sub.name_user_hu.toLowerCase()} kapcsán még nincs tapasztalatod.`
  const pmin = row.preferred_min_frequency
  const pmax = row.preferred_max_frequency
  const freqLabels = sub.frequency_labels as Record<string, string> | undefined
  const getLabel = (v: string | null) => v ? (freqLabels?.[v] ?? v) : null
  const minLabel = getLabel(pmin)
  const maxLabel = getLabel(pmax)
  if (minLabel && maxLabel && pmin !== pmax) {
    return `${sub.name_user_hu} kapcsán a ${minLabel.toLowerCase()}tól a ${maxLabel.toLowerCase()} mértékig preferálsz.`
  }
  if (maxLabel) return `${sub.name_user_hu} kapcsán a ${maxLabel.toLowerCase()} mértéket preferálod.`
  if (minLabel) return `${sub.name_user_hu} kapcsán legalább ${minLabel.toLowerCase()} szükséges számodra.`
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Fő összefoglaló generátor
// ─────────────────────────────────────────────────────────────────────────────

export function generateProfileSummary(
  savedRows: SavedDimensionRow[],
  dimensions: VkmmDimension[],
  subDimensions: VkmmSubDimension[],
): ProfileSummaryData {
  const subDimMap = new Map(subDimensions.map(s => [s.code, s]))
  const rowMap = new Map(savedRows.map(r => [r.sub_dimension_code, r]))
  const answeredCount = savedRows.filter(isAnswered).length
  const totalCount = subDimensions.length
  const completionPct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0

  const items: SummaryItem[] = dimensions.map(dim => {
    const dimSubs = subDimensions.filter(s => s.dimension_code === dim.code)
    const sentences: string[] = []

    for (const sub of dimSubs) {
      const row = rowMap.get(sub.code)
      if (!row || !isAnswered(row)) continue

      let sentence: string | null = null
      const ct = sub.comparison_type
      if (ct === 'HIGHER_IS_MORE_DEMANDING') sentence = ordinalHiSentence(row, sub)
      else if (ct === 'RANGE_PREFERENCE') sentence = ordinalRpSentence(row, sub)
      else if (ct === 'SET_MEMBERSHIP') sentence = categoricalSentence(row, sub)
      else if (ct === 'BOOLEAN_PREFERENCE') sentence = booleanSentence(row, sub)
      else if (ct === 'FREQUENCY_RANGE') sentence = frequencySentence(row, sub)

      if (sentence) sentences.push(sentence)
    }

    return { dimensionCode: dim.code, dimensionName: dim.name_hu, sentences }
  })

  return { items, completionPct, answeredCount, totalCount }
}
