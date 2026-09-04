'use client'
/**
 * Védett Karrier – Wizard Step 7: Ellenőrzés és Munkakör-Térkép
 * Sprint 4
 *
 * Mutatja a komplett Munkakör-Térképet.
 * NEM mutat: suitability score, compatibility %, autizmusbarát/neurodivergens badge.
 * CTA: Munkakör aktiválása | Mentés piszkozatként
 */

import { useState, useTransition } from 'react'
import { activateJobRole } from '../../../../lib/vedett-karrier/employer/actions'
import { checkActivationGate } from '../../../../lib/vedett-karrier/employer/activation'
import type { JobRoleRow, WorkplaceRow, JobRoleEnvValueRow } from '../../../../lib/vedett-karrier/types/employer'
import type { VkmmSubDimension } from '../../../../lib/vedett-karrier/types/index'
import { VKMM_DIMENSIONS } from '../../../../lib/vedett-karrier/seed/vkmm-seed'

interface Props {
  role: JobRoleRow
  workplaces: WorkplaceRow[]
  allSubDimensions: VkmmSubDimension[]
  savedEnvValues: JobRoleEnvValueRow[]
  onBack?: () => void
}

function getValueLabel(sub: VkmmSubDimension, row: JobRoleEnvValueRow): string {
  if (sub.value_type === 'ordinal' && row.ordinal_value !== null) {
    const label = sub.ordinal_labels?.find(l => l.v === row.ordinal_value)
    return label ? `${row.ordinal_value} – ${label.label}` : String(row.ordinal_value)
  }
  if (sub.value_type === 'categorical' && row.categorical_value !== null) {
    return sub.categorical_labels?.[row.categorical_value] ?? row.categorical_value
  }
  if (sub.value_type === 'boolean' && row.boolean_value !== null) {
    return row.boolean_value ? 'Igen' : 'Nem'
  }
  if (sub.value_type === 'frequency' && row.frequency_value !== null) {
    return sub.frequency_labels?.[row.frequency_value] ?? row.frequency_value
  }
  return '–'
}

export default function Step7Review({ role, workplaces, allSubDimensions, savedEnvValues, onBack }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [activated, setActivated] = useState(false)
  const [isPending, startTransition] = useTransition()

  const gate = checkActivationGate(role)
  const workplace = workplaces.find(w => w.id === role.workplace_id)

  function handleActivate() {
    setError(null)
    startTransition(async () => {
      const result = await activateJobRole(role.id)
      if (!result.ok) { setError(result.error); return }
      setActivated(true)
    })
  }

  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm text-gray-500">
        Tekintsd át a Munkakör-Térképet. Ha minden rendben van, aktiválhatod a munkakört.
      </p>

      {activated && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-5 py-4">
          <p className="text-sm font-semibold text-teal-800">✓ A munkakör sikeresen aktiválva.</p>
          <p className="text-xs text-teal-700 mt-1">
            A Munkakör-Térkép most publikusan elérhető.
          </p>
        </div>
      )}

      {/* ─── Alapadatok ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-bold text-gray-800 mb-3">Alapadatok</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="text-gray-400 w-36 flex-shrink-0">Megnevezés</dt>
            <dd className="text-gray-800 font-medium">{role.title_hu}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-gray-400 w-36 flex-shrink-0">Telephely</dt>
            <dd className="text-gray-700">{workplace ? `${workplace.name_hu}${workplace.city ? `, ${workplace.city}` : ''}` : '–'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-gray-400 w-36 flex-shrink-0">Munkakörcsalád</dt>
            <dd className="text-gray-700">{role.job_family_slug ?? '–'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-gray-400 w-36 flex-shrink-0">Foglalkoztatás</dt>
            <dd className="text-gray-700">{role.employment_type ?? '–'}</dd>
          </div>
        </dl>

        {role.summary_hu && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 mb-1">Összefoglaló</p>
            <p className="text-sm text-gray-700">{role.summary_hu}</p>
          </div>
        )}

        {role.main_tasks_json?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 mb-2">Fő feladatok</p>
            <ul className="space-y-1">
              {role.main_tasks_json.map((task, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-teal-400 flex-shrink-0">•</span>
                  {task}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ─── VKMM Munkakör-Térkép ─── */}
      <section>
        <h2 className="text-base font-bold text-gray-800 mb-3">VKMM Munkakör-Térkép</h2>
        <p className="text-xs text-gray-400 mb-4">
          Az alábbi adatok a munkakör tényleges működési körülményeit írják le.
          Nem minősítés – tényszerű leírás.
        </p>

        {VKMM_DIMENSIONS.filter(d => d.is_active).map(dim => {
          const subs = allSubDimensions.filter(s => s.dimension_code === dim.code && s.is_active)
          if (subs.length === 0) return null

          return (
            <div key={dim.code} className="mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{dim.name_hu}</p>
              </div>
              <div className="divide-y divide-gray-100">
                {subs.map(sub => {
                  const row = savedEnvValues.find(v => v.sub_dimension_code === sub.code)
                  const valueLabel = row ? getValueLabel(sub, row) : null

                  return (
                    <div key={sub.code} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">{sub.name_employer_hu}</p>
                        {row?.public_context_note && (
                          <p className="text-xs text-gray-400 italic mt-0.5">{row.public_context_note}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {valueLabel ? (
                          <span className="text-xs text-gray-800 font-medium">{valueLabel}</span>
                        ) : (
                          <span className="text-xs text-gray-300">Nincs adat</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* ─── Aktiválás ─── */}
      {!activated && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Aktiválás</h2>

          {/* Completion */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-sni-brand-teal h-2 rounded-full"
                style={{ width: `${role.profile_completion_pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-600">{role.profile_completion_pct}% kitöltve</span>
          </div>

          {/* Activation gate */}
          {!gate.canActivate && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-2">
                Még {gate.missingItems.length} feltétel hiányzik az aktiváláshoz:
              </p>
              <ul className="space-y-1">
                {gate.missingItems.map((item, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-2">
                    <span>•</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mb-3" role="alert">{error}</p>}

          <div className="flex gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-full border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                ← Vissza
              </button>
            )}
            <button
              type="button"
              onClick={handleActivate}
              disabled={isPending || !gate.canActivate}
              className="rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Aktiválás…' : 'Munkakör aktiválása'}
            </button>
          </div>

          {!gate.canActivate && (
            <p className="text-xs text-gray-400 mt-3">
              A munkakör piszkozatként mentve marad, amíg az összes feltétel nem teljesül.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
