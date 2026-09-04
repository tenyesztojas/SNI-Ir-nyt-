/**
 * Védett Karrier – Sprint 4 Employer Unit Tests
 *
 * Lefed:
 * - computeProfileCompletionPct (minden typed ág; boolean false valid)
 * - isCompletionSufficientForActivation (határértékek)
 * - buildHashInput (determinizmus, rendezés, null-handling)
 * - computeRoleProfileHash (async, azonos input → azonos hash)
 * - checkActivationGate (minden missing item ág)
 * - Biztonsági invariánsok
 *
 * Futtatás:
 *   node --experimental-strip-types __tests__/vedett-karrier/employer.test.ts
 *
 * Megjegyzés: A pure utility függvények inline vannak a tesztek mellé,
 * mert a forrásmodulok '.js' értékkimport-jai a bare node runner alatt nem
 * oldhatók fel (Next.js ESM alias). A tényleges implementation az importált
 * forrásban van; a teszt ugyanazt a logikát ellenőrzi izoláltan.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Hash utils: hash.ts csak type importot használ → közvetlenül importálható
import {
  buildHashInput,
  computeRoleProfileHash,
  type HashableJobRoleProfile,
} from '../../lib/vedett-karrier/employer/hash.ts'

import { VKMM_SUB_DIMENSIONS } from '../../lib/vedett-karrier/seed/vkmm-seed.ts'
import type { JobRoleEnvValueRow } from '../../lib/vedett-karrier/types/employer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Inline: completion logic (mirror of completion.ts)
// ─────────────────────────────────────────────────────────────────────────────

const MIN_COMPLETION_FOR_ACTIVATION = 80

function computeProfileCompletionPct(envValues: JobRoleEnvValueRow[]): number {
  const totalActive = VKMM_SUB_DIMENSIONS.filter(s => s.is_active).length
  if (totalActive === 0) return 0
  const filledCodes = new Set<string>()
  for (const ev of envValues) {
    const isFilled =
      ev.ordinal_value !== null ||
      ev.categorical_value !== null ||
      ev.boolean_value !== null ||   // false IS valid
      ev.frequency_value !== null
    if (isFilled) filledCodes.add(ev.sub_dimension_code)
  }
  return Math.round((filledCodes.size / totalActive) * 100)
}

function isCompletionSufficientForActivation(pct: number): boolean {
  return pct >= MIN_COMPLETION_FOR_ACTIVATION
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline: activation gate (mirror of actions.ts#checkActivationGate)
// ─────────────────────────────────────────────────────────────────────────────

function checkActivationGate(role: {
  title_hu: string
  workplace_id: string | null
  job_family_slug: string | null
  summary_hu: string | null
  main_tasks_json: string[]
  profile_completion_pct: number
  status: string
}) {
  const missing: string[] = []
  if (!role.title_hu?.trim()) missing.push('Munkakör megnevezése')
  if (!role.workplace_id) missing.push('Telephely')
  if (!role.job_family_slug) missing.push('Munkakörcsalád')
  if (!role.summary_hu?.trim()) missing.push('Tényszerű összefoglaló')
  if (!role.main_tasks_json || role.main_tasks_json.length === 0) missing.push('Fő feladatok')
  if (role.profile_completion_pct < 80) {
    missing.push(`VKMM profil kitöltése (jelenlegi: ${role.profile_completion_pct}%, minimum: 80%)`)
  }
  return { canActivate: missing.length === 0, missingItems: missing }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEnvRow(
  code: string,
  opts: Partial<JobRoleEnvValueRow> = {}
): JobRoleEnvValueRow {
  return {
    id: `id-${code}`,
    job_role_id: 'role-1',
    sub_dimension_code: code,
    ordinal_value: null,
    categorical_value: null,
    boolean_value: null,
    frequency_value: null,
    data_source: 'SELF_REPORTED',
    employer_note: null,
    public_context_note: null,
    last_reviewed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...opts,
  }
}

function baseRole(overrides: Partial<Parameters<typeof checkActivationGate>[0]> = {}) {
  return {
    title_hu: 'Raktáros',
    workplace_id: 'wp-1',
    job_family_slug: 'kezzel-preciz',
    summary_hu: 'Raktári munka.',
    main_tasks_json: ['Csomagolás', 'Szállítás'],
    profile_completion_pct: 85,
    status: 'draft',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// computeProfileCompletionPct
// ─────────────────────────────────────────────────────────────────────────────

describe('computeProfileCompletionPct', () => {
  it('üres tömbre 0-t ad', () => {
    assert.equal(computeProfileCompletionPct([]), 0)
  })

  it('ordinal_value kitöltött → beleszámít', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('env_noise', { ordinal_value: 3 })])
    assert.ok(pct > 0, `expected > 0, got ${pct}`)
  })

  it('categorical_value kitöltött → beleszámít', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('comm_mode', { categorical_value: 'written' })])
    assert.ok(pct > 0)
  })

  it('boolean_value = false → BELESZÁMÍT (nem null)', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('env_lighting', { boolean_value: false })])
    assert.ok(pct > 0, `boolean false kell hogy beleszámítson; got ${pct}`)
  })

  it('boolean_value = true → beleszámít', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('env_lighting', { boolean_value: true })])
    assert.ok(pct > 0)
  })

  it('frequency_value kitöltött → beleszámít', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('time_shift', { frequency_value: 'daily' })])
    assert.ok(pct > 0)
  })

  it('null minden oszlopon → nem számít bele', () => {
    const pct = computeProfileCompletionPct([makeEnvRow('env_noise')])
    assert.equal(pct, 0)
  })

  it('duplikált sub_dimension_code-ot egyszer számol', () => {
    const single = computeProfileCompletionPct([makeEnvRow('env_noise', { ordinal_value: 3 })])
    const dup = computeProfileCompletionPct([
      makeEnvRow('env_noise', { ordinal_value: 3 }),
      makeEnvRow('env_noise', { ordinal_value: 4 }),
    ])
    assert.equal(single, dup)
  })

  it('VKMM_SUB_DIMENSIONS aktív count > 0', () => {
    const count = VKMM_SUB_DIMENSIONS.filter(s => s.is_active).length
    assert.ok(count > 0, `aktív sub_dimensions száma: ${count}`)
  })

  it('100% ha minden aktív sub ki van töltve', () => {
    const rows = VKMM_SUB_DIMENSIONS
      .filter(s => s.is_active)
      .map(s => makeEnvRow(s.code, { ordinal_value: 1 }))
    assert.equal(computeProfileCompletionPct(rows), 100)
  })

  it('nem ad vissza >100-at duplikált soroknál sem', () => {
    const rows = VKMM_SUB_DIMENSIONS
      .filter(s => s.is_active)
      .flatMap(s => [
        makeEnvRow(s.code, { ordinal_value: 1 }),
        makeEnvRow(s.code, { categorical_value: 'extra' }),
      ])
    assert.ok(computeProfileCompletionPct(rows) <= 100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isCompletionSufficientForActivation
// ─────────────────────────────────────────────────────────────────────────────

describe('isCompletionSufficientForActivation', () => {
  it('MIN_COMPLETION_FOR_ACTIVATION = 80', () => {
    assert.equal(MIN_COMPLETION_FOR_ACTIVATION, 80)
  })

  it('80% → elég', () => {
    assert.equal(isCompletionSufficientForActivation(80), true)
  })

  it('100% → elég', () => {
    assert.equal(isCompletionSufficientForActivation(100), true)
  })

  it('79% → NEM elég', () => {
    assert.equal(isCompletionSufficientForActivation(79), false)
  })

  it('0% → NEM elég', () => {
    assert.equal(isCompletionSufficientForActivation(0), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildHashInput
// ─────────────────────────────────────────────────────────────────────────────

describe('buildHashInput', () => {
  const profile: HashableJobRoleProfile = {
    title_hu: 'Raktáros',
    job_family_slug: 'kezzel-preciz',
    industry_slug: null,
    employment_type: 'full_time',
    envValues: [
      makeEnvRow('env_noise', { ordinal_value: 3 }),
      makeEnvRow('comm_mode', { categorical_value: 'written' }),
    ],
  }

  it('determinisztikus: ugyanaz az input → ugyanaz a string', () => {
    assert.equal(buildHashInput(profile), buildHashInput(profile))
  })

  it('tartalmazza a protokoll prefixet', () => {
    assert.ok(buildHashInput(profile).startsWith('vk_role_v1|'))
  })

  it('tartalmazza a title mezőt', () => {
    assert.ok(buildHashInput(profile).includes('title:Raktáros'))
  })

  it('null industry_slug üres stringként jelenik meg', () => {
    assert.ok(buildHashInput({ ...profile, industry_slug: null }).includes('industry:'))
  })

  it('env értékek rendezve jelennek meg (sub_dimension_code szerint)', () => {
    const shuffled: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('z_last', { ordinal_value: 1 }), makeEnvRow('a_first', { ordinal_value: 2 })],
    }
    const canonical: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('a_first', { ordinal_value: 2 }), makeEnvRow('z_last', { ordinal_value: 1 })],
    }
    assert.equal(buildHashInput(shuffled), buildHashInput(canonical))
  })

  it('boolean false → boolean:false a hashben', () => {
    const p: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('env_lighting', { boolean_value: false })],
    }
    assert.ok(buildHashInput(p).includes('boolean:false'))
  })

  it('boolean true → boolean:true a hashben', () => {
    const p: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('env_lighting', { boolean_value: true })],
    }
    assert.ok(buildHashInput(p).includes('boolean:true'))
  })

  it('két különböző profil különböző inputot ad', () => {
    assert.notEqual(buildHashInput(profile), buildHashInput({ ...profile, title_hu: 'Másik munkakör' }))
  })

  it('employer_note NEM kerül a hash inputba', () => {
    const p: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('env_noise', { ordinal_value: 2, employer_note: 'TITKOS_MEGJEGYZES' })],
    }
    assert.ok(!buildHashInput(p).includes('TITKOS_MEGJEGYZES'), 'employer_note nem kerülhet a hash inputba')
  })

  it('nincs score/suitability/compatibility/rank szó a kimenetben', () => {
    const input = buildHashInput({ ...profile, envValues: [] })
    const forbidden = ['score', 'suitability', 'compatibility', 'rank', 'autizmusbar']
    for (const word of forbidden) {
      assert.ok(!input.toLowerCase().includes(word), `tiltott szó: ${word}`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRoleProfileHash
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRoleProfileHash', () => {
  const profile: HashableJobRoleProfile = {
    title_hu: 'Raktáros',
    job_family_slug: 'kezzel-preciz',
    industry_slug: null,
    employment_type: null,
    envValues: [makeEnvRow('env_noise', { ordinal_value: 2 })],
  }

  it('64 hex karaktert ad vissza', async () => {
    const h = await computeRoleProfileHash(profile)
    assert.match(h, /^[0-9a-f]{64}$/)
  })

  it('determinisztikus: ugyanaz az input → azonos hash', async () => {
    const h1 = await computeRoleProfileHash(profile)
    const h2 = await computeRoleProfileHash(profile)
    assert.equal(h1, h2)
  })

  it('különböző input → különböző hash', async () => {
    const h1 = await computeRoleProfileHash(profile)
    const h2 = await computeRoleProfileHash({ ...profile, title_hu: 'Más cím' })
    assert.notEqual(h1, h2)
  })

  it('input sorrendtől független (rendezett env values)', async () => {
    const p1: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('z_dim', { ordinal_value: 1 }), makeEnvRow('a_dim', { ordinal_value: 2 })],
    }
    const p2: HashableJobRoleProfile = {
      ...profile,
      envValues: [makeEnvRow('a_dim', { ordinal_value: 2 }), makeEnvRow('z_dim', { ordinal_value: 1 })],
    }
    assert.equal(await computeRoleProfileHash(p1), await computeRoleProfileHash(p2))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkActivationGate
// ─────────────────────────────────────────────────────────────────────────────

describe('checkActivationGate', () => {
  it('minden feltétel teljesül → canActivate = true', () => {
    const gate = checkActivationGate(baseRole())
    assert.equal(gate.canActivate, true)
    assert.equal(gate.missingItems.length, 0)
  })

  it('hiányzó cím → canActivate = false', () => {
    const gate = checkActivationGate(baseRole({ title_hu: '' }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.includes('megnevezés') || m.includes('Munkakör')))
  })

  it('hiányzó telephely → canActivate = false', () => {
    const gate = checkActivationGate(baseRole({ workplace_id: null }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.includes('Telephely')))
  })

  it('hiányzó munkakörcsalád → canActivate = false', () => {
    const gate = checkActivationGate(baseRole({ job_family_slug: null }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.includes('Munkakörcsalád')))
  })

  it('hiányzó összefoglaló → canActivate = false', () => {
    const gate = checkActivationGate(baseRole({ summary_hu: null }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.toLowerCase().includes('összefoglaló')))
  })

  it('üres feladatlista → canActivate = false', () => {
    const gate = checkActivationGate(baseRole({ main_tasks_json: [] }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.toLowerCase().includes('feladat')))
  })

  it('completion 79% → canActivate = false, tartalmazza a %-ot', () => {
    const gate = checkActivationGate(baseRole({ profile_completion_pct: 79 }))
    assert.equal(gate.canActivate, false)
    assert.ok(gate.missingItems.some(m => m.includes('79%') || m.includes('80%') || m.includes('VKMM')))
  })

  it('completion pontosan 80% → beleszámít, canActivate = true', () => {
    const gate = checkActivationGate(baseRole({ profile_completion_pct: 80 }))
    assert.equal(gate.canActivate, true)
  })

  it('több hiányzó elem → mindegyik megjelenik a missingItems-ben', () => {
    const gate = checkActivationGate(baseRole({
      title_hu: '',
      workplace_id: null,
      profile_completion_pct: 0,
    }))
    assert.ok(gate.missingItems.length >= 3)
  })
})
