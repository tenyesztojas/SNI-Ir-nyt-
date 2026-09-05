/**
 * Védett Karrier – Álláslehetőség részletes oldal
 * Sprint 6
 *
 * Publikusan elérhető aktív lehetőség.
 * Lezárt (closed) lehetőség: 404.
 * Piszkozat (draft): csak employer saját dashboard-ján látható, itt 404.
 *
 * Kapcsolatfelvétel KÜLSŐ (EXTERNAL_URL / EMAIL / CONTACT_INSTRUCTIONS).
 * NEM küld user profiladatot a munkáltatónak.
 * Nincs belső ATS, nincs jelöltpipeline.
 *
 * Ha bejelentkezve van a user → link a Kompatibilitási Térképre
 * (ez user-oldali önértékelés, NEM munkáltatói szűrőeszköz).
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase/server'
import { getOpportunityById } from '../../../../lib/vedett-karrier/opportunity/data'
import { getJobRoleById } from '../../../../lib/vedett-karrier/employer/data'
import type { JobOpportunityRow } from '../../../../lib/vedett-karrier/types/opportunity'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const opp = await getOpportunityById(params.id).catch(() => null)
  const title = opp?.title_override_hu ?? 'Álláslehetőség'
  return {
    title: `${title} – Védett Karrier`,
  }
}

function ContactSection({ opp }: { opp: JobOpportunityRow }) {
  if (opp.application_method === 'EXTERNAL_URL' && opp.application_url) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Kapcsolatfelvétel</h2>
        <a
          href={opp.application_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          Tovább a jelentkezési oldalra ↗
        </a>
        <p className="mt-2 text-xs text-gray-500">
          Ez külső webhelyre mutat. A Védett Karrier nem kezeli a jelentkezési folyamatot.
        </p>
      </div>
    )
  }

  if (opp.application_method === 'EMAIL' && opp.application_email) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Kapcsolatfelvétel e-mailben</h2>
        <p className="text-sm text-gray-800 font-mono bg-gray-50 border border-gray-200 rounded px-3 py-2 inline-block">
          {opp.application_email}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Másolj és küldj e-mailt közvetlenül a munkáltatónak. A Védett Karrier nem közvetíti az üzenetet.
        </p>
      </div>
    )
  }

  if (opp.application_method === 'CONTACT_INSTRUCTIONS' && opp.application_instructions_hu) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Kapcsolatfelvétel módja</h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded px-3 py-2">
          {opp.application_instructions_hu}
        </p>
      </div>
    )
  }

  return (
    <p className="mt-6 text-sm text-gray-500">
      A kapcsolatfelvétel módja egyelőre nem elérhető. Keresd a munkáltatót közvetlen úton.
    </p>
  )
}

export default async function OpportunityDetailPage(props: Props) {
  const params = await props.params;
  const opp = await getOpportunityById(params.id).catch(() => null)

  // 404 ha nem létezik, lezárt, vagy piszkozat
  if (!opp || opp.status !== 'active') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = await getJobRoleById(opp.job_role_id).catch(() => null)

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Vissza */}
      <Link
        href="/vedett-karrier/lehetosegek"
        className="text-sm text-blue-600 hover:underline mb-6 inline-block"
      >
        ← Vissza az összes lehetőséghez
      </Link>

      {/* Cím */}
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">
        {opp.title_override_hu ?? role?.title_hu ?? 'Állláslehetőség'}
      </h1>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
        {role?.job_family_slug && (
          <span>Munkakörcsalád: <strong className="text-gray-700">{role.job_family_slug}</strong></span>
        )}
        {opp.valid_from && (
          <span>Elérhető: <strong className="text-gray-700">{opp.valid_from}</strong></span>
        )}
        {opp.valid_until && (
          <span>Határidő: <strong className="text-gray-700">{opp.valid_until}</strong></span>
        )}
      </div>

      {/* Leírás */}
      <section>
        <h2 className="text-sm font-medium text-gray-700 mb-2">A lehetőségről</h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{opp.description_hu}</p>
      </section>

      {/* Elvárások */}
      {opp.requirements_hu && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Elvárások / megjegyzések</h2>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{opp.requirements_hu}</p>
        </section>
      )}

      {/* Kapcsolattartó */}
      {(opp.contact_person_name || opp.contact_person_title) && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-1">Kapcsolattartó</h2>
          {opp.contact_person_name && (
            <p className="text-sm text-gray-800">{opp.contact_person_name}</p>
          )}
          {opp.contact_person_title && (
            <p className="text-sm text-gray-500">{opp.contact_person_title}</p>
          )}
        </section>
      )}

      {/* Kapcsolatfelvétel */}
      <ContactSection opp={opp} />

      {/* Adatvédelmi tájékoztató */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        <strong>Fontos:</strong> A Védett Karrier nem közvetíti a profiladatodat a munkáltatónak.
        A kapcsolatfelvétel teljesen a tiéd – maga döntöd el, mit osztasz meg.
      </div>

      {/* Ha be van jelentkezve: link a kompatibilitási térképre */}
      {user && role && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-800 mb-2">
            Be vagy jelentkezve. Ha szeretnéd, megnézheted, hogyan illeszkedik ez a munkakör a Munkavállalói Profiloddal.
          </p>
          <Link
            href={`/vedett-karrier/kompatibilitas/${opp.job_role_id}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Kompatibilitási Térkép megtekintése →
          </Link>
          <p className="mt-1 text-xs text-blue-600">
            Ez csak neked látható önértékelési eszköz – a munkáltató nem fér hozzá.
          </p>
        </div>
      )}

      {/* Ha nincs bejelentkezve: CTA a regisztrációhoz */}
      {!user && (
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-700 mb-2">
            Bejelentkezve hozzáférhetsz a Kompatibilitási Térképhez – megmutatja, hogyan illeszkedik ez a munkakör a Munkavállalói Profiloddal.
          </p>
          <Link
            href="/belepes"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Bejelentkezés vagy regisztráció →
          </Link>
        </div>
      )}
    </main>
  )
}
