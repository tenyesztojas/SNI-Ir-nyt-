'use client'
/**
 * Védett Karrier – CategoricalInput (SET_MEMBERSHIP)
 *
 * Két halmaz: Preferálom + Elfogadható
 * Invariáns: preferred ⊆ acceptable
 * Ha valamit preferrednek jelöl → automatikusan acceptable is lesz
 */

import type { SmInput } from '@/lib/vedett-karrier/profile/types'

interface Props {
  options: string[]
  labels: Record<string, string>
  value: SmInput
  onChange: (v: SmInput) => void
  disabled?: boolean
}

export default function CategoricalInput({ options, labels, value, onChange, disabled }: Props) {
  const prefSet = new Set(value.preferred_categories)
  const accSet = new Set(value.acceptable_categories)

  function togglePreferred(opt: string) {
    if (prefSet.has(opt)) {
      // Remove from preferred (but keep in acceptable if it was there)
      const newPref = value.preferred_categories.filter(c => c !== opt)
      onChange({ ...value, preferred_categories: newPref })
    } else {
      // Add to preferred → also add to acceptable
      const newPref = [...value.preferred_categories, opt]
      const newAcc = accSet.has(opt) ? value.acceptable_categories : [...value.acceptable_categories, opt]
      onChange({ ...value, preferred_categories: newPref, acceptable_categories: newAcc })
    }
  }

  function toggleAcceptable(opt: string) {
    if (accSet.has(opt)) {
      // Remove from acceptable → also remove from preferred
      const newAcc = value.acceptable_categories.filter(c => c !== opt)
      const newPref = value.preferred_categories.filter(c => c !== opt)
      onChange({ ...value, acceptable_categories: newAcc, preferred_categories: newPref })
    } else {
      const newAcc = [...value.acceptable_categories, opt]
      onChange({ ...value, acceptable_categories: newAcc })
    }
  }

  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs font-semibold text-gray-500">
        <span className="w-1/2 text-center">Preferálom</span>
        <span className="w-1/2 text-center">Elfogadható</span>
      </div>
      <div className="space-y-2">
        {options.map(opt => {
          const isPref = prefSet.has(opt)
          const isAcc = accSet.has(opt)
          const label = labels[opt] ?? opt
          return (
            <div key={opt} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="flex-1 text-sm text-gray-700">{label}</span>
              {/* Preferred toggle */}
              <button
                type="button"
                onClick={() => togglePreferred(opt)}
                disabled={disabled}
                aria-pressed={isPref}
                aria-label={`${label}: preferált ${isPref ? 'igen' : 'nem'}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sni-brand-teal ${
                  isPref
                    ? 'bg-sni-brand-teal text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Preferált
              </button>
              {/* Acceptable toggle */}
              <button
                type="button"
                onClick={() => toggleAcceptable(opt)}
                disabled={disabled}
                aria-pressed={isAcc}
                aria-label={`${label}: elfogadható ${isAcc ? 'igen' : 'nem'}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sni-brand-teal ${
                  isAcc
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                OK
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Amit preferáltnak jelölsz, automatikusan elfogadható is lesz.
      </p>
    </div>
  )
}
