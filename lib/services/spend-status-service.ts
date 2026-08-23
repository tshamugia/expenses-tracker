/**
 * Server-side glue for the category-spend engine (Phase 1).
 * Fetches current-month expense transactions + category limits and runs the
 * pure engine. Not a Server Action — imported by actions.
 */

import { endOfMonth, startOfMonth } from 'date-fns'
import prisma from '@/lib/db/prisma'
import {
  getCategorySpendStatus,
  sumSpentByCategory,
  type CategorySpendStatus,
} from '@/lib/services/category-spend'
import { getMainCurrencyRates } from '@/lib/services/currency'
import type { Currency } from '@/lib/utils/currency-conversion'

export interface CurrencyContext {
  defaultCurrency: Currency
  usdRate: Awaited<ReturnType<typeof getMainCurrencyRates>>['usd']
  eurRate: Awaited<ReturnType<typeof getMainCurrencyRates>>['eur']
}

export async function getCurrencyContext(userId: string): Promise<CurrencyContext> {
  const [preference, rates] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId },
      select: { defaultCurrency: true },
    }),
    getMainCurrencyRates(),
  ])

  return {
    defaultCurrency: (preference?.defaultCurrency || 'GEL') as Currency,
    usdRate: rates.usd,
    eurRate: rates.eur,
  }
}

/**
 * Current-month spend status for all of the user's categories.
 */
export async function computeCategorySpendStatuses(
  userId: string,
  now: Date = new Date()
): Promise<{ statuses: CategorySpendStatus[]; context: CurrencyContext }> {
  const [categories, transactions, context] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      select: { id: true, monthlyLimit: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: startOfMonth(now), lte: endOfMonth(now) },
      },
      select: { categoryId: true, amount: true, currency: true },
    }),
    getCurrencyContext(userId),
  ])

  const spentByCategory = sumSpentByCategory(
    transactions.map((t) => ({
      categoryId: t.categoryId,
      amount: Number(t.amount),
      currency: t.currency,
    })),
    context.defaultCurrency,
    context.usdRate,
    context.eurRate
  )

  const statuses = getCategorySpendStatus(
    spentByCategory,
    categories.map((c) => ({
      id: c.id,
      monthlyLimit: c.monthlyLimit === null ? null : Number(c.monthlyLimit),
    }))
  )

  return { statuses, context }
}

/**
 * Spend status for a single category (used right after quick-add).
 */
export async function computeSingleCategoryStatus(
  userId: string,
  categoryId: string,
  now: Date = new Date()
): Promise<{ status: CategorySpendStatus | null; context: CurrencyContext }> {
  const { statuses, context } = await computeCategorySpendStatuses(userId, now)
  return {
    status: statuses.find((s) => s.categoryId === categoryId) ?? null,
    context,
  }
}
