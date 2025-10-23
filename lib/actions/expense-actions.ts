'use server'

/**
 * Server Actions for Expenses
 * BUSINESS LOGIC LAYER
 * - Handle business rules and data operations
 * - Transform data for UI consumption
 * - Calculate derived values (stats, status flags)
 * - Call Data Access Layer (lib/db/expense-queries.ts)
 */

import { cache } from 'react'
import {
  findExpensesByUserId,
  findExpensesWithFilters,
  findExpenseById,
  findExpensesByDateRange,
  findOverdueExpenses,
  findExpenseCategories,
} from '@/lib/db/expense-queries'
import { isOverdue } from '@/lib/utils/date-helpers'
import type {
  DashboardData,
  ExpenseListItem,
  ExpenseFilters,
  ExpenseWithPayments,
} from '@/types/expense-types'

/**
 * Get dashboard data for a user
 * Business logic: Calculate stats, add status flags, limit to 10 recent
 */
export const getDashboardData = cache(
  async (userId: string): Promise<DashboardData> => {
    try {
      // Call data access layer - Prisma returns Date objects directly
      const expenses = await findExpensesByUserId(userId, {
        limit: 10,
      })

      // Business logic: Transform to view models with computed fields
      const expenseItems: ExpenseListItem[] = expenses.map((expense) => {
        const latestPayment = expense.payments[0]
        const isPaid = latestPayment?.paid ?? false
        const nextDueDate = expense.nextDueDate
        const overdueStatus = isOverdue(nextDueDate)

        return {
          id: expense.id,
          title: expense.title,
          amount: Number(expense.amount),
          currency: expense.currency,
          category: expense.category,
          nextDueDate,
          isOverdue: !isPaid && overdueStatus,
          isPaid,
          isRecurring: expense.isRecurring,
        }
      })

      // Business logic: Calculate aggregated stats
      const stats = expenseItems.reduce(
        (acc, expense) => {
          const amount = expense.amount
          acc.total += amount

          if (expense.isPaid) {
            acc.paid += amount
          } else if (expense.isOverdue) {
            acc.overdue += amount
          } else {
            acc.pending += amount
          }

          return acc
        },
        { total: 0, paid: 0, pending: 0, overdue: 0 }
      )

      return {
        expenses: expenseItems,
        stats,
      }
    } catch (error) {
      console.error('Error in getDashboardData:', error)
      // Business logic: Return safe fallback
      return {
        expenses: [],
        stats: { total: 0, paid: 0, pending: 0, overdue: 0 },
      }
    }
  }
)

/**
 * Get all expenses for a user with optional filters
 */
export const getUserExpenses = cache(
  async (
    userId: string,
    filters?: ExpenseFilters
  ): Promise<ExpenseWithPayments[]> => {
    try {
      const expenses = await findExpensesWithFilters(userId, filters)
      return expenses
    } catch (error) {
      console.error('Error in getUserExpenses:', error)
      return []
    }
  }
)

/**
 * Get a single expense by ID
 */
export const getExpenseById = cache(
  async (expenseId: string): Promise<ExpenseWithPayments | null> => {
    try {
      const expense = await findExpenseById(expenseId)
      return expense
    } catch (error) {
      console.error('Error in getExpenseById:', error)
      return null
    }
  }
)

/**
 * Get upcoming payments for a user (due within next N days)
 * Business logic: Calculate date range, filter unpaid
 */
export const getUpcomingPayments = cache(
  async (userId: string, daysAhead: number = 7) => {
    try {
      // Business logic: Calculate date range
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const futureDate = new Date(today)
      futureDate.setDate(futureDate.getDate() + daysAhead)

      // Call data access layer
      const expenses = await findExpensesByDateRange(userId, today, futureDate)

      return expenses
    } catch (error) {
      console.error('Error in getUpcomingPayments:', error)
      return []
    }
  }
)

/**
 * Get overdue expenses for a user
 * Business logic: Filter out paid expenses
 */
export const getOverdueExpenses = cache(async (userId: string) => {
  try {
    // Business logic: Calculate today's date
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Call data access layer
    const expenses = await findOverdueExpenses(userId, today)

    // Business logic: Filter out paid expenses
    const overdueExpenses = expenses.filter(
      (expense) => !expense.payments[0]?.paid
    )

    return overdueExpenses
  } catch (error) {
    console.error('Error in getOverdueExpenses:', error)
    return []
  }
})

/**
 * Get expense categories for a user (for filter dropdown)
 * Business logic: Extract and sort unique categories
 */
export const getExpenseCategories = cache(
  async (userId: string): Promise<string[]> => {
    try {
      // Call data access layer - Prisma returns array of {category: string} objects
      const categoryObjects = await findExpenseCategories(userId)

      // Business logic: Extract category strings and sort
      const categories = categoryObjects
        .map((item) => item.category)
        .filter((c): c is string => c !== null)
        .sort()

      return categories
    } catch (error) {
      console.error('Error in getExpenseCategories:', error)
      return []
    }
  }
)

/**
 * Create a new expense (placeholder for Phase 3)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createExpense(_data: unknown) {
  // TODO: Add Zod validation
  // TODO: Call Prisma create
  // TODO: Revalidate cache
  throw new Error('Not implemented yet - Phase 3')
}

/**
 * Update an existing expense (placeholder for Phase 3)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function updateExpense(_id: string, _data: unknown) {
  // TODO: Add Zod validation
  // TODO: Call Prisma update
  // TODO: Revalidate cache
  throw new Error('Not implemented yet - Phase 3')
}

/**
 * Delete an expense (placeholder for Phase 3)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteExpense(_id: string) {
  // TODO: Call Prisma delete
  // TODO: Revalidate cache
  throw new Error('Not implemented yet - Phase 3')
}
