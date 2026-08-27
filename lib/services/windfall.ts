/**
 * Windfall split engine (Phase 4, PRD §6 Q1 / ს2).
 * Pure function: no DB, no auth, no Date.now — fully unit-testable.
 *
 * When actual income comes in above the plan's forecast, the excess is proposed
 * for split across debt / goals / free by the user's configured percentages
 * (default 50/30/20). The rounding remainder always lands on `free` so the parts
 * sum back to exactly the excess (to the tetri).
 */

import { roundMoney } from '@/lib/services/amortization'

export type WindfallPercents = {
  debt: number
  goals: number
  free: number
}

export type WindfallSplit = {
  toDebt: number
  toGoals: number
  toFree: number
}

/**
 * Split `excess` by the given percentages. Percentages must sum to exactly 100.
 * debt/goals are rounded down-ish (roundMoney) and free absorbs the remainder,
 * so toDebt + toGoals + toFree === roundMoney(excess) exactly.
 * excess ≤ 0 → all zeros.
 */
export function splitWindfall(
  excess: number,
  pcts: WindfallPercents
): WindfallSplit {
  const sum = pcts.debt + pcts.goals + pcts.free
  if (sum !== 100) {
    throw new Error(`Windfall percentages must sum to 100 (got ${sum})`)
  }

  const total = roundMoney(excess)
  if (total <= 0) {
    return { toDebt: 0, toGoals: 0, toFree: 0 }
  }

  const toDebt = roundMoney((total * pcts.debt) / 100)
  const toGoals = roundMoney((total * pcts.goals) / 100)
  // free takes the remainder so the parts sum back to `total` exactly
  const toFree = roundMoney(total - toDebt - toGoals)

  return { toDebt, toGoals, toFree }
}
