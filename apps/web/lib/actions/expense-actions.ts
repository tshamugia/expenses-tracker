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
  ActionResult,
  DashboardData,
  ExpenseListItem,
  ExpenseFilters,
  ExpenseWithPayments,
  SerializedExpenseWithPayments,
  CategoryData,
} from '@extracker/types'

/**
 * Get dashboard data for a user
 * Business logic: Calculate stats, add status flags, get upcoming expenses, and category breakdown
 */
export const getDashboardData = cache(
  async (userId: string): Promise<DashboardData> => {
    try {
      // Call data access layer - get all expenses for full analytics
      const allExpenses = await findExpensesByUserId(userId)

      // Business logic: Transform to view models with computed fields
      const expenseItems: ExpenseListItem[] = allExpenses.map((expense) => {
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
          paymentCard: expense.paymentCard
            ? {
                id: expense.paymentCard.id,
                nickname: expense.paymentCard.nickname,
                lastFourDigits: expense.paymentCard.lastFourDigits,
                cardBrand: expense.paymentCard.cardBrand,
                color: expense.paymentCard.color,
              }
            : null,
        }
      })

      // Business logic: Calculate aggregated stats with count
      const stats = expenseItems.reduce(
        (acc, expense) => {
          const amount = expense.amount
          acc.total += amount
          acc.count += 1

          if (expense.isPaid) {
            acc.paid += amount
          } else if (expense.isOverdue) {
            acc.overdue += amount
          } else {
            acc.pending += amount
          }

          return acc
        },
        { total: 0, paid: 0, pending: 0, overdue: 0, count: 0 }
      )

      // Business logic: Filter upcoming expenses (not paid, not overdue, has due date within next 30 days)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const thirtyDaysFromNow = new Date(today)
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const upcomingExpenses = expenseItems
        .filter((expense) => {
          if (expense.isPaid || expense.isOverdue || !expense.nextDueDate) return false
          const dueDate = new Date(expense.nextDueDate)
          return dueDate >= today && dueDate <= thirtyDaysFromNow
        })
        .sort((a, b) => {
          const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : 0
          const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : 0
          return dateA - dateB
        })
        .slice(0, 5) // Limit to 5 upcoming expenses

      // Business logic: Calculate category breakdown
      const categoryMap = new Map<string, { amount: number; count: number }>()

      expenseItems.forEach((expense) => {
        const category = expense.category || 'Uncategorized'
        const existing = categoryMap.get(category) || { amount: 0, count: 0 }
        categoryMap.set(category, {
          amount: existing.amount + expense.amount,
          count: existing.count + 1,
        })
      })

      const categoryData: CategoryData[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          amount: data.amount,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount)

      return {
        expenses: expenseItems.slice(0, 10), // Recent 10 for display
        stats,
        upcomingExpenses,
        categoryData,
      }
    } catch (error) {
      console.error('Error in getDashboardData:', error)
      // Business logic: Return safe fallback
      return {
        expenses: [],
        stats: { total: 0, paid: 0, pending: 0, overdue: 0, count: 0 },
        upcomingExpenses: [],
        categoryData: [],
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

// CRUD Operations with Prisma
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db/prisma'
import { notifyPastOrOverdueExpense } from '@/lib/services/notification-service'

/**
 * Create a new expense
 * Business logic: Validate input, create expense and initial payment
 */

export interface CreateExpenseInput {
  userId: string
  title: string
  amount: number
  currency?: string
  description?: string
  category?: string
  paymentCardId?: string
  isRecurring?: boolean
  recurrenceRule?: string
  startDate?: Date
  nextDueDate?: Date
}

export interface UpdateExpenseInput {
  title?: string
  amount?: number
  currency?: string
  description?: string
  category?: string
  paymentCardId?: string
  isRecurring?: boolean
  recurrenceRule?: string
  startDate?: Date
  nextDueDate?: Date
}


export async function createExpense(
  input: CreateExpenseInput
): Promise<ActionResult<SerializedExpenseWithPayments>> {
  try {
    // Business logic: Create expense with Prisma
    const expense = await prisma.expense.create({
      data: {
        userId: input.userId,
        title: input.title,
        amount: input.amount,
        currency: input.currency || 'USD',
        description: input.description,
        category: input.category,
        paymentCardId: input.paymentCardId || null,
        isRecurring: input.isRecurring || false,
        recurrenceRule: input.recurrenceRule,
        startDate: input.startDate,
        nextDueDate: input.nextDueDate,
      },
    })

    // Business logic: Create initial payment if nextDueDate is provided
    let paymentId: string | undefined
    if (input.nextDueDate) {
      const payment = await prisma.payment.create({
        data: {
          expenseId: expense.id,
          dueDate: input.nextDueDate,
          amount: input.amount,
          paid: false,
        },
      })
      paymentId = payment.id

      // Check if the expense is past due or due today and send immediate notification
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const dueDate = new Date(input.nextDueDate)
      dueDate.setHours(0, 0, 0, 0)

      if (dueDate <= now) {
        // Expense is overdue or due today - send instant notification
        await notifyPastOrOverdueExpense(
          input.userId,
          input.title,
          input.nextDueDate,
          input.amount,
          input.currency || 'USD',
          payment.id,
          expense.id
        )
      }
    }

    // Fetch expense with payments after creating payment
    const expenseWithPayments = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        payments: {
          orderBy: {
            dueDate: 'desc',
          },
        },
      },
    })

    // Revalidate pages to show new data
    revalidatePath('/expenses')
    revalidatePath('/dashboard')
    revalidatePath('/notifications') // Revalidate notifications page to show new notification

    // Serialize for client
    const serialized: SerializedExpenseWithPayments = {
      ...expenseWithPayments!,
      amount: Number(expenseWithPayments!.amount),
      payments: expenseWithPayments!.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    }

    return { success: true, data: serialized }
  } catch (error) {
    console.error('Error creating expense:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create expense',
    }
  }
}

/**
 * Update an existing expense
 * Business logic: Validate ownership, update expense data
 */
export async function updateExpense(
  id: string,
  userId: string,
  input: UpdateExpenseInput
): Promise<ActionResult<SerializedExpenseWithPayments>> {
  try {
    // SECURITY: Verify expense belongs to user before updating
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        userId: userId, // Ensure user owns this expense
      },
    })

    if (!existingExpense) {
      return {
        success: false,
        error: 'Expense not found or access denied',
      }
    }

    // Business logic: Update expense with Prisma
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        category: input.category,
        paymentCardId: input.paymentCardId || null,
        isRecurring: input.isRecurring,
        recurrenceRule: input.recurrenceRule,
        startDate: input.startDate,
        nextDueDate: input.nextDueDate,
      },
      include: {
        payments: true,
      },
    })

    // Revalidate pages
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    // Serialize for client
    const serialized: SerializedExpenseWithPayments = {
      ...expense,
      amount: Number(expense.amount),
      payments: expense.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    }

    return { success: true, data: serialized }
  } catch (error) {
    console.error('Error updating expense:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update expense',
    }
  }
}

/**
 * Delete an expense
 * Business logic: Validate ownership, cascade delete payments
 */
export async function deleteExpense(
  id: string,
  userId: string
): Promise<ActionResult<void>> {
  try {
    // SECURITY: Verify expense belongs to user before deleting
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        userId: userId, // Ensure user owns this expense
      },
    })

    if (!existingExpense) {
      return {
        success: false,
        error: 'Expense not found or access denied',
      }
    }

    // Business logic: Delete expense with Prisma (cascade deletes payments)
    await prisma.expense.delete({
      where: { id },
    })

    // Revalidate pages
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error deleting expense:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete expense',
    }
  }
}

/**
 * Mark an expense payment as paid
 * Business logic: Find latest unpaid payment and mark it as paid
 */
export async function markExpensePaid(
  expenseId: string,
  userId: string
): Promise<ActionResult<SerializedExpenseWithPayments>> {
  try {
    // SECURITY: Verify expense belongs to user
    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        userId: userId, // Ensure user owns this expense
      },
    })

    if (!expense) {
      return {
        success: false,
        error: 'Expense not found or access denied',
      }
    }

    // Business logic: Find the latest unpaid payment
    const payment = await prisma.payment.findFirst({
      where: {
        expenseId,
        paid: false,
      },
      orderBy: {
        dueDate: 'asc',
      },
    })

    if (!payment) {
      return {
        success: false,
        error: 'No unpaid payment found',
      }
    }

    // Mark payment as paid
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        paid: true,
        paidAt: new Date(),
      },
    })

    // Fetch updated expense
    const expenseWithPayments = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        payments: true,
      },
    })

    // Revalidate pages
    revalidatePath('/expenses')
    revalidatePath('/dashboard')

    // Serialize for client
    const serialized: SerializedExpenseWithPayments = {
      ...expenseWithPayments!,
      amount: Number(expenseWithPayments!.amount),
      payments: expenseWithPayments!.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    }

    return { success: true, data: serialized }
  } catch (error) {
    console.error('Error marking expense as paid:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark expense as paid',
    }
  }
}

/**
 * Get all expenses for a user (for the expenses page)
 * Business logic: Fetch with payments, transform to ExpenseWithPayments[]
 */
export async function getExpenses(
  userId: string
): Promise<ActionResult<SerializedExpenseWithPayments[]>> {
  try {
    const expenses = await prisma.expense.findMany({
      where: { userId },
      include: {
        payments: {
          orderBy: {
            dueDate: 'desc',
          },
        },
        paymentCard: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Convert Decimal to number for client components
    const serializedExpenses: SerializedExpenseWithPayments[] = expenses.map((expense) => ({
      ...expense,
      amount: Number(expense.amount),
      payments: expense.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    }))

    return { success: true, data: serializedExpenses }
  } catch (error) {
    console.error('Error fetching expenses:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch expenses',
    }
  }
}
