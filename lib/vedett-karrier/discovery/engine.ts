/**
 * Védett Karrier – Career Discovery Engine
 * Sprint 3
 *
 * KRITIKUS:
 * - NEM suitability ranking
 * - NEM fit score
 * - NEM percentage
 * - Nincs score / rank / suitability mező a public output-ban
 * - displayPriorityTuple ephemeral belső logika — nem DB, nem employer
 *
 * Input: user_skills + career_interests + (opcionálisan) career_profile_dimensions
 * Output: 3–5 CareerDiscoveryResult, vagy hasEnoughData=false
 */

import type {
  CareerDiscoveryResult,
  CareerInterestRow,
  DiscoveryOutput,
  DiscoveryReasonCode,
  DisplayPriorityTuple,
  JobFamilyRow,
  UserSkillRow,
} from '../types/discovery'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SKILLS_FOR_FAMILY_CANDIDATE = 2
const MIN_OUTPUT = 3
const MAX_OUTPUT = 5
/** Number of signal types needed to consider data "sufficient" */
const MIN_SIGNALS_FOR_SUFFICIENT = 1

// ─────────────────────────────────────────────────────────────────────────────
// Discovery input
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveryInput {
  families: JobFamilyRow[]
  userSkills: UserSkillRow[]
  careerInterests: CareerInterestRow[]
  /** Optional: set of sub_dimension_codes where user has preferred/acceptable overlap with family env */
  familyEnvOverlapCounts: Record<string, number>  // slug → overlap count
}

// ─────────────────────────────────────────────────────────────────────────────
// Sufficient data check
// ─────────────────────────────────────────────────────────────────────────────

export function hasEnoughDiscoveryData(input: Omit<DiscoveryInput, 'families'>): boolean {
  const hasSkills   = input.userSkills.length >= MIN_SKILLS_FOR_FAMILY_CANDIDATE
  const hasInterest = input.careerInterests.some(
    i => i.interest_level === 'interested' || i.interest_level === 'strong'
  )
  return hasSkills || hasInterest
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate evaluation
// ─────────────────────────────────────────────────────────────────────────────

interface FamilyCandidate {
  family: JobFamilyRow
  reasons: Set<DiscoveryReasonCode>
  matchedSkillCodes: string[]
  trainableSkillCodes: string[]
  /** Internal only – not exposed in public result */
  _priority: DisplayPriorityTuple
}

function evaluateFamily(
  family: JobFamilyRow,
  userSkillCodes: Set<string>,
  interestMap: Map<string, CareerInterestRow>,
  envOverlapCount: number
): FamilyCandidate | null {
  const reasons = new Set<DiscoveryReasonCode>()
  const matchedSkillCodes: string[] = []
  const trainableSkillCodes: string[] = []

  // 1. Explicit interest
  const interest = interestMap.get(family.slug)
  const isExplicitInterest =
    interest?.interest_level === 'interested' ||
    interest?.interest_level === 'strong'
  if (isExplicitInterest) reasons.add('interest_match')

  // 2. Skill connection: user has ≥2 skills in core_skills_json
  const familyCoreCodes = new Set<string>(family.core_skills_json)
  const familyTrainableCodes = new Set<string>(family.trainable_skills_json)

  for (const code of userSkillCodes) {
    if (familyCoreCodes.has(code) || familyTrainableCodes.has(code)) {
      matchedSkillCodes.push(code)
    }
  }

  if (matchedSkillCodes.length >= MIN_SKILLS_FOR_FAMILY_CANDIDATE) {
    reasons.add('has_skills')
  }

  // trainable skills user does NOT have yet
  for (const code of familyTrainableCodes) {
    if (!userSkillCodes.has(code)) {
      trainableSkillCodes.push(code)
    }
  }
  if (trainableSkillCodes.length > 0) reasons.add('trainable_skills')

  // 3. Environment overlap
  const ENV_OVERLAP_THRESHOLD = 3
  if (envOverlapCount >= ENV_OVERLAP_THRESHOLD) {
    reasons.add('env_overlap')
  }

  // Must have at least one qualifying reason for candidacy
  const isCandidate = isExplicitInterest ||
    matchedSkillCodes.length >= MIN_SKILLS_FOR_FAMILY_CANDIDATE ||
    envOverlapCount >= ENV_OVERLAP_THRESHOLD

  if (!isCandidate) return null

  // Internal priority tuple (not exposed):
  // tier 0 = explicit interest, 1 = skills, 2 = env only
  const tier = isExplicitInterest ? 0 : matchedSkillCodes.length >= MIN_SKILLS_FOR_FAMILY_CANDIDATE ? 1 : 2
  const _priority: DisplayPriorityTuple = [
    tier,
    -matchedSkillCodes.length,
    -envOverlapCount,
    family.slug,
  ]

  return { family, reasons, matchedSkillCodes, trainableSkillCodes, _priority }
}

// ─────────────────────────────────────────────────────────────────────────────
// Diversity filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prevent showing 5 near-identical task-pattern families.
 * Groups by task_pattern_summary prefix (first 20 chars) and limits per group.
 */
function applyDiversityFilter(candidates: FamilyCandidate[]): FamilyCandidate[] {
  const MAX_PER_PATTERN_PREFIX = 2
  const seen = new Map<string, number>()
  const result: FamilyCandidate[] = []

  for (const c of candidates) {
    const prefix = c.family.task_pattern_summary.slice(0, 20)
    const count = seen.get(prefix) ?? 0
    if (count < MAX_PER_PATTERN_PREFIX) {
      seen.set(prefix, count + 1)
      result.push(c)
    }
    if (result.length >= MAX_OUTPUT) break
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable sort by displayPriorityTuple
// ─────────────────────────────────────────────────────────────────────────────

function comparePriority(a: DisplayPriorityTuple, b: DisplayPriorityTuple): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine
// ─────────────────────────────────────────────────────────────────────────────

export function runCareerDiscovery(input: DiscoveryInput): DiscoveryOutput {
  const { families, userSkills, careerInterests } = input

  // Data sufficiency check
  if (!hasEnoughDiscoveryData({ userSkills, careerInterests, familyEnvOverlapCounts: input.familyEnvOverlapCounts })) {
    return { hasEnoughData: false, results: [] }
  }

  const userSkillCodes = new Set(userSkills.map(s => s.skill_code))
  const interestMap = new Map(careerInterests.map(i => [i.job_family_slug, i]))

  // Evaluate all families
  const candidates: FamilyCandidate[] = []
  for (const family of families) {
    const envCount = input.familyEnvOverlapCounts[family.slug] ?? 0
    const candidate = evaluateFamily(family, userSkillCodes, interestMap, envCount)
    if (candidate) candidates.push(candidate)
  }

  // Sort by priority (stable: display_order then slug as tie-breaker)
  candidates.sort((a, b) => comparePriority(a._priority, b._priority))

  // Diversity filter then trim to MAX_OUTPUT
  const diverse = applyDiversityFilter(candidates)
  const selected = diverse.slice(0, MAX_OUTPUT)

  if (selected.length < MIN_OUTPUT) {
    // Not enough candidates — treat as insufficient data
    return { hasEnoughData: false, results: [] }
  }

  // Map to public result — NO score/percentage/rank
  const results: CareerDiscoveryResult[] = selected.map(c => ({
    jobFamily: c.family,
    reason_codes: Array.from(c.reasons),
    matchedSkillCodes: c.matchedSkillCodes,
    trainableSkillCodes: c.trainableSkillCodes,
  }))

  return { hasEnoughData: true, results }
}
