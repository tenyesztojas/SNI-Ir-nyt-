/**
 * Védett Karrier – Sprint 3 Seed Validation
 *
 * A DB seed az SQL migration-ban van (ON CONFLICT DO NOTHING).
 * Ez a fájl a TypeScript-oldali seed validáció és konstansok.
 *
 * Futtatás: node --experimental-strip-types lib/vedett-karrier/seed/sprint3-seed.ts
 */

export const EXPECTED_JOB_FAMILY_SLUGS: readonly string[] = [
  'admin-strukturalt',
  'adatbevitel-adatkezeles',
  'dokumentacio-nyilvantartas',
  'digitalis-hattermunka',
  'minoseg-ellenorzes',
  'keszlet-logisztika',
  'technikai-karbantartas',
  'kutatas-informaciofeldolgozas',
  'kreativ-digitalis',
  'kezzel-preciz',
  'novenyek-kornyezet',
  'elelmiszer-elokeszites',
  'gondoskodas-tamogatas',
  'tisztasag-rendezettség',
  'szallitas-fuvarozas',
  'ugyfel-informacios',
  'keszpenz-penzugyi-admin',
  'szoveges-tartalom',
  'vizualis-designtamogatas',
  'oktatasi-tamogatas',
  'megfigyeles-monitorozas',
  'kezi-csomagolas-valogatás',
  'terep-kulteri-munka',
  'digitalis-ugyintezes',
  'szociometriai-kozossegi',
] as const

export const EXPECTED_SKILL_CODES: readonly string[] = [
  // digital
  'data-entry', 'spreadsheet-basic', 'spreadsheet-advanced', 'word-processing',
  'email-communication', 'file-management', 'internet-search', 'data-checking',
  'basic-graphic-editing', 'social-media-basic', 'document-scanning', 'database-entry',
  'simple-coding', 'digital-form-filling', 'content-uploading',
  // manual
  'precise-assembly', 'quality-visual-check', 'packaging', 'inventory-counting',
  'physical-filing', 'equipment-basic-maintenance', 'plant-care', 'food-preparation-simple',
  'cleaning-hygiene', 'delivery-local', 'warehouse-tasks', 'machine-operation-basic',
  'label-marking', 'material-handling', 'handcraft',
  // cognitive
  'attention-to-detail', 'rule-following', 'error-detection', 'information-organizing',
  'note-taking', 'basic-math', 'reading-comprehension', 'pattern-recognition',
  'task-prioritization', 'research-basic', 'categorization', 'process-following',
  'concentration-sustained', 'decision-simple', 'reporting-basic',
  // interpersonal
  'basic-customer-communication', 'team-collaboration', 'instruction-following',
  'feedback-accepting', 'colleague-coordination', 'written-communication',
  'phone-basic', 'service-orientation',
  // physical
  'standing-work', 'walking-extended', 'lifting-light', 'fine-motor-skills',
  'outdoor-tolerance', 'repetitive-motion', 'sensory-vigilance',
] as const

export const EXPECTED_INDUSTRY_SLUGS: readonly string[] = [
  'logisztika', 'kereskedelem', 'egeszseggugyi', 'kozigazgatas', 'info-tech',
  'penzugy', 'oktatás', 'vendeglatas', 'mezogazdasag', 'gyartas',
  'epiteszet-epitoip', 'media-kreativ', 'nonprofit', 'kornyezet-zold', 'altalanos',
] as const

/**
 * Sprint 3 seed konstansok validálása.
 * FAIL FAST ha bármely invariáns sérül.
 */
export function validateSprint3Seed(): void {
  // CHECK-S3-01: pontosan 25 family slug
  if (EXPECTED_JOB_FAMILY_SLUGS.length !== 25) {
    throw new Error(`S3-01 FAIL: ${EXPECTED_JOB_FAMILY_SLUGS.length} family slug, 25 várható`)
  }

  // CHECK-S3-02: pontosan 60 skill code
  if (EXPECTED_SKILL_CODES.length !== 60) {
    throw new Error(`S3-02 FAIL: ${EXPECTED_SKILL_CODES.length} skill code, 60 várható`)
  }

  // CHECK-S3-03: pontosan 15 industry slug
  if (EXPECTED_INDUSTRY_SLUGS.length !== 15) {
    throw new Error(`S3-03 FAIL: ${EXPECTED_INDUSTRY_SLUGS.length} industry slug, 15 várható`)
  }

  // CHECK-S3-04: family slug duplikát
  const familySet = new Set(EXPECTED_JOB_FAMILY_SLUGS)
  if (familySet.size !== EXPECTED_JOB_FAMILY_SLUGS.length) {
    throw new Error('S3-04 FAIL: Duplikált family slug')
  }

  // CHECK-S3-05: skill code duplikát
  const skillSet = new Set(EXPECTED_SKILL_CODES)
  if (skillSet.size !== EXPECTED_SKILL_CODES.length) {
    throw new Error('S3-05 FAIL: Duplikált skill code')
  }

  // CHECK-S3-06: industry slug duplikát
  const industrySet = new Set(EXPECTED_INDUSTRY_SLUGS)
  if (industrySet.size !== EXPECTED_INDUSTRY_SLUGS.length) {
    throw new Error('S3-06 FAIL: Duplikált industry slug')
  }
}

// Self-validate when run directly
validateSprint3Seed()
