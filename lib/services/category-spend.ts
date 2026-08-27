/**
 * Category spend status engine (Phase 1 — soft monthly limits).
 * Pure functions: currency rates are passed in, no DB/network access.
 */

import type { CurrencyRate } from '@/lib/services/currency'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'

export type CategorySpendStatus = {
  categoryId: string
  spent: number // current month, in default currency
  limit: number | null
  ratio: number | null // spent / limit
  level: 'ok' | 'warning' | 'over' // ≥0.8 → warning, >1.0 → over
}

export type CategoryLimitInfo = {
  id: string
  monthlyLimit: number | null
}

export const WARNING_THRESHOLD = 0.8

/**
 * Sum expense amounts per category, converting every amount to the default
 * currency with the provided NBG rates.
 */
export function sumSpentByCategory(
  transactions: { categoryId: string | null; amount: number; currency: string }[],
  defaultCurrency: Currency,
  usdRate: CurrencyRate | null,
  eurRate: CurrencyRate | null
): Map<string, number> {
  const spentByCategory = new Map<string, number>()

  for (const tx of transactions) {
    if (!tx.categoryId) continue
    const converted = convertCurrency(
      tx.amount,
      tx.currency as Currency,
      defaultCurrency,
      usdRate,
      eurRate
    )
    spentByCategory.set(
      tx.categoryId,
      (spentByCategory.get(tx.categoryId) ?? 0) + converted
    )
  }

  return spentByCategory
}

/**
 * Compute the spend status of each category against its soft limit.
 * - limit null → level 'ok', ratio null
 * - ratio ≥ 0.8 → 'warning'; ratio > 1.0 → 'over' (exactly 100% is 'warning')
 */
export function getCategorySpendStatus(
  spentByCategory: Map<string, number>,
  categories: CategoryLimitInfo[]
): CategorySpendStatus[] {
  return categories.map((category) => {
    const spent = spentByCategory.get(category.id) ?? 0
    const limit = category.monthlyLimit

    if (limit === null || limit <= 0) {
      return { categoryId: category.id, spent, limit: null, ratio: null, level: 'ok' as const }
    }

    const ratio = spent / limit
    const level: CategorySpendStatus['level'] =
      ratio > 1 ? 'over' : ratio >= WARNING_THRESHOLD ? 'warning' : 'ok'

    return { categoryId: category.id, spent, limit, ratio, level }
  })
}
