/**
 * Védett Karrier – Employer lehetőség kezelés (detail + activate/close)
 * Sprint 6
 *
 * Csak az employer owner láthatja a saját lehetőségét (bármely státuszban).
 * Aktiválás: draft → active (publikusan látható lesz)
 * Lezárás: active → closed (visszafordíthatatlan, NEM törlés)
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase/server'
import { getEmployerByUserId, isEmployerApproved } from '../../../../../lib/vedett-karrier/employer/data'
import { getOpportunityByIdForEmployer } from '../../../../../lib/vedett-karrier/opportunity/data'
import { activateJobOpportunity, closeJobOpportunity } from '../../../../../lib/vedett-karrier/opportunity/actions'

interface Props {
  params: { id: string }
}

const STATUS_LABELS: Record<string, string> = {
  draft:  'Piszkozat',
  active: 'Aktív',
  closed: 'Lezárt',
}

const METHOD_LABELS: Record<string, string> = {
  EXTERNAL_URL:         'Külső URL',
  EMAIL:                'E-mail',
  CONTACT_INSTRUCTIONS: 'Útmutató',
}

export default async function EmployerOpportunityDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/bejelentkezes')

  const employer = await getEmployerByUserId(user.id).catch(() => null)
  if (!employer) notFound()

  const opp = await getOpportunityByIdForEmployer(params.id, employer.id).catch(() => null)
  if (!opp) notFound()

  const statusLabel = STATUS_LABELS[opp.status] ?? opp.status

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link
        href="/vedett-karrier/munkaltato"
        className="text-sm text-blue-600 hover:underline mb-6 inline-block"
      >
        ← Vissza a dashboardra
      </Link>

      <div className="flex items-start justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {opp.title_override_hu ?? '(cím nincs megadva)'}
        </h1>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
          opp.status === 'active'  ? 'bg-teal-50 text-teal-700' :
          opp.status === 'draft'  ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-500'
        }`}>
          {statusLabel}
        </span>
      </div>

      {/* Leírás */}
      <section className="mb-5">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Leírás</h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{opp.description_hu}</p>
      </section>

      {opp.requirements_hu && (
        <section className="mb-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Elvárások</h2>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{opp.requirements_hu}</p>
        </section>
      )}

      {/* Kapcsolatfelvétel */}
      <section className="mb-5">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Kapcsolatfelvétel</h2>
        <p className="text-sm text-gray-700">Módszer: <strong>{METHOD_LABELS[opp.application_method] ?? opp.application_method}</strong></p>
        {opp.application_url   && <p className="text-sm text-gray-700 break-all mt-1">URL: {opp.application_url}</p>}
        {opp.application_email && <p className="text-sm text-gray-700 mt-1">E-mail: {opp.application_email}</p>}
        {opp.application_instructions_hu && (
          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{opp.application_instructions_hu}</p>
        )}
      </section>

      {/* Érvényesség */}
      {(opp.valid_from || opp.valid_until) && (
        <section className="mb-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Érvényesség</h2>
          {opp.valid_from  && <p className="text-sm text-gray-700">Kezdete: {opp.valid_from}</p>}
          {opp.valid_until && <p className="text-sm text-gray-700">Határidő: {opp.valid_until}</p>}
        </section>
      )}

      {/* Actions */}
      <div className="pt-4 flex flex-wrap gap-3 border-t border-gray-200">
        {opp.status === 'draft' && isEmployerApproved(employer) && (
          <form action={async () => {
            'use server'
            await activateJobOpportunity(params.id)
            redirect(`/vedett-karrier/munkaltato/lehetosegek/${params.id}`)
          }}>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700"
            >
              Aktiválás (nyilvánosra)
            </button>
          </form>
        )}

        {opp.status === 'active' && (
          <form action={async () => {
            'use server'
            await closeJobOpportunity(params.id)
            redirect(`/vedett-karrier/munkaltato/lehetosegek/${params.id}`)
          }}>
            <button
              type="submit"
              className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded hover:bg-red-50"
              onClick={(e) => {
                if (!confirm('Biztosan lezárod ezt a lehetőséget? Ez nem vonható vissza.')) e.preventDefault()
              }}
            >
              Lehetőség lezárása
            </button>
          </form>
        )}

        {opp.status === 'active' && (
          <Link
            href={`/vedett-karrier/lehetosegek/${opp.id}`}
            target="_blank"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50"
          >
            Nyilvános nézet ↗
          </Link>
        )}
      </div>

      {opp.status === 'closed' && (
        <p className="mt-4 text-sm text-gray-400">Ez a lehetőség lezárt – nyilvánosan nem látható.</p>
      )}
    </main>
  )
}
