/**
 * Védett Karrier – Task #273.2 Munkaprofil Interaction Recovery
 *
 * Root cause: ImportanceSelect + BooleanInput hardcoded name="importance" / name="boolean-choice"
 * Több SubDimCard esetén az összes radio egy böngészőcsoportba kerül →
 * csak az utolsó kártya vizuális állapota marad aktív, a kattintás hatástalannak tűnik.
 *
 * Fix: minden kártyának egyedi name attribútum (importance-${sub.code}, bp-${sub.code})
 *
 * Tesztelés: state logika + static analysis (name eltávolítva hardcode-ból)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// 1. ImportanceSelect: name prop meglétének statikus ellenőrzése
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #1: ImportanceSelect name prop', () => {
  it('ImportanceSelect.tsx nem tartalmaz hardkódolt name="importance"-t', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/ImportanceSelect.tsx', 'utf-8')
    assert.ok(!src.includes('name="importance"'), 'hardkódolt name="importance" eltávolítva')
  })

  it('ImportanceSelect.tsx name prop-ot fogad (interface-ben megjelenik)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/ImportanceSelect.tsx', 'utf-8')
    assert.match(src, /name:\s*string/, 'name: string prop definiálva')
  })

  it('ImportanceSelect.tsx name prop-ot használja a radio input-ban', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/ImportanceSelect.tsx', 'utf-8')
    assert.match(src, /name=\{name\}/, 'name={name} szintaxis a radio input-ban')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. BooleanInput: name prop meglétének statikus ellenőrzése
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #2: BooleanInput name prop', () => {
  it('BooleanInput.tsx nem tartalmaz hardkódolt name="boolean-choice"-t', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/inputs/BooleanInput.tsx', 'utf-8')
    assert.ok(!src.includes('name="boolean-choice"'), 'hardkódolt name="boolean-choice" eltávolítva')
  })

  it('BooleanInput.tsx name prop-ot fogad', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/inputs/BooleanInput.tsx', 'utf-8')
    assert.match(src, /name:\s*string/, 'name: string prop definiálva')
  })

  it('BooleanInput.tsx name={name} szintaxis a radio input-ban', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/inputs/BooleanInput.tsx', 'utf-8')
    assert.match(src, /name=\{name\}/, 'name={name} szintaxis')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. DimensionStep: egyedi name-ek átadása
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #3: DimensionStep átad egyedi name-eket', () => {
  it('DimensionStep ImportanceSelect-nek importance-${sub.code} name-et ad', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/DimensionStep.tsx', 'utf-8')
    assert.match(src, /name=\{`importance-\$\{sub\.code\}`\}/, 'importance-${sub.code} name prop')
  })

  it('DimensionStep BooleanInput-nak bp-${sub.code} name-et ad', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('components/vedett-karrier/wizard/DimensionStep.tsx', 'utf-8')
    assert.match(src, /name=\{`bp-\$\{sub\.code\}`\}/, 'bp-${sub.code} name prop')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Importance state változás logika
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #4: Importance state változás logika', () => {
  type ImportanceLevel = 'low' | 'medium' | 'high' | 'essential'
  interface SubDimState {
    importanceLevel: ImportanceLevel
    dirty: boolean
    saved: boolean
  }

  function simulateImportanceChange(state: SubDimState, newLevel: ImportanceLevel): SubDimState {
    return { ...state, importanceLevel: newLevel, dirty: true, saved: false }
  }

  it('medium → high: importanceLevel helyesen frissül', () => {
    const initial: SubDimState = { importanceLevel: 'medium', dirty: false, saved: true }
    const next = simulateImportanceChange(initial, 'high')
    assert.equal(next.importanceLevel, 'high')
    assert.equal(next.dirty, true)
    assert.equal(next.saved, false)
  })

  it('high → essential: importanceLevel helyesen frissül', () => {
    const initial: SubDimState = { importanceLevel: 'high', dirty: false, saved: true }
    const next = simulateImportanceChange(initial, 'essential')
    assert.equal(next.importanceLevel, 'essential')
  })

  it('essential → low: importanceLevel helyesen frissül', () => {
    const initial: SubDimState = { importanceLevel: 'essential', dirty: false, saved: false }
    const next = simulateImportanceChange(initial, 'low')
    assert.equal(next.importanceLevel, 'low')
  })

  it('state változáskor dirty=true, saved=false lesz', () => {
    const initial: SubDimState = { importanceLevel: 'medium', dirty: false, saved: true }
    const next = simulateImportanceChange(initial, 'high')
    assert.equal(next.dirty, true)
    assert.equal(next.saved, false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Categorical state változás logika (preferred ⊆ acceptable invariáns)
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #5: Categorical preferred ⊆ acceptable invariáns', () => {
  interface SmInput {
    type: 'sm'
    preferred_categories: string[]
    acceptable_categories: string[]
  }

  function togglePreferred(value: SmInput, opt: string): SmInput {
    const prefSet = new Set(value.preferred_categories)
    const accSet = new Set(value.acceptable_categories)
    if (prefSet.has(opt)) {
      return { ...value, preferred_categories: value.preferred_categories.filter(c => c !== opt) }
    } else {
      const newPref = [...value.preferred_categories, opt]
      const newAcc = accSet.has(opt) ? value.acceptable_categories : [...value.acceptable_categories, opt]
      return { ...value, preferred_categories: newPref, acceptable_categories: newAcc }
    }
  }

  function toggleAcceptable(value: SmInput, opt: string): SmInput {
    const accSet = new Set(value.acceptable_categories)
    if (accSet.has(opt)) {
      const newAcc = value.acceptable_categories.filter(c => c !== opt)
      const newPref = value.preferred_categories.filter(c => c !== opt)
      return { ...value, acceptable_categories: newAcc, preferred_categories: newPref }
    } else {
      return { ...value, acceptable_categories: [...value.acceptable_categories, opt] }
    }
  }

  const empty: SmInput = { type: 'sm', preferred_categories: [], acceptable_categories: [] }

  it('none → acceptable: OK gomb után acceptable-ben van', () => {
    const next = toggleAcceptable(empty, 'cool')
    assert.ok(next.acceptable_categories.includes('cool'))
    assert.ok(!next.preferred_categories.includes('cool'))
  })

  it('acceptable → preferred: preferred gomb után preferred ÉS acceptable-ben is van', () => {
    const withAcc: SmInput = { type: 'sm', preferred_categories: [], acceptable_categories: ['cool'] }
    const next = togglePreferred(withAcc, 'cool')
    assert.ok(next.preferred_categories.includes('cool'))
    assert.ok(next.acceptable_categories.includes('cool'), 'preferred ⊆ acceptable')
  })

  it('none → preferred: automatikusan acceptable is lesz', () => {
    const next = togglePreferred(empty, 'warm')
    assert.ok(next.preferred_categories.includes('warm'))
    assert.ok(next.acceptable_categories.includes('warm'), 'auto-acceptable')
  })

  it('preferred eltávolítása nem távolítja el acceptable-ből', () => {
    const withBoth: SmInput = { type: 'sm', preferred_categories: ['warm'], acceptable_categories: ['warm', 'cool'] }
    const next = togglePreferred(withBoth, 'warm')
    assert.ok(!next.preferred_categories.includes('warm'))
    assert.ok(next.acceptable_categories.includes('warm'), 'acceptable megmarad')
  })

  it('acceptable eltávolítása eltávolítja preferred-ből is', () => {
    const withBoth: SmInput = { type: 'sm', preferred_categories: ['warm'], acceptable_categories: ['warm'] }
    const next = toggleAcceptable(withBoth, 'warm')
    assert.ok(!next.acceptable_categories.includes('warm'))
    assert.ok(!next.preferred_categories.includes('warm'), 'preferred is törlődik')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Ordinal input: érték módosítható
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #6: Ordinal értékek módosíthatók', () => {
  interface HiInput { type: 'hi'; preferred_max_value: number | null; acceptable_max_value: number | null }

  function handlePreferredMaxChange(v: HiInput, newVal: number): HiInput {
    return {
      ...v,
      type: 'hi',
      preferred_max_value: newVal,
      acceptable_max_value: v.acceptable_max_value == null ? newVal : Math.max(v.acceptable_max_value, newVal),
    }
  }

  it('preferred_max null → 3: értéke 3 lesz', () => {
    const v: HiInput = { type: 'hi', preferred_max_value: null, acceptable_max_value: null }
    const next = handlePreferredMaxChange(v, 3)
    assert.equal(next.preferred_max_value, 3)
  })

  it('acceptable_max auto-frissül ha preferred_max nagyobb', () => {
    const v: HiInput = { type: 'hi', preferred_max_value: 2, acceptable_max_value: 2 }
    const next = handlePreferredMaxChange(v, 4)
    assert.equal(next.preferred_max_value, 4)
    assert.equal(next.acceptable_max_value, 4, 'acceptable >= preferred')
  })

  it('acceptable_max nem csökken ha preferred_max kisebb', () => {
    const v: HiInput = { type: 'hi', preferred_max_value: 3, acceptable_max_value: 5 }
    const next = handlePreferredMaxChange(v, 2)
    assert.equal(next.preferred_max_value, 2)
    assert.equal(next.acceptable_max_value, 5, 'acceptable marad')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Unknown toggle logika
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #7: Unknown toggle logika', () => {
  interface SubDimState { unknown: boolean; dirty: boolean }

  function toggleUnknown(state: SubDimState): SubDimState {
    return { ...state, unknown: !state.unknown, dirty: true }
  }

  it('false → true', () => {
    const next = toggleUnknown({ unknown: false, dirty: false })
    assert.equal(next.unknown, true)
    assert.equal(next.dirty, true)
  })

  it('true → false', () => {
    const next = toggleUnknown({ unknown: true, dirty: false })
    assert.equal(next.unknown, false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Save payload validáció: dirty state esetén payload keletkezik
// ─────────────────────────────────────────────────────────────────────────────

describe('Test #8: Save payload — dirty state alapján', () => {
  it('dirty=true → save szükséges', () => {
    const subStates = {
      'env_noise': { dirty: true, importanceLevel: 'medium' },
      'env_light': { dirty: false, importanceLevel: 'medium' },
    }
    const dirtyOnes = Object.values(subStates).filter(s => s.dirty)
    assert.equal(dirtyOnes.length, 1)
  })

  it('dirty=false → save nem szükséges', () => {
    const subStates = {
      'env_noise': { dirty: false },
      'env_light': { dirty: false },
    }
    const dirtyOnes = Object.values(subStates).filter(s => s.dirty)
    assert.equal(dirtyOnes.length, 0)
  })
})
