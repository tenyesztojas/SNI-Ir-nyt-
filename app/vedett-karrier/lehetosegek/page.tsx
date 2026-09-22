/**
 * Védett Karrier – Álláslehetőségek lista
 * Sprint 6
 *
 * Publikusan elérhető (anon is láthatja).
 * Csak aktív (status='active') lehetőségeket listáz.
 *
 * KRITIKUS:
 * - Nincs suitability score, ranking, AI matching
 * - Nincs user profil összehasonlítás ezen az oldalon
 * - Employer NEM látja a user interakciókat
 */

import Link from 'next/link'
import { getActiveOpportunities } from '../../../lib/vedett-karrier/opportunity/data'
import { getJobRoleById } from '../../../lib/vedett-karrier/employer/data'
import type { JobOpportunityRow } from '../../../lib/vedett-karrier/types/opportunity'

export const metadata = {
  title: 'Munkalehetőségek – Védett Karrier',
  description: 'Munkáltatók által feltöltött munkalehetőségek a Védett Karrierben.',
}

function ApplicationMethodLabel({ method }: { method: JobOpportunityRow['application_method'] }) {
  const labels: Record<typeof method, string> = {
    EXTERNAL_URL:            'Külső jelentkezési oldal',
    EMAIL:                   'E-mail',
    CONTACT_INSTRUCTIONS:    'Kapcsolatfelvételi útmutató',
  }
  return <span className="text-sm text-gray-500">{labels[method]}</span>
}

export default async function LehetosegekPage() {
  const opportunities = await getActiveOpportunities().catch(() => [])

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Munkalehetőségek</h1>
      <p className="text-gray-600 mb-8 text-sm">
        Itt olyan munkákat találsz, amelyeket munkáltatók töltöttek fel a Védett Karrierbe.
      </p>
      <p className="text-gray-600 mb-8 text-sm">
        Ha elkészítetted a Munkaprofilodat, megnézheted, hogy az adott munka körülményei mennyire illenek hozzád.
        Ehhez jelentkezz be.
      </p>

      {opportunities.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">
          Jelenleg nincs elérhető munkalehetőség. Nézz vissza később.
        </p>
      ) : (
        <ul className="space-y-4">
          {opportunities.map(opp => (
            <li key={opp.id} className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/vedett-karrier/lehetosegek/${opp.id}`}
                    className="text-base font-medium text-gray-900 hover:underline"
                  >
                    {opp.title_override_hu ?? '(Cím betöltése…)'}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-3 items-center">
                    <ApplicationMethodLabel method={opp.application_method} />
                    {opp.valid_until && (
                      <span className="text-xs text-gray-400">
                        Határidő: {opp.valid_until}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                    {opp.description_hu}
                  </p>
                </div>
                <Link
                  href={`/vedett-karrier/lehetosegek/${opp.id}`}
                  className="shrink-0 text-sm text-blue-600 hover:underline whitespace-nowrap"
                  aria-label={`Részletek: ${opp.title_override_hu ?? 'lehetőség'}`}
                >
                  Részletek →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
