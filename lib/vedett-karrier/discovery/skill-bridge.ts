/**
 * Védett Karrier – Light Készséghíd
 * Sprint 3
 *
 * Három blokk: MÁR MEGVAN | ÉRDEMES FEJLESZTENI | KÖVETKEZŐ LÉPÉS
 *
 * NEM: alkalmas/nem alkalmas, százalék, hiánypontszám, "hiányosságod".
 */

import type { LightSkillBridgeResult, SkillRow, UserSkillRow } from '../types/discovery'

// ─────────────────────────────────────────────────────────────────────────────
// Next step templates (determinisztikus, NEM AI)
// ─────────────────────────────────────────────────────────────────────────────

function generateNextStep(developNext: SkillRow[]): string {
  if (developNext.length === 0) {
    return 'Próbálj meg a munkakörcsalád egyik tipikus feladatával megismerkedni, akár önkéntesként vagy gyakorlaton keresztül.'
  }

  const first = developNext[0]
  switch (first.category) {
    case 'digital':
      return `Érdemes lehet alap szinten kipróbálni: ${first.name_hu.toLowerCase()}. Keress ingyenes online gyakorló felületet.`
    case 'manual':
      return `Próbálj rövid, kézzel végezhető feladatokat keresni, ahol ${first.name_hu.toLowerCase()} szükséges.`
    case 'cognitive':
      return `Napi rendszerességgel végzett ${first.name_hu.toLowerCase()} segíthet fejleszteni ezt a területet.`
    case 'interpersonal':
      return `A ${first.name_hu.toLowerCase()} területén alacsony tétű helyzetekben (pl. önkéntes munka) érdemes gyakorolni.`
    case 'physical':
      return `A ${first.name_hu.toLowerCase()} fokozatosan fejleszthető – érdemes kis lépésekben elkezdeni.`
    default:
      return `Érdemes lehet megismerkedni ezzel a területtel: ${first.name_hu.toLowerCase()}.`
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Light Skill Bridge computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Light Skill Bridge for a job family.
 *
 * @param familyCoreSkillCodes - skill codes in this family's core_skills_json
 * @param familyTrainableSkillCodes - skill codes in this family's trainable_skills_json
 * @param allSkills - full skill reference list
 * @param userSkills - user's saved skills
 */
export function computeLightSkillBridge(
  familyCoreSkillCodes: string[],
  familyTrainableSkillCodes: string[],
  allSkills: SkillRow[],
  userSkills: UserSkillRow[]
): LightSkillBridgeResult {
  const userSkillCodeSet = new Set(userSkills.map(s => s.skill_code))
  const skillByCode = new Map(allSkills.map(s => [s.code, s]))

  // MÁR MEGVAN: user has the skill at any proficiency level
  const alreadyHave: SkillRow[] = []
  for (const code of familyCoreSkillCodes) {
    if (userSkillCodeSet.has(code)) {
      const skill = skillByCode.get(code)
      if (skill) alreadyHave.push(skill)
    }
  }

  // ÉRDEMES FEJLESZTENI: trainable skills user does NOT yet have
  // NEM: "hiányosságod" — framing is "érdemes fejleszteni"
  const developNext: SkillRow[] = []
  for (const code of familyTrainableSkillCodes) {
    if (!userSkillCodeSet.has(code)) {
      const skill = skillByCode.get(code)
      if (skill && skill.is_trainable) developNext.push(skill)
    }
  }

  const nextStepText = generateNextStep(developNext)

  return { alreadyHave, developNext, nextStepText }
}
