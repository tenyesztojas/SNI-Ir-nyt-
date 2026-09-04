'use client'
/**
 * Védett Karrier – OrdinalInput
 * Handles both HI (max-only) and RP (four-bound) sub-dimensions.
 *
 * HI: preferred_max_value + acceptable_max_value (no min)
 * RP: preferred_min + preferred_max + acceptable_min + acceptable_max
 *
 * Skála NEM sugall értékítéletet (1=rossz / 5=jó).
 * Az ordinal_labels a seed-ből jön.
 */

import type { OrdinalLabel } from '@/lib/vedett-karrier/types/index'
import type { HiInput, RpInput } from '@/lib/vedett-karrier/profile/types'

interface Props {
  comparisonType: 'HIGHER_IS_MORE_DEMANDING' | 'RANGE_PREFERENCE'
  ordinalMin: number
  ordinalMax: number
  ordinalLabels: OrdinalLabel[]
  value: HiInput | RpInput
  onChange: (v: HiInput | RpInput) => void
  disabled?: boolean
}

function LabeledSlider({
  label,
  hint,
  min,
  max,
  value,
  onChange,
  disabled,
  labels,
}: {
  label: string
  hint: string
  min: number
  max: number
  value: number | null
  onChange: (v: number) => void
  disabled?: boolean
  labels: OrdinalLabel[]
}) {
  const currentLabel = labels.find(l => l.v === value)?.label ?? null

  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <span className="ml-1 text-xs font-normal text-gray-400">({hint})</span>
      </label>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 w-4 text-center">{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value ?? min}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          className="flex-1 accent-sni-brand-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal rounded"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? min}
          aria-valuetext={currentLabel ?? undefined}
        />
        <span className="text-xs text-gray-400 w-4 text-center">{max}</span>
      </div>
      {currentLabel && (
        <p className="mt-1 text-xs text-gray-600 italic">{currentLabel}</p>
      )}
      {value == null && (
        <p className="mt-1 text-xs text-gray-400">Mozgasd a csúszkát a beállításhoz</p>
      )}
    </div>
  )
}

export default function OrdinalInput({ comparisonType, ordinalMin, ordinalMax, ordinalLabels, value, onChange, disabled }: Props) {
  const isHI = comparisonType === 'HIGHER_IS_MORE_DEMANDING'
  const hi = value as HiInput
  const rp = value as RpInput

  if (isHI) {
    return (
      <div>
        <LabeledSlider
          label="Meddig kényelmes számodra?"
          hint="preferált maximum"
          min={ordinalMin}
          max={ordinalMax}
          value={hi.preferred_max_value}
          onChange={v => onChange({ ...hi, type: 'hi', preferred_max_value: v, acceptable_max_value: hi.acceptable_max_value == null ? v : Math.max(hi.acceptable_max_value, v) })}
          disabled={disabled}
          labels={ordinalLabels}
        />
        <LabeledSlider
          label="Mi az a szint, ami még elfogadható?"
          hint="elfogadható maximum"
          min={ordinalMin}
          max={ordinalMax}
          value={hi.acceptable_max_value}
          onChange={v => onChange({ ...hi, type: 'hi', acceptable_max_value: v, preferred_max_value: hi.preferred_max_value == null ? v : Math.min(hi.preferred_max_value, v) })}
          disabled={disabled}
          labels={ordinalLabels}
        />
      </div>
    )
  }

  // RP
  return (
    <div>
      <LabeledSlider
        label="Mi az ideális minimum számodra?"
        hint="preferált minimum"
        min={ordinalMin}
        max={ordinalMax}
        value={rp.preferred_min_value}
        onChange={v => {
          const pmax = rp.preferred_max_value == null ? v : Math.max(rp.preferred_max_value, v)
          const amin = rp.acceptable_min_value == null ? v : Math.min(rp.acceptable_min_value, v)
          onChange({ ...rp, type: 'rp', preferred_min_value: v, preferred_max_value: pmax, acceptable_min_value: amin })
        }}
        disabled={disabled}
        labels={ordinalLabels}
      />
      <LabeledSlider
        label="Mi az ideális maximum számodra?"
        hint="preferált maximum"
        min={ordinalMin}
        max={ordinalMax}
        value={rp.preferred_max_value}
        onChange={v => {
          const pmin = rp.preferred_min_value == null ? v : Math.min(rp.preferred_min_value, v)
          const amax = rp.acceptable_max_value == null ? v : Math.max(rp.acceptable_max_value, v)
          onChange({ ...rp, type: 'rp', preferred_max_value: v, preferred_min_value: pmin, acceptable_max_value: amax })
        }}
        disabled={disabled}
        labels={ordinalLabels}
      />
      <LabeledSlider
        label="Mi az elfogadható minimum?"
        hint="elfogadható minimum"
        min={ordinalMin}
        max={ordinalMax}
        value={rp.acceptable_min_value}
        onChange={v => {
          const pmin = rp.preferred_min_value == null ? v : Math.max(rp.preferred_min_value, v)
          onChange({ ...rp, type: 'rp', acceptable_min_value: v, preferred_min_value: pmin })
        }}
        disabled={disabled}
        labels={ordinalLabels}
      />
      <LabeledSlider
        label="Mi az elfogadható maximum?"
        hint="elfogadható maximum"
        min={ordinalMin}
        max={ordinalMax}
        value={rp.acceptable_max_value}
        onChange={v => {
          const pmax = rp.preferred_max_value == null ? v : Math.min(rp.preferred_max_value, v)
          onChange({ ...rp, type: 'rp', acceptable_max_value: v, preferred_max_value: pmax })
        }}
        disabled={disabled}
        labels={ordinalLabels}
      />
    </div>
  )
}
