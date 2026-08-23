'use server'

/**
 * Server Actions for Income (Phase 1)
 * BUSINESS LOGIC LAYER
 * - Income source CRUD (stable salary / variable projects)
 * - Recording income facts into the unified Transaction ledger
 * - Conservative next-month forecast (PRD R2) for the /income page
 */

import { revalidatePath } from 'next/cache'
import { endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { forecastNextMonthIncome } from '@/lib/services/income-forecast'
import {
  getCurrencyContext,
  type CurrencyContext,
} from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type {
  CreateIncomeSourceInput,
  IncomeOverview,
  RecordIncomeInput,
  SerializedIncomeSource,
  UpdateIncomeSourceInput,
} from '@/types/income-types'
import type { SerializedTransaction, TransactionListItem } from '@/types/transaction-types'

export interface IncomeActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const SUPPORTED_CURRENCIES = ['GEL', 'USD', 'EUR']
const FORECAST_HISTORY_MONTHS = 6

function serializeSource(source: {
  expectedAmount: unknown
  [key: string]: unknown
}): SerializedIncomeSource {
  return {
    ...source,
    expectedAmount:
      source.expectedAmount === null ? null : Number(source.expectedAmount),
  } as SerializedIncomeSource
}

function validateSourceInput(input: {
  name?: string
  type?: 'STABLE' | 'VARIABLE'
  expectedAmount?: number | null
  currency?: string
  expectedDay?: number | null
}): string | null {
  if (input.name !== undefined && !input.name.trim()) {
    return 'Source name is required'
  }
  if (input.currency !== undefined && !SUPPORTED_CURRENCIES.includes(input.currency)) {
    return 'Unsupported currency'
  }
  if (
    input.expectedAmount !== undefined &&
    input.expectedAmount !== null &&
    (!Number.isFinite(input.expectedAmount) || input.expectedAmount <= 0)
  ) {
    return 'Expected amount must be greater than zero'
  }
  if (
    input.expectedDay !== undefined &&
    input.expectedDay !== null &&
    (!Number.isInteger(input.expectedDay) || input.expectedDay < 1 || input.expectedDay > 31)
  ) {
    return 'Expected day must be between 1 and 31'
  }
  return null
}

/**
 * Create an income source. STABLE sources require an expected amount.
 */
export async function createIncomeSource(
  input: CreateIncomeSourceInput
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const validationError = validateSourceInput(input)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (input.type === 'STABLE' && !input.expectedAmount) {
      return { success: false, error: 'Stable sources require an expected amount' }
    }

    const source = await prisma.incomeSource.create({
      data: {
        userId: session.user.id,
        name: input.name.trim(),
        type: input.type,
        expectedAmount: input.expectedAmount ?? null,
        currency: input.currency || 'GEL',
        expectedDay: input.expectedDay ?? null,
      },
    })

    revalidatePath('/income')

    return { success: true, data: serializeSource(source) }
  } catch (error) {
    console.error('Error in createIncomeSource:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create income source',
    }
  }
}

/**
 * Update an income source (name, type, expected amount/day, active flag).
 */
export async function updateIncomeSource(
  id: string,
  input: UpdateIncomeSourceInput
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    // SECURITY: verify ownership
    const existing = await prisma.incomeSource.findFirst({ where: { id, userId } })
    if (!existing) {
      return { success: false, error: 'Income source not found or access denied' }
    }

    const validationError = validateSourceInput(input)
    if (validationError) {
      return { success: false, error: validationError }
    }

    // STABLE sources must end up with an expected amount after the update
    const nextType = input.type ?? existing.type
    const nextExpected =
      input.expectedAmount !== undefined ? input.expectedAmount : existing.expectedAmount
    if (nextType === 'STABLE' && !nextExpected) {
      return { success: false, error: 'Stable sources require an expected amount' }
    }

    const source = await prisma.incomeSource.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        type: input.type,
        expectedAmount: input.expectedAmount,
        currency: input.currency,
        expectedDay: input.expectedDay,
        isActive: input.isActive,
      },
    })

    revalidatePath('/income')

    return { success: true, data: serializeSource(source) }
  } catch (error) {
    console.error('Error in updateIncomeSource:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update income source',
    }
  }
}

/**
 * Archive an income source (soft delete — history stays in the ledger).
 */
export async function archiveIncomeSource(
  id: string
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  return updateIncomeSource(id, { isActive: false })
}

/**
 * Record an income fact into the ledger. Returns the updated month total.
 */
export async function recordIncome(
  input: RecordIncomeInput
): Promise<IncomeActionResult<{ transaction: SerializedTransaction; monthTotal: number }>> {
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

    // SECURITY: the referenced source must belong to the user
    if (input.incomeSourceId) {
      const source = await prisma.incomeSource.findFirst({
        where: { id: input.incomeSourceId, userId },
      })
      if (!source) {
        return { success: false, error: 'Income source not found or access denied' }
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'INCOME',
        amount: input.amount,
        currency,
        date: input.date ?? new Date(),
        incomeSourceId: input.incomeSourceId ?? null,
        description: input.description?.trim() || null,
        entrySource: 'MANUAL',
      },
    })

    const context = await getCurrencyContext(userId)
    const monthTotal = await sumMonthIncome(userId, context)

    revalidatePath('/income')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: {
        transaction: { ...transaction, amount: Number(transaction.amount) },
        monthTotal,
      },
    }
  } catch (error) {
    console.error('Error in recordIncome:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record income',
    }
  }
}

async function sumMonthIncome(
  userId: string,
  context: CurrencyContext,
  now: Date = new Date()
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'INCOME',
      date: { gte: startOfMonth(now), lte: endOfMonth(now) },
    },
    select: { amount: true, currency: true },
  })

  return transactions.reduce(
    (sum, t) =>
      sum +
      convertCurrency(
        Number(t.amount),
        t.currency as Currency,
        context.defaultCurrency,
        context.usdRate,
        context.eurRate
      ),
    0
  )
}

/**
 * Everything the /income page needs: sources, current-month facts,
 * and the conservative next-month forecast (R2).
 */
export async function getIncomeOverview(): Promise<IncomeActionResult<IncomeOverview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id
    const now = new Date()

    const context = await getCurrencyContext(userId)
    const toDefault = (amount: number, currency: string) =>
      convertCurrency(
        amount,
        currency as Currency,
        context.defaultCurrency,
        context.usdRate,
        context.eurRate
      )

    const [sources, monthTransactions] = await Promise.all([
      prisma.incomeSource.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'INCOME',
          date: { gte: startOfMonth(now), lte: endOfMonth(now) },
        },
        include: { incomeSource: { select: { name: true } } },
        orderBy: { date: 'desc' },
      }),
    ])

    // --- Variable income history for the forecast (last 6 full months) ---
    const windowStart = startOfMonth(subMonths(now, FORECAST_HISTORY_MONTHS))
    const currentMonthStart = startOfMonth(now)
    const variableWhere = {
      userId,
      type: 'INCOME' as const,
      OR: [{ incomeSourceId: null }, { incomeSource: { type: 'VARIABLE' as const } }],
    }

    const [variableTxs, olderCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { ...variableWhere, date: { gte: windowStart, lt: currentMonthStart } },
        select: { amount: true, currency: true, date: true },
        orderBy: { date: 'asc' },
      }),
      prisma.transaction.count({
        where: { ...variableWhere, date: { lt: windowStart } },
      }),
    ])

    // History starts either at the window edge (older data exists) or at the
    // first variable-income month; months with zero income count as 0 (R2).
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
        currency: context.defaultCurrency,
      }))

    const forecast = forecastNextMonthIncome({ stableSources, variableHistory })

    const monthItems: TransactionListItem[] = monthTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      categoryId: t.categoryId,
      categoryName: null,
      categoryColor: null,
      incomeSourceId: t.incomeSourceId,
      incomeSourceName: t.incomeSource?.name ?? null,
      expenseId: t.expenseId,
      description: t.description,
      entrySource: t.entrySource,
    }))

    const monthTotal = monthItems.reduce(
      (sum, t) => sum + toDefault(t.amount, t.currency),
      0
    )

    return {
      success: true,
      data: {
        sources: sources.map(serializeSource),
        monthTransactions: monthItems,
        monthTotal,
        defaultCurrency: context.defaultCurrency,
        forecast,
      },
    }
  } catch (error) {
    console.error('Error in getIncomeOverview:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load income overview',
    }
  }
}
