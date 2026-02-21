/**
 * Database queries for expenses
 * DATA ACCESS LAYER - Pure database operations only
 * No business logic, no data transformation
 * Called by Server Actions in lib/actions/
 */

import { prisma } from '../client'
import type { ExpenseWithRelationsData } from '@extracker/types'

/**
 * Find expenses by user ID with payment relations
 */
export async function findExpensesByUserId(
  userId: string,
  options?: {
    limit?: number
    orderBy?: 'asc' | 'desc'
  }
): Promise<ExpenseWithRelationsData[]> {
  return await prisma.expense.findMany({
    where: {
      userId,
    },
    include: {
      payments: {
        orderBy: {
          dueDate: 'desc',
        },
        take: 1,
      },
      paymentCard: true,
    },
    orderBy: {
      nextDueDate: options?.orderBy || 'asc',
    },
    take: options?.limit,
  })
}

/**
 * Find all expenses for a user with optional filters
 */
export async function findExpensesWithFilters(
  userId: string,
  filters?: {
    category?: string
    isRecurring?: boolean
    startDate?: Date
    endDate?: Date
  }
): Promise<ExpenseWithRelationsData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { userId }

  if (filters?.category) {
    where.category = filters.category
  }
  if (filters?.isRecurring !== undefined) {
    where.isRecurring = filters.isRecurring
  }
  if (filters?.startDate || filters?.endDate) {
    where.nextDueDate = {}
    if (filters.startDate) {
      where.nextDueDate.gte = filters.startDate
    }
    if (filters.endDate) {
      where.nextDueDate.lte = filters.endDate
    }
  }

  return await prisma.expense.findMany({
    where,
    include: {
      payments: {
        orderBy: {
          dueDate: 'desc',
        },
      },
      paymentCard: true,
    },
    orderBy: {
      nextDueDate: 'asc',
    },
  })
}

/**
 * Find a single expense by ID
 */
export async function findExpenseById(expenseId: string): Promise<ExpenseWithRelationsData | null> {
  return await prisma.expense.findUnique({
    where: {
      id: expenseId,
    },
    include: {
      payments: {
        orderBy: {
          dueDate: 'desc',
        },
      },
      paymentCard: true,
    },
  })
}

/**
 * Find expenses with upcoming due dates
 */
export async function findExpensesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ExpenseWithRelationsData[]> {
  return await prisma.expense.findMany({
    where: {
      userId,
      nextDueDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      payments: {
        where: {
          dueDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          dueDate: 'asc',
        },
      },
      paymentCard: true,
    },
    orderBy: {
      nextDueDate: 'asc',
    },
  })
}

/**
 * Find overdue expenses (before today)
 */
export async function findOverdueExpenses(userId: string, beforeDate: Date): Promise<ExpenseWithRelationsData[]> {
  return await prisma.expense.findMany({
    where: {
      userId,
      nextDueDate: {
        lt: beforeDate,
      },
    },
    include: {
      payments: {
        orderBy: {
          dueDate: 'desc',
        },
        take: 1,
      },
      paymentCard: true,
    },
    orderBy: {
      nextDueDate: 'asc',
    },
  })
}

/**
 * Find unique expense categories for a user
 */
export async function findExpenseCategories(userId: string) {
  return await prisma.expense.findMany({
    where: {
      userId,
      category: {
        not: null,
      },
    },
    select: {
      category: true,
    },
    distinct: ['category'],
  })
}
