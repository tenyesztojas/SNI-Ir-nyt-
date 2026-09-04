'use client'
/**
 * Védett Karrier – SkillMapClient
 * Sprint 3
 *
 * Kategória-alapú, kereshetű készséglista.
 * NEM egy végtelen checklist.
 * Mobilon is használható.
 */

import { useState, useTransition, useMemo } from 'react'
import type { SkillRow, UserSkillRow, SkillProficiency } from '@/lib/vedett-karrier/types/discovery'
import { saveUserSkill, removeUserSkill } from '@/lib/vedett-karrier/skills/actions'

const CATEGORY_LABELS: Record<string, string> = {
  digital:       'Digitális',
  manual:        'Kézi / fizikai',
  cognitive:     'Gondolkodási',
  interpersonal: 'Kapcsolati',
  physical:      'Testi',
}

const PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  learning:     'Tanulom',
  basic:        'Alapszint',
  intermediate: 'Közép',
  advanced:     'Haladó',
}

interface Props {
  allSkills: SkillRow[]
  initialUserSkills: UserSkillRow[]
}

export default function SkillMapClient({ allSkills, initialUserSkills }: Props) {
  const [userSkills, setUserSkills] = useState<UserSkillRow[]>(initialUserSkills)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editProficiency, setEditProficiency] = useState<SkillProficiency>('basic')
  const [editConfident, setEditConfident] = useState(false)
  const [editEnjoys, setEditEnjoys] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const userSkillMap = useMemo(
    () => new Map(userSkills.map(s => [s.skill_code, s])),
    [userSkills]
  )

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(allSkills.map(s => s.category)))],
    [allSkills]
  )

  const filteredSkills = useMemo(() => {
    return allSkills.filter(skill => {
      const matchesCategory = activeCategory === 'all' || skill.category === activeCategory
      const matchesSearch = search.trim() === '' ||
        skill.name_hu.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch && skill.is_active
    })
  }, [allSkills, activeCategory, search])

  function openEdit(code: string) {
    const existing = userSkillMap.get(code)
    setEditingCode(code)
    setEditProficiency(existing?.proficiency ?? 'basic')
    setEditConfident(existing?.is_confident ?? false)
    setEditEnjoys(existing?.enjoys_it ?? false)
    setSaveError(null)
  }

  function handleSave(skillCode: string) {
    setSaveError(null)
    startTransition(async () => {
      const result = await saveUserSkill({
        skillCode,
        proficiency: editProficiency,
        isConfident: editConfident,
        enjoysIt: editEnjoys,
      })
      if (!result.ok) {
        setSaveError(result.error ?? 'Hiba')
        return
      }
      // Optimistic update
      const skill = allSkills.find(s => s.code === skillCode)!
      setUserSkills(prev => {
        const filtered = prev.filter(s => s.skill_code !== skillCode)
        return [...filtered, {
          id: '',
          user_id: '',
          skill_id: '',
          skill_code: skillCode,
          skill_name_hu: skill.name_hu,
          skill_category: skill.category,
          proficiency: editProficiency,
          is_confident: editConfident,
          enjoys_it: editEnjoys,
          experience_years: null,
          acquisition_note: null,
        }]
      })
      setEditingCode(null)
    })
  }

  function handleRemove(skillCode: string) {
    startTransition(async () => {
      const result = await removeUserSkill(skillCode)
      if (result.ok) {
        setUserSkills(prev => prev.filter(s => s.skill_code !== skillCode))
        if (editingCode === skillCode) setEditingCode(null)
      }
    })
  }

  const selectedCount = userSkills.length

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-teal-700">
          {selectedCount} készség megjelölve
        </span>
        {selectedCount > 0 && (
          <a
            href="/vedett-karrier/karrieriranytu"
            className="text-xs text-sni-brand-teal hover:underline"
          >
            Karrieriránytű megtekintése →
          </a>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Keresés a készségek között…"
        className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
        aria-label="Keresés"
      />

      {/* Category filter */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-sni-brand-teal text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'Összes' : CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Skill list */}
      {filteredSkills.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Nincs ilyen készség.</p>
      ) : (
        <div className="space-y-2">
          {filteredSkills.map(skill => {
            const existing = userSkillMap.get(skill.code)
            const isEditing = editingCode === skill.code

            return (
              <div
                key={skill.code}
                className={`rounded-xl border px-4 py-3 transition-all ${
                  existing
                    ? 'border-teal-200 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{skill.name_hu}</span>
                    {existing && (
                      <span className="ml-2 text-xs text-teal-600">
                        {PROFICIENCY_LABELS[existing.proficiency]}
                        {existing.is_confident && ' · Magabiztos'}
                        {existing.enjoys_it && ' · Szeretem'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => isEditing ? setEditingCode(null) : openEdit(skill.code)}
                      disabled={isPending}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        existing
                          ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {existing ? 'Szerkesztés' : '+ Hozzáadom'}
                    </button>
                    {existing && (
                      <button
                        type="button"
                        onClick={() => handleRemove(skill.code)}
                        disabled={isPending}
                        className="rounded-full px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                        aria-label="Eltávolítás"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline edit panel */}
                {isEditing && (
                  <div className="mt-3 border-t border-teal-100 pt-3 space-y-3">
                    {/* Proficiency */}
                    <fieldset>
                      <legend className="text-xs font-semibold text-gray-500 mb-1">Szint</legend>
                      <div className="flex flex-wrap gap-2">
                        {(['learning','basic','intermediate','advanced'] as SkillProficiency[]).map(level => (
                          <label key={level} className="cursor-pointer">
                            <input
                              type="radio"
                              name={`proficiency-${skill.code}`}
                              value={level}
                              checked={editProficiency === level}
                              onChange={() => setEditProficiency(level)}
                              className="sr-only"
                            />
                            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${
                              editProficiency === level
                                ? 'border-sni-brand-teal bg-sni-brand-teal text-white'
                                : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}>
                              {PROFICIENCY_LABELS[level]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {/* Confident + Enjoys */}
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editConfident}
                          onChange={e => setEditConfident(e.target.checked)}
                          className="rounded accent-sni-brand-teal"
                        />
                        Magabiztos vagyok benne
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editEnjoys}
                          onChange={e => setEditEnjoys(e.target.checked)}
                          className="rounded accent-sni-brand-teal"
                        />
                        Szeretem csinálni
                      </label>
                    </div>

                    {saveError && (
                      <p className="text-xs text-red-600" role="alert">{saveError}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSave(skill.code)}
                      disabled={isPending}
                      className="rounded-full bg-sni-brand-teal px-5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {isPending ? 'Mentés…' : 'Mentés'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
