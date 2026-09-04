'use client'
/**
 * Védett Karrier – Career Interest Button
 * Sprint 3
 *
 * Az érdeklődés NEM alkalmassági adat.
 * Employer NEM látja.
 */

import { useState, useTransition } from 'react'
import { saveCareerInterest, removeCareerInterest } from '@/lib/vedett-karrier/interests/actions'
import type { CareerInterestRow, InterestLevel } from '@/lib/vedett-karrier/types/discovery'

const INTEREST_OPTIONS: { value: InterestLevel; label: string }[] = [
  { value: 'curious',    label: 'Kíváncsi vagyok' },
  { value: 'interested', label: 'Érdekel' },
  { value: 'strong',     label: 'Nagyon érdekel' },
]

interface Props {
  familySlug: string
  familyName: string
  currentInterest: CareerInterestRow | null
}

export default function CareerInterestButton({ familySlug, familyName, currentInterest }: Props) {
  const [interest, setInterest] = useState<CareerInterestRow | null>(currentInterest)
  const [showPanel, setShowPanel] = useState(false)
  const [level, setLevel] = useState<InterestLevel>(currentInterest?.interest_level ?? 'curious')
  const [hasExp, setHasExp] = useState(currentInterest?.has_experience ?? false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await saveCareerInterest({ jobFamilySlug: familySlug, interestLevel: level, hasExperience: hasExp })
      if (!result.ok) { setError(result.error ?? 'Hiba'); return }
      setInterest({ id: '', user_id: '', job_family_id: '', job_family_slug: familySlug, interest_level: level, has_experience: hasExp })
      setShowPanel(false)
    })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await removeCareerInterest(familySlug)
      if (!result.ok) { setError(result.error ?? 'Hiba'); return }
      setInterest(null)
      setShowPanel(false)
    })
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Érdeklődés</p>
          {interest ? (
            <p className="text-sm text-teal-700 font-medium">
              {INTEREST_OPTIONS.find(o => o.value === interest.interest_level)?.label}
              {interest.has_experience && ' · Van tapasztalatom'}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Nincs megjelölve</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPanel(v => !v)}
          className="rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal hover:bg-teal-50"
        >
          {interest ? 'Módosítás' : 'Megjelölés'}
        </button>
      </div>

      {showPanel && (
        <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Az érdeklődés csak a Karrieriránytűdet segíti. Nem kerül munkáltatóhoz.
          </p>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 mb-2">Mennyire érdekel?</legend>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(opt => (
                <label key={opt.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`interest-${familySlug}`}
                    value={opt.value}
                    checked={level === opt.value}
                    onChange={() => setLevel(opt.value)}
                    className="sr-only"
                  />
                  <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${
                    level === opt.value ? 'border-sni-brand-teal bg-sni-brand-teal text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={hasExp}
              onChange={e => setHasExp(e.target.checked)}
              className="rounded accent-sni-brand-teal"
            />
            Van már tapasztalatom ezeken a feladatmintákon
          </label>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-sni-brand-teal px-5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? 'Mentés…' : 'Mentés'}
            </button>
            {interest && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                Törlés
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
