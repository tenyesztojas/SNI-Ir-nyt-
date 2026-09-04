/**
 * Védett Karrier – Compatibility Engine: 5 Comparison Handlers
 * Sprint 5
 *
 * Pure functions. NO DB access. NO AI. Deterministic.
 *
 * KRITIKUS invariánsok:
 * - LOAD_POINT: outside acceptable → ALWAYS LOAD_POINT, importance SOHA nem enyhíti
 * - ACCEPTABLE → CLARIFY: csak high/essential importance esetén
 * - boolean false = VALID DATA (=== null check, soha nem falsy check)
 * - preferred_boolean = null → INDIFFERENT → ACCEPTABLE (soha nem STRONG_FIT)
 * - missing employer data → UNKNOWN
 * - Nincs score, nincs percentage, nincs suitability, nincs rank
 */

import type {
  CompatibilityResult,
  CompatibilityStatus,
  DataConfidence,
  ImportanceLevel,
  OrdinalUserPreference,
  SetUserPreference,
  BooleanUserPreference,
  FrequencyUserPreference,
  OrdinalEmployerValue,
  CategoricalEmployerValue,
  BooleanEmployerValue,
  FrequencyEmployerValue,
  EmployerDimensionValue,
} from '../types/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// Explanation keys – determinisztikus, nem AI generált
// ─────────────────────────────────────────────────────────────────────────────

export const ExplKey = {
  // Közös
  EMPLOYER_MISSING:  'employer.missing',
  USER_UNKNOWN:      'user.unknown',
  USER_PREF_MISSING: 'user.preference_missing',
  // HI
  HI_STRONG_FIT:     'hi.strong_fit',
  HI_ACCEPTABLE:     'hi.acceptable',
  HI_CLARIFY:        'hi.clarify',
  HI_LOAD_POINT:     'hi.load_point',
  // RP
  RP_STRONG_FIT:     'rp.strong_fit',
  RP_ACCEPTABLE:     'rp.acceptable',
  RP_CLARIFY:        'rp.clarify',
  RP_LOAD_POINT:     'rp.load_point',
  // SM
  SM_STRONG_FIT:     'sm.strong_fit',
  SM_ACCEPTABLE:     'sm.acceptable',
  SM_CLARIFY:        'sm.clarify',
  SM_LOAD_POINT:     'sm.load_point',
  // BP
  BP_STRONG_FIT:     'bp.strong_fit',
  BP_INDIFFERENT:    'bp.indifferent',
  BP_ACCEPTABLE:     'bp.acceptable',
  BP_CLARIFY:        'bp.clarify',
  BP_LOAD_POINT:     'bp.load_point',
  // FR
  FR_STRONG_FIT:     'fr.strong_fit',
  FR_ACCEPTABLE:     'fr.acceptable',
  FR_CLARIFY:        'fr.clarify',
  FR_LOAD_POINT:     'fr.load_point',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// CLARIFY escalation
// Csak ACCEPTABLE→CLARIFY lehetséges.
// LOAD_POINT SOHA nem módosítható importance alapján.
// ─────────────────────────────────────────────────────────────────────────────

export function applyImportanceEscalation(
  status: CompatibilityStatus,
  importance: ImportanceLevel,
): CompatibilityStatus {
  if (status === 'ACCEPTABLE' && (importance === 'high' || importance === 'essential')) {
    return 'CLARIFY'
  }
  return status
}

// ─────────────────────────────────────────────────────────────────────────────
// Belső segédfüggvény
// ─────────────────────────────────────────────────────────────────────────────

function makeResult(
  subDimensionCode: string,
  status: CompatibilityStatus,
  dataConfidence: DataConfidence,
  explanationKey: string,
  employerValue: EmployerDimensionValue,
  clarificationKey?: string,
): CompatibilityResult {
  return { subDimensionCode, status, dataConfidence, explanationKey, employerValue, clarificationKey }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 1: HIGHER_IS_MORE_DEMANDING (HI)
//
// employer_value = ordinal (mennyire megterhelő a munkakör ezen a dimenzión)
// user: preferred_max_value (kényelmes max), acceptable_max_value (stretch max)
//
// v <= pref_max              → STRONG_FIT
// pref_max < v <= acc_max    → ACCEPTABLE (high/essential → CLARIFY)
// v > acc_max                → LOAD_POINT (MINDIG, importance irreleváns)
//
// HI-ban preferred_min NEM HASZNÁLT.
// ─────────────────────────────────────────────────────────────────────────────

export function handleHI(
  subDimensionCode: string,
  employerValue: OrdinalEmployerValue | null,
  pref: OrdinalUserPreference,
): CompatibilityResult {
  if (employerValue === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', 'MISSING', ExplKey.EMPLOYER_MISSING, null)
  }
  if (pref.unknown) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_UNKNOWN, employerValue)
  }

  const v = employerValue.value
  const prefMax = pref.preferred_max_value
  const accMax  = pref.acceptable_max_value

  // Nincs beállított user preferencia
  if (prefMax === null && accMax === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_PREF_MISSING, employerValue)
  }

  // STRONG_FIT: employer érték a preferált tartományban
  if (prefMax !== null && v <= prefMax) {
    return makeResult(subDimensionCode, 'STRONG_FIT', employerValue.dataConfidence, ExplKey.HI_STRONG_FIT, employerValue)
  }

  // ACCEPTABLE / CLARIFY: employer érték az elfogadható tartományban
  if (accMax !== null && v <= accMax) {
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.HI_CLARIFY : ExplKey.HI_ACCEPTABLE
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  // LOAD_POINT: v > accMax, VAGY accMax null és v > prefMax
  return makeResult(subDimensionCode, 'LOAD_POINT', employerValue.dataConfidence, ExplKey.HI_LOAD_POINT, employerValue)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 2: RANGE_PREFERENCE (RP)
//
// user: [acceptable_min, preferred_min, preferred_max, acceptable_max]
// invariáns: acc_min ≤ pref_min ≤ pref_max ≤ acc_max
//
// v in [pref_min, pref_max] → STRONG_FIT
// v in [acc_min, acc_max]   → ACCEPTABLE (high/essential → CLARIFY)
// v kívül                   → LOAD_POINT
// ─────────────────────────────────────────────────────────────────────────────

export function handleRP(
  subDimensionCode: string,
  employerValue: OrdinalEmployerValue | null,
  pref: OrdinalUserPreference,
): CompatibilityResult {
  if (employerValue === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', 'MISSING', ExplKey.EMPLOYER_MISSING, null)
  }
  if (pref.unknown) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_UNKNOWN, employerValue)
  }

  const v    = employerValue.value
  const pMin = pref.preferred_min_value
  const pMax = pref.preferred_max_value
  const aMin = pref.acceptable_min_value
  const aMax = pref.acceptable_max_value

  if (pMin === null && pMax === null && aMin === null && aMax === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_PREF_MISSING, employerValue)
  }

  // STRONG_FIT: v a preferred range-ben
  const hasPref = pMin !== null || pMax !== null
  const inPref  = hasPref
    && (pMin === null || v >= pMin)
    && (pMax === null || v <= pMax)

  if (inPref) {
    return makeResult(subDimensionCode, 'STRONG_FIT', employerValue.dataConfidence, ExplKey.RP_STRONG_FIT, employerValue)
  }

  // ACCEPTABLE / CLARIFY: v az acceptable range-ben
  const hasAcc = aMin !== null || aMax !== null
  const inAcc  = hasAcc
    && (aMin === null || v >= aMin)
    && (aMax === null || v <= aMax)

  if (inAcc) {
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.RP_CLARIFY : ExplKey.RP_ACCEPTABLE
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  // LOAD_POINT: kívül az acceptable range-en
  return makeResult(subDimensionCode, 'LOAD_POINT', employerValue.dataConfidence, ExplKey.RP_LOAD_POINT, employerValue)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 3: SET_MEMBERSHIP (SM)
//
// user: preferred_categories ⊆ acceptable_categories
//
// v ∈ preferred   → STRONG_FIT
// v ∈ acceptable  → ACCEPTABLE (high/essential → CLARIFY)
// v ∉ acceptable  → LOAD_POINT
// ─────────────────────────────────────────────────────────────────────────────

export function handleSM(
  subDimensionCode: string,
  employerValue: CategoricalEmployerValue | null,
  pref: SetUserPreference,
): CompatibilityResult {
  if (employerValue === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', 'MISSING', ExplKey.EMPLOYER_MISSING, null)
  }
  if (pref.unknown) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_UNKNOWN, employerValue)
  }

  const v     = employerValue.value
  const pCats = pref.preferred_categories
  const aCats = pref.acceptable_categories

  // Nincs beállított kategória-preferencia
  if (pCats.length === 0 && aCats.length === 0) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_PREF_MISSING, employerValue)
  }

  if (pCats.includes(v)) {
    return makeResult(subDimensionCode, 'STRONG_FIT', employerValue.dataConfidence, ExplKey.SM_STRONG_FIT, employerValue)
  }

  if (aCats.includes(v)) {
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.SM_CLARIFY : ExplKey.SM_ACCEPTABLE
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  return makeResult(subDimensionCode, 'LOAD_POINT', employerValue.dataConfidence, ExplKey.SM_LOAD_POINT, employerValue)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 4: BOOLEAN_PREFERENCE (BP)
//
// KRITIKUS: boolean false = VALID adat. Mindig === null check, soha nem falsy.
//
// preferred_boolean = null → INDIFFERENT → ACCEPTABLE (soha nem STRONG_FIT)
// v === preferred_boolean  → STRONG_FIT
// v ∈ acceptable_boolean_values (de v ≠ preferred) → ACCEPTABLE (high/essential → CLARIFY)
// v ∉ acceptable_boolean_values → LOAD_POINT
// ─────────────────────────────────────────────────────────────────────────────

export function handleBP(
  subDimensionCode: string,
  employerValue: BooleanEmployerValue | null,
  pref: BooleanUserPreference,
): CompatibilityResult {
  if (employerValue === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', 'MISSING', ExplKey.EMPLOYER_MISSING, null)
  }
  if (pref.unknown) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_UNKNOWN, employerValue)
  }

  const v   = employerValue.value  // boolean – false IS valid
  const pb  = pref.preferred_boolean           // boolean | null – KRITIKUS: === null check!
  const acc = pref.acceptable_boolean_values   // boolean[]

  // INDIFFERENT: preferred null, nincs preferált érték
  if (pb === null) {
    if (acc.length === 0) {
      return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_PREF_MISSING, employerValue)
    }
    // null = mindegy → ACCEPTABLE (SOHA nem STRONG_FIT, per spec §8)
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.BP_CLARIFY : ExplKey.BP_INDIFFERENT
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  // STRONG_FIT: employer érték egyezik a preferált értékkel
  // KRITIKUS: v === pb (nem falsy! false === false → true ✅)
  if (v === pb) {
    return makeResult(subDimensionCode, 'STRONG_FIT', employerValue.dataConfidence, ExplKey.BP_STRONG_FIT, employerValue)
  }

  // ACCEPTABLE / CLARIFY: v ∈ acceptable (de ≠ preferred)
  if (acc.includes(v)) {
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.BP_CLARIFY : ExplKey.BP_ACCEPTABLE
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  // LOAD_POINT: v ∉ acceptable
  return makeResult(subDimensionCode, 'LOAD_POINT', employerValue.dataConfidence, ExplKey.BP_LOAD_POINT, employerValue)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 5: FREQUENCY_RANGE (FR)
//
// A frequency domain rendezett szemantikus kód-lista (VKMM seedből).
// NEM alfabetikus string-összehasonlítás!
// string → index → range comparison (mint RP, de indexekkel).
//
// frequencyOptions: pl. ['none','rare','regular','central'] (rendezett)
//
// v idx ∈ [pref_min_idx, pref_max_idx] → STRONG_FIT
// v idx ∈ [acc_min_idx, acc_max_idx]   → ACCEPTABLE (high/essential → CLARIFY)
// kívül                                → LOAD_POINT
// ─────────────────────────────────────────────────────────────────────────────

export function handleFR(
  subDimensionCode: string,
  employerValue: FrequencyEmployerValue | null,
  pref: FrequencyUserPreference,
  frequencyOptions: readonly string[],
): CompatibilityResult {
  if (employerValue === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', 'MISSING', ExplKey.EMPLOYER_MISSING, null)
  }
  if (pref.unknown) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_UNKNOWN, employerValue)
  }

  const vIdx = frequencyOptions.indexOf(employerValue.value)
  if (vIdx === -1) {
    // Ismeretlen/invalid frequency kód az employer oldalon
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.EMPLOYER_MISSING, employerValue)
  }

  const { preferred_min_frequency: pMinStr, preferred_max_frequency: pMaxStr,
          acceptable_min_frequency: aMinStr, acceptable_max_frequency: aMaxStr } = pref

  if (pMinStr === null && pMaxStr === null && aMinStr === null && aMaxStr === null) {
    return makeResult(subDimensionCode, 'UNKNOWN', employerValue.dataConfidence, ExplKey.USER_PREF_MISSING, employerValue)
  }

  // String → ordered index (null = nincs határ beállítva = open-ended)
  const pMinIdx = pMinStr !== null ? frequencyOptions.indexOf(pMinStr) : null
  const pMaxIdx = pMaxStr !== null ? frequencyOptions.indexOf(pMaxStr) : null
  const aMinIdx = aMinStr !== null ? frequencyOptions.indexOf(aMinStr) : null
  const aMaxIdx = aMaxStr !== null ? frequencyOptions.indexOf(aMaxStr) : null

  // STRONG_FIT: v a preferred range-ben (index alapján)
  const hasPref = pMinIdx !== null || pMaxIdx !== null
  const inPref  = hasPref
    && (pMinIdx === null || vIdx >= pMinIdx)
    && (pMaxIdx === null || vIdx <= pMaxIdx)

  if (inPref) {
    return makeResult(subDimensionCode, 'STRONG_FIT', employerValue.dataConfidence, ExplKey.FR_STRONG_FIT, employerValue)
  }

  // ACCEPTABLE / CLARIFY: v az acceptable range-ben
  const hasAcc = aMinIdx !== null || aMaxIdx !== null
  const inAcc  = hasAcc
    && (aMinIdx === null || vIdx >= aMinIdx)
    && (aMaxIdx === null || vIdx <= aMaxIdx)

  if (inAcc) {
    const base: CompatibilityStatus = 'ACCEPTABLE'
    const status = applyImportanceEscalation(base, pref.importanceLevel)
    const key = status === 'CLARIFY' ? ExplKey.FR_CLARIFY : ExplKey.FR_ACCEPTABLE
    return makeResult(subDimensionCode, status, employerValue.dataConfidence, key, employerValue)
  }

  // LOAD_POINT: kívül az acceptable range-en
  return makeResult(subDimensionCode, 'LOAD_POINT', employerValue.dataConfidence, ExplKey.FR_LOAD_POINT, employerValue)
}
