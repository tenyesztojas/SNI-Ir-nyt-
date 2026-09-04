'use client'
/**
 * Védett Karrier – Employer Boolean Input
 * Sprint 4
 *
 * KRITIKUS: false IS a valid value. NEM null check, NEM falsy check.
 * Értékek: true | false | null (null = még nem válaszolt)
 */

interface Props {
  code: string
  value: boolean | null          // null = not yet answered (not saved)
  labelTrue?: string
  labelFalse?: string
  onChange: (v: boolean) => void
  disabled?: boolean
}

export default function BooleanInput({
  code,
  value,
  labelTrue = 'Igen',
  labelFalse = 'Nem',
  onChange,
  disabled,
}: Props) {
  const options: { val: boolean; label: string }[] = [
    { val: true, label: labelTrue },
    { val: false, label: labelFalse },
  ]

  return (
    <fieldset className="flex gap-3">
      {options.map(({ val, label }) => {
        // Explicit check: value === val (not value == val)
        const selected = value === val
        return (
          <label
            key={String(val)}
            className={`cursor-pointer flex-1 flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              selected
                ? 'border-sni-brand-teal bg-teal-50 text-sni-brand-teal'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name={`boolean-${code}`}
              value={String(val)}
              checked={selected}
              onChange={() => onChange(val)}
              disabled={disabled}
              className="sr-only"
            />
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}
