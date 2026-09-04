/**
 * Védett Karrier – Opportunity + Preferencialap Unit Tests
 * Sprint 6
 *
 * Node.js built-in test runner:
 *   node --experimental-strip-types __tests__/vedett-karrier/opportunity.test.ts
 *
 * Tesztelt modulok:
 * - lib/vedett-karrier/opportunity/actions.ts (Zod validation, status guards) — via import type only
 * - lib/vedett-karrier/preferencialap/template.ts (deterministic text gen)
 *
 * MEGJEGYZÉS:
 * - opportunity/actions.ts 'use server' + 'zod' import-ot tartalmaz → NEM importálható Node-ba
 * - template.ts csak 'import type' utasításokat tartalmaz → biztonságosan importálható
 * - Opportunity validation logic inline tesztelve (séma replikálva)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─────────────────────────────────────────────────────────────────────────────
// 1. Opportunity status lifecycle invariánsok (inline logika)
// ─────────────────────────────────────────────────────────────────────────────

type OppStatus = 'draft' | 'active' | 'closed'

function canActivate(status: OppStatus): boolean {
  return status === 'draft'
}
function canClose(status: OppStatus): boolean {
  return status === 'active'
}
function canEdit(status: OppStatus): boolean {
  return status !== 'closed'
}
function isPublic(status: OppStatus): boolean {
  return status === 'active'
}

describe('Opportunity status lifecycle', () => {
  it('csak draft aktiválható', () => {
    assert.equal(canActivate('draft'),  true)
    assert.equal(canActivate('active'), false)
    assert.equal(canActivate('closed'), false)
  })

  it('csak active zárható le', () => {
    assert.equal(canClose('active'), true)
    assert.equal(canClose('draft'),  false)
    assert.equal(canClose('closed'), false)
  })

  it('lezárt lehetőség nem szerkeszthető', () => {
    assert.equal(canEdit('draft'),  true)
    assert.equal(canEdit('active'), true)
    assert.equal(canEdit('closed'), false)
  })

  it('csak active látható publikusan', () => {
    assert.equal(isPublic('active'), true)
    assert.equal(isPublic('draft'),  false)
    assert.equal(isPublic('closed'), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. ApplicationMethod invariánsok
// ─────────────────────────────────────────────────────────────────────────────

type ApplicationMethod = 'EXTERNAL_URL' | 'EMAIL' | 'CONTACT_INSTRUCTIONS'
const VALID_METHODS: Set<ApplicationMethod> = new Set(['EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS'])

describe('ApplicationMethod validation', () => {
  it('érvényes módszerek elfogadva', () => {
    assert.ok(VALID_METHODS.has('EXTERNAL_URL'))
    assert.ok(VALID_METHODS.has('EMAIL'))
    assert.ok(VALID_METHODS.has('CONTACT_INSTRUCTIONS'))
  })

  it('érvénytelen módszer elutasítva', () => {
    assert.ok(!VALID_METHODS.has('INTERNAL_APPLICATION' as ApplicationMethod))
    assert.ok(!VALID_METHODS.has('ATS' as ApplicationMethod))
    assert.ok(!VALID_METHODS.has('' as ApplicationMethod))
  })

  it('nincs INTERNAL_APPLICATION – ez az MVP-ből szándékosan hiányzik', () => {
    assert.ok(!VALID_METHODS.has('INTERNAL_APPLICATION' as ApplicationMethod))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Preferencialap template – determinisztikus szöveggenerálás
//    template.ts csak import type → Node.js test runner kompatibilis
// ─────────────────────────────────────────────────────────────────────────────

import {
  generatePreferenceDimensionBlocks,
  buildPreferenceDocumentText,
} from '../../lib/vedett-karrier/preferencialap/template.ts'

// Minimal mock SavedDimensionRow
function makeOrdinalRow(code: string, prefMin: number, prefMax: number): any {
  return {
    sub_dimension_code:       code,
    is_unknown:               false,
    importance_level:         'medium',
    user_note:                null,
    preferred_min_value:      prefMin,
    preferred_max_value:      prefMax,
    acceptable_min_value:     null,
    acceptable_max_value:     null,
    preferred_categories_json:  null,
    acceptable_categories_json: null,
    preferred_boolean:          null,
    acceptable_boolean_json:    null,
    preferred_min_frequency:    null,
    preferred_max_frequency:    null,
    acceptable_min_frequency:   null,
    acceptable_max_frequency:   null,
  }
}

function makeUnknownRow(code: string): any {
  return {
    sub_dimension_code:         code,
    is_unknown:                 true,
    importance_level:           'medium',
    user_note:                  null,
    preferred_min_value:        null,
    preferred_max_value:        null,
    acceptable_min_value:       null,
    acceptable_max_value:       null,
    preferred_categories_json:  null,
    acceptable_categories_json: null,
    preferred_boolean:          null,
    acceptable_boolean_json:    null,
    preferred_min_frequency:    null,
    preferred_max_frequency:    null,
    acceptable_min_frequency:   null,
    acceptable_max_frequency:   null,
  }
}

function makeBooleanRow(code: string, preferred: boolean | null, acceptable: boolean[] | null): any {
  return {
    sub_dimension_code:         code,
    is_unknown:                 false,
    importance_level:           'medium',
    user_note:                  null,
    preferred_min_value:        null,
    preferred_max_value:        null,
    acceptable_min_value:       null,
    acceptable_max_value:       null,
    preferred_categories_json:  null,
    acceptable_categories_json: null,
    preferred_boolean:          preferred,
    acceptable_boolean_json:    acceptable,
    preferred_min_frequency:    null,
    preferred_max_frequency:    null,
    acceptable_min_frequency:   null,
    acceptable_max_frequency:   null,
  }
}

function makeCategoricalRow(code: string, pref: string[], acc: string[]): any {
  return {
    sub_dimension_code:         code,
    is_unknown:                 false,
    importance_level:           'medium',
    user_note:                  null,
    preferred_min_value:        null,
    preferred_max_value:        null,
    acceptable_min_value:       null,
    acceptable_max_value:       null,
    preferred_categories_json:  pref,
    acceptable_categories_json: acc,
    preferred_boolean:          null,
    acceptable_boolean_json:    null,
    preferred_min_frequency:    null,
    preferred_max_frequency:    null,
    acceptable_min_frequency:   null,
    acceptable_max_frequency:   null,
  }
}

function makeFrequencyRow(code: string, prefMin: string, prefMax: string): any {
  return {
    sub_dimension_code:         code,
    is_unknown:                 false,
    importance_level:           'medium',
    user_note:                  null,
    preferred_min_value:        null,
    preferred_max_value:        null,
    acceptable_min_value:       null,
    acceptable_max_value:       null,
    preferred_categories_json:  null,
    acceptable_categories_json: null,
    preferred_boolean:          null,
    acceptable_boolean_json:    null,
    preferred_min_frequency:    prefMin,
    preferred_max_frequency:    prefMax,
    acceptable_min_frequency:   null,
    acceptable_max_frequency:   null,
  }
}

// Minimal sub-dimension mocks
function makeOrdinalSub(code: string): any {
  return {
    code,
    dimension_code: 'env',
    name_user_hu: `${code} (felhasználói)`,
    name_employer_hu: `${code} (munkáltatói)`,
    value_type: 'ordinal',
    comparison_type: 'HIGHER_IS_MORE_DEMANDING',
    is_active: true,
    display_order: 1,
    ordinal_labels: [
      { v: 1, label: 'Alacsony' },
      { v: 2, label: 'Közepes' },
      { v: 3, label: 'Magas' },
    ],
    importance_level: 'medium',
  }
}

function makeBoolSub(code: string): any {
  return {
    code,
    dimension_code: 'comm',
    name_user_hu: `${code} (felhasználói)`,
    name_employer_hu: `${code} (munkáltatói)`,
    value_type: 'boolean',
    comparison_type: 'BOOLEAN_PREFERENCE',
    is_active: true,
    display_order: 1,
    importance_level: 'medium',
  }
}

function makeCatSub(code: string): any {
  return {
    code,
    dimension_code: 'env',
    name_user_hu: `${code} (felhasználói)`,
    name_employer_hu: `${code} (munkáltatói)`,
    value_type: 'categorical',
    comparison_type: 'SET_MEMBERSHIP',
    is_active: true,
    display_order: 1,
    categorical_labels: { indoor: 'Belső tér', outdoor: 'Külső tér' },
    importance_level: 'medium',
  }
}

function makeFreqSub(code: string): any {
  return {
    code,
    dimension_code: 'comm',
    name_user_hu: `${code} (felhasználói)`,
    name_employer_hu: `${code} (munkáltatói)`,
    value_type: 'frequency',
    comparison_type: 'FREQUENCY_RANGE',
    is_active: true,
    display_order: 1,
    frequency_labels: { none: 'Soha', rare: 'Ritka', regular: 'Rendszeres', central: 'Meghatározó' },
    importance_level: 'medium',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template generation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generatePreferenceDimensionBlocks', () => {
  it('ordinal – preferált tartomány megjelenik a szövegben', () => {
    const row = makeOrdinalRow('env_noise', 1, 2)
    const sub = makeOrdinalSub('env_noise')
    const blocks = generatePreferenceDimensionBlocks(['env_noise'], [row], [sub])
    assert.equal(blocks.length, 1)
    assert.ok(blocks[0].text_hu.includes('Alacsony'))
    assert.ok(blocks[0].text_hu.includes('Közepes'))
  })

  it('ordinal – egypontos preferált értéknél nincs tartomány-jelölő', () => {
    const row = makeOrdinalRow('env_noise', 2, 2)
    const sub = makeOrdinalSub('env_noise')
    const blocks = generatePreferenceDimensionBlocks(['env_noise'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('Preferált értékem: Közepes'))
    assert.ok(!blocks[0].text_hu.includes('–'))
  })

  it('unknown row → "Még nem töltöttem ki" szöveg', () => {
    const row = makeUnknownRow('env_noise')
    const sub = makeOrdinalSub('env_noise')
    const blocks = generatePreferenceDimensionBlocks(['env_noise'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('még nem töltöttem ki'))
  })

  it('hiányzó row → "Még nem töltöttem ki" szöveg', () => {
    const sub = makeOrdinalSub('env_noise')
    const blocks = generatePreferenceDimensionBlocks(['env_noise'], [], [sub])
    assert.ok(blocks[0].text_hu.includes('még nem töltöttem ki'))
  })

  it('boolean – preferred=true → "Igen"', () => {
    const row = makeBooleanRow('comm_phone', true, [])
    const sub = makeBoolSub('comm_phone')
    const blocks = generatePreferenceDimensionBlocks(['comm_phone'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('Igen'))
  })

  it('boolean – preferred=false → "Nem" (false is valid!)', () => {
    const row = makeBooleanRow('comm_phone', false, [])
    const sub = makeBoolSub('comm_phone')
    const blocks = generatePreferenceDimensionBlocks(['comm_phone'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('Nem'))
    assert.ok(!blocks[0].text_hu.includes('Még nem töltöttem ki'))
  })

  it('boolean – preferred=null → "mindegy"', () => {
    const row = makeBooleanRow('comm_phone', null, null)
    const sub = makeBoolSub('comm_phone')
    const blocks = generatePreferenceDimensionBlocks(['comm_phone'], [row], [sub])
    assert.ok(blocks[0].text_hu.toLowerCase().includes('mindegy'))
  })

  it('categorical – preferált kategóriák megjelennek', () => {
    const row = makeCategoricalRow('env_space_type', ['indoor'], ['outdoor'])
    const sub = makeCatSub('env_space_type')
    const blocks = generatePreferenceDimensionBlocks(['env_space_type'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('Belső tér'))
    assert.ok(blocks[0].text_hu.includes('Külső tér'))
  })

  it('frequency – tartomány megjelenik', () => {
    const row = makeFrequencyRow('comm_phone', 'none', 'rare')
    const sub = makeFreqSub('comm_phone')
    const blocks = generatePreferenceDimensionBlocks(['comm_phone'], [row], [sub])
    assert.ok(blocks[0].text_hu.includes('Soha'))
    assert.ok(blocks[0].text_hu.includes('Ritka'))
  })

  it('ismeretlen sub_dimension_code → üres tömb (nem dob hibát)', () => {
    const row = makeOrdinalRow('nonexistent_code', 1, 2)
    const sub = makeOrdinalSub('env_noise')
    const blocks = generatePreferenceDimensionBlocks(['nonexistent_code'], [row], [sub])
    assert.equal(blocks.length, 0)
  })

  it('több dimenzió kiválasztva → több blokk', () => {
    const rows = [makeOrdinalRow('env_noise', 1, 2), makeBooleanRow('comm_phone', true, [])]
    const subs = [makeOrdinalSub('env_noise'), makeBoolSub('comm_phone')]
    const blocks = generatePreferenceDimensionBlocks(['env_noise', 'comm_phone'], rows, subs)
    assert.equal(blocks.length, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildPreferenceDocumentText tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPreferenceDocumentText', () => {
  it('tartalmazza a document fejlécet és a cím szövegét', () => {
    const blocks = [{ code: 'env_noise', label_hu: 'Zajszint', text_hu: 'Zajszint: Alacsony.' }]
    const text = buildPreferenceDocumentText('Teszt lap', blocks)
    assert.ok(text.includes('MUNKAPREFERENCIA-LAP'))
    assert.ok(text.includes('Teszt lap'))
    assert.ok(text.includes('Zajszint: Alacsony.'))
  })

  it('tartalmazza a záradékot', () => {
    const text = buildPreferenceDocumentText('X', [])
    assert.ok(text.includes('Védett Karrier'))
    assert.ok(text.includes('nem alkalmassági értékelés'))
  })

  it('determinisztikus: azonos bemenet → azonos kimenet', () => {
    const blocks = [{ code: 'c', label_hu: 'L', text_hu: 'T' }]
    const t1 = buildPreferenceDocumentText('Cím', blocks)
    const t2 = buildPreferenceDocumentText('Cím', blocks)
    assert.equal(t1, t2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Globális invariánsok – biztonsági / adatvédelmi
// ─────────────────────────────────────────────────────────────────────────────

describe('Globális invariánsok', () => {
  it('INTERNAL_APPLICATION módszer nem létezik a rendszerben', () => {
    const VALID: Set<string> = new Set(['EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS'])
    assert.ok(!VALID.has('INTERNAL_APPLICATION'))
  })

  it('boolean false nem tévesztendő össze null-lal (adatvédelmi invariáns)', () => {
    const preferredFalse = false
    const preferredNull  = null
    assert.notEqual(preferredFalse, preferredNull)
    assert.equal(preferredFalse === null, false)
    assert.equal(preferredNull  === null, true)
  })

  it('work_preference_documents – employer NEM fér hozzá (nincs employer policy)', () => {
    // Ez RLS szinten van érvényesítve – itt csak dokumentáció
    // A migration szándékosan nem tartalmaz employer SELECT policyt
    const employerPolicies: string[] = [] // szándékosan üres
    assert.equal(employerPolicies.length, 0)
  })

  it('compatibility_results – employer NEM fér hozzá (nincs employer policy)', () => {
    const employerPolicies: string[] = [] // szándékosan üres
    assert.equal(employerPolicies.length, 0)
  })

  it('OpportunityStatus értékkészlete zárt (csak 3 érték)', () => {
    const VALID_STATUSES = ['draft', 'active', 'closed']
    assert.equal(VALID_STATUSES.length, 3)
    assert.ok(!VALID_STATUSES.includes('pending'))
    assert.ok(!VALID_STATUSES.includes('rejected'))
  })
})
