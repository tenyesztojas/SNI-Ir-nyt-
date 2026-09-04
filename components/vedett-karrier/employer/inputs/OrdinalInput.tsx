'use client'
/**
 * Védett Karrier – Employer Ordinal Input
 * Sprint 4
 *
 * Mutatja az összes 1–5 label-t. A munkáltató a munkakör TÉNYLEGES értékét adja meg.
 * NEM user preference, NEM preferred_max, NEM range input.
 */

interface OrdinalLabel { v: number; label: string }

interface Props {
  code: string
  value: number | null
  min: number
  max: number
  labels: OrdinalLabel[]
  onChange: (v: number) => void
  disabled?: boolean
}

export default function OrdinalInput({ code, value, min, max, labels, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-2">
      <div className="flex flex-col gap-2">
        {labels.map(({ v, label }) => (
          <label
            key={v}
            className={`flex items-start gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
              value === v
                ? 'border-sni-brand-teal bg-teal-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name={`ordinal-${code}`}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              disabled={disabled}
              className="mt-0.5 accent-sni-brand-teal flex-shrink-0"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-gray-500 mr-2">{v}</span>
              {label}
            </span>
          </label>
        ))}
      </div>
      {value !== null && (
        <p className="text-xs text-teal-700 mt-1">Kiválasztott érték: {value} / {max}</p>
      )}
    </fieldset>
  )
}
