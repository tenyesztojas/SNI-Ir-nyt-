/**
 * Védett Karrier – Új munkakör feltérképezése (Server Component wrapper)
 * Sprint 4
 *
 * Server-side authorization gate:
 * 1. Authenticated user check → redirect /belepes ha nincs session
 * 2. Employer record lookup → redirect /munkaltato ha nincs employer
 * 3. Employer approval check → redirect /munkaltato ha nem approved
 *
 * Csak sikeres authorization után rendereli a NewJobRoleClient formot.
 * A form logika és a createJobRole action hívás a client komponensben van.
 */

import { redirect } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase/server'
import { getEmployerByUserId, isEmployerApproved } from '../../../../../lib/vedett-karrier/employer/data'
import NewJobRoleClient from './NewJobRoleClient'

export const metadata = { title: 'Új munkakör – Védett Karrier' }

export default async function NewJobRolePage() {
  // 1. Authentication
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/belepes?next=/vedett-karrier/munkaltato/munkakorok/new')
  }

  // 2. Employer record
  const employer = await getEmployerByUserId(user.id)
  if (!employer) {
    redirect('/vedett-karrier/munkaltato')
  }

  // 3. Employer approval — konzisztens a szerkesztes/page.tsx guard-jával
  if (!isEmployerApproved(employer)) {
    redirect('/vedett-karrier/munkaltato')
  }

  // Authorization passed — render client form
  return <NewJobRoleClient />
}
