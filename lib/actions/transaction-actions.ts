'use server'

/**
 * Server Actions for Transactions (Phase 1 — unified ledger)
 * BUSINESS LOGIC LAYER
 * - Quick-add for variable expenses (10-second flow)
 * - Ledger queries with filters and pagination
 * - Category soft-limit status returned with every quick-add
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import type { CategorySpendStatus } from '@/lib/services/category-spend'
import { notifyCategoryLimitThreshold } from '@/lib/services/notification-service'
import { computeSingleCategoryStatus } from '@/lib/services/spend-status-service'
import type {
  QuickAddExpenseInput,
  SerializedTransaction,
  TransactionFilters,
  TransactionListItem,
  TransactionPage,
  UpdateTransactionInput,
} from '@/types/transaction-types'

export interface TransactionActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const SUPPORTED_CURRENCIES = ['GEL', 'USD', 'EUR']

function serializeTransaction(transaction: {
  amount: unknown
  [key: string]: unknown
}): SerializedTransaction {
  return {
    ...transaction,
    amount: Number(transaction.amount),
  } as SerializedTransaction
}

export interface QuickAddResult {
  transaction: SerializedTransaction
  categoryStatus: (CategorySpendStatus & { categoryName: string }) | null
  defaultCurrency: string
}

/**
 * Quick-add a variable expense: amount + category (+ optional description/date).
 * Returns the updated category spend status so the UI can warn immediately.
 */
export async function quickAddExpense(
  input: QuickAddExpenseInput
): Promise<TransactionActionResult<QuickAddResult>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }

    const currency = input.currency || 'GEL'
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return { success: false, error: 'Unsupported currency' }
    }

    // SECURITY: category must belong to the user
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId },
    })
    if (!category) {
      return { success: false, error: 'Category not found or access denied' }
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

    // Fresh status for this category so the UI can show the warning in the toast
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

    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: {
        transaction: serializeTransaction(transaction),
        categoryStatus: status
          ? { ...status, categoryName: category.categoryName }
          : null,
        defaultCurrency: context.defaultCurrency,
      },
    }
  } catch (error) {
    console.error('Error in quickAddExpense:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add expense',
    }
  }
}

/**
 * Get transactions with filters (type/category/period) and pagination.
 */
export async function getTransactions(
  filters: TransactionFilters = {}
): Promise<TransactionActionResult<TransactionPage>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

    const where = {
      userId,
      ...(filters.type && { type: filters.type }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...((filters.from || filters.to) && {
        date: {
          ...(filters.from && { gte: filters.from }),
          ...(filters.to && { lte: filters.to }),
        },
      }),
    }

    const [transactions, totalCount] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        include: {
          category: { select: { categoryName: true, color: true } },
          incomeSource: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ])

    const items: TransactionListItem[] = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      categoryId: t.categoryId,
      categoryName: t.category?.categoryName ?? null,
      categoryColor: t.category?.color ?? null,
      incomeSourceId: t.incomeSourceId,
      incomeSourceName: t.incomeSource?.name ?? null,
      expenseId: t.expenseId,
      description: t.description,
      entrySource: t.entrySource,
    }))

    return { success: true, data: { items, totalCount, page, pageSize } }
  } catch (error) {
    console.error('Error in getTransactions:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transactions',
    }
  }
}

/**
 * Update a transaction (amount, date, category, description).
 */
export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): Promise<TransactionActionResult<SerializedTransaction>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    // SECURITY: verify ownership
    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
    })
    if (!existing) {
      return { success: false, error: 'Transaction not found or access denied' }
    }

    if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
      return { success: false, error: 'Amount must be greater than zero' }
    }

    if (input.currency !== undefined && !SUPPORTED_CURRENCIES.includes(input.currency)) {
      return { success: false, error: 'Unsupported currency' }
    }

    if (input.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
      })
      if (!category) {
        return { success: false, error: 'Category not found or access denied' }
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        amount: input.amount,
        currency: input.currency,
        date: input.date,
        categoryId: input.categoryId,
        description: input.description,
      },
    })

    revalidatePath('/expenses')
    revalidatePath('/dashboard')
    revalidatePath('/income')

    return { success: true, data: serializeTransaction(transaction) }
  } catch (error) {
    console.error('Error in updateTransaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update transaction',
    }
  }
}

/**
 * Delete a transaction.
 */
export async function deleteTransaction(
  id: string
): Promise<TransactionActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    // SECURITY: verify ownership
    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
    })
    if (!existing) {
      return { success: false, error: 'Transaction not found or access denied' }
    }

    await prisma.transaction.delete({ where: { id } })

    revalidatePath('/expenses')
    revalidatePath('/dashboard')
    revalidatePath('/income')

    return { success: true }
  } catch (error) {
    console.error('Error in deleteTransaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete transaction',
    }
  }
}
