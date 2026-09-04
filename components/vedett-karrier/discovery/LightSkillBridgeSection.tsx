'use client'
/**
 * Védett Karrier – Light Készséghíd Section
 * Sprint 3
 *
 * NEM: alkalmas/nem alkalmas, százalék, hiánypontszám, "hiányosságod".
 * Három blokk: MÁR MEGVAN | ÉRDEMES FEJLESZTENI | KÖVETKEZŐ LÉPÉS
 */

import type { LightSkillBridgeResult } from '@/lib/vedett-karrier/types/discovery'

interface Props {
  bridge: LightSkillBridgeResult
}

export default function LightSkillBridgeSection({ bridge }: Props) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Készséghíd</h2>

      {/* Már megvan */}
      {bridge.alreadyHave.length > 0 && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-2">✓ Már megvan</p>
          <div className="flex flex-wrap gap-2">
            {bridge.alreadyHave.map(skill => (
              <span key={skill.code} className="rounded-full bg-teal-100 px-3 py-1 text-xs text-teal-800">
                {skill.name_hu}
              </span>
            ))}
          </div>
        </div>
      )}

      {bridge.alreadyHave.length === 0 && (
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-400">
          Még nem jelöltél meg készséget, ami ehhez a munkakörcsaládhoz kapcsolódik.
        </div>
      )}

      {/* Érdemes fejleszteni */}
      {bridge.developNext.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Érdemes fejleszteni</p>
          <div className="flex flex-wrap gap-2">
            {bridge.developNext.map(skill => (
              <span key={skill.code} className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
                {skill.name_hu}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Következő lépés */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Következő lépés</p>
        <p className="text-sm text-gray-700">{bridge.nextStepText}</p>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Ez nem alkalmassági értékelés. A készséghíd csak tájékoztató jellegű.
      </p>
    </section>
  )
}
