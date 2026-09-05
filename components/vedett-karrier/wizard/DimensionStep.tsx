'use client'
/**
 * Védett Karrier – DimensionStep
 * Egy fődimenzió összes aldimenziójának wizard lépése.
 * Autosave: lépésváltáskor, nem minden slider mozdulatnál.
 */

import { useState, useCallback } from 'react'
import type { VkmmDimension, VkmmSubDimension } from '@/lib/vedett-karrier/types/index'
import type { SubDimState, DimensionValueInput, HiInput, RpInput, SmInput, BpInput, FrInput } from '@/lib/vedett-karrier/profile/types'
import OrdinalInput from './inputs/OrdinalInput'
import CategoricalInput from './inputs/CategoricalInput'
import BooleanInput from './inputs/BooleanInput'
import FrequencyInput from './inputs/FrequencyInput'
import ImportanceSelect from './ImportanceSelect'

interface Props {
  dimension: VkmmDimension
  subDimensions: VkmmSubDimension[]
  states: Record<string, SubDimState>
  onStateChange: (code: string, state: SubDimState) => void
  isSaving: boolean
}

function initValueForSub(sub: VkmmSubDimension, existing?: SubDimState): DimensionValueInput {
  if (existing) return existing.value
  const ct = sub.comparison_type
  if (ct === 'HIGHER_IS_MORE_DEMANDING') return { type: 'hi', preferred_max_value: null, acceptable_max_value: null }
  if (ct === 'RANGE_PREFERENCE') return { type: 'rp', preferred_min_value: null, preferred_max_value: null, acceptable_min_value: null, acceptable_max_value: null }
  if (ct === 'SET_MEMBERSHIP') return { type: 'sm', preferred_categories: [], acceptable_categories: [] }
  if (ct === 'BOOLEAN_PREFERENCE') return { type: 'bp', preferred_boolean: null, acceptable_boolean_values: [true, false] }
  return { type: 'fr', preferred_min_frequency: null, preferred_max_frequency: null, acceptable_min_frequency: null, acceptable_max_frequency: null }
}

function SubDimCard({
  sub,
  state,
  onChange,
  disabled,
}: {
  sub: VkmmSubDimension
  state: SubDimState
  onChange: (next: SubDimState) => void
  disabled: boolean
}) {
  const isUnknown = state.unknown

  function handleValueChange(v: DimensionValueInput) {
    onChange({ ...state, value: v, dirty: true, saved: false })
  }

  function handleImportanceChange(v: SubDimState['importanceLevel']) {
    onChange({ ...state, importanceLevel: v, dirty: true, saved: false })
  }

  function toggleUnknown() {
    onChange({ ...state, unknown: !state.unknown, dirty: true, saved: false })
  }

  function handleNoteChange(v: string) {
    onChange({ ...state, userNote: v, dirty: true, saved: false })
  }

  const ct = sub.comparison_type

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4 shadow-sm">
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-semibold text-gray-800 text-sm">{sub.user_question_hu}</h3>
        {state.saved && !state.dirty && (
          <span className="ml-2 flex-shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">Mentve</span>
        )}
        {state.saveError && (
          <span className="ml-2 flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Hiba</span>
        )}
      </div>

      {/* Unknown toggle */}
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={isUnknown}
          onChange={toggleUnknown}
          disabled={disabled}
          className="rounded accent-sni-brand-teal"
          aria-label="Nem tudom / még nincs tapasztalatom"
        />
        Nem tudom / még nincs tapasztalatom
      </label>

      {!isUnknown && (
        <div className="mt-2">
          {(ct === 'HIGHER_IS_MORE_DEMANDING' || ct === 'RANGE_PREFERENCE') && (
            <OrdinalInput
              comparisonType={ct}
              ordinalMin={sub.ordinal_min ?? 1}
              ordinalMax={sub.ordinal_max ?? 5}
              ordinalLabels={sub.ordinal_labels ?? []}
              value={state.value as HiInput | RpInput}
              onChange={handleValueChange}
              disabled={disabled}
            />
          )}
          {ct === 'SET_MEMBERSHIP' && (
            <CategoricalInput
              options={sub.categorical_options ?? []}
              labels={sub.categorical_labels ?? {}}
              value={state.value as SmInput}
              onChange={handleValueChange}
              disabled={disabled}
            />
          )}
          {ct === 'BOOLEAN_PREFERENCE' && (
            <BooleanInput
              value={state.value as BpInput}
              onChange={handleValueChange}
              disabled={disabled}
              name={`bp-${sub.code}`}
            />
          )}
          {ct === 'FREQUENCY_RANGE' && (
            <FrequencyInput
              options={sub.frequency_options ?? []}
              labels={sub.frequency_labels ?? {}}
              value={state.value as FrInput}
              onChange={handleValueChange}
              disabled={disabled}
            />
          )}

          <ImportanceSelect
            value={state.importanceLevel}
            onChange={handleImportanceChange}
            disabled={disabled}
            name={`importance-${sub.code}`}
          />
        </div>
      )}

      {/* Optional user note – private */}
      <div className="mt-3">
        <label className="block text-xs text-gray-400 mb-1" htmlFor={`note-${sub.code}`}>
          Saját megjegyzés <span className="text-gray-300">(opcionális, privát)</span>
        </label>
        <textarea
          id={`note-${sub.code}`}
          value={state.userNote}
          onChange={e => handleNoteChange(e.target.value)}
          disabled={disabled}
          maxLength={2000}
          rows={2}
          placeholder="Egyéni megjegyzés (csak te látod)"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal resize-none"
          aria-label="Saját megjegyzés"
        />
      </div>

      {state.saveError && (
        <p role="alert" className="mt-2 text-xs text-red-600">{state.saveError}</p>
      )}
    </div>
  )
}

export default function DimensionStep({ dimension, subDimensions, states, onStateChange, isSaving }: Props) {
  return (
    <section aria-labelledby={`dim-heading-${dimension.code}`}>
      <h2 id={`dim-heading-${dimension.code}`} className="text-lg font-bold text-gray-800 mb-1">
        {dimension.name_hu}
      </h2>
      <p className="text-xs text-gray-400 mb-4">{subDimensions.length} kérdés</p>

      {subDimensions.map(sub => {
        const state = states[sub.code] ?? {
          subDimensionCode: sub.code,
          importanceLevel: 'medium' as const,
          unknown: false,
          userNote: '',
          value: initValueForSub(sub),
          dirty: false,
          saved: false,
          saveError: null,
        }
        return (
          <SubDimCard
            key={sub.code}
            sub={sub}
            state={state}
            onChange={next => onStateChange(sub.code, next)}
            disabled={isSaving}
          />
        )
      })}
    </section>
  )
}
