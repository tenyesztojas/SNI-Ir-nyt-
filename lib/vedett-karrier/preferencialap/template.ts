/**
 * Védett Karrier – Preferencialap sablon generátor
 * Sprint 6
 *
 * DETERMINISZTIKUS. Nincs AI, nincs LLM hívás.
 * Ugyanaz a bemenet → mindig ugyanaz a kimenet.
 *
 * A szöveg a user SavedDimensionRow adataiból épül fel:
 * - ordinal preferencia → szöveges leírás a dimension ordinal_labels alapján
 * - categorical → felsorolt kategóriák
 * - boolean → igen/nem/mindegy
 * - frequency → tartomány
 * - unknown = true → "Még nem töltöttem ki"
 */

import type { SavedDimensionRow } from '../profile/types'
import type { VkmmSubDimension } from '../types'
import type { PreferenceDimensionBlock } from '../types/preferencialap'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ordinalLabel(sub: VkmmSubDimension, v: number): string {
  return sub.ordinal_labels?.find(l => l.v === v)?.label ?? String(v)
}

function frequencyLabel(sub: VkmmSubDimension, code: string): string {
  return sub.frequency_labels?.[code] ?? code
}

function categoricalLabel(sub: VkmmSubDimension, code: string): string {
  return sub.categorical_labels?.[code] ?? code
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-dimenzió szöveg generálás
// ─────────────────────────────────────────────────────────────────────────────

function generateBlockText(
  row: SavedDimensionRow,
  sub: VkmmSubDimension,
): string {
  if (row.is_unknown) {
    return `${sub.name_user_hu}: Ezt a dimenziót még nem töltöttem ki.`
  }

  // HIGHER_IS_MORE_DEMANDING / RANGE_PREFERENCE → ordinal
  if (sub.value_type === 'ordinal') {
    const pref = row.preferred_min_value !== null && row.preferred_max_value !== null
    const acc  = row.acceptable_min_value !== null && row.acceptable_max_value !== null

    if (!pref && !acc) return `${sub.name_user_hu}: Nincs megadott preferencia.`

    const parts: string[] = []
    if (pref) {
      const minLabel = ordinalLabel(sub, row.preferred_min_value!)
      const maxLabel = ordinalLabel(sub, row.preferred_max_value!)
      if (row.preferred_min_value === row.preferred_max_value) {
        parts.push(`Preferált értékem: ${minLabel}.`)
      } else {
        parts.push(`Preferált tartomány: ${minLabel}–${maxLabel}.`)
      }
    }
    if (acc) {
      const minLabel = ordinalLabel(sub, row.acceptable_min_value!)
      const maxLabel = ordinalLabel(sub, row.acceptable_max_value!)
      if (row.acceptable_min_value === row.acceptable_max_value) {
        parts.push(`Elfogadható: ${minLabel}.`)
      } else {
        parts.push(`Elfogadható tartomány: ${minLabel}–${maxLabel}.`)
      }
    }
    return `${sub.name_user_hu}: ${parts.join(' ')}`
  }

  // SET_MEMBERSHIP → categorical
  if (sub.value_type === 'categorical') {
    const pref  = (row.preferred_categories_json  as string[] | null) ?? []
    const acc   = (row.acceptable_categories_json as string[] | null) ?? []

    if (pref.length === 0 && acc.length === 0) {
      return `${sub.name_user_hu}: Nincs megadott preferencia.`
    }
    const parts: string[] = []
    if (pref.length > 0) {
      parts.push(`Preferált: ${pref.map(c => categoricalLabel(sub, c)).join(', ')}.`)
    }
    if (acc.length > 0) {
      parts.push(`Elfogadható: ${acc.map(c => categoricalLabel(sub, c)).join(', ')}.`)
    }
    return `${sub.name_user_hu}: ${parts.join(' ')}`
  }

  // BOOLEAN_PREFERENCE
  if (sub.value_type === 'boolean') {
    if (row.preferred_boolean === null) {
      return `${sub.name_user_hu}: Számomra mindegy (közömbös).`
    }
    const prefText = row.preferred_boolean ? 'Igen' : 'Nem'
    const accValues = (row.acceptable_boolean_json as boolean[] | null) ?? []
    const parts: string[] = [`Preferált: ${prefText}.`]
    if (accValues.length > 0) {
      const accText = accValues.map(v => (v ? 'Igen' : 'Nem')).join(' vagy ')
      parts.push(`Elfogadható: ${accText}.`)
    }
    return `${sub.name_user_hu}: ${parts.join(' ')}`
  }

  // FREQUENCY_RANGE
  if (sub.value_type === 'frequency') {
    const prefMin  = row.preferred_min_frequency
    const prefMax  = row.preferred_max_frequency
    const accMin   = row.acceptable_min_frequency
    const accMax   = row.acceptable_max_frequency

    if (!prefMin && !prefMax && !accMin && !accMax) {
      return `${sub.name_user_hu}: Nincs megadott preferencia.`
    }
    const parts: string[] = []
    if (prefMin && prefMax) {
      if (prefMin === prefMax) {
        parts.push(`Preferált: ${frequencyLabel(sub, prefMin)}.`)
      } else {
        parts.push(`Preferált tartomány: ${frequencyLabel(sub, prefMin)}–${frequencyLabel(sub, prefMax)}.`)
      }
    }
    if (accMin && accMax) {
      if (accMin === accMax) {
        parts.push(`Elfogadható: ${frequencyLabel(sub, accMin)}.`)
      } else {
        parts.push(`Elfogadható tartomány: ${frequencyLabel(sub, accMin)}–${frequencyLabel(sub, accMax)}.`)
      }
    }
    return `${sub.name_user_hu}: ${parts.join(' ')}`
  }

  return `${sub.name_user_hu}: Nincs elegendő adat.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generál egy PreferenceDimensionBlock listát a kiválasztott kódokhoz.
 * Determinisztikus: nincs AI, mindig azonos kimenet azonos bemenetre.
 */
export function generatePreferenceDimensionBlocks(
  selectedCodes: string[],
  savedRows: SavedDimensionRow[],
  subDimensions: VkmmSubDimension[],
): PreferenceDimensionBlock[] {
  return selectedCodes.flatMap(code => {
    const sub = subDimensions.find(s => s.code === code)
    if (!sub) return []
    const row = savedRows.find(r => r.sub_dimension_code === code)
    if (!row) {
      return [{
        code,
        label_hu: sub.name_user_hu,
        text_hu:  `${sub.name_user_hu}: Ezt a dimenziót még nem töltöttem ki.`,
      }]
    }
    return [{
      code,
      label_hu: sub.name_user_hu,
      text_hu:  generateBlockText(row, sub),
    }]
  })
}

/**
 * Összeállítja a teljes dokumentum szövegét blokkokból.
 * Fejléccel és záradékkal.
 */
export function buildPreferenceDocumentText(
  titleHu: string,
  blocks: PreferenceDimensionBlock[],
): string {
  const date = new Date().toLocaleDateString('hu-HU', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const body = blocks.map(b => `• ${b.text_hu}`).join('\n')

  return [
    `MUNKAPREFERENCIA-LAP`,
    `Cím: ${titleHu}`,
    `Dátum: ${date}`,
    ``,
    `Ez a dokumentum a saját munkavállalói preferenciáimat tartalmazza.`,
    `Kizárólag tájékoztatási célra készült, nem alkalmassági értékelés.`,
    ``,
    body,
    ``,
    `---`,
    `Készült a Védett Karrier rendszerben. A tartalom kizárólag a munkavállalót minősíti önmaga számára.`,
  ].join('\n')
}
