'use client'
/**
 * Védett Karrier – Employer Frequency Input
 * Sprint 4
 *
 * Sorrend: seed frequency_options_json pozicionális sorrend szerint (NEM alfabetikus).
 */

interface Props {
  code: string
  value: string | null
  options: string[]              // ordered by seed position
  labels: Record<string, string> // code → hu label
  onChange: (v: string) => void
  disabled?: boolean
}

export default function FrequencyInput({ code, value, options, labels, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-2">
      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => {
          const label = labels[opt] ?? opt
          const selected = value === opt
          return (
            <label
              key={opt}
              className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                selected
                  ? 'border-sni-brand-teal bg-teal-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name={`frequency-${code}`}
                value={opt}
                checked={selected}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="accent-sni-brand-teal flex-shrink-0"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
