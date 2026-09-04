'use client'
/**
 * Védett Karrier – Employer Categorical Input
 * Sprint 4
 *
 * Csak a seed categorical_options_json engedélyezett értékei közül lehet választani.
 * Human-readable magyar label; DB-be stable semantic code kerül.
 */

interface Props {
  code: string
  value: string | null
  options: string[]             // semantic codes
  labels: Record<string, string> // code → hu label
  onChange: (v: string) => void
  disabled?: boolean
}

export default function CategoricalInput({ code, value, options, labels, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const label = labels[opt] ?? opt
          const selected = value === opt
          return (
            <label
              key={opt}
              className={`cursor-pointer inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                selected
                  ? 'border-sni-brand-teal bg-sni-brand-teal text-white'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
              } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name={`categorical-${code}`}
                value={opt}
                checked={selected}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="sr-only"
              />
              {label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
