import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateCareerProfile, loadSavedDimensions } from '@/lib/vedett-karrier/profile/data'
import { VKMM_SEED } from '@/lib/vedett-karrier/seed/vkmm-seed'
import MunkaprofilWizard from '@/components/vedett-karrier/MunkaprofilWizard'
import type { WizardInitData } from '@/lib/vedett-karrier/profile/types'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Munkaprofilom – Védett Karrier',
  description: 'Töltsd ki a munkakörnyezeti preferenciaproflodat. Nem teszt, nem diagnózis – csak a saját preferenciáid.',
}

export const dynamic = 'force-dynamic'

export default async function MunkaprofilPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/belepes?next=/vedett-karrier/munkaprofil')
  }

  // Career profile lekérése/létrehozása
  const profile = await getOrCreateCareerProfile(user.id)
  if (!profile) {
    // DB hiba esetén hibaoldal helyett egyszerű üzenet
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md rounded-xl bg-white p-8 shadow text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Átmeneti hiba</h1>
          <p className="text-gray-600 text-sm">A profilod betöltése nem sikerült. Kérjük, frissítsd az oldalt.</p>
        </div>
      </div>
    )
  }

  // Meglévő kitöltött dimenziók betöltése
  const savedRows = await loadSavedDimensions(profile.id)

  const initData: WizardInitData = {
    careerProfileId: profile.id,
    dimensions: VKMM_SEED.dimensions,
    subDimensions: VKMM_SEED.subDimensions,
    savedRows,
    completionPct: profile.completion_pct,
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Munkaprofilom</h1>
        <p className="mt-1 text-sm text-gray-500">
          Ez nem teszt, nem diagnózis és nem alkalmassági vizsgálat.
          A saját munkakörnyezeti preferenciáidat rögzítheted itt.
        </p>
      </div>
      <MunkaprofilWizard initData={initData} />
    </main>
  )
}
