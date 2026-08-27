/**
 * Goal what-if impact (Phase 4 extension). Pure helper — no DB, no auth, no
 * Date.now — fully unit-testable. Answers "if I approved this proposed goal now,
 * how would my monthly Safe-to-Spend change?" by running the pure waterfall
 * (`generatePlan`) twice: once as-is, once with the candidate goal appended.
 *
 * A proposed goal is a wishlist entry — excluded from the real plan until
 * approved — so this never persists anything; it only previews the delta.
 */

import { generatePlan, type PlanInput } from '@/lib/services/plan-engine'

/** The minimal shape of a goal that would enter the GOAL tier of the waterfall. */
export interface WhatIfCandidate {
  monthlyContribution: number
  remaining: number
  priority: number
}

export interface GoalWhatIfResult {
  safeBefore: number
  safeAfter: number
  deltaMonthly: number
}

/**
 * Compute the Safe-to-Spend impact of approving one proposed goal. `safeBefore`
 * is the current plan's monthly Safe-to-Spend; `safeAfter` is what it would be
 * with the candidate added to the GOAL tier. `deltaMonthly` is the reduction
 * (>= 0), floored at 0 — the waterfall never lets Safe-to-Spend go negative, so
 * once the plan is already at a deficit the delta reads as 0.
 */
export function computeGoalWhatIf(
  baseInput: PlanInput,
  candidate: WhatIfCandidate
): GoalWhatIfResult {
  const safeBefore = generatePlan(baseInput).safeToSpendMonth
  const withGoal: PlanInput = {
    ...baseInput,
    goals: [
      ...baseInput.goals,
      {
        goalId: '__whatif__',
        label: '__whatif__',
        monthlyContribution: candidate.monthlyContribution,
        remaining: candidate.remaining,
        priority: candidate.priority,
      },
    ],
  }
  const safeAfter = generatePlan(withGoal).safeToSpendMonth
  const deltaMonthly = Math.max(0, Math.round((safeBefore - safeAfter) * 100) / 100)
  return { safeBefore, safeAfter, deltaMonthly }
}
