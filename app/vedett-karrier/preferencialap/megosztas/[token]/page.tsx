/**
 * Védett Karrier – Megosztott Preferencialap (publikus nézet)
 * Sprint 6
 *
 * Anon is elérheti, ha a user explicit megosztotta (is_shared=true + share_token).
 * NEM mutat user_id-t, NEM mutat karrierprofil ID-t.
 * Employer NEM kap automatikus hozzáférést – csak az a link alapján éri el,
 * amelyet a user küldött neki.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSharedPreferenceDocument } from '../../../../../lib/vedett-karrier/preferencialap/data'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const doc = await getSharedPreferenceDocument(params.token).catch(() => null)
  return {
    title: doc ? `${doc.title_hu} – Védett Karrier` : 'Preferencialap – Védett Karrier',
    // Noindex: a share token oldalak személyes adatot tartalmaznak,
    // nem kerülhetnek keresőindexbe.
    // Az X-Robots-Tag HTTP headert a middleware is beállítja (megbízhatóbb crawlerek számára).
    robots: {
      index:  false,
      follow: false,
    },
  }
}

export default async function SharedPreferenceDocPage(props: Props) {
  const params = await props.params;
  const doc = await getSharedPreferenceDocument(params.token).catch(() => null)
  if (!doc) notFound()

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        Ez egy munkavállalói Preferencialap – kizárólag tájékoztatásra készült.
        Nem alkalmassági értékelés, nem rangsor. A dokumentum tulajdonosa osztotta meg veled.
      </div>

      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{doc.title_hu}</h1>
      <p className="text-xs text-gray-400 mb-6">
        Utoljára frissítve: {new Date(doc.updated_at).toLocaleDateString('hu-HU')}
      </p>

      <div className="p-4 bg-gray-50 border border-gray-200 rounded">
        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
          {doc.generated_text_hu}
        </pre>
      </div>

      <div className="mt-8 text-xs text-gray-400">
        Készült a <Link href="/vedett-karrier" className="underline">Védett Karrier</Link> rendszerben.
      </div>
    </main>
  )
}
