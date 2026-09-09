'use server'

/**
 * Server Actions for Transactions (Phase 1 — unified ledger)
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * - Quick-add for variable expenses (10-second flow) → lib/services/quick-add
 * - Ledger queries with filters and pagination
 * - Update/delete → lib/services/transaction-service (shared with MCP tools)
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { toActionResult } from '@/lib/services/outcome'
import { addExpenseTransaction, type QuickAddResult } from '@/lib/services/quick-add'
import {
  deleteTransactionForUser,
  updateTransactionForUser,
} from '@/lib/services/transaction-service'
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

    const result = await addExpenseTransaction(session.user.id, input)
    if (!result.ok) {
      return { success: false, error: result.error }
    }

    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return { success: true, data: result.data }
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

function revalidateLedgerPages(): void {
  revalidatePath('/expenses')
  revalidatePath('/dashboard')
  revalidatePath('/income')
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

    const outcome = await updateTransactionForUser(session.user.id, id, input)
    if (outcome.ok) revalidateLedgerPages()
    return toActionResult(outcome)
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

    const outcome = await deleteTransactionForUser(session.user.id, id)
    if (outcome.ok) revalidateLedgerPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in deleteTransaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete transaction',
    }
  }
}
