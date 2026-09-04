'use client'
/**
 * Védett Karrier – MunkaprofilWizard
 * Fő kliens komponens. 10 lépéses wizard (1 fődimenzió / lépés).
 *
 * Autosave: lépésváltáskor menti a dirty dimenziókat.
 * NEM ment minden slider mozdulatnál.
 * Adatvesztés védelem: unsaved changes figyelmeztetés.
 */

import { useState, useCallback, useTransition, useEffect } from 'react'
import type { WizardInitData, SubDimState, DimensionValueInput, SavedDimensionRow } from '@/lib/vedett-karrier/profile/types'
import type { VkmmSubDimension } from '@/lib/vedett-karrier/types/index'
import { saveDimensionPreference } from '@/lib/vedett-karrier/profile/actions'
import { generateProfileSummary } from '@/lib/vedett-karrier/profile/summary'
import DimensionStep from './wizard/DimensionStep'
import ProfileSummary from './ProfileSummary'

// ─────────────────────────────────────────────────────────────────────────────
// State initialization from saved DB rows
// ─────────────────────────────────────────────────────────────────────────────

function initStateFromRow(row: SavedDimensionRow, sub: VkmmSubDimension): SubDimState {
  let value: DimensionValueInput

  const ct = sub.comparison_type
  if (ct === 'HIGHER_IS_MORE_DEMANDING') {
    value = { type: 'hi', preferred_max_value: row.preferred_max_value, acceptable_max_value: row.acceptable_max_value }
  } else if (ct === 'RANGE_PREFERENCE') {
    value = { type: 'rp', preferred_min_value: row.preferred_min_value, preferred_max_value: row.preferred_max_value, acceptable_min_value: row.acceptable_min_value, acceptable_max_value: row.acceptable_max_value }
  } else if (ct === 'SET_MEMBERSHIP') {
    value = { type: 'sm', preferred_categories: row.preferred_categories_json ?? [], acceptable_categories: row.acceptable_categories_json ?? [] }
  } else if (ct === 'BOOLEAN_PREFERENCE') {
    value = { type: 'bp', preferred_boolean: row.preferred_boolean, acceptable_boolean_values: row.acceptable_boolean_json ?? [true, false] }
  } else {
    value = { type: 'fr', preferred_min_frequency: row.preferred_min_frequency, preferred_max_frequency: row.preferred_max_frequency, acceptable_min_frequency: row.acceptable_min_frequency, acceptable_max_frequency: row.acceptable_max_frequency }
  }

  return {
    subDimensionCode: row.sub_dimension_code,
    importanceLevel: row.importance_level,
    unknown: row.is_unknown,
    userNote: row.user_note ?? '',
    value,
    dirty: false,
    saved: true,
    saveError: null,
  }
}

function initDefaultState(sub: VkmmSubDimension): SubDimState {
  const ct = sub.comparison_type
  let value: DimensionValueInput
  if (ct === 'HIGHER_IS_MORE_DEMANDING') value = { type: 'hi', preferred_max_value: null, acceptable_max_value: null }
  else if (ct === 'RANGE_PREFERENCE') value = { type: 'rp', preferred_min_value: null, preferred_max_value: null, acceptable_min_value: null, acceptable_max_value: null }
  else if (ct === 'SET_MEMBERSHIP') value = { type: 'sm', preferred_categories: [], acceptable_categories: [] }
  else if (ct === 'BOOLEAN_PREFERENCE') value = { type: 'bp', preferred_boolean: null, acceptable_boolean_values: [true, false] }
  else value = { type: 'fr', preferred_min_frequency: null, preferred_max_frequency: null, acceptable_min_frequency: null, acceptable_max_frequency: null }

  return {
    subDimensionCode: sub.code,
    importanceLevel: 'medium',
    unknown: false,
    userNote: '',
    value,
    dirty: false,
    saved: false,
    saveError: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build server action payload from SubDimState
// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(careerProfileId: string, code: string, state: SubDimState, sub: VkmmSubDimension) {
  const base = {
    careerProfileId,
    subDimensionCode: code,
    importanceLevel: state.importanceLevel,
    unknown: state.unknown,
    userNote: state.userNote || null,
    comparisonType: sub.comparison_type,
    frequencyOptions: sub.frequency_options ?? [],
  }
  const v = state.value
  if (v.type === 'hi') return { ...base, preferred_max_value: v.preferred_max_value, acceptable_max_value: v.acceptable_max_value }
  if (v.type === 'rp') return { ...base, preferred_min_value: v.preferred_min_value, preferred_max_value: v.preferred_max_value, acceptable_min_value: v.acceptable_min_value, acceptable_max_value: v.acceptable_max_value }
  if (v.type === 'sm') return { ...base, preferred_categories_json: v.preferred_categories, acceptable_categories_json: v.acceptable_categories }
  if (v.type === 'bp') return { ...base, preferred_boolean: v.preferred_boolean, acceptable_boolean_json: v.acceptable_boolean_values }
  return { ...base, preferred_min_frequency: v.preferred_min_frequency, preferred_max_frequency: v.preferred_max_frequency, acceptable_min_frequency: v.acceptable_min_frequency, acceptable_max_frequency: v.acceptable_max_frequency }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  initData: WizardInitData
}

export default function MunkaprofilWizard({ initData }: Props) {
  const { careerProfileId, dimensions, subDimensions, savedRows } = initData

  const subDimMap = new Map(subDimensions.map(s => [s.code, s]))

  // Initial state from saved rows
  const [subStates, setSubStates] = useState<Record<string, SubDimState>>(() => {
    const map: Record<string, SubDimState> = {}
    for (const sub of subDimensions) {
      const row = savedRows.find(r => r.sub_dimension_code === sub.code)
      map[sub.code] = row ? initStateFromRow(row, sub) : initDefaultState(sub)
    }
    return map
  })

  const [currentDimIdx, setCurrentDimIdx] = useState(0)
  const [completionPct, setCompletionPct] = useState(initData.completionPct)
  const [showSummary, setShowSummary] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [globalSaveError, setGlobalSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const hasDirty = Object.values(subStates).some(s => s.dirty)

  // Unsaved changes warning on navigate away
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (hasDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDirty])

  // ── Save dirty dimensions in current dimension ──────────────────────────

  const saveDirtyForCurrentDim = useCallback(async () => {
    const dim = dimensions[currentDimIdx]
    const dimSubs = subDimensions.filter(s => s.dimension_code === dim.code)
    const dirtyStates = dimSubs.filter(sub => subStates[sub.code]?.dirty)
    if (dirtyStates.length === 0) return

    setGlobalSaveError(null)
    let anyError = false

    await Promise.all(
      dirtyStates.map(async sub => {
        const state = subStates[sub.code]
        if (!state) return
        const payload = buildPayload(careerProfileId, sub.code, state, sub)
        const result = await saveDimensionPreference(payload)

        setSubStates(prev => ({
          ...prev,
          [sub.code]: {
            ...prev[sub.code],
            dirty: !result.ok,
            saved: result.ok,
            saveError: result.ok ? null : (result.error ?? 'Hiba'),
          },
        }))

        if (!result.ok) anyError = true
        if (result.ok && result.completionPct !== undefined) {
          setCompletionPct(result.completionPct)
        }
      })
    )

    if (!anyError) {
      setLastSavedAt(new Date())
    } else {
      setGlobalSaveError('Néhány adat mentése nem sikerült. Ellenőrizd a piros mezőket.')
    }
  }, [careerProfileId, currentDimIdx, dimensions, subDimensions, subStates])

  // ── Navigation ──────────────────────────────────────────────────────────

  async function goToNext() {
    await saveDirtyForCurrentDim()
    if (currentDimIdx < dimensions.length - 1) {
      setCurrentDimIdx(i => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      // Last dim → show summary
      setShowSummary(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function goToPrev() {
    await saveDirtyForCurrentDim()
    if (currentDimIdx > 0) {
      setCurrentDimIdx(i => i - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function handleExplicitSave() {
    startSaving(async () => {
      await saveDirtyForCurrentDim()
    })
  }

  function handleStateChange(code: string, state: SubDimState) {
    setSubStates(prev => ({ ...prev, [code]: state }))
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const summaryData = generateProfileSummary(
    Object.values(subStates).map(s => ({
      sub_dimension_code: s.subDimensionCode,
      importance_level: s.importanceLevel,
      is_unknown: s.unknown,
      user_note: s.userNote || null,
      preferred_max_value: s.value.type === 'hi' || s.value.type === 'rp' ? s.value.preferred_max_value : null,
      acceptable_max_value: s.value.type === 'hi' || s.value.type === 'rp' ? s.value.acceptable_max_value : null,
      preferred_min_value: s.value.type === 'rp' ? s.value.preferred_min_value : null,
      acceptable_min_value: s.value.type === 'rp' ? s.value.acceptable_min_value : null,
      preferred_categories_json: s.value.type === 'sm' ? s.value.preferred_categories : null,
      acceptable_categories_json: s.value.type === 'sm' ? s.value.acceptable_categories : null,
      preferred_boolean: s.value.type === 'bp' ? s.value.preferred_boolean : null,
      acceptable_boolean_json: s.value.type === 'bp' ? s.value.acceptable_boolean_values : null,
      preferred_min_frequency: s.value.type === 'fr' ? s.value.preferred_min_frequency : null,
      preferred_max_frequency: s.value.type === 'fr' ? s.value.preferred_max_frequency : null,
      acceptable_min_frequency: s.value.type === 'fr' ? s.value.acceptable_min_frequency : null,
      acceptable_max_frequency: s.value.type === 'fr' ? s.value.acceptable_max_frequency : null,
    })),
    dimensions,
    subDimensions
  )

  // ── Summary view ─────────────────────────────────────────────────────────

  if (showSummary) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowSummary(false)}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-sni-brand-teal rounded"
        >
          ← Vissza a kitöltéshez
        </button>
        <ProfileSummary summary={summaryData} onBack={() => setShowSummary(false)} />
      </div>
    )
  }

  // ── Wizard view ──────────────────────────────────────────────────────────

  const dim = dimensions[currentDimIdx]
  const dimSubs = subDimensions.filter(s => s.dimension_code === dim.code)
  const isLast = currentDimIdx === dimensions.length - 1

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{currentDimIdx + 1} / {dimensions.length}. dimenzió</span>
          <span className="font-medium">{completionPct}% kitöltve</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-sni-brand-teal transition-all"
            style={{ width: `${((currentDimIdx) / dimensions.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={currentDimIdx}
            aria-valuemin={0}
            aria-valuemax={dimensions.length}
            aria-label="Haladás"
          />
        </div>
        {/* Dimension tabs */}
        <div className="mt-2 flex gap-1 flex-wrap">
          {dimensions.map((d, i) => (
            <button
              key={d.code}
              type="button"
              onClick={async () => {
                await saveDirtyForCurrentDim()
                setCurrentDimIdx(i)
              }}
              className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                i === currentDimIdx
                  ? 'bg-sni-brand-teal text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              aria-label={d.name_hu}
              aria-current={i === currentDimIdx ? 'step' : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Save feedback */}
      {globalSaveError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {globalSaveError}
        </div>
      )}
      {lastSavedAt && !hasDirty && (
        <div className="mb-2 text-xs text-green-600">
          ✓ Mentve: {lastSavedAt.toLocaleTimeString('hu-HU')}
        </div>
      )}
      {hasDirty && (
        <div className="mb-2 text-xs text-amber-600">
          Nem mentett változás – lépés váltásakor automatikusan menti.
        </div>
      )}

      {/* Current dimension */}
      <DimensionStep
        dimension={dim}
        subDimensions={dimSubs}
        states={subStates}
        onStateChange={handleStateChange}
        isSaving={isSaving}
      />

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goToPrev}
            disabled={currentDimIdx === 0 || isSaving}
            className="rounded-full border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
            aria-label="Előző dimenzió"
          >
            ← Előző
          </button>
          <button
            type="button"
            onClick={handleExplicitSave}
            disabled={isSaving || !hasDirty}
            className="rounded-full border border-sni-brand-teal px-5 py-2 text-sm text-sni-brand-teal hover:bg-teal-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
            aria-label="Mentés és folytatás"
          >
            {isSaving ? 'Mentés…' : 'Mentés'}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
          >
            Összefoglaló
          </button>
          <button
            type="button"
            onClick={goToNext}
            disabled={isSaving}
            className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
            aria-label={isLast ? 'Összefoglaló megtekintése' : 'Következő dimenzió'}
          >
            {isLast ? 'Összefoglaló →' : 'Következő →'}
          </button>
        </div>
      </div>
    </div>
  )
}
