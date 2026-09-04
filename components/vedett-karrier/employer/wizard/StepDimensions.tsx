'use client'
/**
 * Védett Karrier – Wizard Steps 2–6: VKMM Dimension Groups
 * Sprint 4
 *
 * Generikus lépés-komponens: kap egy dimension_code listát,
 * megmutatja a megfelelő sub_dimension kérdéseket.
 * A VKMM taxonómia NEM változik — csak UX csoportosítás.
 */

import type { VkmmSubDimension } from '../../../../lib/vedett-karrier/types/index'
import type { JobRoleEnvValueRow, EmployerDimensionValue } from '../../../../lib/vedett-karrier/types/employer'
import DimensionQuestionCard from './DimensionQuestionCard'
import { WIZARD_STEP_LABELS } from '../../../../lib/vedett-karrier/types/employer'

const STEP_CONTEXT: Record<number, string> = {
  2: 'Ebben a részben a munkaterület fizikai jellemzőit rögzítsd – milyen ingerek érik azt, aki ebben a munkakörben dolgozik.',
  3: 'Milyen kommunikációs és szociális helyzetek jellemzők erre a munkakörre? Tényszerűen, a valóságot leírva.',
  4: 'Milyen feladatstruktúra, kiszámíthatóság és dinamika jellemzi ezt a munkakört?',
  5: 'Milyen a munkarend, a tempó és az önállóság mértéke ebben a munkakörben?',
  6: 'Milyen támogatást kap a munkavállaló, és milyen fizikai igénybevétellel jár a munkakör?',
}

interface Props {
  stepNumber: number
  roleId: string
  allSubDimensions: VkmmSubDimension[]
  savedEnvValues: JobRoleEnvValueRow[]
  dimensionCodes: string[]
  onSaved: (code: string, value: EmployerDimensionValue, completionPct: number) => void
  onNext?: () => void
  onBack?: () => void
}

function buildInitialValue(
  sub: VkmmSubDimension,
  saved: JobRoleEnvValueRow[]
): EmployerDimensionValue | null {
  const row = saved.find(v => v.sub_dimension_code === sub.code)
  if (!row) return null
  if (sub.value_type === 'ordinal' && row.ordinal_value !== null)
    return { type: 'ordinal', value: row.ordinal_value, dataSource: row.data_source as 'SELF_REPORTED' | 'CONFIRMED' }
  if (sub.value_type === 'categorical' && row.categorical_value !== null)
    return { type: 'categorical', value: row.categorical_value, dataSource: row.data_source as 'SELF_REPORTED' | 'CONFIRMED' }
  if (sub.value_type === 'boolean' && row.boolean_value !== null)
    return { type: 'boolean', value: row.boolean_value, dataSource: row.data_source as 'SELF_REPORTED' | 'CONFIRMED' }
  if (sub.value_type === 'frequency' && row.frequency_value !== null)
    return { type: 'frequency', value: row.frequency_value, dataSource: row.data_source as 'SELF_REPORTED' | 'CONFIRMED' }
  return null
}

export default function StepDimensions({
  stepNumber,
  roleId,
  allSubDimensions,
  savedEnvValues,
  dimensionCodes,
  onSaved,
  onNext,
  onBack,
}: Props) {
  const subsForStep = allSubDimensions.filter(s =>
    s.is_active && dimensionCodes.includes(s.dimension_code)
  )

  const filledCount = subsForStep.filter(s => buildInitialValue(s, savedEnvValues) !== null).length

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-gray-500 mb-4">
        {STEP_CONTEXT[stepNumber]}
      </p>

      <p className="text-xs text-gray-400 mb-6">
        Kitöltve: {filledCount} / {subsForStep.length} kérdés ezen a lépésen.
        Minden kérdés önállóan mentődik.
      </p>

      {/* Dimension group headers */}
      {dimensionCodes.map(dimCode => {
        const subs = subsForStep.filter(s => s.dimension_code === dimCode)
        if (subs.length === 0) return null
        const dimName = subs[0]?.dimension_code
          ? dimCode.charAt(0).toUpperCase() + dimCode.slice(1).replace('_', ' ')
          : dimCode

        return (
          <div key={dimCode} className="mb-6">
            {dimensionCodes.length > 1 && (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
                {dimCode.replace('_', ' ')}
              </p>
            )}
            {subs.map(sub => (
              <DimensionQuestionCard
                key={sub.code}
                roleId={roleId}
                sub={sub}
                initialValue={buildInitialValue(sub, savedEnvValues)}
                onSaved={onSaved}
              />
            ))}
          </div>
        )
      })}

      <div className="flex justify-between pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← Vissza
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="ml-auto rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Következő →
          </button>
        )}
      </div>
    </div>
  )
}
