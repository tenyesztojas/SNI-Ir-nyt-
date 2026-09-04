/**
 * Védett Karrier – Job Role Card (employer dashboard)
 * Sprint 4
 *
 * Mutat: cím, telephely, státusz, completion %.
 * NEM mutat: suitability, score, badge, minősítés.
 */

import Link from 'next/link'
import type { JobRoleRow, WorkplaceRow } from '../../../lib/vedett-karrier/types/employer'

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Piszkozat', cls: 'bg-gray-100 text-gray-600' },
  active:   { label: 'Aktív',     cls: 'bg-teal-50 text-teal-700' },
  archived: { label: 'Archivált', cls: 'bg-amber-50 text-amber-700' },
}

interface Props {
  role: JobRoleRow
  workplace: WorkplaceRow | null
}

export default function JobRoleCard({ role, workplace }: Props) {
  const statusInfo = STATUS_LABELS[role.status] ?? STATUS_LABELS['draft']

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800">{role.title_hu}</h3>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.cls}`}>
          {statusInfo.label}
        </span>
      </div>

      {workplace && (
        <p className="text-xs text-gray-500">
          📍 {workplace.name_hu}{workplace.city ? `, ${workplace.city}` : ''}
        </p>
      )}

      {role.job_family_slug && (
        <p className="text-xs text-teal-700">Munkakörcsalád: {role.job_family_slug}</p>
      )}

      {/* Completion bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400">VKMM profil kitöltve</p>
          <p className="text-xs text-gray-600 font-medium">{role.profile_completion_pct}%</p>
        </div>
        <div className="bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-sni-brand-teal h-1.5 rounded-full transition-all"
            style={{ width: `${role.profile_completion_pct}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <Link
          href={`/vedett-karrier/munkaltato/munkakorok/${role.id}/szerkesztes`}
          className="flex-1 text-center rounded-full border border-sni-brand-teal px-3 py-1.5 text-xs font-semibold text-sni-brand-teal hover:bg-teal-50"
        >
          Szerkesztés
        </Link>
        <Link
          href={`/vedett-karrier/munkaltato/munkakorok/${role.id}`}
          className="flex-1 text-center rounded-full bg-sni-brand-teal px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Munkakör-Térkép
        </Link>
      </div>
    </div>
  )
}
