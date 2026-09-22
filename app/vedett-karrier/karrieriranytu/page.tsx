/**
 * Védett Karrier – Karrieriránytű
 * /vedett-karrier/karrieriranytu
 * Server Component (auth guard: page-szintű getUser() redirect)
 *
 * NEM jelenít: százalék, csillagos score, ranghely, "legjobb találat".
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { assembleDiscoveryInput } from '@/lib/vedett-karrier/discovery/data'
import { runCareerDiscovery } from '@/lib/vedett-karrier/discovery/engine'
import { getAllJobFamilies } from '@/lib/vedett-karrier/families/data'
import FamilyDiscoveryCard from '@/components/vedett-karrier/discovery/FamilyDiscoveryCard'
import InsufficientDataBanner from '@/components/vedett-karrier/discovery/InsufficientDataBanner'

export const dynamic = 'force-dynamic'

export default async function KarrieriranytűPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/belepes?next=/vedett-karrier/karrieriranytu')

  const input = await assembleDiscoveryInput(user.id)
  const output = runCareerDiscovery(input)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Munkák, amelyeket érdemes lehet megnézned</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ezeket a munkakörtípusokat a válaszaid alapján mutatjuk.
        Ez csak segítség a kereséshez. Más munkákat is megnézhetsz.
      </p>

      {!output.hasEnoughData ? (
        <InsufficientDataBanner allFamilies={input.families} />
      ) : (
        <div className="space-y-4">
          {output.results.map(result => (
            <FamilyDiscoveryCard key={result.jobFamily.slug} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}
