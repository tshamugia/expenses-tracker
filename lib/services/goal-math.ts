/**
 * Goals & emergency-fund engine (Phase 3, PRD §7.4 / R1 / D5 / G3-G4).
 * Pure functions: no DB, no auth, no Date.now — fully unit-testable. The caller
 * passes `today` so projections are deterministic.
 *
 * A goal is computed in both directions: from a deadline we derive the required
 * monthly contribution; from a contribution we derive the projected completion
 * date. When a goal carries both a deadline and a planned contribution it can
 * fall "behind" — the plan no longer hits the deadline — and the engine returns
 * a concrete recommendation (§7.4).
 */

import { addMonths, differenceInCalendarMonths } from 'date-fns'
import { roundMoney } from '@/lib/services/amortization'

export { roundMoney }

/**
 * What a single goal must receive THIS month to stay on schedule (Phase 4b).
 * This is the driver of the goal-based monthly plan:
 *  - a goal with a deadline → remaining ÷ months left (a past/this-month deadline
 *    demands the whole remaining now);
 *  - a goal with only a contribution pace → that pace, capped at remaining;
 *  - a goal with neither → 0 (nothing planned).
 * `referenceDate` is injected so the result is deterministic and testable.
 */
export function goalRequiredThisMonth(
  goal: { targetDate: Date | null; monthlyContribution: number | null },
  remaining: number,
  referenceDate: Date
): number {
  if (remaining <= 0) return 0
  const hasDate =
    goal.targetDate instanceof Date && !isNaN(goal.targetDate.getTime())
  if (hasDate) {
    const monthsLeft = differenceInCalendarMonths(
      goal.targetDate as Date,
      referenceDate
    )
    return requiredMonthlyContribution(remaining, monthsLeft)
  }
  if (goal.monthlyContribution != null && goal.monthlyContribution > 0) {
    return roundMoney(Math.min(goal.monthlyContribution, remaining))
  }
  return 0
}

/**
 * Contribution needed each month to cover `remaining` by the deadline.
 * monthsLeft ≤ 0 (deadline is now or past) → the whole remaining in one month.
 * remaining ≤ 0 → 0 (already funded).
 */
export function requiredMonthlyContribution(
  remaining: number,
  monthsLeft: number
): number {
  if (remaining <= 0) return 0
  if (monthsLeft <= 0) return roundMoney(remaining)
  return roundMoney(remaining / monthsLeft)
}

/**
 * Date the goal is reached contributing `monthlyContribution` from `from`.
 * Returns null when the contribution is ≤ 0 (it would never be reached).
 * A partial final month counts as a whole month (ceil).
 */
export function projectedCompletionDate(
  remaining: number,
  monthlyContribution: number,
  from: Date
): Date | null {
  if (monthlyContribution <= 0) return null
  if (remaining <= 0) return new Date(from)
  const months = Math.ceil(roundMoney(remaining) / monthlyContribution)
  return addMonths(from, months)
}

export type GoalStatusKind = 'on_track' | 'behind' | 'achieved' | 'no_plan'

export type GoalProgress = {
  saved: number // sum of contributions (withdrawals subtracted)
  targetAmount: number
  remaining: number
  percent: number // 0–100, capped
  monthsLeft: number | null
  requiredMonthly: number | null // from targetDate
  projectedDate: Date | null // from monthlyContribution
  status: GoalStatusKind
  behindAdvice?: {
    increaseMonthlyBy: number // raise the contribution by this to still hit the deadline
    orMoveDateTo: Date // …or keep the current contribution and finish on this date
  }
}

export type GoalMathInput = {
  targetAmount: number
  targetDate: Date | null
  monthlyContribution: number | null
}

/**
 * Full progress snapshot for a goal from its contribution ledger.
 * - saved sums signed contributions (negative = withdrawal).
 * - status: achieved when saved ≥ target; no_plan when there is neither a
 *   deadline nor a contribution (or the target is not set yet); behind when a
 *   deadline + contribution plan no longer meet the deadline; else on_track.
 */
export function calcGoalProgress(
  goal: GoalMathInput,
  contributions: { amount: number }[],
  today: Date = new Date()
): GoalProgress {
  const targetAmount = roundMoney(goal.targetAmount)
  const saved = roundMoney(
    contributions.reduce((sum, c) => sum + c.amount, 0)
  )
  const remaining = Math.max(0, roundMoney(targetAmount - saved))

  const hasDate = goal.targetDate instanceof Date && !isNaN(goal.targetDate.getTime())
  const contribution =
    goal.monthlyContribution != null && goal.monthlyContribution > 0
      ? goal.monthlyContribution
      : null

  const monthsLeft = hasDate
    ? differenceInCalendarMonths(goal.targetDate as Date, today)
    : null
  const requiredMonthly = hasDate
    ? requiredMonthlyContribution(remaining, monthsLeft as number)
    : null
  const projectedDate =
    contribution !== null
      ? projectedCompletionDate(remaining, contribution, today)
      : null

  const percent =
    targetAmount > 0
      ? Math.min(100, Math.max(0, (saved / targetAmount) * 100))
      : 0

  const base = {
    saved,
    targetAmount,
    remaining,
    percent,
    monthsLeft,
    requiredMonthly,
    projectedDate,
  }

  // Nothing to save (target not derived yet) or no plan at all
  if (targetAmount <= 0) {
    return { ...base, status: 'no_plan' }
  }
  if (saved >= targetAmount) {
    return { ...base, percent: 100, status: 'achieved' }
  }
  if (!hasDate && contribution === null) {
    return { ...base, status: 'no_plan' }
  }

  // Deadline + contribution plan → can fall behind, with concrete advice
  if (hasDate && contribution !== null) {
    const needed = requiredMonthly as number
    if (contribution + 1e-9 < needed) {
      return {
        ...base,
        status: 'behind',
        behindAdvice: {
          increaseMonthlyBy: roundMoney(needed - contribution),
          // projectedDate is non-null here (contribution > 0)
          orMoveDateTo: projectedDate as Date,
        },
      }
    }
    return { ...base, status: 'on_track' }
  }

  // Deadline only (no contribution baseline): feasible until the deadline passes
  if (hasDate) {
    return {
      ...base,
      status: (monthsLeft as number) <= 0 ? 'behind' : 'on_track',
    }
  }

  // Contribution only (no deadline): always on track, just projects a date
  return { ...base, status: 'on_track' }
}

/**
 * Mandatory monthly expense = active fixed Expense total + 3-month average spend
 * in FIXED categories. Both inputs are already in the user's default currency.
 */
export function calcMandatoryMonthlyExpense(
  fixedExpensesMonthly: number,
  fixedCategorySpend3moAvg: number
): number {
  return roundMoney(
    Math.max(0, fixedExpensesMonthly) + Math.max(0, fixedCategorySpend3moAvg)
  )
}

/**
 * Reserve target = mandatory monthly expense × stage (1 or 3 months).
 * mandatoryMonthly 0 (brand-new user) → target 0.
 */
export function calcReserveTarget(
  mandatoryMonthly: number,
  stage: 1 | 3
): number {
  return roundMoney(Math.max(0, mandatoryMonthly) * stage)
}
