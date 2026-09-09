/**
 * Data adapters for the MCP server — thin, userId-first, JSON-safe.
 * Every function takes the userId resolved from the access token (never from
 * tool input) and returns numbers instead of Prisma Decimals. Money math is
 * never re-implemented here: the view models come from the same builders the
 * app's Server Actions use (plan-view, debt-overview, goal-overview, …).
 */

import prisma from '@/lib/db/prisma'
import { createExpense } from '@/lib/actions/expense-actions'
import { buildDashboardData, buildPlanView } from '@/lib/services/plan-view'
import { buildDebtsOverview } from '@/lib/services/debt-overview'
import { buildGoalsOverview } from '@/lib/services/goal-overview'
import { addExpenseTransaction, type QuickAddResult } from '@/lib/services/quick-add'
import { toMonthKey } from '@/lib/services/plan-input'
import { isOverdue } from '@/lib/utils/date-helpers'
import type { DashboardData, PlanView } from '@/types/plan-types'
import type { DebtsOverview } from '@/types/debt-types'
import type { GoalsOverview } from '@/types/goal-types'
import type { TransactionType } from '@/types/transaction-types'

export const MCP_MAX_LIST = 200
export const MCP_DEFAULT_LIST = 50

// --- reads -------------------------------------------------------------------

export function mcpGetDashboard(userId: string, now: Date = new Date()): Promise<DashboardData> {
  return buildDashboardData(userId, now)
}

/**
 * The plan for `month` (YYYY-MM, default: current). Read-only: unlike the app,
 * a missing plan is reported as null instead of being generated on the fly.
 */
export async function mcpGetMonthlyPlan(
  userId: string,
  month?: string,
  now: Date = new Date()
): Promise<{ month: string; plan: PlanView | null }> {
  const targetMonth = month ?? toMonthKey(now)
  const plan = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month: targetMonth } },
    select: { id: true },
  })
  if (!plan) return { month: targetMonth, plan: null }
  return { month: targetMonth, plan: await buildPlanView(userId, plan.id, now) }
}

export interface McpExpenseItem {
  id: string
  title: string
  amount: number
  currency: string
  category: string | null
  description: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  nextDueDate: string | null
  isPaid: boolean
  isOverdue: boolean
}

/** Fixed/recurring bills (Expense) ordered by next due date. */
export async function mcpListExpenses(
  userId: string,
  opts: { limit?: number } = {}
): Promise<McpExpenseItem[]> {
  const take = clampLimit(opts.limit)
  const rows = await prisma.expense.findMany({
    where: { userId },
    orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'desc' }],
    take,
    include: { payments: { orderBy: { dueDate: 'desc' }, take: 1 } },
  })
  return rows.map((e) => {
    const isPaid = e.payments[0]?.paid ?? false
    return {
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      currency: e.currency,
      category: e.category,
      description: e.description,
      isRecurring: e.isRecurring,
      recurrenceRule: e.recurrenceRule,
      nextDueDate: e.nextDueDate?.toISOString() ?? null,
      isPaid,
      isOverdue: !isPaid && isOverdue(e.nextDueDate),
    }
  })
}

export interface McpTransactionFilters {
  type?: TransactionType
  categoryId?: string
  from?: Date
  to?: Date
  limit?: number
}

export interface McpTransactionItem {
  id: string
  type: TransactionType
  amount: number
  currency: string
  date: string
  categoryId: string | null
  categoryName: string | null
  incomeSourceName: string | null
  description: string | null
  entrySource: string
}

/** Ledger rows (newest first) with optional type / category / period filters. */
export async function mcpListTransactions(
  userId: string,
  filters: McpTransactionFilters = {}
): Promise<{ items: McpTransactionItem[]; totalCount: number }> {
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
  const [rows, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: { select: { categoryName: true } },
        incomeSource: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: clampLimit(filters.limit),
    }),
    prisma.transaction.count({ where }),
  ])
  return {
    totalCount,
    items: rows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date.toISOString(),
      categoryId: t.categoryId,
      categoryName: t.category?.categoryName ?? null,
      incomeSourceName: t.incomeSource?.name ?? null,
      description: t.description,
      entrySource: t.entrySource,
    })),
  }
}

export interface McpCategoryItem {
  id: string
  name: string
  kind: string
  monthlyLimit: number | null
  color: string
}

export async function mcpListCategories(userId: string): Promise<McpCategoryItem[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: { categoryName: 'asc' },
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.categoryName,
    kind: c.kind,
    monthlyLimit: c.monthlyLimit === null ? null : Number(c.monthlyLimit),
    color: c.color,
  }))
}

export function mcpListDebts(userId: string, now: Date = new Date()): Promise<DebtsOverview> {
  return buildDebtsOverview(userId, now)
}

export function mcpListGoals(userId: string, now: Date = new Date()): Promise<GoalsOverview> {
  return buildGoalsOverview(userId, now)
}

// --- writes ------------------------------------------------------------------

export interface McpCreateExpenseInput {
  title: string
  amount: number
  currency: string
  category?: string
  description?: string
  nextDueDate?: Date
  isRecurring?: boolean
  recurrenceRule?: string
}

export type McpWriteOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

/** Create a fixed bill through the app's createExpense (initial Payment + overdue notice included). */
export async function mcpCreateExpense(
  userId: string,
  input: McpCreateExpenseInput
): Promise<McpWriteOutcome<{ id: string; title: string; amount: number; currency: string; nextDueDate: string | null }>> {
  const result = await createExpense({
    userId,
    title: input.title,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    description: input.description,
    nextDueDate: input.nextDueDate,
    isRecurring: input.isRecurring ?? false,
    recurrenceRule: input.recurrenceRule,
    startDate: input.nextDueDate,
  })
  if (!result.success || !result.data) {
    return { ok: false, error: result.error ?? 'Failed to create expense' }
  }
  const e = result.data
  return {
    ok: true,
    data: {
      id: e.id,
      title: e.title,
      amount: e.amount,
      currency: e.currency,
      nextDueDate: e.nextDueDate ? new Date(e.nextDueDate).toISOString() : null,
    },
  }
}

export interface McpAddTransactionInput {
  amount: number
  currency?: string
  /** Either the category id or its (case-insensitive) name; the category must belong to the user. */
  categoryId?: string
  categoryName?: string
  description?: string
  date?: Date
}

/** Quick-add a variable expense into the ledger (same path as the app's Quick Add). */
export async function mcpAddTransaction(
  userId: string,
  input: McpAddTransactionInput
): Promise<McpWriteOutcome<QuickAddResult>> {
  let categoryId = input.categoryId
  if (!categoryId) {
    if (!input.categoryName?.trim()) {
      return { ok: false, error: 'Provide categoryId or categoryName' }
    }
    const category = await prisma.category.findFirst({
      where: { userId, categoryName: { equals: input.categoryName.trim(), mode: 'insensitive' } },
      select: { id: true },
    })
    if (!category) return { ok: false, error: `Category "${input.categoryName}" not found` }
    categoryId = category.id
  }

  const outcome = await addExpenseTransaction(userId, {
    amount: input.amount,
    categoryId,
    currency: input.currency,
    description: input.description,
    date: input.date,
  })
  return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, error: outcome.error }
}

// --- helpers -----------------------------------------------------------------

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return MCP_DEFAULT_LIST
  return Math.min(MCP_MAX_LIST, Math.max(1, Math.floor(limit)))
}
