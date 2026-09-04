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
  title: 'Álláslehetőségek – Védett Karrier',
  description: 'Aktív munkahelyi lehetőségek befogadó munkáltatóktól.',
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
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Álláslehetőségek</h1>
      <p className="text-gray-600 mb-8 text-sm">
        Ezek az aktuálisan elérhető nyitott pozíciók befogadó munkáltatóktól.
        A Kompatibilitási Térképet a saját fiókodból érheted el, ha be vagy jelentkezve.
      </p>

      {opportunities.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">
          Jelenleg nincs aktív álláslehetőség. Nézz vissza hamarosan.
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
