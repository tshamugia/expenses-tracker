/**
 * Quick-add of a variable expense into the unified ledger (Phase 1 §6.2).
 * BUSINESS LOGIC — userId-first, no session, no revalidation; shared by the
 * quickAddExpense Server Action and the MCP `add_transaction` tool.
 */

import prisma from '@/lib/db/prisma'
import type { CategorySpendStatus } from '@/lib/services/category-spend'
import { notifyCategoryLimitThreshold } from '@/lib/services/notification-service'
import { computeSingleCategoryStatus } from '@/lib/services/spend-status-service'
import type { QuickAddExpenseInput, SerializedTransaction } from '@/types/transaction-types'

export const SUPPORTED_CURRENCIES = ['GEL', 'USD', 'EUR'] as const

export interface QuickAddResult {
  transaction: SerializedTransaction
  categoryStatus: (CategorySpendStatus & { categoryName: string }) | null
  defaultCurrency: string
}

export type QuickAddOutcome =
  | { ok: true; data: QuickAddResult }
  | { ok: false; error: string }

function serializeTransaction(transaction: {
  amount: unknown
  [key: string]: unknown
}): SerializedTransaction {
  return {
    ...transaction,
    amount: Number(transaction.amount),
  } as SerializedTransaction
}

/**
 * Validate, write the EXPENSE transaction and refresh the category's
 * soft-limit status (80%/100% notifications are deduped inside the service).
 * The category must belong to `userId` — a foreign id is rejected.
 */
export async function addExpenseTransaction(
  userId: string,
  input: QuickAddExpenseInput
): Promise<QuickAddOutcome> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero' }
  }

  const currency = input.currency || 'GEL'
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return { ok: false, error: 'Unsupported currency' }
  }

  // SECURITY: category must belong to the user
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, userId },
  })
  if (!category) {
    return { ok: false, error: 'Category not found or access denied' }
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: 'EXPENSE',
      amount: input.amount,
      currency,
      date: input.date ?? new Date(),
      categoryId: category.id,
      description: input.description?.trim() || null,
      entrySource: 'MANUAL',
    },
  })

  // Fresh status for this category so the caller can show the warning at once
  const { status, context } = await computeSingleCategoryStatus(userId, category.id)

  // 80%/100% warning — deduped per month inside the service; never blocks the write
  if (status && status.limit !== null && status.ratio !== null) {
    await notifyCategoryLimitThreshold(
      userId,
      { id: category.id, name: category.categoryName },
      { spent: status.spent, limit: status.limit, ratio: status.ratio },
      context.defaultCurrency
    )
  }

  return {
    ok: true,
    data: {
      transaction: serializeTransaction(transaction),
      categoryStatus: status ? { ...status, categoryName: category.categoryName } : null,
      defaultCurrency: context.defaultCurrency,
    },
  }
}
