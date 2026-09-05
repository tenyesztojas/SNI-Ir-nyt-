/**
 * Védett Karrier – Preferencialap oldal
 * Sprint 6
 *
 * Auth-only. User látja meglévő dokumentumait és újat hozhat létre.
 * PDF export: böngésző print dialógus (CSS @media print), nincs npm dependency.
 *
 * KRITIKUS:
 * - Determinisztikus szöveg (NEM AI)
 * - Privát alapértelmezés (is_shared = false)
 * - Employer NEM fér hozzá (RLS backstop)
 * - User explicit dönt a megosztásról
 * - NEM önéletrajz, NEM alkalmassági dokumentum
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/server'
import { loadSavedDimensions } from '../../../lib/vedett-karrier/profile/data'
import { VKMM_DIMENSIONS, VKMM_SUB_DIMENSIONS } from '../../../lib/vedett-karrier/seed/vkmm-seed'
import { getPreferenceDocumentsByUser } from '../../../lib/vedett-karrier/preferencialap/data'
import { generateAndSavePreferenceDocument } from '../../../lib/vedett-karrier/preferencialap/actions'
import PreferenceDocumentViewer from './PreferenceDocumentViewer'
import type { PreferenceDocumentRow } from '../../../lib/vedett-karrier/types/preferencialap'

export const metadata = {
  title: 'Preferencialap – Védett Karrier',
}

export default async function PreferencialapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/belepes?next=/vedett-karrier/preferencialap')

  // Aktív karrierprofil
  const { data: profile } = await supabase
    .from('career_profiles')
    .select('id, profile_version_hash')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!profile) {
    return (
      <main className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold text-gray-900 mb-3">Preferencialap</h1>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          A Preferencialap elkészítéséhez szükséges, hogy kitöltsd a{' '}
          <Link href="/vedett-karrier/munkaprofil" className="underline font-medium">Munkaprofilodat</Link>.
        </div>
      </main>
    )
  }

  const [savedRows, existingDocs] = await Promise.all([
    loadSavedDimensions(profile.id).catch(() => []),
    getPreferenceDocumentsByUser(user.id).catch(() => []),
  ])

  const activeSubs  = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)
  const answeredCodes = savedRows
    .filter(r => !r.is_unknown)
    .map(r => r.sub_dimension_code)

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Preferencialap</h1>
      <p className="text-sm text-gray-600 mb-6">
        A Preferencialap a saját munkavállalói preferenciáidat tartalmazza – te döntöd el, mit osztasz meg.
        A dokumentum determinisztikus: nincs AI, mindig a profiladataidból épül fel.
        Privát, amíg te magad meg nem osztod.
      </p>

      {/* Meglévő dokumentumok */}
      {existingDocs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Mentett dokumentumaid
          </h2>
          <ul className="space-y-3">
            {existingDocs.map(doc => (
              <PreferenceDocumentViewer key={doc.id} doc={doc} />
            ))}
          </ul>
        </section>
      )}

      {/* Új dokumentum készítő */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Új Preferencialap készítése
        </h2>

        {answeredCodes.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            Még egyetlen dimenziót sem töltöttél ki a Munkafprofilban. Töltsd ki{' '}
            <Link href="/vedett-karrier/munkaprofil" className="underline">itt</Link>.
          </div>
        ) : (
          <form
            action={async (formData: FormData) => {
              'use server'
              const selected = formData.getAll('dimension_codes') as string[]
              const title    = (formData.get('title_hu') as string) || 'Munkapreferencia-lapom'
              await generateAndSavePreferenceDocument({
                careerProfileId:        profile.id,
                selectedDimensionCodes: selected,
                title_hu:               title,
                generatedTextHu:        '',  // actions.ts generálja
              })
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dokumentum neve
              </label>
              <input
                name="title_hu"
                type="text"
                defaultValue="Munkapreferencia-lapom"
                maxLength={200}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">
                Válaszd ki, mely dimenziókat szerepled a dokumentumban:
              </p>
              <div className="space-y-4">
                {VKMM_DIMENSIONS.filter(d => d.is_active).map(dim => {
                  const subs = activeSubs.filter(s => s.dimension_code === dim.code)
                  return (
                    <div key={dim.code}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {dim.name_hu}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {subs.map(sub => {
                          const isAnswered = answeredCodes.includes(sub.code)
                          return (
                            <label
                              key={sub.code}
                              className={`flex items-center gap-2 text-sm cursor-pointer ${!isAnswered ? 'opacity-40' : ''}`}
                            >
                              <input
                                type="checkbox"
                                name="dimension_codes"
                                value={sub.code}
                                disabled={!isAnswered}
                                className="w-4 h-4 text-teal-600"
                              />
                              <span className={isAnswered ? 'text-gray-800' : 'text-gray-400'}>
                                {sub.name_user_hu}
                              </span>
                              {!isAnswered && (
                                <span className="text-xs text-gray-400">(nem kitöltött)</span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors"
              >
                Preferencialap generálása és mentése
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
