'use client'
/**
 * Védett Karrier – Új munkakör feltérképezése
 * Sprint 4
 *
 * Kétlépéses onboarding a wizard előtt:
 * 1. Gyors alapadat form → createJobRole action → redirect to wizard
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createJobRole } from '../../../../../lib/vedett-karrier/employer/actions'

export default function NewJobRolePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!title.trim()) { setError('Add meg a munkakör megnevezését.'); return }
    setError(null)
    startTransition(async () => {
      const result = await createJobRole({ title_hu: title.trim() })
      if (!result.ok) { setError(result.error); return }
      router.push(`/vedett-karrier/munkaltato/munkakorok/${result.data.id}/szerkesztes`)
    })
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-16">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Védett Karrier</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Új munkakör feltérképezése</h1>
        <p className="text-sm text-gray-500 mb-8">
          A Védett Karrier rendszerében elsőként a munkakört térképezed fel – nem hirdetést adsz fel.
          A feltérképezés 7 lépésből áll, és bármikor megszakítható.
        </p>

        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="title">
              Munkakör megnevezése <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              maxLength={200}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
              placeholder="pl. Raktári munkatárs – Budaörsi logisztikai központ"
            />
            <p className="text-xs text-gray-400 mt-1">
              Ezzel egyedi azonosítót kap a munkakör. Később módosítható.
            </p>
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending || !title.trim()}
            className="w-full rounded-full bg-sni-brand-teal py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Létrehozás…' : 'Munkakör létrehozása és feltérképezés indítása →'}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          A munkakör piszkozat állapotban jön létre, és csak akkor válik publikusan elérhetővé,
          ha az összes aktiválási feltétel teljesül.
        </p>
      </div>
    </main>
  )
}
