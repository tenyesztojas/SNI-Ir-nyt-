'use client'
/**
 * Védett Karrier – Employer Dimension Question Card
 * Sprint 4
 *
 * Egy sub_dimension kérdés + typed input. Mentor szöveg + mentés.
 * NEM tartalmaz: alkalmas, autizmusbarát, ADHD-barát, suitability, score.
 */

import { useState, useTransition } from 'react'
import OrdinalInput from '../inputs/OrdinalInput.js'
import CategoricalInput from '../inputs/CategoricalInput.js'
import BooleanInput from '../inputs/BooleanInput.js'
import FrequencyInput from '../inputs/FrequencyInput.js'
import { saveJobRoleDimension } from '../../../../lib/vedett-karrier/employer/actions.js'
import type { EmployerDimensionValue } from '../../../../lib/vedett-karrier/types/employer.js'
import type { VkmmSubDimension } from '../../../../lib/vedett-karrier/types/index.js'

interface Props {
  roleId: string
  sub: VkmmSubDimension
  initialValue: EmployerDimensionValue | null
  onSaved?: (code: string, value: EmployerDimensionValue, completionPct: number) => void
}

// Helper to build initial local state from an EmployerDimensionValue
function extractRawValue(val: EmployerDimensionValue | null): {
  ordinal: number | null
  categorical: string | null
  boolean: boolean | null
  frequency: string | null
} {
  if (!val) return { ordinal: null, categorical: null, boolean: null, frequency: null }
  return {
    ordinal:      val.type === 'ordinal'      ? val.value : null,
    categorical:  val.type === 'categorical'  ? val.value : null,
    boolean:      val.type === 'boolean'      ? val.value : null,
    frequency:    val.type === 'frequency'    ? val.value : null,
  }
}

export default function DimensionQuestionCard({ roleId, sub, initialValue, onSaved }: Props) {
  const raw = extractRawValue(initialValue)
  const [ordinal, setOrdinal] = useState<number | null>(raw.ordinal)
  const [categorical, setCategorical] = useState<string | null>(raw.categorical)
  const [boolVal, setBoolVal] = useState<boolean | null>(raw.boolean)
  const [frequency, setFrequency] = useState<string | null>(raw.frequency)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function getCurrentValue(): EmployerDimensionValue | null {
    if (sub.value_type === 'ordinal' && ordinal !== null)
      return { type: 'ordinal', value: ordinal, dataSource: 'SELF_REPORTED' }
    if (sub.value_type === 'categorical' && categorical !== null)
      return { type: 'categorical', value: categorical, dataSource: 'SELF_REPORTED' }
    if (sub.value_type === 'boolean' && boolVal !== null)
      return { type: 'boolean', value: boolVal, dataSource: 'SELF_REPORTED' }
    if (sub.value_type === 'frequency' && frequency !== null)
      return { type: 'frequency', value: frequency, dataSource: 'SELF_REPORTED' }
    return null
  }

  function handleSave() {
    const value = getCurrentValue()
    if (!value) { setError('Kérjük, válassz egy értéket.'); return }
    setError(null)
    startTransition(async () => {
      const result = await saveJobRoleDimension({
        roleId,
        subDimensionCode: sub.code,
        value,
      })
      if (!result.ok) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.(sub.code, value, result.data.completionPct)
    })
  }

  // Parse ordinal labels from seed
  const ordinalLabels = sub.ordinal_labels ?? []
  const catOptions = sub.categorical_options ?? []
  const catLabels = sub.categorical_labels ?? {}
  const freqOptions = sub.frequency_options ?? []
  const freqLabels = sub.frequency_labels ?? {}

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {sub.name_employer_hu}
      </p>
      <p className="text-sm font-medium text-gray-800 mb-4">
        {sub.employer_question_hu}
      </p>

      {sub.value_type === 'ordinal' && (
        <OrdinalInput
          code={sub.code}
          value={ordinal}
          min={sub.ordinal_min ?? 1}
          max={sub.ordinal_max ?? 5}
          labels={ordinalLabels}
          onChange={v => { setOrdinal(v); setSaved(false) }}
          disabled={isPending}
        />
      )}

      {sub.value_type === 'categorical' && (
        <CategoricalInput
          code={sub.code}
          value={categorical}
          options={catOptions}
          labels={catLabels}
          onChange={v => { setCategorical(v); setSaved(false) }}
          disabled={isPending}
        />
      )}

      {sub.value_type === 'boolean' && (
        <BooleanInput
          code={sub.code}
          value={boolVal}
          onChange={v => { setBoolVal(v); setSaved(false) }}
          disabled={isPending}
        />
      )}

      {sub.value_type === 'frequency' && (
        <FrequencyInput
          code={sub.code}
          value={frequency}
          options={freqOptions}
          labels={freqLabels}
          onChange={v => { setFrequency(v); setSaved(false) }}
          disabled={isPending}
        />
      )}

      {error && <p className="text-xs text-red-600 mt-2" role="alert">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || getCurrentValue() === null}
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? 'Mentés…' : saved ? '✓ Mentve' : 'Mentés'}
        </button>
        {saved && <span className="text-xs text-teal-600">Sikeresen mentve</span>}
      </div>
    </div>
  )
}
