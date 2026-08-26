/**
 * Server-side glue for the income-forecast engine (Phase 1, reused by Phase 4).
 * Gathers the user's stable sources + variable-income history and runs the pure
 * `forecastNextMonthIncome` engine. Not a Server Action — imported by
 * income-actions (overview) and the plan-input gatherer.
 */

import { endOfMonth, startOfMonth, subMonths } from 'date-fns'
import prisma from '@/lib/db/prisma'
import {
  forecastNextMonthIncome,
  type IncomeForecast,
} from '@/lib/services/income-forecast'
import {
  getCurrencyContext,
  type CurrencyContext,
} from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'

export const FORECAST_HISTORY_MONTHS = 6

/**
 * Conservative income forecast for next month in the user's default currency.
 * `context` can be passed in when the caller already resolved currency rates.
 */
export async function computeIncomeForecastForUser(
  userId: string,
  now: Date = new Date(),
  context?: CurrencyContext
): Promise<{ forecast: IncomeForecast; context: CurrencyContext }> {
  const ctx = context ?? (await getCurrencyContext(userId))
  const toDefault = (amount: number, currency: string) =>
    convertCurrency(
      amount,
      currency as Currency,
      ctx.defaultCurrency,
      ctx.usdRate,
      ctx.eurRate
    )

  const windowStart = startOfMonth(subMonths(now, FORECAST_HISTORY_MONTHS))
  const currentMonthStart = startOfMonth(now)
  const variableWhere = {
    userId,
    type: 'INCOME' as const,
    OR: [{ incomeSourceId: null }, { incomeSource: { type: 'VARIABLE' as const } }],
  }

  const [sources, variableTxs, olderCount] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId, isActive: true, type: 'STABLE' },
      select: { expectedAmount: true, currency: true, isActive: true, type: true },
    }),
    prisma.transaction.findMany({
      where: { ...variableWhere, date: { gte: windowStart, lt: currentMonthStart } },
      select: { amount: true, currency: true, date: true },
      orderBy: { date: 'asc' },
    }),
    prisma.transaction.count({
      where: { ...variableWhere, date: { lt: windowStart } },
    }),
  ])

  // History starts either at the window edge (older data exists) or at the first
  // variable-income month; months with zero income count as 0 (R2).
  const firstHistoryMonth =
    olderCount > 0
      ? windowStart
      : variableTxs.length > 0
        ? startOfMonth(variableTxs[0].date)
        : null

  const variableHistory: { month: string; total: number }[] = []
  if (firstHistoryMonth) {
    for (
      let cursor = new Date(firstHistoryMonth);
      cursor < currentMonthStart;
      cursor = startOfMonth(subMonths(cursor, -1))
    ) {
      const next = startOfMonth(subMonths(cursor, -1))
      const total = variableTxs
        .filter((t) => t.date >= cursor && t.date < next)
        .reduce((sum, t) => sum + toDefault(Number(t.amount), t.currency), 0)
      variableHistory.push({
        month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        total,
      })
    }
  }

  const stableSources = sources
    .filter((s) => s.isActive && s.type === 'STABLE' && s.expectedAmount !== null)
    .map((s) => ({
      expectedAmount: toDefault(Number(s.expectedAmount), s.currency),
      currency: ctx.defaultCurrency,
    }))

  const forecast = forecastNextMonthIncome({ stableSources, variableHistory })
  return { forecast, context: ctx }
}

// Re-export for the endOfMonth helper convenience in callers
export { endOfMonth }
