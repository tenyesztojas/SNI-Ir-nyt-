'use client'
/**
 * Védett Karrier – ProfileSummary
 * Determinisztikus template-alapú összefoglaló.
 * NEM AI-val. NEM diagnosztizál.
 */

import type { ProfileSummaryData } from '@/lib/vedett-karrier/profile/types'

interface Props {
  summary: ProfileSummaryData
  onBack: () => void
}

export default function ProfileSummary({ summary, onBack }: Props) {
  const filled = summary.items.filter(i => i.sentences.length > 0)

  return (
    <div>
      <div className="mb-6 rounded-xl bg-teal-50 border border-teal-100 p-5">
        <h2 className="text-xl font-bold text-teal-900 mb-1">Munkaprofilom összefoglalója</h2>
        <p className="text-sm text-teal-700">
          Ez nem diagnózis, nem teszt és nem rangsorolás. Kizárólag a saját preferenciáidat foglalja össze.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 rounded-full bg-teal-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${summary.completionPct}%` }}
              role="progressbar"
              aria-valuenow={summary.completionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Kitöltöttség"
            />
          </div>
          <span className="text-sm font-semibold text-teal-700">{summary.completionPct}%</span>
        </div>
        <p className="mt-1 text-xs text-teal-600">
          {summary.answeredCount} / {summary.totalCount} aldimenzió kitöltve
        </p>
      </div>

      {summary.completionPct < 20 && (
        <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          A profil összefoglalóhoz érdemes legalább néhány dimenziót kitölteni.
        </div>
      )}

      {filled.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          <p className="text-sm">Még nem töltöttél ki egyetlen dimenziót sem.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-full bg-sni-brand-teal px-6 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
          >
            Vissza a kitöltéshez
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filled.map(item => (
            <section key={item.dimensionCode} aria-labelledby={`sum-dim-${item.dimensionCode}`}>
              <h3
                id={`sum-dim-${item.dimensionCode}`}
                className="text-base font-semibold text-gray-800 mb-2 border-b border-gray-100 pb-1"
              >
                {item.dimensionName}
              </h3>
              <ul className="space-y-1">
                {item.sentences.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="mt-1 text-teal-400 flex-shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-500">
            Ez az összefoglaló a kitöltött preferenciáid alapján, automatikusan készül.
            Nem diagnosztikai célt szolgál, és nem kerül megosztásra munkáltatókkal.
          </div>

          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
          >
            ← Vissza a kitöltéshez
          </button>
        </div>
      )}
    </div>
  )
}
