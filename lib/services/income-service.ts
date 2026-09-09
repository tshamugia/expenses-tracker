/**
 * Income sources & income facts — userId-first business logic (no session, no
 * revalidation). Shared by the income Server Actions and the MCP tools.
 *
 * - STABLE sources (salary) carry an expected amount/day and are accrued into
 *   the ledger automatically each month (income-accrual); manual entries for
 *   them are rejected to avoid double counting.
 * - VARIABLE sources (projects, one-off extra income) are recorded manually.
 */

import { endOfMonth, startOfMonth } from 'date-fns'
import prisma from '@/lib/db/prisma'
import { accrueStableIncomeForUser } from '@/lib/services/income-accrual'
import { computeIncomeForecastForUser } from '@/lib/services/income-forecast-service'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { regenerateCurrentPlan } from '@/lib/services/plan-generation'
import { SUPPORTED_CURRENCIES } from '@/lib/services/quick-add'
import { getCurrencyContext, type CurrencyContext } from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type {
  CreateIncomeSourceInput,
  IncomeOverview,
  RecordIncomeInput,
  SerializedIncomeSource,
  UpdateIncomeSourceInput,
} from '@/types/income-types'
import type { SerializedTransaction, TransactionListItem } from '@/types/transaction-types'

export function serializeIncomeSource(source: {
  expectedAmount: unknown
  [key: string]: unknown
}): SerializedIncomeSource {
  return {
    ...source,
    expectedAmount: source.expectedAmount === null ? null : Number(source.expectedAmount),
  } as SerializedIncomeSource
}

export function validateIncomeSourceInput(input: {
  name?: string
  type?: 'STABLE' | 'VARIABLE'
  expectedAmount?: number | null
  currency?: string
  expectedDay?: number | null
}): string | null {
  if (input.name !== undefined && !input.name.trim()) {
    return 'Source name is required'
  }
  if (
    input.currency !== undefined &&
    !(SUPPORTED_CURRENCIES as readonly string[]).includes(input.currency)
  ) {
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

/** Create an income source. STABLE sources require an expected amount. */
export async function createIncomeSourceForUser(
  userId: string,
  input: CreateIncomeSourceInput
): Promise<Outcome<SerializedIncomeSource>> {
  const validationError = validateIncomeSourceInput(input)
  if (validationError) return fail(validationError)
  if (input.type === 'STABLE' && !input.expectedAmount) {
    return fail('Stable sources require an expected amount')
  }

  const source = await prisma.incomeSource.create({
    data: {
      userId,
      name: input.name.trim(),
      type: input.type,
      expectedAmount: input.expectedAmount ?? null,
      currency: input.currency || 'GEL',
      expectedDay: input.expectedDay ?? null,
    },
  })

  // A new source shifts the income forecast → re-derive the current plan
  // and Safe-to-Spend (Phase 4b event-driven refresh).
  await regenerateCurrentPlan(userId)

  return ok(serializeIncomeSource(source))
}

/** Update an income source (name, type, expected amount/day, active flag). */
export async function updateIncomeSourceForUser(
  userId: string,
  id: string,
  input: UpdateIncomeSourceInput
): Promise<Outcome<SerializedIncomeSource>> {
  // SECURITY: verify ownership
  const existing = await prisma.incomeSource.findFirst({ where: { id, userId } })
  if (!existing) return fail('Income source not found or access denied')

  const validationError = validateIncomeSourceInput(input)
  if (validationError) return fail(validationError)

  // STABLE sources must end up with an expected amount after the update
  const nextType = input.type ?? existing.type
  const nextExpected =
    input.expectedAmount !== undefined ? input.expectedAmount : existing.expectedAmount
  if (nextType === 'STABLE' && !nextExpected) {
    return fail('Stable sources require an expected amount')
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

  // A changed expected amount / active flag shifts the income forecast →
  // re-derive the current plan and Safe-to-Spend.
  await regenerateCurrentPlan(userId)

  return ok(serializeIncomeSource(source))
}

/** Archive an income source (soft delete — history stays in the ledger). */
export function archiveIncomeSourceForUser(
  userId: string,
  id: string
): Promise<Outcome<SerializedIncomeSource>> {
  return updateIncomeSourceForUser(userId, id, { isActive: false })
}

/** Record an income fact into the ledger. Returns the updated month total. */
export async function recordIncomeForUser(
  userId: string,
  input: RecordIncomeInput,
  now: Date = new Date()
): Promise<Outcome<{ transaction: SerializedTransaction; monthTotal: number }>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail('Amount must be greater than zero')
  }

  const currency = input.currency || 'GEL'
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return fail('Unsupported currency')
  }

  // SECURITY: the referenced source must belong to the user
  if (input.incomeSourceId) {
    const source = await prisma.incomeSource.findFirst({
      where: { id: input.incomeSourceId, userId },
    })
    if (!source) return fail('Income source not found or access denied')
    // STABLE income is accrued automatically each month — manual entries
    // would double-count it
    if (source.type === 'STABLE') {
      return fail('Stable income is recorded automatically every month')
    }
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: 'INCOME',
      amount: input.amount,
      currency,
      date: input.date ?? now,
      incomeSourceId: input.incomeSourceId ?? null,
      description: input.description?.trim() || null,
      entrySource: 'MANUAL',
    },
  })

  const context = await getCurrencyContext(userId)
  const monthTotal = await sumMonthIncome(userId, context, now)

  return ok({
    transaction: { ...transaction, amount: Number(transaction.amount) },
    monthTotal,
  })
}

export async function sumMonthIncome(
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
 * Everything the /income page needs: sources, current-month facts, and the
 * conservative next-month forecast (R2). Accrues due stable income first.
 */
export async function buildIncomeOverview(
  userId: string,
  now: Date = new Date()
): Promise<IncomeOverview> {
  // Lazy accrual: credit any stable income that came due since the last
  // visit, so the month facts below already include it. Never blocks the page.
  try {
    await accrueStableIncomeForUser(userId, now)
  } catch (error) {
    console.error('Error accruing stable income:', error)
  }

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

  // Conservative next-month forecast (shared engine, PRD R2)
  const { forecast } = await computeIncomeForecastForUser(userId, now, context)

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

  const monthTotal = monthItems.reduce((sum, t) => sum + toDefault(t.amount, t.currency), 0)

  return {
    sources: sources.map(serializeIncomeSource),
    monthTransactions: monthItems,
    monthTotal,
    defaultCurrency: context.defaultCurrency,
    forecast,
  }
}
