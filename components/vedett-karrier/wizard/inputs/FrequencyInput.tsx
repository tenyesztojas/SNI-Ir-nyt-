'use client'
/**
 * Védett Karrier – FrequencyInput (FREQUENCY_RANGE)
 *
 * A frequency értékek mindig frequency_options_json sorrendjében jelennek meg.
 * NEM alfabetikusan!
 *
 * Preferred range: min + max
 * Acceptable range: min + max
 */

import type { FrInput } from '@/lib/vedett-karrier/profile/types'

interface Props {
  options: string[]          // frequency_options – sorrend megőrizve!
  labels: Record<string, string>
  value: FrInput
  onChange: (v: FrInput) => void
  disabled?: boolean
}

function FreqSelect({
  label,
  hint,
  options,
  labels,
  value,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  options: string[]
  labels: Record<string, string>
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <span className="ml-1 text-xs font-normal text-gray-400">({hint})</span>
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
        aria-label={label}
      >
        <option value="">— Nem jelölök meg —</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{labels[opt] ?? opt}</option>
        ))}
      </select>
    </div>
  )
}

export default function FrequencyInput({ options, labels, value, onChange, disabled }: Props) {
  const prefMinIdx = value.preferred_min_frequency ? options.indexOf(value.preferred_min_frequency) : -1
  const prefMaxIdx = value.preferred_max_frequency ? options.indexOf(value.preferred_max_frequency) : -1
  const accMinIdx = value.acceptable_min_frequency ? options.indexOf(value.acceptable_min_frequency) : -1
  const accMaxIdx = value.acceptable_max_frequency ? options.indexOf(value.acceptable_max_frequency) : -1

  function safeSet(field: keyof FrInput, raw: string | null): FrInput {
    const next: FrInput = { ...value, [field]: raw }

    // Auto-correct: preferred range within acceptable
    if (field === 'preferred_min_frequency' && raw) {
      const idx = options.indexOf(raw)
      if (prefMaxIdx !== -1 && idx > prefMaxIdx) next.preferred_max_frequency = raw
      if (accMinIdx !== -1 && idx < accMinIdx) next.acceptable_min_frequency = raw
    }
    if (field === 'preferred_max_frequency' && raw) {
      const idx = options.indexOf(raw)
      if (prefMinIdx !== -1 && idx < prefMinIdx) next.preferred_min_frequency = raw
      if (accMaxIdx !== -1 && idx > accMaxIdx) next.acceptable_max_frequency = raw
    }
    return next
  }

  return (
    <div>
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-4">
        <p className="text-xs text-blue-700">Preferált: amit ideálisnak tartasz. Elfogadható: amivel még el tudsz lenni.</p>
      </div>
      <FreqSelect
        label="Preferált minimum"
        hint="az ideális legkevesebb"
        options={options}
        labels={labels}
        value={value.preferred_min_frequency}
        onChange={v => onChange(safeSet('preferred_min_frequency', v))}
        disabled={disabled}
      />
      <FreqSelect
        label="Preferált maximum"
        hint="az ideális legtöbb"
        options={options}
        labels={labels}
        value={value.preferred_max_frequency}
        onChange={v => onChange(safeSet('preferred_max_frequency', v))}
        disabled={disabled}
      />
      <FreqSelect
        label="Elfogadható minimum"
        hint="még elfogadható legkevesebb"
        options={options}
        labels={labels}
        value={value.acceptable_min_frequency}
        onChange={v => onChange(safeSet('acceptable_min_frequency', v))}
        disabled={disabled}
      />
      <FreqSelect
        label="Elfogadható maximum"
        hint="még elfogadható legtöbb"
        options={options}
        labels={labels}
        value={value.acceptable_max_frequency}
        onChange={v => onChange(safeSet('acceptable_max_frequency', v))}
        disabled={disabled}
      />
    </div>
  )
}
