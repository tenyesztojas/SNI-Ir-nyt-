/**
 * Védett Karrier – Munkakör szerkesztése (7-lépéses wizard)
 * Sprint 4
 *
 * Server Component: betölti az adatokat, majd átadja a JobRoleWizard client komponensnek.
 * Auth: bejelentkezés + jóváhagyott employer + saját role.
 */

import { redirect, notFound } from 'next/navigation'
import { createClient } from '../../../../../../lib/supabase/server'
import { getEmployerByUserId, getJobRoleByIdForEmployer, getWorkplacesByEmployerId, getEnvValuesByJobRoleId } from '../../../../../../lib/vedett-karrier/employer/data'
import { getAllJobFamilies } from '../../../../../../lib/vedett-karrier/families/data'
import { VKMM_SUB_DIMENSIONS } from '../../../../../../lib/vedett-karrier/seed/vkmm-seed'
import JobRoleWizard from '../../../../../../components/vedett-karrier/employer/wizard/JobRoleWizard'
import type { VkmmSubDimension } from '../../../../../../lib/vedett-karrier/types'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  return { title: 'Munkakör szerkesztése – Védett Karrier' }
}

export default async function JobRoleEditPage(props: Props) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/belepes?next=/vedett-karrier/munkaltato/munkakorok/${params.id}/szerkesztes`)

  const employer = await getEmployerByUserId(user.id)
  if (!employer || employer.status !== 'approved') {
    redirect('/vedett-karrier/munkaltato')
  }

  const [role, workplaces, allFamilies, savedEnvValues] = await Promise.all([
    getJobRoleByIdForEmployer(params.id, employer.id),
    getWorkplacesByEmployerId(employer.id),
    getAllJobFamilies(),
    getEnvValuesByJobRoleId(params.id),
  ])

  if (!role) notFound()

  // Only draft roles can be edited via wizard; archived stays read-only
  // Active roles: wizard allowed for updating, activation gate re-checked
  const allSubDimensions = VKMM_SUB_DIMENSIONS.filter((s: VkmmSubDimension) => s.is_active)

  return (
    <JobRoleWizard
      role={role}
      workplaces={workplaces}
      allFamilies={allFamilies}
      allSubDimensions={allSubDimensions}
      savedEnvValues={savedEnvValues}
    />
  )
}
