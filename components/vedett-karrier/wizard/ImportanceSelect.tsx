'use client'
/**
 * Védett Karrier – ImportanceSelect
 * Importance NEM vezethető le automatikusan a preference range-ből.
 * Mindig külön kérdezzük.
 */

import type { ImportanceLevel } from '@/lib/vedett-karrier/types/index'

const OPTIONS: { value: ImportanceLevel; label: string }[] = [
  { value: 'low',       label: 'Kevésbé fontos' },
  { value: 'medium',    label: 'Fontos' },
  { value: 'high',      label: 'Nagyon fontos' },
  { value: 'essential', label: 'Elengedhetetlen' },
]

interface Props {
  value: ImportanceLevel
  onChange: (v: ImportanceLevel) => void
  disabled?: boolean
}

export default function ImportanceSelect({ value, onChange, disabled }: Props) {
  return (
    <div className="mt-4">
      <fieldset>
        <legend className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
          Mennyire fontos ez számodra?
        </legend>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map(opt => (
            <label key={opt.value} className="cursor-pointer">
              <input
                type="radio"
                name="importance"
                value={opt.value}
                checked={value === opt.value}
                onChange={() => !disabled && onChange(opt.value)}
                disabled={disabled}
                className="sr-only"
                aria-label={opt.label}
              />
              <span
                className={`inline-block rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                  value === opt.value
                    ? 'border-sni-brand-teal bg-sni-brand-teal text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
