'use client'
/**
 * Védett Karrier – Wizard Step 1: Munkakör Alapadatai
 * Sprint 4
 *
 * Kéri: munkakör megnevezése, telephely, munkakörcsalád,
 * tényszerű összefoglaló, fő feladatok (lista), foglalkoztatás típusa.
 * NEM: vonzó marketing szöveg, álláshirdetés.
 */

import { useState, useTransition } from 'react'
import { updateJobRoleBasics } from '../../../../lib/vedett-karrier/employer/actions'
import type { JobRoleRow, WorkplaceRow } from '../../../../lib/vedett-karrier/types/employer'
import type { JobFamilyRow } from '../../../../lib/vedett-karrier/types/discovery'

interface Props {
  role: JobRoleRow
  workplaces: WorkplaceRow[]
  allFamilies: JobFamilyRow[]
  onSaved?: () => void
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Teljes munkaidő' },
  { value: 'part_time', label: 'Részmunkaidő' },
  { value: 'flexible', label: 'Rugalmas' },
  { value: 'shift', label: 'Műszakos' },
]

export default function Step1Basics({ role, workplaces, allFamilies, onSaved }: Props) {
  const [title, setTitle] = useState(role.title_hu)
  const [workplaceId, setWorkplaceId] = useState<string>(role.workplace_id ?? '')
  const [familySlug, setFamilySlug] = useState<string>(role.job_family_slug ?? '')
  const [summary, setSummary] = useState(role.summary_hu ?? '')
  const [tasks, setTasks] = useState<string[]>(role.main_tasks_json ?? [''])
  const [employmentType, setEmploymentType] = useState(role.employment_type ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleTaskChange(idx: number, val: string) {
    setTasks(prev => { const next = [...prev]; next[idx] = val; return next })
    setSaved(false)
  }
  function addTask() { if (tasks.length < 10) setTasks(prev => [...prev, '']) }
  function removeTask(idx: number) { setTasks(prev => prev.filter((_, i) => i !== idx)) }

  function handleSave(andContinue = false) {
    setError(null)
    startTransition(async () => {
      const result = await updateJobRoleBasics({
        roleId: role.id,
        title_hu: title.trim(),
        workplace_id: workplaceId || null,
        job_family_slug: familySlug || null,
        summary_hu: summary.trim() || null,
        main_tasks_json: tasks.filter(t => t.trim()),
        employment_type: employmentType || null,
        last_saved_step: 1,
      })
      if (!result.ok) { setError(result.error); return }
      setSaved(true)
      if (andContinue) onSaved?.()
    })
  }

  return (
    <div className="space-y-6 mt-4">
      <p className="text-sm text-gray-500">
        Az alapadatokban a munkakör tényleges tartalmát és helyét rögzítsd – nem a hirdetési szöveget.
      </p>

      {/* Munkakör megnevezése */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="title">
          Munkakör megnevezése <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={e => { setTitle(e.target.value); setSaved(false) }}
          maxLength={200}
          required
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
          placeholder="pl. Raktári munkatárs – Budaörsi logisztikai központ"
        />
      </div>

      {/* Telephely */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="workplace">
          Telephely <span className="text-red-500">*</span>
        </label>
        {workplaces.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Még nincs rögzített telephely. Először hozz létre egyet a munkáltatói dashboardon.
          </p>
        ) : (
          <select
            id="workplace"
            value={workplaceId}
            onChange={e => { setWorkplaceId(e.target.value); setSaved(false) }}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
          >
            <option value="">– Válassz telephelyet –</option>
            {workplaces.map(wp => (
              <option key={wp.id} value={wp.id}>
                {wp.name_hu}{wp.city ? ` – ${wp.city}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Munkakörcsalád */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="family">
          Munkakörcsalád <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Melyik feladatminta-csoporthoz áll a legközelebb ez a munkakör?
        </p>
        <select
          id="family"
          value={familySlug}
          onChange={e => { setFamilySlug(e.target.value); setSaved(false) }}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
        >
          <option value="">– Válassz munkakörcsaládot –</option>
          {allFamilies.map(f => (
            <option key={f.slug} value={f.slug}>
              {f.name_hu}
            </option>
          ))}
        </select>
        {familySlug && (
          <p className="text-xs text-teal-700 mt-1">
            {allFamilies.find(f => f.slug === familySlug)?.task_pattern_summary}
          </p>
        )}
      </div>

      {/* Tényszerű összefoglaló */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="summary">
          Rövid, tényszerű összefoglaló <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Mit csinál ténylegesen az, aki ebben a munkakörben dolgozik? (Ne marketingszöveg.)
        </p>
        <textarea
          id="summary"
          value={summary}
          onChange={e => { setSummary(e.target.value); setSaved(false) }}
          maxLength={1000}
          rows={4}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal resize-y"
          placeholder="pl. A munkatárs csomagokat fogad be, szortíroz és rendel el a raktárban. Munkája döntően önállóan, kézi szkennerrel zajlik..."
        />
        <p className="text-xs text-gray-400 text-right">{summary.length}/1000</p>
      </div>

      {/* Fő feladatok */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">
          Fő feladatok <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-gray-400 mb-3">
          Add meg a legfontosabb napi/rendszeres feladatokat (max. 10). Röviden, tényszerűen.
        </p>
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={task}
                onChange={e => handleTaskChange(i, e.target.value)}
                maxLength={300}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sni-brand-teal"
                placeholder={`${i + 1}. feladat`}
                aria-label={`${i + 1}. feladat`}
              />
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(i)}
                  className="text-gray-400 hover:text-red-500 text-xs px-2"
                  aria-label="Feladat törlése"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {tasks.length < 10 && (
          <button
            type="button"
            onClick={addTask}
            className="mt-2 text-xs text-sni-brand-teal hover:underline"
          >
            + Feladat hozzáadása
          </button>
        )}
      </div>

      {/* Foglalkoztatás típusa */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Foglalkoztatás típusa</p>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPES.map(et => (
            <label key={et.value} className="cursor-pointer">
              <input
                type="radio"
                name="employment_type"
                value={et.value}
                checked={employmentType === et.value}
                onChange={() => { setEmploymentType(et.value); setSaved(false) }}
                className="sr-only"
              />
              <span className={`inline-block rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                employmentType === et.value
                  ? 'border-sni-brand-teal bg-sni-brand-teal text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}>
                {et.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={isPending || !title.trim()}
          className="rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal hover:bg-teal-50 disabled:opacity-50"
        >
          {isPending ? 'Mentés…' : saved ? '✓ Mentve' : 'Mentés'}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={isPending || !title.trim() || !familySlug}
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Mentés és tovább →
        </button>
      </div>
    </div>
  )
}
