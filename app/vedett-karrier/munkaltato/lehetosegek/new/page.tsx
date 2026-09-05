/**
 * Védett Karrier – Új álláslehetőség létrehozása (Employer)
 * Sprint 6
 *
 * Csak jóváhagyott employer érheti el.
 * A munkakörnek aktívnak kell lennie.
 * Létrehozás után a lehetőség draft státuszban van;
 * az employer külön aktiválja.
 *
 * KRITIKUS:
 * - Nincs belső ATS / jelöltpipeline
 * - Csak külső kapcsolatfelvétel (URL / email / utasítás)
 * - Nincs jelöltszűrés, -rangsorolás, -értékelés
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../../lib/supabase/server'
import { getEmployerByUserId, isEmployerApproved, getJobRoleByIdForEmployer } from '../../../../../lib/vedett-karrier/employer/data'
import { createJobOpportunity, activateJobOpportunity } from '../../../../../lib/vedett-karrier/opportunity/actions'
import { buildLoginRedirect } from '../../../../../lib/vedett-karrier/returnTo'

export const metadata = {
  title: 'Új álláslehetőség – Védett Karrier',
}

interface Props {
  searchParams: Promise<{ jobRoleId?: string }>
}

export default async function NewOpportunityPage(props: Props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // jobRoleId query paramétert is megőrizzük a return target-ben
    const base = '/vedett-karrier/munkaltato/lehetosegek/new'
    const jobRoleId = searchParams.jobRoleId
    const returnPath = jobRoleId ? `${base}?jobRoleId=${encodeURIComponent(jobRoleId)}` : base
    redirect(buildLoginRedirect(returnPath))
  }

  const employer = await getEmployerByUserId(user.id).catch(() => null)
  if (!employer || !isEmployerApproved(employer)) {
    return (
      <main className="max-w-xl mx-auto px-4 py-12">
        <p className="text-red-600">A munkáltatói profil nem jóváhagyott. Lehetőséget csak jóváhagyott munkáltató hozhat létre.</p>
        <Link href="/vedett-karrier/munkaltato" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Vissza a dashboardra</Link>
      </main>
    )
  }

  const jobRoleId = searchParams.jobRoleId
  if (!jobRoleId) notFound()

  const role = await getJobRoleByIdForEmployer(jobRoleId, employer.id).catch(() => null)
  if (!role || role.status !== 'active') {
    return (
      <main className="max-w-xl mx-auto px-4 py-12">
        <p className="text-red-600">A megadott munkakör nem található, nem a tiéd, vagy nem aktív.</p>
        <Link href="/vedett-karrier/munkaltato" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Vissza</Link>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link
        href={`/vedett-karrier/munkaltato/munkakorok/${jobRoleId}`}
        className="text-sm text-blue-600 hover:underline mb-6 inline-block"
      >
        ← Vissza a munkakörre
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Új álláslehetőség</h1>
      <p className="text-sm text-gray-500 mb-6">
        Munkakör: <strong className="text-gray-700">{role.title_hu}</strong>
      </p>

      <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        A lehetőség piszkozatként jön létre. Ellenőrzés után te aktiválod – ettől válik nyilvánosan láthatóvá.
        A Védett Karrier nem kezeli a jelölteket: a kapcsolatfelvétel külső csatornán történik.
      </div>

      <form
        action={async (formData: FormData) => {
          'use server'
          const method = formData.get('application_method') as string
          const result = await createJobOpportunity({
            job_role_id:                 jobRoleId,
            title_override_hu:           (formData.get('title_override_hu') as string) || null,
            description_hu:              formData.get('description_hu') as string,
            requirements_hu:             (formData.get('requirements_hu') as string) || null,
            application_method:          method as 'EXTERNAL_URL' | 'EMAIL' | 'CONTACT_INSTRUCTIONS',
            application_url:             (formData.get('application_url') as string) || null,
            application_email:           (formData.get('application_email') as string) || null,
            application_instructions_hu: (formData.get('application_instructions_hu') as string) || null,
            contact_person_name:         (formData.get('contact_person_name') as string) || null,
            contact_person_title:        (formData.get('contact_person_title') as string) || null,
            valid_from:                  (formData.get('valid_from') as string) || null,
            valid_until:                 (formData.get('valid_until') as string) || null,
          })
          if (result.ok && result.data) {
            redirect(`/vedett-karrier/munkaltato/lehetosegek/${result.data.id}`)
          }
        }}
        className="space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cím (opcionális – ha eltér a munkakör nevétől)
          </label>
          <input
            name="title_override_hu"
            type="text"
            maxLength={300}
            placeholder={role.title_hu}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Leírás <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description_hu"
            required
            rows={5}
            maxLength={5000}
            placeholder="Miről szól ez a lehetőség? Mit kínáltok?"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Elvárások / megjegyzések (opcionális)
          </label>
          <textarea
            name="requirements_hu"
            rows={3}
            maxLength={3000}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Kapcsolatfelvétel módja <span className="text-red-500">*</span>
          </label>
          <select
            name="application_method"
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Válassz…</option>
            <option value="EXTERNAL_URL">Külső weboldal (URL)</option>
            <option value="EMAIL">E-mail cím</option>
            <option value="CONTACT_INSTRUCTIONS">Leírt útmutató</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Külső URL (ha „Külső weboldal&quot;)</label>
          <input name="application_url" type="url" maxLength={2000} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail cím (ha „E-mail&quot;)</label>
          <input name="application_email" type="email" maxLength={300} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Útmutató szövege (ha „Leírt útmutató&quot;)</label>
          <textarea name="application_instructions_hu" rows={3} maxLength={2000} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kapcsolattartó neve</label>
            <input name="contact_person_name" type="text" maxLength={200} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beosztása</label>
            <input name="contact_person_title" type="text" maxLength={200} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Érvényesség kezdete</label>
            <input name="valid_from" type="date" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Határidő</label>
            <input name="valid_until" type="date" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors"
          >
            Lehetőség mentése (piszkozatként)
          </button>
        </div>
      </form>
    </main>
  )
}
