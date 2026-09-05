/**
 * Védett Karrier – Munkáltatói Dashboard
 * Sprint 4
 *
 * Auth-only: employer kell.
 * Főoldal: MUNKAKÖREIM + „Új munkakör feltérképezése" CTA.
 * NEM: „Álláshirdetés feladása", „Pozíció meghirdetése".
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/server'
import { getEmployerByUserId, getJobRolesByEmployerId, getWorkplacesByEmployerId } from '../../../lib/vedett-karrier/employer/data'
import JobRoleCard from '../../../components/vedett-karrier/employer/JobRoleCard'

export const metadata = { title: 'Munkáltatói felület – Védett Karrier' }

export default async function EmployerDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/belepes?next=/vedett-karrier/munkaltato')

  const employer = await getEmployerByUserId(user.id)
  if (!employer) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Nincs munkáltatói fiók</h1>
          <p className="text-sm text-gray-600 mb-6">
            A Védett Karrier munkáltatói felületéhez jóváhagyott munkáltatói fiók szükséges.
          </p>
          {/* TEMPORARY LEGACY BRIDGE – nincs még /vedett-karrier/munkaltato/regisztracio route.
              A régi vedettmunka regisztrációs oldal az átmeneti belépési pont.
              TODO: új VK employer registration page implementálásakor cseréld le. */}
          <Link
            href="/vedettmunka/munkaltatoi-regisztracio"
            className="inline-block rounded-full bg-sni-brand-teal px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Munkáltatói regisztráció
          </Link>
        </div>
      </main>
    )
  }

  const isPending = employer.status === 'pending_review'
  const isApproved = employer.status === 'approved'

  const [roles, workplaces] = await Promise.all([
    isApproved ? getJobRolesByEmployerId(employer.id) : Promise.resolve([]),
    isApproved ? getWorkplacesByEmployerId(employer.id) : Promise.resolve([]),
  ])

  const workplaceMap = new Map(workplaces.map(w => [w.id, w]))

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Védett Karrier – Munkáltatói felület</p>
          <h1 className="text-2xl font-bold text-gray-900">{employer.company_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Státusz:{' '}
            <span className={`font-medium ${isApproved ? 'text-teal-700' : 'text-amber-600'}`}>
              {isPending ? 'Jóváhagyásra vár' : isApproved ? 'Jóváhagyott' : employer.status}
            </span>
          </p>
        </div>

        {/* Pending state */}
        {isPending && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 mb-8">
            <p className="text-sm font-semibold text-amber-800">A munkáltatói fiókod jóváhagyásra vár.</p>
            <p className="text-sm text-amber-700 mt-1">
              Amint az adminisztrátor jóváhagyja, elkezdheted a munkakörök feltérképezését.
            </p>
          </div>
        )}

        {isApproved && (
          <>
            {/* CTA */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">Munkaköreim</h2>
              <Link
                href="/vedett-karrier/munkaltato/munkakorok/new"
                className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                + Új munkakör feltérképezése
              </Link>
            </div>

            {roles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <p className="text-sm font-semibold text-gray-600 mb-2">Még nincs feltérképezett munkakör.</p>
                <p className="text-xs text-gray-400 mb-6">
                  A Védett Karrier rendszerében a munkáltató elsőként a munkakört térképezi fel –
                  nem hirdetést ad fel.
                </p>
                <Link
                  href="/vedett-karrier/munkaltato/munkakorok/new"
                  className="inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Munkakör feltérképezése
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {roles.map(role => (
                  <JobRoleCard
                    key={role.id}
                    role={role}
                    workplace={role.workplace_id ? (workplaceMap.get(role.workplace_id) ?? null) : null}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
