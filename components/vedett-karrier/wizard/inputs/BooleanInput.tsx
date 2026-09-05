'use client'
/**
 * Védett Karrier – BooleanInput (BOOLEAN_PREFERENCE)
 *
 * 4 explicit state:
 *   preferred_boolean = true  → "Igen, ezt preferálom"
 *   preferred_boolean = false → "Nem ezt preferálom"
 *   preferred_boolean = null  → "Mindegy / nem jelölök meg preferenciát"
 *   (+ "Nem szeretném" → acceptable_boolean_values = [])
 *
 * KRITIKUS: false ≠ null
 * null = indifferent (→ ACCEPTABLE a kompatibilitásban)
 * false = explicit "nem preferálom"
 */

import type { BpInput } from '@/lib/vedett-karrier/profile/types'

interface Props {
  value: BpInput
  onChange: (v: BpInput) => void
  disabled?: boolean
  /** Egyedi name attribútum — kötelező, ha több BooleanInput van egy oldalon.
   *  Tipikusan: `bp-${sub.code}` */
  name: string
}

type Choice = 'prefer_true' | 'prefer_false' | 'indifferent' | 'not_wanted'

function getCurrentChoice(v: BpInput): Choice | null {
  if (v.preferred_boolean === true) return 'prefer_true'
  if (v.preferred_boolean === false && v.acceptable_boolean_values.includes(false)) return 'prefer_false'
  if (v.preferred_boolean === null && v.acceptable_boolean_values.length > 0) return 'indifferent'
  if (v.acceptable_boolean_values.length === 0 && v.preferred_boolean === null) return 'not_wanted'
  return null
}

const OPTIONS: { key: Choice; label: string; description: string }[] = [
  {
    key: 'prefer_true',
    label: 'Igen, ezt preferálom',
    description: 'Ez a munkakörülmény fontos vagy kedvező számomra.',
  },
  {
    key: 'prefer_false',
    label: 'Inkább nem preferálom',
    description: 'Ez nem ideális, de elfogadható lehet.',
  },
  {
    key: 'indifferent',
    label: 'Mindegy',
    description: 'Nincs konkrét preferenciám. Bármelyik elfogadható.',
  },
  {
    key: 'not_wanted',
    label: 'Ezt nem szeretném',
    description: 'Ez a munkakörülmény kifejezetten nem megfelelő számomra.',
  },
]

function choiceToValue(choice: Choice): BpInput {
  switch (choice) {
    case 'prefer_true':
      return { type: 'bp', preferred_boolean: true, acceptable_boolean_values: [true, false] }
    case 'prefer_false':
      // preferred = false, acceptable includes false (and optionally true)
      return { type: 'bp', preferred_boolean: false, acceptable_boolean_values: [true, false] }
    case 'indifferent':
      // null = indifferent → ACCEPTABLE (nem STRONG_FIT)
      return { type: 'bp', preferred_boolean: null, acceptable_boolean_values: [true, false] }
    case 'not_wanted':
      return { type: 'bp', preferred_boolean: null, acceptable_boolean_values: [] }
  }
}

export default function BooleanInput({ value, onChange, disabled, name }: Props) {
  const current = getCurrentChoice(value)

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Preferencia</legend>
      {OPTIONS.map(opt => {
        const isSelected = current === opt.key
        return (
          <label
            key={opt.key}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${
              isSelected
                ? 'border-sni-brand-teal bg-teal-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={opt.key}
              checked={isSelected}
              onChange={() => !disabled && onChange(choiceToValue(opt.key))}
              disabled={disabled}
              className="mt-0.5 accent-sni-brand-teal"
              aria-label={opt.label}
            />
            <div>
              <p className="text-sm font-medium text-gray-800">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.description}</p>
            </div>
          </label>
        )
      })}
    </fieldset>
  )
}
