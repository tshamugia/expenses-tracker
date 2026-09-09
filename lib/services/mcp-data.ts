/**
 * Data adapters for the MCP server — thin, userId-first, JSON-safe.
 * Every function takes the userId resolved from the access token (never from
 * tool input) and returns numbers instead of Prisma Decimals. Money math is
 * never re-implemented here: the view models come from the same builders and
 * userId-first services the app's Server Actions use (plan-view, debt-overview,
 * goal-overview, income-service, goal-service, debt-service, plan-service, …).
 */

import prisma from '@/lib/db/prisma'
import {
  createExpense,
  deleteExpense,
  markExpensePaid,
  updateExpense,
  type UpdateExpenseInput,
} from '@/lib/actions/expense-actions'
import { buildDashboardData, buildPlanView, computeStabilityProgress } from '@/lib/services/plan-view'
import { buildDebtsOverview } from '@/lib/services/debt-overview'
import { buildGoalsOverview } from '@/lib/services/goal-overview'
import { addExpenseTransaction, type QuickAddResult } from '@/lib/services/quick-add'
import { toMonthKey } from '@/lib/services/plan-input'
import {
  archiveIncomeSourceForUser,
  buildIncomeOverview,
  createIncomeSourceForUser,
  recordIncomeForUser,
  updateIncomeSourceForUser,
} from '@/lib/services/income-service'
import {
  advanceReserveStageForUser,
  approveGoalForUser,
  archiveGoalForUser,
  contributeToGoalForUser,
  createGoalForUser,
  getGoalDetailForUser,
  reorderGoalsForUser,
  updateGoalForUser,
  withdrawFromGoalForUser,
} from '@/lib/services/goal-service'
import {
  createCategoryForUser,
  deleteCategoryForUser,
  updateCategoryForUser,
} from '@/lib/services/category-service'
import {
  deleteTransactionForUser,
  updateTransactionForUser,
} from '@/lib/services/transaction-service'
import {
  applyPrepaymentForUser,
  archiveDebtForUser,
  createDebtForUser,
  getDebtDetailForUser,
  recordDebtPaymentForUser,
  simulatePrepaymentForUser,
  updateDebtForUser,
} from '@/lib/services/debt-service'
import {
  buildClosePreview,
  confirmPlanForUser,
  regeneratePlanForUser,
  reopenPlanForUser,
} from '@/lib/services/plan-service'
import { closePlanForUser } from '@/lib/services/plan-close'
import {
  createPaymentCardForUser,
  deletePaymentCardForUser,
  listPaymentCardsForUser,
  updatePaymentCardForUser,
} from '@/lib/services/payment-card-service'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { isOverdue } from '@/lib/utils/date-helpers'
import type { ClosePreview, CloseDecision, ConfirmAdjustment, DashboardData, PlanView, StabilityProgress } from '@/types/plan-types'
import type { DebtDetail, DebtsOverview, PrepaymentSimulation, SerializedDebt, SimulatePrepaymentInput, UpdateDebtInput } from '@/types/debt-types'
import type { GoalDetail, GoalsOverview, SerializedGoal, UpdateGoalInput } from '@/types/goal-types'
import type { IncomeOverview, SerializedIncomeSource, UpdateIncomeSourceInput } from '@/types/income-types'
import type { CategoryKind, SerializedCategory, UpdateCategoryInput } from '@/types/category-types'
import type { PaymentCardListItem, SerializedPaymentCard, UpdatePaymentCardInput } from '@/types/payment-card-types'
import type { SerializedExpenseWithPayments } from '@/types/expense-types'
import type { SerializedTransaction, TransactionType, UpdateTransactionInput } from '@/types/transaction-types'

export const MCP_MAX_LIST = 200
export const MCP_DEFAULT_LIST = 50

export type McpWriteOutcome<T> = Outcome<T>

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
  paymentCardId: string | null
  isPaid: boolean
  isOverdue: boolean
}

type ExpenseRow = {
  id: string
  title: string
  amount: unknown
  currency: string
  category: string | null
  description: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  nextDueDate: Date | string | null
  paymentCardId: string | null
  payments: { paid: boolean; dueDate: Date | string }[]
}

/** Compact, JSON-safe shape for a fixed bill (paid flag = its latest payment). */
export function toExpenseItem(e: ExpenseRow): McpExpenseItem {
  const latest = [...e.payments].sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
  )[0]
  const isPaid = latest?.paid ?? false
  const nextDueDate = e.nextDueDate ? new Date(e.nextDueDate) : null
  return {
    id: e.id,
    title: e.title,
    amount: Number(e.amount),
    currency: e.currency,
    category: e.category,
    description: e.description,
    isRecurring: e.isRecurring,
    recurrenceRule: e.recurrenceRule,
    nextDueDate: nextDueDate?.toISOString() ?? null,
    paymentCardId: e.paymentCardId,
    isPaid,
    isOverdue: !isPaid && isOverdue(nextDueDate),
  }
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
  return rows.map(toExpenseItem)
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
  incomeSourceId: string | null
  incomeSourceName: string | null
  expenseId: string | null
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
      incomeSourceId: t.incomeSourceId,
      incomeSourceName: t.incomeSource?.name ?? null,
      expenseId: t.expenseId,
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

export function toCategoryItem(c: SerializedCategory): McpCategoryItem {
  return {
    id: c.id,
    name: c.categoryName,
    kind: c.kind,
    monthlyLimit: c.monthlyLimit,
    color: c.color,
  }
}

export async function mcpListCategories(userId: string): Promise<McpCategoryItem[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: { categoryName: 'asc' },
  })
  return rows.map((c) =>
    toCategoryItem({
      ...c,
      monthlyLimit: c.monthlyLimit === null ? null : Number(c.monthlyLimit),
    })
  )
}

export function mcpListDebts(userId: string, now: Date = new Date()): Promise<DebtsOverview> {
  return buildDebtsOverview(userId, now)
}

export function mcpListGoals(userId: string, now: Date = new Date()): Promise<GoalsOverview> {
  return buildGoalsOverview(userId, now)
}

export function mcpGetGoal(userId: string, goalId: string): Promise<McpWriteOutcome<GoalDetail>> {
  return getGoalDetailForUser(userId, goalId)
}

export function mcpGetDebt(userId: string, debtId: string): Promise<McpWriteOutcome<DebtDetail>> {
  return getDebtDetailForUser(userId, debtId)
}

/** Income sources (salary = STABLE, extra income = VARIABLE) + this month's facts + forecast. */
export function mcpListIncomeSources(userId: string, now: Date = new Date()): Promise<IncomeOverview> {
  return buildIncomeOverview(userId, now)
}

export function mcpListPaymentCards(userId: string): Promise<PaymentCardListItem[]> {
  return listPaymentCardsForUser(userId)
}

export function mcpGetStabilityProgress(userId: string, now: Date = new Date()): Promise<StabilityProgress> {
  return computeStabilityProgress(userId, now)
}

// --- writes: fixed bills (Expense) --------------------------------------------

export interface McpCreateExpenseInput {
  title: string
  amount: number
  currency: string
  category?: string
  description?: string
  nextDueDate?: Date
  isRecurring?: boolean
  recurrenceRule?: string
  paymentCardId?: string
}

function fromExpenseResult(result: {
  success: boolean
  data?: SerializedExpenseWithPayments
  error?: string
}, fallback: string): McpWriteOutcome<McpExpenseItem> {
  if (!result.success || !result.data) return fail(result.error ?? fallback)
  return ok(toExpenseItem(result.data))
}

/** Create a fixed bill through the app's createExpense (initial Payment + overdue notice included). */
export async function mcpCreateExpense(
  userId: string,
  input: McpCreateExpenseInput
): Promise<McpWriteOutcome<McpExpenseItem>> {
  if (input.paymentCardId) {
    const card = await prisma.paymentCard.findFirst({
      where: { id: input.paymentCardId, userId },
      select: { id: true },
    })
    if (!card) return fail('Payment card not found or access denied')
  }
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
    paymentCardId: input.paymentCardId,
  })
  return fromExpenseResult(result, 'Failed to create expense')
}

export type McpUpdateExpenseInput = Omit<UpdateExpenseInput, 'icon' | 'startDate'>

/** Update a fixed bill (title, amount, currency, category, recurrence, due date, card). */
export async function mcpUpdateExpense(
  userId: string,
  expenseId: string,
  input: McpUpdateExpenseInput
): Promise<McpWriteOutcome<McpExpenseItem>> {
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    return fail('Amount must be greater than zero')
  }
  if (input.paymentCardId) {
    const card = await prisma.paymentCard.findFirst({
      where: { id: input.paymentCardId, userId },
      select: { id: true },
    })
    if (!card) return fail('Payment card not found or access denied')
  }
  const result = await updateExpense(expenseId, userId, input)
  return fromExpenseResult(result, 'Failed to update expense')
}

/** Delete a fixed bill and its payment history (cascade). */
export async function mcpDeleteExpense(
  userId: string,
  expenseId: string
): Promise<McpWriteOutcome<{ id: string; deleted: true }>> {
  const result = await deleteExpense(expenseId, userId)
  if (!result.success) return fail(result.error ?? 'Failed to delete expense')
  return ok({ id: expenseId, deleted: true })
}

/** Mark the next unpaid payment of a fixed bill as paid (mirrored into the ledger; recurring bills roll forward). */
export async function mcpMarkExpensePaid(
  userId: string,
  expenseId: string
): Promise<McpWriteOutcome<McpExpenseItem>> {
  const result = await markExpensePaid(expenseId, userId)
  return fromExpenseResult(result, 'Failed to mark expense as paid')
}

// --- writes: ledger transactions ---------------------------------------------

export interface McpAddTransactionInput {
  amount: number
  currency?: string
  /** Either the category id or its (case-insensitive) name; the category must belong to the user. */
  categoryId?: string
  categoryName?: string
  description?: string
  date?: Date
}

/** Resolve a category by id or (case-insensitive) name, scoped to the user. */
export async function resolveCategoryId(
  userId: string,
  ref: { categoryId?: string; categoryName?: string }
): Promise<McpWriteOutcome<string>> {
  if (ref.categoryId) return ok(ref.categoryId)
  if (!ref.categoryName?.trim()) return fail('Provide categoryId or categoryName')
  const category = await prisma.category.findFirst({
    where: { userId, categoryName: { equals: ref.categoryName.trim(), mode: 'insensitive' } },
    select: { id: true },
  })
  if (!category) return fail(`Category "${ref.categoryName}" not found`)
  return ok(category.id)
}

/** Quick-add a variable expense into the ledger (same path as the app's Quick Add). */
export async function mcpAddTransaction(
  userId: string,
  input: McpAddTransactionInput
): Promise<McpWriteOutcome<QuickAddResult>> {
  const resolved = await resolveCategoryId(userId, input)
  if (!resolved.ok) return resolved

  const outcome = await addExpenseTransaction(userId, {
    amount: input.amount,
    categoryId: resolved.data,
    currency: input.currency,
    description: input.description,
    date: input.date,
  })
  return outcome.ok ? ok(outcome.data) : fail(outcome.error)
}

export interface McpUpdateTransactionInput extends Omit<UpdateTransactionInput, 'categoryId'> {
  categoryId?: string | null
  categoryName?: string
}

/** Update a ledger entry (amount, currency, date, category by id or name, description). */
export async function mcpUpdateTransaction(
  userId: string,
  transactionId: string,
  input: McpUpdateTransactionInput
): Promise<McpWriteOutcome<SerializedTransaction>> {
  const { categoryName, ...rest } = input
  let categoryId = rest.categoryId
  if (categoryName !== undefined) {
    const resolved = await resolveCategoryId(userId, { categoryName })
    if (!resolved.ok) return resolved
    categoryId = resolved.data
  }
  return updateTransactionForUser(userId, transactionId, { ...rest, categoryId })
}

export async function mcpDeleteTransaction(
  userId: string,
  transactionId: string
): Promise<McpWriteOutcome<{ id: string; deleted: true }>> {
  const outcome = await deleteTransactionForUser(userId, transactionId)
  return outcome.ok ? ok({ id: transactionId, deleted: true as const }) : outcome
}

// --- writes: income ----------------------------------------------------------

export interface McpCreateIncomeSourceInput {
  name: string
  type: 'STABLE' | 'VARIABLE'
  expectedAmount?: number
  currency?: string
  expectedDay?: number
}

export function mcpCreateIncomeSource(
  userId: string,
  input: McpCreateIncomeSourceInput
): Promise<McpWriteOutcome<SerializedIncomeSource>> {
  return createIncomeSourceForUser(userId, input)
}

export function mcpUpdateIncomeSource(
  userId: string,
  sourceId: string,
  input: UpdateIncomeSourceInput
): Promise<McpWriteOutcome<SerializedIncomeSource>> {
  return updateIncomeSourceForUser(userId, sourceId, input)
}

export function mcpArchiveIncomeSource(
  userId: string,
  sourceId: string
): Promise<McpWriteOutcome<SerializedIncomeSource>> {
  return archiveIncomeSourceForUser(userId, sourceId)
}

export interface McpRecordIncomeInput {
  amount: number
  currency?: string
  /** Either the source id or its (case-insensitive) name; optional for one-off income. */
  incomeSourceId?: string
  incomeSourceName?: string
  description?: string
  date?: Date
}

/** Record extra income (VARIABLE source or none). STABLE salary accrues automatically. */
export async function mcpRecordIncome(
  userId: string,
  input: McpRecordIncomeInput
): Promise<McpWriteOutcome<{ transaction: SerializedTransaction; monthTotal: number }>> {
  let incomeSourceId = input.incomeSourceId
  if (!incomeSourceId && input.incomeSourceName?.trim()) {
    const source = await prisma.incomeSource.findFirst({
      where: { userId, name: { equals: input.incomeSourceName.trim(), mode: 'insensitive' } },
      select: { id: true },
    })
    if (!source) return fail(`Income source "${input.incomeSourceName}" not found`)
    incomeSourceId = source.id
  }
  return recordIncomeForUser(userId, {
    amount: input.amount,
    currency: input.currency,
    incomeSourceId,
    description: input.description,
    date: input.date,
  })
}

// --- writes: goals -----------------------------------------------------------

export interface McpCreateGoalInput {
  name: string
  targetAmount: number
  currency?: string
  targetDate?: Date | null
  monthlyContribution?: number | null
}

export function mcpCreateGoal(
  userId: string,
  input: McpCreateGoalInput
): Promise<McpWriteOutcome<SerializedGoal>> {
  return createGoalForUser(userId, input)
}

export function mcpApproveGoal(
  userId: string,
  goalId: string
): Promise<McpWriteOutcome<{ goal: SerializedGoal; planRefreshed: boolean }>> {
  return approveGoalForUser(userId, goalId)
}

export function mcpUpdateGoal(
  userId: string,
  goalId: string,
  input: UpdateGoalInput
): Promise<McpWriteOutcome<SerializedGoal>> {
  return updateGoalForUser(userId, goalId, input)
}

export async function mcpArchiveGoal(
  userId: string,
  goalId: string
): Promise<McpWriteOutcome<{ id: string; status: 'ARCHIVED' }>> {
  const outcome = await archiveGoalForUser(userId, goalId)
  return outcome.ok ? ok({ id: goalId, status: 'ARCHIVED' as const }) : outcome
}

export function mcpReorderGoals(
  userId: string,
  orderedIds: string[]
): Promise<McpWriteOutcome<{ orderedIds: string[] }>> {
  return reorderGoalsForUser(userId, orderedIds)
}

export function mcpContributeToGoal(
  userId: string,
  goalId: string,
  input: { amount: number; date?: Date }
): Promise<McpWriteOutcome<{ achieved: boolean }>> {
  return contributeToGoalForUser(userId, goalId, input)
}

export async function mcpWithdrawFromGoal(
  userId: string,
  goalId: string,
  input: { amount: number; reason: string; date?: Date }
): Promise<McpWriteOutcome<{ goalId: string; withdrawn: number }>> {
  const outcome = await withdrawFromGoalForUser(userId, goalId, input)
  return outcome.ok ? ok({ goalId, withdrawn: input.amount }) : outcome
}

export function mcpAdvanceReserveStage(
  userId: string,
  goalId: string
): Promise<McpWriteOutcome<SerializedGoal>> {
  return advanceReserveStageForUser(userId, goalId)
}

// --- writes: categories ------------------------------------------------------

export interface McpCreateCategoryInput {
  name: string
  color?: string
  kind?: CategoryKind
  monthlyLimit?: number | null
}

export async function mcpCreateCategory(
  userId: string,
  input: McpCreateCategoryInput
): Promise<McpWriteOutcome<McpCategoryItem>> {
  const outcome = await createCategoryForUser(userId, {
    categoryName: input.name,
    color: input.color,
    kind: input.kind,
    monthlyLimit: input.monthlyLimit,
  })
  return outcome.ok ? ok(toCategoryItem(outcome.data)) : outcome
}

export interface McpUpdateCategoryInput extends Omit<UpdateCategoryInput, 'categoryName'> {
  name?: string
}

export async function mcpUpdateCategory(
  userId: string,
  categoryId: string,
  input: McpUpdateCategoryInput
): Promise<McpWriteOutcome<McpCategoryItem>> {
  const { name, ...rest } = input
  const outcome = await updateCategoryForUser(userId, categoryId, {
    ...rest,
    categoryName: name,
  })
  return outcome.ok ? ok(toCategoryItem(outcome.data)) : outcome
}

export async function mcpDeleteCategory(
  userId: string,
  categoryId: string
): Promise<McpWriteOutcome<{ id: string; deleted: true }>> {
  const outcome = await deleteCategoryForUser(userId, categoryId)
  return outcome.ok ? ok({ id: categoryId, deleted: true as const }) : outcome
}

// --- writes: debts -----------------------------------------------------------

export interface McpCreateDebtInput {
  name: string
  principal: number
  annualRatePct: number
  currency?: string
  firstPaymentDate: Date
  termMonths?: number
  monthlyPayment?: number
}

export function mcpCreateDebt(
  userId: string,
  input: McpCreateDebtInput
): Promise<McpWriteOutcome<SerializedDebt>> {
  return createDebtForUser(userId, input)
}

export function mcpUpdateDebt(
  userId: string,
  debtId: string,
  input: UpdateDebtInput
): Promise<McpWriteOutcome<SerializedDebt>> {
  return updateDebtForUser(userId, debtId, input)
}

export async function mcpArchiveDebt(
  userId: string,
  debtId: string
): Promise<McpWriteOutcome<{ id: string; status: 'ARCHIVED' }>> {
  const outcome = await archiveDebtForUser(userId, debtId)
  return outcome.ok ? ok({ id: debtId, status: 'ARCHIVED' as const }) : outcome
}

export interface McpRecordDebtPaymentInput {
  /** A specific installment; when omitted the debt's next unpaid installment is used. */
  scheduleItemId?: string
  debtId?: string
  amount?: number
  paidAt?: Date
}

/** Record an installment by schedule item id, or the next unpaid one of a debt. */
export async function mcpRecordDebtPayment(
  userId: string,
  input: McpRecordDebtPaymentInput
): Promise<McpWriteOutcome<{ paidOff: boolean; debtId: string; scheduleItemId: string }>> {
  let scheduleItemId = input.scheduleItemId
  if (!scheduleItemId) {
    if (!input.debtId) return fail('Provide scheduleItemId or debtId')
    const next = await prisma.debtScheduleItem.findFirst({
      where: { debtId: input.debtId, paid: false, debt: { userId } },
      orderBy: { seq: 'asc' },
      select: { id: true },
    })
    if (!next) return fail('Debt not found, access denied, or no unpaid installments')
    scheduleItemId = next.id
  }
  const outcome = await recordDebtPaymentForUser(userId, scheduleItemId, {
    amount: input.amount,
    paidAt: input.paidAt,
  })
  return outcome.ok ? ok({ ...outcome.data, scheduleItemId }) : outcome
}

export function mcpSimulatePrepayment(
  userId: string,
  debtId: string,
  input: SimulatePrepaymentInput
): Promise<McpWriteOutcome<PrepaymentSimulation>> {
  return simulatePrepaymentForUser(userId, debtId, input)
}

export function mcpApplyPrepayment(
  userId: string,
  debtId: string,
  input: SimulatePrepaymentInput
): Promise<McpWriteOutcome<PrepaymentSimulation>> {
  return applyPrepaymentForUser(userId, debtId, input)
}

// --- writes: monthly plan ----------------------------------------------------

export interface McpPlanRef {
  planId?: string
  /** YYYY-MM; default = current month. Ignored when planId is given. */
  month?: string
}

/** Resolve a plan by id or by month (default current), scoped to the user. */
export async function resolvePlanId(
  userId: string,
  ref: McpPlanRef,
  now: Date = new Date()
): Promise<McpWriteOutcome<string>> {
  if (ref.planId) return ok(ref.planId)
  const month = ref.month ?? toMonthKey(now)
  const plan = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month } },
    select: { id: true },
  })
  if (!plan) return fail(`No plan exists for ${month}. Call generate_monthly_plan first.`)
  return ok(plan.id)
}

export function mcpGeneratePlan(
  userId: string,
  month?: string,
  now: Date = new Date()
): Promise<McpWriteOutcome<PlanView>> {
  return regeneratePlanForUser(userId, month, now)
}

export async function mcpConfirmPlan(
  userId: string,
  ref: McpPlanRef,
  adjustments: ConfirmAdjustment[] = [],
  now: Date = new Date()
): Promise<McpWriteOutcome<PlanView>> {
  const planId = await resolvePlanId(userId, ref, now)
  if (!planId.ok) return planId
  return confirmPlanForUser(userId, planId.data, adjustments, now)
}

export async function mcpReopenPlan(
  userId: string,
  ref: McpPlanRef,
  now: Date = new Date()
): Promise<McpWriteOutcome<{ planId: string; status: 'DRAFT' }>> {
  const planId = await resolvePlanId(userId, ref, now)
  if (!planId.ok) return planId
  const outcome = await reopenPlanForUser(userId, planId.data)
  return outcome.ok ? ok({ planId: planId.data, status: 'DRAFT' as const }) : outcome
}

export async function mcpGetClosePreview(
  userId: string,
  ref: McpPlanRef,
  now: Date = new Date()
): Promise<McpWriteOutcome<ClosePreview>> {
  const planId = await resolvePlanId(userId, ref, now)
  if (!planId.ok) return planId
  return buildClosePreview(userId, planId.data)
}

export async function mcpCloseMonth(
  userId: string,
  ref: McpPlanRef,
  decision: CloseDecision = { conclusions: [] },
  now: Date = new Date()
): Promise<McpWriteOutcome<ClosePreview>> {
  const planId = await resolvePlanId(userId, ref, now)
  if (!planId.ok) return planId
  const result = await closePlanForUser(userId, planId.data, decision)
  return result.ok ? ok(result.data) : fail(result.error)
}

// --- writes: payment cards ---------------------------------------------------

export interface McpCreatePaymentCardInput {
  cardholderName: string
  cardNumber: string
  expiryMonth: number
  expiryYear: number
  nickname?: string
  color?: string
}

export function toPaymentCardItem(card: SerializedPaymentCard): PaymentCardListItem {
  return {
    id: card.id,
    cardholderName: card.cardholderName,
    lastFourDigits: card.lastFourDigits,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    cardBrand: card.cardBrand,
    nickname: card.nickname,
    color: card.color,
  }
}

export async function mcpCreatePaymentCard(
  userId: string,
  input: McpCreatePaymentCardInput
): Promise<McpWriteOutcome<PaymentCardListItem>> {
  const outcome = await createPaymentCardForUser(userId, input)
  return outcome.ok ? ok(toPaymentCardItem(outcome.data)) : outcome
}

export async function mcpUpdatePaymentCard(
  userId: string,
  cardId: string,
  input: UpdatePaymentCardInput
): Promise<McpWriteOutcome<PaymentCardListItem>> {
  const outcome = await updatePaymentCardForUser(userId, cardId, input)
  return outcome.ok ? ok(toPaymentCardItem(outcome.data)) : outcome
}

export async function mcpDeletePaymentCard(
  userId: string,
  cardId: string
): Promise<McpWriteOutcome<{ id: string; deleted: true }>> {
  const outcome = await deletePaymentCardForUser(userId, cardId)
  return outcome.ok ? ok({ id: cardId, deleted: true as const }) : outcome
}

// --- helpers -----------------------------------------------------------------

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return MCP_DEFAULT_LIST
  return Math.min(MCP_MAX_LIST, Math.max(1, Math.floor(limit)))
}
