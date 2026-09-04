/**
 * Védett Karrier – Munkakör-Térkép nyilvános oldal
 * Sprint 4
 *
 * Publikusan elérhető, ha role.status === 'active'.
 * Employer saját piszkozatát is megtekintheti.
 * NEM mutat: suitability, score, badge, compatibility, autizmusbarát.
 * NEM mutat: user profilt, career_profile_dimensions-t.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase/server'
import { getJobRoleById, getEmployerByUserId, getEnvValuesByJobRoleId } from '../../../../../lib/vedett-karrier/employer/data'
import { VKMM_DIMENSIONS, VKMM_SUB_DIMENSIONS } from '../../../../../lib/vedett-karrier/seed/vkmm-seed'
import type { JobRoleEnvValueRow } from '../../../../../lib/vedett-karrier/types/employer'
import type { VkmmSubDimension } from '../../../../../lib/vedett-karrier/types'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  const role = await getJobRoleById(params.id).catch(() => null)
  return {
    title: role ? `${role.title_hu} – Munkakör-Térkép` : 'Munkakör-Térkép – Védett Karrier',
  }
}

function getValueLabel(sub: VkmmSubDimension, row: JobRoleEnvValueRow): string | null {
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
  return null
}

export default async function JobRoleMapPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = await getJobRoleById(params.id)
  if (!role) notFound()

  // Draft: only owner employer can view
  if (role.status !== 'active') {
    if (!user) notFound()
    const employer = await getEmployerByUserId(user.id)
    if (!employer || employer.id !== role.employer_id) notFound()
  }

  const savedEnvValues = await getEnvValuesByJobRoleId(params.id)
  const activeSubs = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)

  // Check if current user is the employer owner
  let isOwner = false
  if (user) {
    const employer = await getEmployerByUserId(user.id).catch(() => null)
    isOwner = employer?.id === role.employer_id
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Védett Karrier</p>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">{role.title_hu}</h1>
            {role.status === 'draft' && (
              <span className="flex-shrink-0 rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-semibold">
                Piszkozat
              </span>
            )}
            {role.status === 'active' && (
              <span className="flex-shrink-0 rounded-full bg-teal-50 text-teal-700 px-3 py-1 text-xs font-semibold">
                Aktív
              </span>
            )}
          </div>
        </div>

        {role.job_family_slug && (
          <p className="text-sm text-teal-700 mb-1">Munkakörcsalád: {role.job_family_slug}</p>
        )}
        {role.employment_type && (
          <p className="text-sm text-gray-500 mb-4">Foglalkoztatás: {role.employment_type}</p>
        )}

        {isOwner && (
          <div className="mb-6 flex flex-wrap gap-3">
            <Link
              href={`/vedett-karrier/munkaltato/munkakorok/${role.id}/szerkesztes`}
              className="inline-block rounded-full border border-sni-brand-teal px-4 py-1.5 text-xs font-semibold text-sni-brand-teal hover:bg-teal-50"
            >
              ← Szerkesztés folytatása
            </Link>
            {role.status === 'active' && (
              <Link
                href={`/vedett-karrier/munkaltato/lehetosegek/new?jobRoleId=${role.id}`}
                className="inline-block rounded-full bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                + Új álláslehetőség ehhez a munkakörhez
              </Link>
            )}
          </div>
        )}

        {/* Context note */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 mb-6">
          <p className="text-xs text-blue-700">
            <strong>Mi ez?</strong> A Munkakör-Térkép a munkakör tényleges működési körülményeit írja le objektíven –
            nem minősítés, nem rangsor. Célja, hogy mindenki tájékozottan dönthessen.
          </p>
        </div>

        {/* Summary */}
        {role.summary_hu && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Összefoglaló</h2>
            <p className="text-sm text-gray-700">{role.summary_hu}</p>
          </section>
        )}

        {/* Main tasks */}
        {role.main_tasks_json?.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Fő feladatok</h2>
            <ul className="space-y-1.5">
              {role.main_tasks_json.map((task, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-teal-400 flex-shrink-0 mt-0.5">•</span>
                  {task}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Completion indicator (owner only) */}
        {isOwner && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 mb-4 flex items-center gap-4">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="bg-sni-brand-teal h-2 rounded-full"
                style={{ width: `${role.profile_completion_pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 flex-shrink-0">{role.profile_completion_pct}% VKMM kitöltve</span>
          </div>
        )}

        {/* VKMM Dimensions */}
        <section>
          <h2 className="text-base font-bold text-gray-800 mb-1">VKMM Munkakör-Térkép</h2>
          <p className="text-xs text-gray-400 mb-4">
            A 10 dimenzió a munkakör tényleges körülményeit írja le. Nem értékelés – tényszerű leírás.
          </p>

          {VKMM_DIMENSIONS.filter(d => d.is_active).map(dim => {
            const subs = activeSubs.filter(s => s.dimension_code === dim.code)
            if (subs.length === 0) return null

            const filledCount = subs.filter(s => {
              const row = savedEnvValues.find(v => v.sub_dimension_code === s.code)
              return row && getValueLabel(s, row) !== null
            }).length

            return (
              <div key={dim.code} className="mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{dim.name_hu}</p>
                  <p className="text-xs text-gray-400">{filledCount}/{subs.length}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {subs.map(sub => {
                    const row = savedEnvValues.find(v => v.sub_dimension_code === sub.code)
                    const valueLabel = row ? getValueLabel(sub, row) : null

                    return (
                      <div key={sub.code} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500">{sub.name_employer_hu}</p>
                          {row?.public_context_note && (
                            <p className="text-xs text-gray-400 italic mt-0.5">{row.public_context_note}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          {valueLabel !== null ? (
                            <span className="text-xs text-gray-800 font-medium">{valueLabel}</span>
                          ) : (
                            <span className="text-xs text-gray-300">–</span>
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

        {/* Version hash (owner only) */}
        {isOwner && role.profile_version_hash && (
          <p className="text-xs text-gray-300 text-center mt-6">
            Verzió: {role.profile_version_hash.slice(0, 16)}…
          </p>
        )}

        {/* Footer disclaimer */}
        <p className="text-xs text-gray-400 text-center mt-8 pb-8">
          Ez az oldal a munkáltató által megadott adatokat tükrözi. Az SNI nem ellenőrzi az adatok pontosságát.
        </p>
      </div>
    </main>
  )
}
