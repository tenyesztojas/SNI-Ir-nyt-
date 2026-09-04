/**
 * Védett Karrier – Kompatibilitási Térkép
 * Sprint 5
 *
 * Route: /vedett-karrier/kompatibilitas/[jobRoleId]
 * Server Component – auto-számít ha elavult/hiányzik.
 *
 * KRITIKUS:
 * - Nincs overall score, nincs percentage, nincs rank, nincs suitability
 * - Employer NEM látja ezt az oldalt
 * - employer_note NEM jelenik meg
 * - LOAD_POINT semleges nyelven jelenik meg
 * - user_note privát, nem kerül megjelenítésre
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase/server'
import { getJobRoleById, getEnvValuesByJobRoleId } from '../../../../lib/vedett-karrier/employer/data'
import { loadSavedDimensions } from '../../../../lib/vedett-karrier/profile/data'
import { VKMM_DIMENSIONS, VKMM_SUB_DIMENSIONS } from '../../../../lib/vedett-karrier/seed/vkmm-seed'
import {
  computeCompatibility,
  buildCompatibilitySummary,
} from '../../../../lib/vedett-karrier/compatibility/engine'
import {
  loadCompatibilityResult,
  isResultStale,
  upsertCompatibilityResult,
  COMPATIBILITY_ENGINE_VERSION,
} from '../../../../lib/vedett-karrier/compatibility/data'
import type { CompatibilityResult } from '../../../../lib/vedett-karrier/types'

interface Props {
  params: { jobRoleId: string }
  searchParams?: { filter?: string }
}

export async function generateMetadata({ params }: Props) {
  const role = await getJobRoleById(params.jobRoleId).catch(() => null)
  return {
    title: role
      ? `${role.title_hu} – Kompatibilitási Térkép – Védett Karrier`
      : 'Kompatibilitási Térkép – Védett Karrier',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Státusz konfiguráció (szöveg + szín)
// ─────────────────────────────────────────────────────────────────────────────

type StatusKey = 'STRONG_FIT' | 'ACCEPTABLE' | 'CLARIFY' | 'LOAD_POINT' | 'UNKNOWN'

const STATUS_CONFIG: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  STRONG_FIT: {
    label: 'Jól illeszkedik',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    dot:   'bg-teal-500',
  },
  ACCEPTABLE: {
    label: 'Elfogadható',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot:   'bg-blue-400',
  },
  CLARIFY: {
    label: 'Érdemes tisztázni',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot:   'bg-amber-400',
  },
  LOAD_POINT: {
    label: 'Lehetséges terhelési pont',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    dot:   'bg-orange-400',
  },
  UNKNOWN: {
    label: 'Nincs elég információ',
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
    dot:   'bg-gray-300',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Determinisztikus explanation szövegek
// NOT AI – template alapú
// ─────────────────────────────────────────────────────────────────────────────

const EXPLANATIONS: Record<string, string> = {
  'employer.missing':       'Ehhez az összehasonlításhoz a munkáltató még nem adott meg adatot.',
  'user.unknown':           'Ehhez a dimenzióhoz nem adtál meg preferenciát.',
  'user.preference_missing':'Ehhez az összehasonlításhoz még nem töltötted ki a preferenciádat.',
  'hi.strong_fit':          'A munkakör tényleges értéke a számodra kifejezetten preferált tartományba esik.',
  'hi.acceptable':          'Ez az érték nem az általad preferált tartományban van, de még az általad elfogadhatónak jelölt szinten belül marad.',
  'hi.clarify':             'Ez a körülmény az általad elfogadhatónak jelölt tartományban van, de mivel számodra különösen fontos, érdemes előre pontosítani.',
  'hi.load_point':          'A munkakörben jellemző érték kívül esik azon a tartományon, amelyet még elfogadhatónak jelöltél.',
  'rp.strong_fit':          'A munkakör tényleges értéke a számodra preferált tartományba esik.',
  'rp.acceptable':          'Ez az érték nem az általad preferált tartományban van, de még az elfogadható tartományodon belül marad.',
  'rp.clarify':             'Ez a körülmény az elfogadható tartományodban van, de fontos dimenziónál érdemes előre egyeztetni.',
  'rp.load_point':          'A munkakörben jellemző érték kívül esik az általad elfogadhatónak jelölt tartományon.',
  'sm.strong_fit':          'A munkakör kategóriája az általad preferált kategóriák közé esik.',
  'sm.acceptable':          'A munkakör kategóriája nem a preferált, de az elfogadhatónak jelölt kategóriák között van.',
  'sm.clarify':             'A kategória elfogadható számodra, de fontossága miatt érdemes előre pontosítani.',
  'sm.load_point':          'A munkakör kategóriája kívül esik az általad elfogadhatónak jelölt körön.',
  'bp.strong_fit':          'A munkakör ezen jellemzője egyezik a számodra preferált értékkel.',
  'bp.indifferent':         'Erre a jellemzőre nincs erős preferenciád – mindkét értéket elfogadhatónak jelölted.',
  'bp.acceptable':          'A munkakör ezen jellemzője nem a preferált, de elfogadható számodra.',
  'bp.clarify':             'Ez a jellemző elfogadható, de fontossága miatt érdemes előre tisztázni.',
  'bp.load_point':          'A munkakör ezen jellemzője kívül esik az általad elfogadhatónak jelölt értékeken.',
  'fr.strong_fit':          'A munkakör tényleges gyakorisága a számodra preferált tartományba esik.',
  'fr.acceptable':          'Ez a gyakoriság nem a preferált tartományodban van, de még elfogadható számodra.',
  'fr.clarify':             'Ez a gyakoriság elfogadható, de fontossága miatt érdemes előre egyeztetni.',
  'fr.load_point':          'A munkakörben jellemző gyakoriság kívül esik az általad elfogadhatónak jelölt tartományon.',
}

function getExplanation(key: string): string {
  return EXPLANATIONS[key] ?? 'Nincs elég információ az összehasonlításhoz.'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function KompatibilitasPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/belepes?next=/vedett-karrier/kompatibilitas/${params.jobRoleId}`)

  // Munkakör betöltése (csak aktív)
  const role = await getJobRoleById(params.jobRoleId)
  if (!role || role.status !== 'active') notFound()

  // User aktív karrierprofil
  const { data: profileData } = await supabase
    .from('career_profiles')
    .select('id, profile_version_hash')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  // Ha nincs profil → CTA
  if (!profileData) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Védett Karrier</p>
          <h1 className="text-xl font-bold text-gray-900 mb-4">Kompatibilitási Térkép</h1>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-6">
            <p className="text-sm text-amber-800 mb-4">
              A kompatibilitás megjelenítéséhez először töltsd ki a Munkaprofilodat.
            </p>
            <Link
              href="/vedett-karrier/munkaprofil"
              className="inline-block rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Munkaprofil kitöltése →
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const careerProfileId = profileData.id
  const careerHash      = profileData.profile_version_hash
  const jobRoleHash     = role.profile_version_hash ?? ''

  // Tárolt eredmény betöltése
  const stored = await loadCompatibilityResult(user.id, params.jobRoleId)
  const stale  = !stored || isResultStale(stored, careerHash, jobRoleHash)

  let results: CompatibilityResult[] = stored?.dimension_results ?? []
  let wasRecomputed = false
  let computeError: string | null = null

  // Auto-recompute ha elavult vagy hiányzik
  if (stale) {
    try {
      const savedRows  = await loadSavedDimensions(careerProfileId)
      const envValues  = await getEnvValuesByJobRoleId(params.jobRoleId)
      const activeSubs = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)

      results = computeCompatibility(savedRows, envValues, activeSubs)

      await upsertCompatibilityResult({
        userId:                   user.id,
        careerProfileId,
        careerProfileVersionHash: careerHash ?? '',
        jobRoleId:                params.jobRoleId,
        jobRoleProfileVersionHash: jobRoleHash,
        dimensionResults:         results,
      })

      wasRecomputed = true
    } catch (err) {
      computeError = 'A kompatibilitás kiszámítása nem sikerült. Kérjük, próbáld újra.'
      console.error('[VK] computeCompatibility page error:', err instanceof Error ? err.message : 'unknown')
    }
  }

  const summary       = buildCompatibilitySummary(results)
  const activeDims    = VKMM_DIMENSIONS.filter(d => d.is_active)
  const activeSubs    = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)
  const byCode        = new Map<string, CompatibilityResult>(results.map(r => [r.subDimensionCode, r]))

  // Filter (searchParams alapján – NEM ranking, NEM score)
  const filter = searchParams?.filter ?? 'all'
  const filterLabel: Record<string, string> = {
    all:        'Mind',
    load_point: 'Lehetséges terhelési pontok',
    clarify:    'Érdemes tisztázni',
    important:  'Számodra különösen fontos',
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Védett Karrier</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{role.title_hu}</h1>
          {role.job_family_slug && (
            <p className="text-sm text-teal-700">{role.job_family_slug}</p>
          )}
          <Link
            href={`/vedett-karrier/munkaltato/munkakorok/${role.id}`}
            className="text-xs text-gray-400 hover:text-gray-600 mt-1 inline-block"
          >
            ← Munkakör-Térkép megtekintése
          </Link>
        </div>

        {/* Magyarázó szöveg */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 mb-6">
          <p className="text-xs text-blue-800">
            <strong>Ez az összevetés azt mutatja meg,</strong> hogyan viszonyulnak a munkakör tényleges körülményei
            a saját Munkaprofilodban megadott preferenciáidhoz.{' '}
            <strong>Nem alkalmassági vizsgálat.</strong> Célja, hogy tájékozottan dönthess.
          </p>
        </div>

        {/* Elavult / újraszámolt banner */}
        {wasRecomputed && !computeError && (
          <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 mb-4">
            <p className="text-xs text-teal-700">
              ✓ Az eredmények frissítve lettek a legújabb Munkaprofilod alapján.
            </p>
          </div>
        )}

        {computeError && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 mb-4">
            <p className="text-xs text-red-700">{computeError}</p>
          </div>
        )}

        {/* Summary kártyák – darabszám, NEM percentage */}
        {results.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            {([ 'STRONG_FIT', 'ACCEPTABLE', 'CLARIFY', 'LOAD_POINT', 'UNKNOWN' ] as StatusKey[]).map(s => {
              const cfg = STATUS_CONFIG[s]
              const count = summary[s.toLowerCase() as keyof typeof summary] as number
              return (
                <div key={s} className={`rounded-xl border px-3 py-3 text-center ${cfg.badge}`}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs mt-0.5 leading-tight">{cfg.label}</p>
                </div>
              )
            })}
          </section>
        )}

        {/* Filter (NEM ranking) */}
        {results.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(filterLabel).map(([key, label]) => (
              <Link
                key={key}
                href={`/vedett-karrier/kompatibilitas/${params.jobRoleId}${key === 'all' ? '' : `?filter=${key}`}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === key
                    ? 'bg-sni-brand-teal text-white border-sni-brand-teal'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-sni-brand-teal'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        )}

        {/* 10 VKMM fődimenzió */}
        {results.length === 0 && !computeError ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              Nincsenek összehasonlítható adatok. Töltsd ki a Munkaprofilodat!
            </p>
            <Link
              href="/vedett-karrier/munkaprofil"
              className="inline-block mt-4 rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Munkaprofil kitöltése →
            </Link>
          </div>
        ) : (
          <section aria-label="Kompatibilitási Térkép dimenziók">
            {activeDims.map(dim => {
              const subs = activeSubs.filter(s => s.dimension_code === dim.code)
              if (subs.length === 0) return null

              const dimResults = subs.map(s => byCode.get(s.code)).filter(Boolean) as CompatibilityResult[]

              // Filter alkalmazása (csak megjelenítési szűrő, NEM ranking)
              const filteredSubs = subs.filter(sub => {
                const r = byCode.get(sub.code)
                if (!r) return filter === 'all'
                if (filter === 'load_point') return r.status === 'LOAD_POINT'
                if (filter === 'clarify')    return r.status === 'CLARIFY'
                if (filter === 'important') {
                  // Ennek az aldimenziónak nincs közvetlen importance az eredményben
                  // CLARIFY mindig fontos, LOAD_POINT is releváns – mindkettőt mutatjuk
                  return r.status === 'CLARIFY' || r.status === 'LOAD_POINT'
                }
                return true
              })

              if (filteredSubs.length === 0) return null

              const loadCount   = dimResults.filter(r => r.status === 'LOAD_POINT').length
              const clarifyCount = dimResults.filter(r => r.status === 'CLARIFY').length

              return (
                <details key={dim.code} open className="mb-3 rounded-xl border border-gray-200 bg-white overflow-hidden group">
                  <summary className="cursor-pointer list-none px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{dim.name_hu}</span>
                      {loadCount > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
                          {loadCount} terhelési pont
                        </span>
                      )}
                      {clarifyCount > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                          {clarifyCount} tisztázandó
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{dimResults.length} aldimenzió</span>
                  </summary>

                  <div className="divide-y divide-gray-100">
                    {filteredSubs.map(sub => {
                      const r   = byCode.get(sub.code)
                      const cfg = r ? STATUS_CONFIG[r.status as StatusKey] : STATUS_CONFIG.UNKNOWN

                      return (
                        <div key={sub.code} className="px-4 py-4">
                          <div className="flex items-start gap-3">
                            {/* Státusz dot + szöveg (nem csak szín – akadálymentesség) */}
                            <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`}
                                 role="img"
                                 aria-label={cfg.label} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-sm font-medium text-gray-800">{sub.name_user_hu}</p>
                                <span className={`flex-shrink-0 text-xs border rounded-full px-2 py-0.5 ${cfg.badge}`}>
                                  {cfg.label}
                                </span>
                              </div>

                              {/* Explanation (determinisztikus template, NOT AI) */}
                              {r && (
                                <p className="text-xs text-gray-500 mb-2">
                                  {getExplanation(r.explanationKey)}
                                </p>
                              )}

                              {/* CLARIFY CTA */}
                              {r?.status === 'CLARIFY' && (
                                <p className="text-xs text-amber-700 mt-1">
                                  💬 Érdemes erről az interjún rákérdezni.
                                </p>
                              )}

                              {/* LOAD_POINT CTA (semleges nyelvezet) */}
                              {r?.status === 'LOAD_POINT' && (
                                <p className="text-xs text-orange-700 mt-1">
                                  Érdemes megkérdezni: mennyire jellemző ez a körülmény nap mint nap?
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </section>
        )}

        {/* Verzió info (nem score, nem rank) */}
        <p className="text-xs text-gray-300 text-center mt-6">
          Motor v{COMPATIBILITY_ENGINE_VERSION} · {results.length} aldimenzió összehasonlítva
        </p>

        {/* Lábléc – nem döntési javaslat */}
        <div className="mt-6 rounded-xl border border-gray-100 bg-white px-4 py-4 text-center">
          <p className="text-xs text-gray-500 mb-3">
            Az összevetés a te Munkaprofilodban megadott preferenciáidon és a munkáltató VKMM adatain alapul.
            Ez tájékoztató – nem alkalmassági vizsgálat.
          </p>
          <Link
            href={`/vedett-karrier/munkaltato/munkakorok/${role.id}`}
            className="text-xs text-teal-700 hover:underline"
          >
            Munkakör-Térkép részleteinek megtekintése →
          </Link>
        </div>

      </div>
    </main>
  )
}
