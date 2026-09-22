/**
 * Védett Karrier – Képességtérkép
 * /vedett-karrier/kepessegek
 * Server Component (auth guard: page-szintű getUser() redirect)
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllSkills } from '@/lib/vedett-karrier/skills/data'
import { loadUserSkills } from '@/lib/vedett-karrier/skills/data'
import SkillMapClient from '@/components/vedett-karrier/kepessegek/SkillMapClient'

export const dynamic = 'force-dynamic'

export default async function KepessegekPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/belepes?next=/vedett-karrier/kepessegek')

  const [allSkills, userSkills] = await Promise.all([
    getAllSkills(),
    loadUserSkills(user.id),
  ])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Képességtérkép</h1>
      <p className="text-sm font-semibold text-sni-brand-teal mb-4">Mit tudok megcsinálni?</p>
      <p className="text-sm text-gray-500 mb-6">
        Megjelölöd, mit tudsz megcsinálni. Ez nem vizsga. Nincs jó vagy rossz válasz.
        A válaszaidat csak te látod. A munkáltató nem látja automatikusan.
      </p>
      <SkillMapClient allSkills={allSkills} initialUserSkills={userSkills} />
    </div>
  )
}
