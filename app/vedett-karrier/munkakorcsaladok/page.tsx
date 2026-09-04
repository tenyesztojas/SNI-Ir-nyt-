/**
 * Védett Karrier – Munkakörcsaládok lista
 * /vedett-karrier/munkakorcsaladok
 * Public (nem igényel auth)
 */

import { getAllJobFamilies } from '@/lib/vedett-karrier/families/data'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Task-pattern csoportok
const PATTERN_GROUPS: { label: string; prefixes: string[] }[] = [
  {
    label: 'Digitális és adminisztratív feladatok',
    prefixes: ['admin-strukturalt', 'adatbevitel-adatkezeles', 'dokumentacio-nyilvantartas', 'digitalis-hattermunka', 'digitalis-ugyintezes'],
  },
  {
    label: 'Minőség, ellenőrzés, logisztika',
    prefixes: ['minoseg-ellenorzes', 'keszlet-logisztika', 'kezi-csomagolas-valogatás', 'megfigyeles-monitorozas'],
  },
  {
    label: 'Műszaki és terepi feladatok',
    prefixes: ['technikai-karbantartas', 'terep-kulteri-munka'],
  },
  {
    label: 'Információ, kutatás, tartalom',
    prefixes: ['kutatas-informaciofeldolgozas', 'szoveges-tartalom', 'vizualis-designtamogatas', 'kreativ-digitalis'],
  },
  {
    label: 'Kézzel végzett és precíz munka',
    prefixes: ['kezzel-preciz', 'elelmiszer-elokeszites', 'novenyek-kornyezet', 'tisztasag-rendezettség'],
  },
  {
    label: 'Emberekkel és közösséggel',
    prefixes: ['gondoskodas-tamogatas', 'ugyfel-informacios', 'oktatasi-tamogatas', 'szociometriai-kozossegi'],
  },
  {
    label: 'Pénzügy és szállítás',
    prefixes: ['keszpenz-penzugyi-admin', 'szallitas-fuvarozas'],
  },
]

export default async function MunkakorcsaladokPage() {
  const families = await getAllJobFamilies()
  const familyBySlug = new Map(families.map(f => [f.slug, f]))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Munkakörcsaládok</h1>
      <p className="text-sm text-gray-500 mb-8">
        25 feladatminta-alapú munkakörcsalád. Nem iparági kategória – hanem arra épül, mit csinálsz a munkában.
        Egy munkakörcsalád számos iparágban megjelenhet.
      </p>

      {PATTERN_GROUPS.map(group => {
        const groupFamilies = group.prefixes
          .map(slug => familyBySlug.get(slug))
          .filter(Boolean) as typeof families
        if (groupFamilies.length === 0) return null

        return (
          <section key={group.label} className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
              {group.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupFamilies.map(family => (
                <Link
                  key={family.slug}
                  href={`/vedett-karrier/munkakorcsaladok/${family.slug}`}
                  className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-sni-brand-teal hover:shadow-sm transition-all group"
                >
                  <h3 className="font-semibold text-gray-800 text-sm group-hover:text-sni-brand-teal transition-colors">
                    {family.name_hu}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {family.task_pattern_summary}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}

      <p className="mt-8 text-xs text-gray-400">
        A munkakörcsaládok feladatmintán alapulnak – nem diagnosztikai célt szolgálnak,
        és nem meghatározók arra, milyen munkát vállalhatsz.
      </p>
    </div>
  )
}
