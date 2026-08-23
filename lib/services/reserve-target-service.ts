/**
 * Server-side glue for the emergency-fund auto target (Phase 3 §3, §5).
 * Computes the mandatory monthly expense (active fixed Expenses + 3-month FIXED
 * category average) and recomputes the reserve goal's cached target. Not a
 * Server Action — imported by goal-actions and the daily cron.
 */

import { endOfMonth, startOfMonth, subMonths } from 'date-fns'
import prisma from '@/lib/db/prisma'
import {
  calcMandatoryMonthlyExpense,
  calcReserveTarget,
  roundMoney,
} from '@/lib/services/goal-math'
import {
  getCurrencyContext,
  type CurrencyContext,
} from '@/lib/services/spend-status-service'
import { notifyReserveTargetChanged } from '@/lib/services/notification-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'

/**
 * Mandatory monthly expense in the user's default currency:
 * active recurring (fixed) Expenses + average monthly spend in FIXED categories
 * over the last 3 completed months.
 */
export async function computeMandatoryMonthly(
  userId: string,
  now: Date = new Date()
): Promise<{ mandatoryMonthly: number; context: CurrencyContext }> {
  const context = await getCurrencyContext(userId)
  const toDefault = (amount: number, currency: string) =>
    convertCurrency(
      amount,
      currency as Currency,
      context.defaultCurrency,
      context.usdRate,
      context.eurRate
    )

  // Last 3 completed months (exclude the current, partial month)
  const windowStart = startOfMonth(subMonths(now, 3))
  const windowEnd = endOfMonth(subMonths(now, 1))

  const [fixedExpenses, fixedCategories] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, isRecurring: true },
      select: { amount: true, currency: true },
    }),
    prisma.category.findMany({
      where: { userId, kind: 'FIXED' },
      select: { id: true },
    }),
  ])

  const fixedExpensesMonthly = roundMoney(
    fixedExpenses.reduce((sum, e) => sum + toDefault(Number(e.amount), e.currency), 0)
  )

  let fixedCategorySpend3moAvg = 0
  if (fixedCategories.length > 0) {
    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { in: fixedCategories.map((c) => c.id) },
        date: { gte: windowStart, lte: windowEnd },
      },
      select: { amount: true, currency: true },
    })
    const total = txns.reduce(
      (sum, t) => sum + toDefault(Number(t.amount), t.currency),
      0
    )
    fixedCategorySpend3moAvg = total / 3
  }

  return {
    mandatoryMonthly: calcMandatoryMonthlyExpense(
      fixedExpensesMonthly,
      fixedCategorySpend3moAvg
    ),
    context,
  }
}

export interface RecalcResult {
  changed: boolean
  oldTarget: number
  newTarget: number
  mandatoryMonthly: number
}

/**
 * Recompute and persist the reserve goal's target for one user.
 * Notifies (best-effort) when the target moves by more than ±10%.
 * No-op (returns changed:false) when the user has no emergency fund.
 */
export async function recalcReserveTargetForUser(
  userId: string,
  now: Date = new Date()
): Promise<RecalcResult | null> {
  const reserve = await prisma.goal.findFirst({
    where: { userId, isEmergencyFund: true },
  })
  if (!reserve) return null

  const { mandatoryMonthly } = await computeMandatoryMonthly(userId, now)
  const stage = (reserve.reserveStage ?? 1) as 1 | 3
  const newTarget = calcReserveTarget(mandatoryMonthly, stage)
  const oldTarget = Number(reserve.targetAmount)

  if (newTarget === oldTarget) {
    return { changed: false, oldTarget, newTarget, mandatoryMonthly }
  }

  await prisma.goal.update({
    where: { id: reserve.id },
    data: { targetAmount: newTarget },
  })

  // Notify only on a meaningful move (>±10%); from 0 always counts as meaningful
  const movedEnough =
    oldTarget === 0 ? newTarget > 0 : Math.abs(newTarget - oldTarget) / oldTarget > 0.1
  if (movedEnough) {
    try {
      await notifyReserveTargetChanged(userId, {
        oldTarget,
        newTarget,
        currency: reserve.currency,
      })
    } catch (error) {
      console.error('Error notifying reserve target change:', error)
    }
  }

  return { changed: true, oldTarget, newTarget, mandatoryMonthly }
}

/**
 * Recompute reserve targets for every user with an emergency fund (daily cron).
 * Returns how many targets actually changed.
 */
export async function recalcAllReserveTargets(): Promise<number> {
  const reserves = await prisma.goal.findMany({
    where: { isEmergencyFund: true },
    select: { userId: true },
  })
  let changed = 0
  for (const { userId } of reserves) {
    try {
      const result = await recalcReserveTargetForUser(userId)
      if (result?.changed) changed++
    } catch (error) {
      console.error(`Error recalculating reserve for user ${userId}:`, error)
    }
  }
  return changed
}
