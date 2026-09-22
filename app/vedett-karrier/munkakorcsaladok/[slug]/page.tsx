/**
 * Védett Karrier – Family Detail
 * /vedett-karrier/munkakorcsaladok/[slug]
 * Public – Light Készséghíd csak bejelentkezett usernek
 */

import { notFound } from 'next/navigation'
import { getJobFamilyBySlug } from '@/lib/vedett-karrier/families/data'
import { createClient } from '@/lib/supabase/server'
import { getAllSkills, loadUserSkills } from '@/lib/vedett-karrier/skills/data'
import { computeLightSkillBridge } from '@/lib/vedett-karrier/discovery/skill-bridge'
import CareerInterestButton from '@/components/vedett-karrier/discovery/CareerInterestButton'
import LightSkillBridgeSection from '@/components/vedett-karrier/discovery/LightSkillBridgeSection'
import { loadCareerInterests } from '@/lib/vedett-karrier/interests/data'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export default async function FamilyDetailPage({ params }: Props) {
  const family = await getJobFamilyBySlug(params.slug)
  if (!family) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let skillBridge = null
  let currentInterest = null

  if (user) {
    const [allSkills, userSkills, interests] = await Promise.all([
      getAllSkills(),
      loadUserSkills(user.id),
      loadCareerInterests(user.id),
    ])
    skillBridge = computeLightSkillBridge(
      family.core_skills_json,
      family.trainable_skills_json,
      allSkills,
      userSkills
    )
    currentInterest = interests.find(i => i.job_family_slug === family.slug) ?? null
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 mb-1">
          <a href="/vedett-karrier/munkakorcsaladok" className="hover:underline">← Munkakörtípusok</a>
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{family.name_hu}</h1>
        <p className="mt-2 text-sm text-gray-600">{family.description_hu}</p>
      </div>

      {/* Disclaimer */}
      <div className="mb-6 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
        Egy konkrét munkahelyen a körülmények mások lehetnek. Ez a leírás egy tipikus példát mutat be,
        nem egy valódi munkahely adatait.
      </div>

      {/* Career interest (only for auth users) */}
      {user && (
        <CareerInterestButton
          familySlug={family.slug}
          familyName={family.name_hu}
          currentInterest={currentInterest}
        />
      )}

      {/* Tipikus feladatok */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Tipikus feladatok</h2>
        <ul className="space-y-1.5">
          {family.typical_tasks_json.map((task, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-teal-400 flex-shrink-0 mt-0.5">•</span>
              <span>{task}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Példamunkakörök */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Példamunkakörök</h2>
        <div className="flex flex-wrap gap-2">
          {family.example_roles_json.map((role, i) => (
            <span key={i} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
              {role}
            </span>
          ))}
        </div>
      </section>

      {/* Belépési lehetőségek */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Belépési lehetőségek</h2>
        <p className="text-sm text-gray-600">{family.entry_threshold_description}</p>
      </section>

      {/* Fejlődési utak */}
      {family.growth_paths_json.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Lehetséges fejlődési irányok</h2>
          <div className="flex flex-wrap gap-2">
            {family.growth_paths_json.map((path, i) => (
              <span key={i} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-700">
                {path}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Light Készséghíd */}
      {skillBridge ? (
        <LightSkillBridgeSection bridge={skillBridge} />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-5 text-sm text-gray-400 text-center">
          <p className="font-semibold text-gray-500">Készségeim ehhez a munkához</p>
          <p className="mt-1">
            Szeretnéd megnézni, milyen készségeid vannak ehhez a munkához?{' '}
            Töltsd ki a{' '}
            <a href="/vedett-karrier/kepessegek" className="text-sni-brand-teal hover:underline">
              Képességtérképet
            </a>.
          </p>
        </div>
      )}

      <div className="mt-8 text-xs text-gray-400">
        Fontos: Ez az oldal ötleteket ad. Nem dönti el, hogy milyen munkát tudsz vagy nem tudsz elvégezni.
      </div>
    </div>
  )
}
