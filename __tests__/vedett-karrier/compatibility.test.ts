/**
 * Védett Karrier – Sprint 5 Compatibility Engine Unit Tests
 *
 * Teszteli az 5 comparison handlert és globális invariánsokat.
 * Pure function tesztek – nincs DB, nincs Supabase, nincs Next.js.
 *
 * Futtatás: node --experimental-strip-types __tests__/vedett-karrier/compatibility.test.ts
 *
 * MIÉRT SAFE: handlers.ts csak `import type` utasításokat tartalmaz → node runner nem töri meg
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  handleHI,
  handleRP,
  handleSM,
  handleBP,
  handleFR,
  applyImportanceEscalation,
  ExplKey,
} from '../../lib/vedett-karrier/compatibility/handlers.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function ordEmp(value: number, dc = 'SELF_REPORTED' as const) {
  return { type: 'ordinal' as const, value, dataConfidence: dc }
}
function catEmp(value: string, dc = 'SELF_REPORTED' as const) {
  return { type: 'categorical' as const, value, dataConfidence: dc }
}
function boolEmp(value: boolean, dc = 'SELF_REPORTED' as const) {
  return { type: 'boolean' as const, value, dataConfidence: dc }
}
function freqEmp(value: string, dc = 'SELF_REPORTED' as const) {
  return { type: 'frequency' as const, value, dataConfidence: dc }
}

function hiPref(prefMax: number | null, accMax: number | null, imp = 'medium' as const, unknown = false) {
  return {
    subDimensionCode: 'test',
    importanceLevel: imp,
    unknown,
    type: 'ordinal' as const,
    comparisonType: 'HIGHER_IS_MORE_DEMANDING' as const,
    preferred_max_value: prefMax,
    acceptable_max_value: accMax,
    preferred_min_value: null,
    acceptable_min_value: null,
  }
}
function rpPref(
  pMin: number | null, pMax: number | null,
  aMin: number | null, aMax: number | null,
  imp = 'medium' as const
) {
  return {
    subDimensionCode: 'test',
    importanceLevel: imp,
    unknown: false,
    type: 'ordinal' as const,
    comparisonType: 'RANGE_PREFERENCE' as const,
    preferred_min_value: pMin,
    preferred_max_value: pMax,
    acceptable_min_value: aMin,
    acceptable_max_value: aMax,
  }
}
function smPref(pCats: string[], aCats: string[], imp = 'medium' as const) {
  return {
    subDimensionCode: 'test',
    importanceLevel: imp,
    unknown: false,
    type: 'categorical' as const,
    preferred_categories: pCats,
    acceptable_categories: aCats,
  }
}
function bpPref(pb: boolean | null, acc: boolean[], imp = 'medium' as const) {
  return {
    subDimensionCode: 'test',
    importanceLevel: imp,
    unknown: false,
    type: 'boolean' as const,
    preferred_boolean: pb,
    acceptable_boolean_values: acc,
  }
}
function frPref(
  pMin: string | null, pMax: string | null,
  aMin: string | null, aMax: string | null,
  imp = 'medium' as const
) {
  return {
    subDimensionCode: 'test',
    importanceLevel: imp,
    unknown: false,
    type: 'frequency' as const,
    preferred_min_frequency: pMin,
    preferred_max_frequency: pMax,
    acceptable_min_frequency: aMin,
    acceptable_max_frequency: aMax,
  }
}

const FREQ_OPTS = ['none', 'rare', 'regular', 'central'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: applyImportanceEscalation
// ─────────────────────────────────────────────────────────────────────────────

describe('applyImportanceEscalation', () => {
  it('ACCEPTABLE + low → ACCEPTABLE', () => {
    assert.equal(applyImportanceEscalation('ACCEPTABLE', 'low'), 'ACCEPTABLE')
  })
  it('ACCEPTABLE + medium → ACCEPTABLE', () => {
    assert.equal(applyImportanceEscalation('ACCEPTABLE', 'medium'), 'ACCEPTABLE')
  })
  it('ACCEPTABLE + high → CLARIFY', () => {
    assert.equal(applyImportanceEscalation('ACCEPTABLE', 'high'), 'CLARIFY')
  })
  it('ACCEPTABLE + essential → CLARIFY', () => {
    assert.equal(applyImportanceEscalation('ACCEPTABLE', 'essential'), 'CLARIFY')
  })
  it('LOAD_POINT + essential → LOAD_POINT (importance soha nem enyhíti)', () => {
    assert.equal(applyImportanceEscalation('LOAD_POINT', 'essential'), 'LOAD_POINT')
  })
  it('STRONG_FIT + high → STRONG_FIT (csak ACCEPTABLE érintett)', () => {
    assert.equal(applyImportanceEscalation('STRONG_FIT', 'high'), 'STRONG_FIT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: handleHI – HIGHER_IS_MORE_DEMANDING
// ─────────────────────────────────────────────────────────────────────────────

describe('handleHI', () => {
  it('employer < preferred_max → STRONG_FIT', () => {
    const r = handleHI('d1', ordEmp(3), hiPref(5, 8))
    assert.equal(r.status, 'STRONG_FIT')
    assert.equal(r.explanationKey, ExplKey.HI_STRONG_FIT)
  })
  it('employer === preferred_max → STRONG_FIT', () => {
    const r = handleHI('d1', ordEmp(5), hiPref(5, 8))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('preferred_max < employer <= acceptable_max + low → ACCEPTABLE', () => {
    const r = handleHI('d1', ordEmp(7), hiPref(5, 8, 'low'))
    assert.equal(r.status, 'ACCEPTABLE')
    assert.equal(r.explanationKey, ExplKey.HI_ACCEPTABLE)
  })
  it('preferred_max < employer <= acceptable_max + high → CLARIFY', () => {
    const r = handleHI('d1', ordEmp(7), hiPref(5, 8, 'high'))
    assert.equal(r.status, 'CLARIFY')
    assert.equal(r.explanationKey, ExplKey.HI_CLARIFY)
  })
  it('employer > acceptable_max + low → LOAD_POINT (importance irreleváns)', () => {
    const r = handleHI('d1', ordEmp(10), hiPref(5, 8, 'low'))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('employer > acceptable_max + essential → LOAD_POINT (importance SOHA nem enyhít)', () => {
    const r = handleHI('d1', ordEmp(10), hiPref(5, 8, 'essential'))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('missing employer → UNKNOWN + MISSING confidence', () => {
    const r = handleHI('d1', null, hiPref(5, 8))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.dataConfidence, 'MISSING')
    assert.equal(r.explanationKey, ExplKey.EMPLOYER_MISSING)
  })
  it('user unknown=true → UNKNOWN', () => {
    const r = handleHI('d1', ordEmp(3), hiPref(5, 8, 'medium', true))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.explanationKey, ExplKey.USER_UNKNOWN)
  })
  it('user pref both null → UNKNOWN', () => {
    const r = handleHI('d1', ordEmp(3), hiPref(null, null))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.explanationKey, ExplKey.USER_PREF_MISSING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: handleRP – RANGE_PREFERENCE
// ─────────────────────────────────────────────────────────────────────────────

describe('handleRP', () => {
  it('employer in preferred range → STRONG_FIT', () => {
    const r = handleRP('d2', ordEmp(5), rpPref(3, 7, 1, 9))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('employer at preferred_min boundary → STRONG_FIT', () => {
    const r = handleRP('d2', ordEmp(3), rpPref(3, 7, 1, 9))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('employer in acceptable only + low → ACCEPTABLE', () => {
    const r = handleRP('d2', ordEmp(8), rpPref(3, 7, 1, 9, 'low'))
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('employer in acceptable only + essential → CLARIFY', () => {
    const r = handleRP('d2', ordEmp(8), rpPref(3, 7, 1, 9, 'essential'))
    assert.equal(r.status, 'CLARIFY')
  })
  it('employer below acceptable_min → LOAD_POINT', () => {
    const r = handleRP('d2', ordEmp(0), rpPref(3, 7, 1, 9))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('employer above acceptable_max → LOAD_POINT', () => {
    const r = handleRP('d2', ordEmp(10), rpPref(3, 7, 1, 9))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('missing employer → UNKNOWN', () => {
    const r = handleRP('d2', null, rpPref(3, 7, 1, 9))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.dataConfidence, 'MISSING')
  })
  it('all pref nulls → UNKNOWN', () => {
    const r = handleRP('d2', ordEmp(5), rpPref(null, null, null, null))
    assert.equal(r.status, 'UNKNOWN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: handleSM – SET_MEMBERSHIP
// ─────────────────────────────────────────────────────────────────────────────

describe('handleSM', () => {
  it('employer value in preferred categories → STRONG_FIT', () => {
    const r = handleSM('d3', catEmp('irodai'), smPref(['irodai', 'otthon'], ['irodai', 'otthon', 'hybrid']))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('employer value in acceptable only + low → ACCEPTABLE', () => {
    const r = handleSM('d3', catEmp('hybrid'), smPref(['irodai'], ['irodai', 'hybrid'], 'low'))
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('employer value in acceptable only + high → CLARIFY', () => {
    const r = handleSM('d3', catEmp('hybrid'), smPref(['irodai'], ['irodai', 'hybrid'], 'high'))
    assert.equal(r.status, 'CLARIFY')
  })
  it('employer value outside acceptable → LOAD_POINT', () => {
    const r = handleSM('d3', catEmp('kiküldetés'), smPref(['irodai'], ['irodai', 'hybrid']))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('missing employer → UNKNOWN', () => {
    const r = handleSM('d3', null, smPref(['irodai'], ['irodai']))
    assert.equal(r.status, 'UNKNOWN')
  })
  it('both category sets empty → UNKNOWN', () => {
    const r = handleSM('d3', catEmp('irodai'), smPref([], []))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.explanationKey, ExplKey.USER_PREF_MISSING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: handleBP – BOOLEAN_PREFERENCE
// ─────────────────────────────────────────────────────────────────────────────

describe('handleBP', () => {
  it('preferred true + employer true → STRONG_FIT', () => {
    const r = handleBP('d4', boolEmp(true), bpPref(true, [true]))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('preferred false + employer false → STRONG_FIT (false IS valid)', () => {
    const r = handleBP('d4', boolEmp(false), bpPref(false, [false]))
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('preferred null (indifferent) + employer true → ACCEPTABLE (soha nem STRONG_FIT)', () => {
    const r = handleBP('d4', boolEmp(true), bpPref(null, [true, false]))
    assert.equal(r.status, 'ACCEPTABLE')
    assert.equal(r.explanationKey, ExplKey.BP_INDIFFERENT)
  })
  it('preferred null (indifferent) + employer false → ACCEPTABLE', () => {
    const r = handleBP('d4', boolEmp(false), bpPref(null, [true, false]))
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('indifferent soha nem STRONG_FIT', () => {
    const r = handleBP('d4', boolEmp(true), bpPref(null, [true, false]))
    assert.notEqual(r.status, 'STRONG_FIT')
  })
  it('acceptable non-preferred + low → ACCEPTABLE', () => {
    const r = handleBP('d4', boolEmp(false), bpPref(true, [true, false], 'low'))
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('acceptable non-preferred + essential → CLARIFY', () => {
    const r = handleBP('d4', boolEmp(false), bpPref(true, [true, false], 'essential'))
    assert.equal(r.status, 'CLARIFY')
  })
  it('employer value outside acceptable → LOAD_POINT', () => {
    const r = handleBP('d4', boolEmp(true), bpPref(false, [false]))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('missing employer → UNKNOWN + MISSING confidence', () => {
    const r = handleBP('d4', null, bpPref(true, [true]))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.dataConfidence, 'MISSING')
  })
  it('false employer value NOT treated as missing', () => {
    // boolean false = valid employer data – nem UNKNOWN
    const r = handleBP('d4', boolEmp(false), bpPref(false, [false]))
    assert.notEqual(r.status, 'UNKNOWN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: handleFR – FREQUENCY_RANGE
// ─────────────────────────────────────────────────────────────────────────────

describe('handleFR', () => {
  // opts: ['none','rare','regular','central']
  it('employer frequency in preferred range → STRONG_FIT', () => {
    const r = handleFR('d5', freqEmp('regular'), frPref('none', 'regular', 'none', 'central'), FREQ_OPTS)
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('employer at preferred_max → STRONG_FIT', () => {
    const r = handleFR('d5', freqEmp('rare'), frPref('none', 'rare', 'none', 'central'), FREQ_OPTS)
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('employer in acceptable only + low → ACCEPTABLE', () => {
    const r = handleFR('d5', freqEmp('central'), frPref('none', 'regular', 'none', 'central', 'low'), FREQ_OPTS)
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('employer in acceptable only + high → CLARIFY', () => {
    const r = handleFR('d5', freqEmp('central'), frPref('none', 'regular', 'none', 'central', 'high'), FREQ_OPTS)
    assert.equal(r.status, 'CLARIFY')
  })
  it('employer outside acceptable → LOAD_POINT', () => {
    // pref=none..none, acc=none..rare; employer=regular → LOAD_POINT
    const r = handleFR('d5', freqEmp('regular'), frPref('none', 'none', 'none', 'rare'), FREQ_OPTS)
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('ordered domain used, NOT alphabetic – "central" > "rare"', () => {
    // central idx=3, rare idx=1 → central kívül van ha acc max=rare
    const r = handleFR('d5', freqEmp('central'), frPref('none', 'rare', 'none', 'rare'), FREQ_OPTS)
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('alphabetically earlier but domain-later → correct ordering', () => {
    // 'none' < 'rare' alphabetically; none idx=0, rare idx=1
    // employer='none' in preferred ['none','none'] → STRONG_FIT
    const r = handleFR('d5', freqEmp('none'), frPref('none', 'none', 'none', 'central'), FREQ_OPTS)
    assert.equal(r.status, 'STRONG_FIT')
  })
  it('invalid frequency code → UNKNOWN', () => {
    const r = handleFR('d5', freqEmp('invalid_code'), frPref('none', 'rare', 'none', 'central'), FREQ_OPTS)
    assert.equal(r.status, 'UNKNOWN')
  })
  it('missing employer → UNKNOWN', () => {
    const r = handleFR('d5', null, frPref('none', 'rare', 'none', 'central'), FREQ_OPTS)
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.dataConfidence, 'MISSING')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: Globális invariánsok
// ─────────────────────────────────────────────────────────────────────────────

describe('Globális invariánsok', () => {
  it('outside acceptable → ALWAYS LOAD_POINT (HI, essential)', () => {
    const r = handleHI('inv1', ordEmp(99), hiPref(5, 8, 'essential'))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('outside acceptable → ALWAYS LOAD_POINT (SM, low)', () => {
    const r = handleSM('inv2', catEmp('X'), smPref(['A'], ['A', 'B'], 'low'))
    assert.equal(r.status, 'LOAD_POINT')
  })
  it('boolean indifferent → ACCEPTABLE (soha nem STRONG_FIT) – true employer', () => {
    const r = handleBP('inv3', boolEmp(true), bpPref(null, [true, false]))
    assert.notEqual(r.status, 'STRONG_FIT')
    assert.equal(r.status, 'ACCEPTABLE')
  })
  it('boolean indifferent → ACCEPTABLE (soha nem STRONG_FIT) – false employer', () => {
    const r = handleBP('inv4', boolEmp(false), bpPref(null, [true, false]))
    assert.notEqual(r.status, 'STRONG_FIT')
  })
  it('missing employer → UNKNOWN minden handler-ben (RP)', () => {
    const r = handleRP('inv5', null, rpPref(1, 5, 0, 8))
    assert.equal(r.status, 'UNKNOWN')
    assert.equal(r.dataConfidence, 'MISSING')
  })
  it('SELF_REPORTED confidence alone → nem UNKNOWN (confidence ≠ status)', () => {
    const r = handleHI('inv6', ordEmp(3, 'SELF_REPORTED'), hiPref(5, 8))
    assert.equal(r.status, 'STRONG_FIT')
    assert.equal(r.dataConfidence, 'SELF_REPORTED')
  })
  it('nincs overall score mező az eredményben', () => {
    const r = handleHI('inv7', ordEmp(3), hiPref(5, 8))
    assert.equal(('score' in r), false)
    assert.equal(('percentage' in r), false)
    assert.equal(('suitability' in r), false)
    assert.equal(('rank' in r), false)
  })
  it('importance soha nem enyhíti LOAD_POINT-ot (RP, essential)', () => {
    const r = handleRP('inv8', ordEmp(100), rpPref(1, 5, 0, 8, 'essential'))
    assert.equal(r.status, 'LOAD_POINT')
  })
})
