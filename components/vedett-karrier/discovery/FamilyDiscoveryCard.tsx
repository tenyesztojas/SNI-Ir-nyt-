'use client'
/**
 * Védett Karrier – Family Discovery Card
 * Sprint 3
 *
 * NEM jelenít: százalék, csillag, ranghely, "legjobb találat", score.
 */

import Link from 'next/link'
import type { CareerDiscoveryResult, DiscoveryReasonCode } from '@/lib/vedett-karrier/types/discovery'

const REASON_LABELS: Record<DiscoveryReasonCode, string> = {
  has_skills:      'Vannak már kapcsolódó készségeid',
  interest_match:  'Megjelölted érdeklődési területként',
  env_overlap:     'A munkakörnyezeti preferenciáid illenek ide',
  trainable_skills:'Könnyen tanulható készségek szükségesek',
}

interface Props {
  result: CareerDiscoveryResult
}

export default function FamilyDiscoveryCard({ result }: Props) {
  const { jobFamily: family, reason_codes } = result

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-800">{family.name_hu}</h2>
      </div>

      <p className="text-sm text-gray-600 mb-3">{family.task_pattern_summary}</p>

      {/* Tipikus feladatok – max 3 */}
      <ul className="mb-4 space-y-1">
        {family.typical_tasks_json.slice(0, 3).map((task, i) => (
          <li key={i} className="flex gap-2 text-xs text-gray-500">
            <span className="text-teal-400 flex-shrink-0">•</span>
            {task}
          </li>
        ))}
      </ul>

      {/* Miért mutatjuk? */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Miért mutatjuk?</p>
        <div className="flex flex-wrap gap-1.5">
          {reason_codes.map(code => (
            <span
              key={code}
              className="rounded-full bg-teal-50 border border-teal-100 px-2.5 py-0.5 text-xs text-teal-700"
            >
              {REASON_LABELS[code]}
            </span>
          ))}
        </div>
      </div>

      <Link
        href={`/vedett-karrier/munkakorcsaladok/${family.slug}`}
        className="inline-block rounded-full bg-sni-brand-teal px-5 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
      >
        Megnézem →
      </Link>
    </div>
  )
}
