'use client'
/**
 * Védett Karrier – Insufficient Data Banner
 * Sprint 3 – Jelenít, ha nincs elég adat a discovery-hoz.
 */

import Link from 'next/link'
import type { JobFamilyRow } from '@/lib/vedett-karrier/types/discovery'

interface Props {
  allFamilies: JobFamilyRow[]
}

export default function InsufficientDataBanner({ allFamilies }: Props) {
  return (
    <div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-8">
        <p className="text-sm font-semibold text-amber-800 mb-2">
          Töltsd ki a Munkaprofilodat és a Képességtérképet
        </p>
        <p className="text-sm text-amber-700 mb-4">
          Így személyre szabottabb felfedezési javaslatokat kaphatunk számodra.
        </p>
        <div className="flex gap-3">
          <Link
            href="/vedett-karrier/munkaprofil"
            className="rounded-full bg-sni-brand-teal px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Munkaprofil kitöltése
          </Link>
          <Link
            href="/vedett-karrier/kepessegek"
            className="rounded-full border border-sni-brand-teal px-4 py-2 text-xs font-semibold text-sni-brand-teal hover:bg-teal-50"
          >
            Képességtérkép kitöltése
          </Link>
        </div>
      </div>

      {/* Browse all families */}
      <h2 className="text-base font-semibold text-gray-700 mb-4">
        Addig is – böngéssz a munkakörcsaládok között:
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {allFamilies.slice(0, 10).map(family => (
          <Link
            key={family.slug}
            href={`/vedett-karrier/munkakorcsaladok/${family.slug}`}
            className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-sni-brand-teal transition-colors"
          >
            <p className="text-sm font-semibold text-gray-800">{family.name_hu}</p>
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{family.task_pattern_summary}</p>
          </Link>
        ))}
      </div>
      <div className="mt-4">
        <Link href="/vedett-karrier/munkakorcsaladok" className="text-sm text-sni-brand-teal hover:underline">
          Összes munkakörcsalád →
        </Link>
      </div>
    </div>
  )
}
