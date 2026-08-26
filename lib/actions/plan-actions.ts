'use server'

/**
 * Server Actions for the Monthly Plan (Phase 4)
 * BUSINESS LOGIC LAYER — orchestration only; the money math lives in the pure
 * engines (plan-engine, verdict, stability, month-close). These actions:
 *  - generate a DRAFT plan by the waterfall (D3 — our own engine, no Claude)
 *  - confirm it (with deficit-resolution adjustments) into the active plan
 *  - track live actuals & Safe to spend during the month
 *  - propose/apply a windfall split when income beats the forecast
 *  - close the month: plan vs actual, an honest verdict, and conclusions that
 *    feed the next plan
 *  - assemble the dashboard + stability-path view models
 */

import { revalidatePath } from 'next/cache'
import {
  differenceInCalendarDays,
  endOfMonth,
  getDaysInMonth,
} from 'date-fns'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import type { DeficitInfo } from '@/lib/services/plan-engine'
import { generatePlanForUser } from '@/lib/services/plan-generation'
import { calcVerdict } from '@/lib/services/verdict'
import {
  computeCompletionPct,
  deltaPct,
  proposeConclusions,
} from '@/lib/services/month-close'
import {
  currentStabilityStage,
  debtFreeProjection,
  netPosition,
} from '@/lib/services/stability'
import { splitWindfall } from '@/lib/services/windfall'
import { monthStartOf, toMonthKey } from '@/lib/services/plan-input'
import {
  getCurrencyContext,
  type CurrencyContext,
} from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type { MonthlyPlan, PlanAllocation } from '@prisma/client'
import type {
  ClosePreview,
  CloseDecision,
  ConfirmAdjustment,
  DashboardData,
  PlanConclusion,
  PlanView,
  SerializedAllocation,
  SerializedPlan,
  StabilityProgress,
  WindfallProposal,
} from '@/types/plan-types'

export interface PlanActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const TREND_MONTHS = 6

// --- serialization -----------------------------------------------------------

function serializePlan(plan: MonthlyPlan): SerializedPlan {
  return {
    ...plan,
    forecastIncome: Number(plan.forecastIncome),
    forecastStable: Number(plan.forecastStable),
    forecastVariable: Number(plan.forecastVariable),
    actualIncome: plan.actualIncome === null ? null : Number(plan.actualIncome),
    safeToSpend: Number(plan.safeToSpend),
  }
}

function serializeAllocation(a: PlanAllocation): SerializedAllocation {
  return {
    ...a,
    planned: Number(a.planned),
    actual: a.actual === null ? null : Number(a.actual),
  }
}

// --- month actuals (shared by live view + close) -----------------------------

interface MonthActuals {
  incomeTotal: number
  spendByCategory: Map<string, number>
  spendByExpense: Map<string, number>
  debtPaidByDebt: Map<string, number> // total paid (payment) per debt
  debtPrincipalByDebt: Map<string, number> // principal cleared per debt
  debtPrincipalPaidTotal: number
  contribByGoal: Map<string, number> // net contribution per goal
  reserveNet: number
  goalsNet: number
  newDebtPrincipal: number
  discretionarySpent: number
  categoryKind: Map<string, string>
}

/**
 * Aggregate every real money movement in [monthStart, monthEnd] from the ledger
 * and the debt/goal sub-ledgers, in the user's default currency. Discretionary
 * spend (what draws down Safe to spend) excludes fixed bills, recurring-expense
 * payments, debt payments and savings contributions.
 */
async function gatherMonthActuals(
  userId: string,
  monthStart: Date,
  monthEnd: Date,
  context: CurrencyContext
): Promise<MonthActuals> {
  const toDefault = (amount: number, currency: string) =>
    convertCurrency(
      amount,
      currency as Currency,
      context.defaultCurrency,
      context.usdRate,
      context.eurRate
    )

  const [expenseTxs, incomeAgg, categories, goalContribs, debtItems, newDebts] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { userId, type: 'EXPENSE', date: { gte: monthStart, lte: monthEnd } },
        select: { id: true, amount: true, currency: true, categoryId: true, expenseId: true },
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
        // aggregate can't convert currencies; income is summed raw then treated
        // as default currency (matches the rest of the money model here)
      }),
      prisma.category.findMany({ where: { userId }, select: { id: true, kind: true } }),
      prisma.goalContribution.findMany({
        where: { goal: { userId }, date: { gte: monthStart, lte: monthEnd } },
        select: { goalId: true, amount: true, transactionId: true, goal: { select: { isEmergencyFund: true, currency: true } } },
      }),
      prisma.debtScheduleItem.findMany({
        where: { debt: { userId }, paid: true, paidAt: { gte: monthStart, lte: monthEnd } },
        select: {
          debtId: true,
          principalPart: true,
          payment: true,
          paidAmount: true,
          transactionId: true,
          debt: { select: { currency: true } },
        },
      }),
      prisma.debt.findMany({
        where: { userId, createdAt: { gte: monthStart, lte: monthEnd } },
        select: { principal: true, currency: true },
      }),
    ])

  const categoryKind = new Map(categories.map((c) => [c.id, c.kind]))

  // Transactions that mirror a savings/debt movement — excluded from discretionary
  const excludedTxIds = new Set<string>()
  for (const gc of goalContribs) if (gc.transactionId) excludedTxIds.add(gc.transactionId)
  for (const it of debtItems) if (it.transactionId) excludedTxIds.add(it.transactionId)

  const spendByCategory = new Map<string, number>()
  const spendByExpense = new Map<string, number>()
  let discretionarySpent = 0
  for (const tx of expenseTxs) {
    const amount = toDefault(Number(tx.amount), tx.currency)
    if (tx.categoryId) {
      spendByCategory.set(tx.categoryId, (spendByCategory.get(tx.categoryId) ?? 0) + amount)
    }
    if (tx.expenseId) {
      spendByExpense.set(tx.expenseId, (spendByExpense.get(tx.expenseId) ?? 0) + amount)
    }
    const isFixed = tx.categoryId ? categoryKind.get(tx.categoryId) === 'FIXED' : false
    const isRecurringBill = tx.expenseId !== null
    const isExcluded = excludedTxIds.has(tx.id)
    if (!isFixed && !isRecurringBill && !isExcluded) {
      discretionarySpent += amount
    }
  }

  const debtPaidByDebt = new Map<string, number>()
  const debtPrincipalByDebt = new Map<string, number>()
  let debtPrincipalPaidTotal = 0
  for (const it of debtItems) {
    const paid = toDefault(Number(it.paidAmount ?? it.payment), it.debt.currency)
    const principal = toDefault(Number(it.principalPart), it.debt.currency)
    debtPaidByDebt.set(it.debtId, (debtPaidByDebt.get(it.debtId) ?? 0) + paid)
    debtPrincipalByDebt.set(it.debtId, (debtPrincipalByDebt.get(it.debtId) ?? 0) + principal)
    debtPrincipalPaidTotal += principal
  }

  const contribByGoal = new Map<string, number>()
  let reserveNet = 0
  let goalsNet = 0
  for (const gc of goalContribs) {
    const amount = toDefault(Number(gc.amount), gc.goal.currency)
    contribByGoal.set(gc.goalId, (contribByGoal.get(gc.goalId) ?? 0) + amount)
    if (gc.goal.isEmergencyFund) reserveNet += amount
    else goalsNet += amount
  }

  const newDebtPrincipal = newDebts.reduce(
    (sum, d) => sum + toDefault(Number(d.principal), d.currency),
    0
  )

  return {
    incomeTotal: roundMoney(Number(incomeAgg._sum.amount ?? 0)),
    spendByCategory,
    spendByExpense,
    debtPaidByDebt,
    debtPrincipalByDebt,
    debtPrincipalPaidTotal: roundMoney(debtPrincipalPaidTotal),
    contribByGoal,
    reserveNet: roundMoney(reserveNet),
    goalsNet: roundMoney(goalsNet),
    newDebtPrincipal: roundMoney(newDebtPrincipal),
    discretionarySpent: roundMoney(discretionarySpent),
    categoryKind,
  }
}

/** Actual money moved for one allocation this month (by kind + refId). */
function actualForAllocation(a: SerializedAllocation, actuals: MonthActuals): number {
  switch (a.kind) {
    case 'DEBT':
      return roundMoney(a.refId ? actuals.debtPaidByDebt.get(a.refId) ?? 0 : 0)
    case 'RESERVE':
    case 'GOAL':
      return roundMoney(a.refId ? actuals.contribByGoal.get(a.refId) ?? 0 : 0)
    case 'VARIABLE':
      return roundMoney(a.refId ? actuals.spendByCategory.get(a.refId) ?? 0 : 0)
    case 'MANDATORY':
      // refId is either a FIXED category or a recurring-expense id
      if (!a.refId) return 0
      return roundMoney(
        (actuals.spendByCategory.get(a.refId) ?? 0) +
          (actuals.spendByExpense.get(a.refId) ?? 0)
      )
    case 'FREE':
      return actuals.discretionarySpent
    default:
      return 0
  }
}

// --- generate / confirm ------------------------------------------------------

/**
 * Generate a DRAFT plan for `month` (default: the current month) by the
 * waterfall. Idempotent for drafts — an existing DRAFT is regenerated; a
 * CONFIRMED/CLOSED plan is protected (the user must reopen editing).
 */
export async function generateMonthlyPlan(
  month?: string
): Promise<PlanActionResult<PlanView>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id
    const now = new Date()
    const targetMonth = month ?? toMonthKey(now)

    const gen = await generatePlanForUser(userId, targetMonth)
    if (gen.skipped || !gen.planId) {
      return {
        success: false,
        error: 'A confirmed plan already exists for this month — reopen it to edit',
      }
    }

    revalidatePath('/plan')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: await buildPlanView(userId, gen.planId, now),
    }
  } catch (error) {
    console.error('Error in generateMonthlyPlan:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate plan',
    }
  }
}

/**
 * Confirm a DRAFT plan into the active plan, applying the user's adjustments
 * (deficit resolution / inline edits). FREE is recomputed from the forecast so
 * Safe to spend stays exact. One action — G1: ≤1 minute.
 */
export async function confirmPlan(
  planId: string,
  adjustments: ConfirmAdjustment[] = []
): Promise<PlanActionResult<PlanView>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id

    const plan = await prisma.monthlyPlan.findFirst({
      where: { id: planId, userId },
      include: { allocations: true },
    })
    if (!plan) return { success: false, error: 'Plan not found or access denied' }
    if (plan.status === 'CLOSED') {
      return { success: false, error: 'This month is already closed' }
    }

    const adjustmentMap = new Map(adjustments.map((a) => [a.allocationId, roundMoney(a.planned)]))

    await prisma.$transaction(async (tx) => {
      // apply adjustments to non-FREE allocations
      let nonFreeTotal = 0
      let freeAllocationId: string | null = null
      for (const a of plan.allocations) {
        if (a.kind === 'FREE') {
          freeAllocationId = a.id
          continue
        }
        const newPlanned = adjustmentMap.has(a.id)
          ? (adjustmentMap.get(a.id) as number)
          : Number(a.planned)
        if (adjustmentMap.has(a.id)) {
          await tx.planAllocation.update({ where: { id: a.id }, data: { planned: newPlanned } })
        }
        nonFreeTotal += newPlanned
      }

      const free = Math.max(0, roundMoney(Number(plan.forecastIncome) - nonFreeTotal))
      if (freeAllocationId) {
        await tx.planAllocation.update({ where: { id: freeAllocationId }, data: { planned: free } })
      }
      await tx.monthlyPlan.update({
        where: { id: planId },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), safeToSpend: free },
      })
    })

    revalidatePath('/plan')
    revalidatePath('/dashboard')

    return { success: true, data: await buildPlanView(userId, planId, new Date()) }
  } catch (error) {
    console.error('Error in confirmPlan:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm plan',
    }
  }
}

/** Reopen a CONFIRMED plan for editing (back to DRAFT). */
export async function reopenPlan(planId: string): Promise<PlanActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const plan = await prisma.monthlyPlan.findFirst({
      where: { id: planId, userId: session.user.id },
      select: { id: true, status: true },
    })
    if (!plan) return { success: false, error: 'Plan not found or access denied' }
    if (plan.status === 'CLOSED') return { success: false, error: 'This month is already closed' }
    await prisma.monthlyPlan.update({ where: { id: planId }, data: { status: 'DRAFT', confirmedAt: null } })
    revalidatePath('/plan')
    return { success: true }
  } catch (error) {
    console.error('Error in reopenPlan:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reopen plan' }
  }
}

// --- live view ---------------------------------------------------------------

/** Recompute the deficit for a draft from its allocations vs the forecast. */
function deficitFromAllocations(
  allocations: SerializedAllocation[],
  forecastIncome: number
): DeficitInfo | null {
  const nonFree = allocations.filter((a) => a.kind !== 'FREE')
  let running = 0
  let failedAt: SerializedAllocation | null = null
  for (const a of nonFree) {
    running = roundMoney(running + a.planned)
    if (!failedAt && running > forecastIncome) failedAt = a
  }
  if (!failedAt) return null
  return {
    shortfall: roundMoney(running - forecastIncome),
    failedAtKind: failedAt.kind,
    failedAtLabel: failedAt.label,
    options: [],
  }
}

async function buildPlanView(
  userId: string,
  planId: string,
  now: Date
): Promise<PlanView> {
  const plan = await prisma.monthlyPlan.findFirstOrThrow({
    where: { id: planId, userId },
    include: { allocations: true },
  })
  const serPlan = serializePlan(plan)
  const allocations = plan.allocations.map(serializeAllocation)
  const monthStart = monthStartOf(plan.month)
  const monthEnd = endOfMonth(monthStart)

  // Days remaining in the month (from now, clamped to the plan's month)
  const daysLeft =
    now < monthStart
      ? getDaysInMonth(monthStart)
      : now > monthEnd
        ? 0
        : Math.max(1, differenceInCalendarDays(monthEnd, now) + 1)

  const context = await getCurrencyContext(userId)
  const actuals = await gatherMonthActuals(userId, monthStart, monthEnd, context)

  const variablePlanned = allocations
    .filter((a) => a.kind === 'VARIABLE')
    .reduce((s, a) => s + a.planned, 0)
  const flexibleBudget = roundMoney(serPlan.safeToSpend + variablePlanned)
  const spentFree = actuals.discretionarySpent
  const remainingSafe = Math.max(0, roundMoney(flexibleBudget - spentFree))
  const safeToSpendDay = daysLeft > 0 ? Math.floor((remainingSafe / daysLeft) * 100) / 100 : remainingSafe

  const live =
    serPlan.status === 'CONFIRMED'
      ? allocations.map((a) => ({ allocation: a, actual: actualForAllocation(a, actuals) }))
      : null

  const deficit =
    serPlan.status === 'DRAFT'
      ? deficitFromAllocations(allocations, serPlan.forecastIncome)
      : null

  // Windfall proposal (CONFIRMED plans with income above forecast)
  let windfall: WindfallProposal | null = null
  if (serPlan.status === 'CONFIRMED') {
    windfall = await computeWindfallProposal(userId, serPlan, actuals.incomeTotal)
  }

  return {
    plan: serPlan,
    allocations,
    live,
    deficit,
    safeToSpendMonth: remainingSafe,
    safeToSpendDay,
    spentFree,
    daysLeft,
    windfall,
    defaultCurrency: context.defaultCurrency,
  }
}

/** The active (current-month) plan with live facts, or null if none exists. */
export async function getActivePlan(
  month?: string
): Promise<PlanActionResult<PlanView | null>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id
    const now = new Date()
    const targetMonth = month ?? toMonthKey(now)

    const plan = await prisma.monthlyPlan.findUnique({
      where: { userId_month: { userId, month: targetMonth } },
      select: { id: true },
    })
    if (!plan) return { success: true, data: null }

    return { success: true, data: await buildPlanView(userId, plan.id, now) }
  } catch (error) {
    console.error('Error in getActivePlan:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load plan' }
  }
}

// --- windfall ----------------------------------------------------------------

async function computeWindfallProposal(
  userId: string,
  plan: SerializedPlan,
  actualIncome: number
): Promise<WindfallProposal | null> {
  const excess = roundMoney(actualIncome - plan.forecastIncome)
  if (excess <= 0) return null
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { windfallDebtPct: true, windfallGoalsPct: true, windfallFreePct: true },
  })
  const pcts = {
    debt: pref?.windfallDebtPct ?? 50,
    goals: pref?.windfallGoalsPct ?? 30,
    free: pref?.windfallFreePct ?? 20,
  }
  const split = splitWindfall(excess, pcts)
  return { excess, toDebt: split.toDebt, toGoals: split.toGoals, toFree: split.toFree }
}

/**
 * Apply a windfall split (ს2): bump FREE by toFree, the first debt allocation by
 * toDebt and the reserve/first goal by toGoals. actualIncome is snapshotted.
 */
export async function applyWindfall(
  planId: string,
  split: { toDebt: number; toGoals: number; toFree: number }
): Promise<PlanActionResult<PlanView>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id

    const plan = await prisma.monthlyPlan.findFirst({
      where: { id: planId, userId },
      include: { allocations: true },
    })
    if (!plan) return { success: false, error: 'Plan not found or access denied' }
    if (plan.status !== 'CONFIRMED') {
      return { success: false, error: 'Only a confirmed plan can take a windfall' }
    }

    const toDebt = roundMoney(Math.max(0, split.toDebt))
    const toGoals = roundMoney(Math.max(0, split.toGoals))
    const toFree = roundMoney(Math.max(0, split.toFree))

    const firstDebt = plan.allocations.find((a) => a.kind === 'DEBT')
    const reserveOrGoal =
      plan.allocations.find((a) => a.kind === 'RESERVE') ??
      plan.allocations.find((a) => a.kind === 'GOAL')
    const free = plan.allocations.find((a) => a.kind === 'FREE')

    const context = await getCurrencyContext(userId)
    const monthStart = monthStartOf(plan.month)
    const actuals = await gatherMonthActuals(userId, monthStart, endOfMonth(monthStart), context)

    await prisma.$transaction(async (tx) => {
      if (toDebt > 0 && firstDebt) {
        await tx.planAllocation.update({
          where: { id: firstDebt.id },
          data: { planned: roundMoney(Number(firstDebt.planned) + toDebt) },
        })
      }
      if (toGoals > 0 && reserveOrGoal) {
        await tx.planAllocation.update({
          where: { id: reserveOrGoal.id },
          data: { planned: roundMoney(Number(reserveOrGoal.planned) + toGoals) },
        })
      }
      if (free) {
        await tx.planAllocation.update({
          where: { id: free.id },
          data: { planned: roundMoney(Number(free.planned) + toFree) },
        })
      }
      await tx.monthlyPlan.update({
        where: { id: planId },
        data: {
          actualIncome: actuals.incomeTotal,
          safeToSpend: roundMoney(Number(plan.safeToSpend) + toFree),
        },
      })
    })

    revalidatePath('/plan')
    revalidatePath('/dashboard')

    return { success: true, data: await buildPlanView(userId, planId, new Date()) }
  } catch (error) {
    console.error('Error in applyWindfall:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to apply windfall' }
  }
}

// --- month close -------------------------------------------------------------

function buildCloseLines(
  allocations: SerializedAllocation[],
  actuals: MonthActuals
) {
  return allocations.map((a) => {
    const actual = actualForAllocation(a, actuals)
    return {
      kind: a.kind,
      label: a.label,
      refId: a.refId,
      planned: a.planned,
      actual,
      deltaPct: deltaPct(a.planned, actual),
    }
  })
}

/** Close preview: plan vs actual, proposed conclusions, verdict — no writes. */
export async function getClosePreview(
  planId: string
): Promise<PlanActionResult<ClosePreview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id

    const plan = await prisma.monthlyPlan.findFirst({
      where: { id: planId, userId },
      include: { allocations: true },
    })
    if (!plan) return { success: false, error: 'Plan not found or access denied' }

    const serPlan = serializePlan(plan)
    const allocations = plan.allocations.map(serializeAllocation)
    const monthStart = monthStartOf(plan.month)
    const context = await getCurrencyContext(userId)
    const actuals = await gatherMonthActuals(userId, monthStart, endOfMonth(monthStart), context)

    const lines = buildCloseLines(allocations, actuals)
    const completionPct = computeCompletionPct(
      lines.map((l) => ({ kind: l.kind, refId: l.refId, label: l.label, planned: l.planned, actual: l.actual }))
    )
    const verdict = calcVerdict({
      debtPrincipalPaid: actuals.debtPrincipalPaidTotal,
      reserveNet: actuals.reserveNet,
      goalsNet: actuals.goalsNet,
      newDebtPrincipal: actuals.newDebtPrincipal,
    })
    const plannedNetChange = computePlannedNetChange(allocations)
    const proposed = proposeConclusions(
      lines.filter((l) => l.kind === 'VARIABLE').map((l) => ({ refId: l.refId, label: l.label, planned: l.planned, actual: l.actual }))
    )

    return {
      success: true,
      data: {
        plan: serPlan,
        lines,
        proposedConclusions: proposed,
        verdict: { kind: verdict.verdict, netChange: verdict.netChange, components: verdict.components },
        plannedNetChange,
        completionPct,
        defaultCurrency: context.defaultCurrency,
      },
    }
  } catch (error) {
    console.error('Error in getClosePreview:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to preview close' }
  }
}

/** What the plan intended to move the net position by (debt+reserve+goal plans). */
function computePlannedNetChange(allocations: SerializedAllocation[]): number {
  return roundMoney(
    allocations
      .filter((a) => a.kind === 'DEBT' || a.kind === 'RESERVE' || a.kind === 'GOAL')
      .reduce((s, a) => s + a.planned, 0)
  )
}

/**
 * Close the month (ს4): compute actuals from the ledger, the completion %, the
 * honest verdict and net change, persist MonthClose + allocation actuals + set
 * status CLOSED — atomically. Re-closing a closed month is rejected.
 */
export async function closeMonth(
  planId: string,
  decision: CloseDecision = { conclusions: [] }
): Promise<PlanActionResult<ClosePreview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id

    const plan = await prisma.monthlyPlan.findFirst({
      where: { id: planId, userId },
      include: { allocations: true, close: true },
    })
    if (!plan) return { success: false, error: 'Plan not found or access denied' }
    if (plan.status === 'CLOSED' || plan.close) {
      return { success: false, error: 'This month is already closed' }
    }

    const allocations = plan.allocations.map(serializeAllocation)
    const monthStart = monthStartOf(plan.month)
    const context = await getCurrencyContext(userId)
    const actuals = await gatherMonthActuals(userId, monthStart, endOfMonth(monthStart), context)

    const lines = buildCloseLines(allocations, actuals)
    const completionPct = computeCompletionPct(
      lines.map((l) => ({ kind: l.kind, refId: l.refId, label: l.label, planned: l.planned, actual: l.actual }))
    )
    const verdict = calcVerdict({
      debtPrincipalPaid: actuals.debtPrincipalPaidTotal,
      reserveNet: actuals.reserveNet,
      goalsNet: actuals.goalsNet,
      newDebtPrincipal: actuals.newDebtPrincipal,
    })
    const plannedNetChange = computePlannedNetChange(allocations)
    const withdrawals = roundMoney(
      Math.min(0, actuals.reserveNet) + Math.min(0, actuals.goalsNet)
    )

    const acceptedConclusions: PlanConclusion[] = decision.conclusions ?? []

    await prisma.$transaction(async (tx) => {
      for (const a of plan.allocations) {
        const actual = actualForAllocation(serializeAllocation(a), actuals)
        await tx.planAllocation.update({ where: { id: a.id }, data: { actual } })
      }
      await tx.monthClose.create({
        data: {
          planId,
          completionPct,
          verdict: verdict.verdict,
          netChange: verdict.netChange,
          plannedNetChange,
          debtPrincipalDelta: actuals.debtPrincipalPaidTotal,
          reserveDelta: actuals.reserveNet,
          goalsDelta: actuals.goalsNet,
          newDebt: actuals.newDebtPrincipal,
          withdrawals,
          conclusions: acceptedConclusions as unknown as object,
        },
      })
      await tx.monthlyPlan.update({
        where: { id: planId },
        data: { status: 'CLOSED', actualIncome: actuals.incomeTotal },
      })
    })

    revalidatePath('/plan')
    revalidatePath('/dashboard')

    return {
      success: true,
      data: {
        plan: serializePlan(plan),
        lines,
        proposedConclusions: acceptedConclusions,
        verdict: { kind: verdict.verdict, netChange: verdict.netChange, components: verdict.components },
        plannedNetChange,
        completionPct,
        defaultCurrency: context.defaultCurrency,
      },
    }
  } catch (error) {
    console.error('Error in closeMonth:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close month' }
  }
}

// --- stability + dashboard ---------------------------------------------------

/**
 * The stability path: current stage, main-goal cards (debt-free + 3-month
 * reserve), net position and its 6-month trend, and the verdict history.
 */
export async function getStabilityProgress(): Promise<
  PlanActionResult<StabilityProgress>
> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id
    const now = new Date()

    const data = await computeStabilityProgress(userId, now)
    return { success: true, data }
  } catch (error) {
    console.error('Error in getStabilityProgress:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load progress' }
  }
}

async function computeStabilityProgress(
  userId: string,
  now: Date
): Promise<StabilityProgress> {
  const context = await getCurrencyContext(userId)
  const toDefault = (amount: number, currency: string) =>
    convertCurrency(amount, currency as Currency, context.defaultCurrency, context.usdRate, context.eurRate)

  const [goals, debts, closes] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      include: { contributions: { select: { amount: true } } },
    }),
    prisma.debt.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { schedule: { select: { paid: true, principalPart: true, remainingPrincipal: true, seq: true } } },
    }),
    prisma.monthClose.findMany({
      where: { plan: { userId } },
      include: { plan: { select: { month: true } } },
      orderBy: { plan: { month: 'asc' } },
    }),
  ])

  // Reserve + goal savings
  const reserveGoal = goals.find((g) => g.isEmergencyFund)
  const reserveSaved = reserveGoal
    ? roundMoney(reserveGoal.contributions.reduce((s, c) => s + toDefault(Number(c.amount), reserveGoal.currency), 0))
    : 0
  const goalSavings = roundMoney(
    goals
      .filter((g) => !g.isEmergencyFund)
      .reduce((s, g) => s + g.contributions.reduce((cs, c) => cs + toDefault(Number(c.amount), g.currency), 0), 0)
  )

  const oneMonthTarget = reserveGoal
    ? roundMoney(toDefault(Number(reserveGoal.targetAmount), reserveGoal.currency) / (reserveGoal.reserveStage === 3 ? 3 : 1))
    : 0
  const threeMonthTarget = roundMoney(oneMonthTarget * 3)

  // Debt totals + pace
  const debtInputs = debts.map((d) => {
    const paidPrincipal = d.schedule.filter((s) => s.paid).reduce((s, r) => s + toDefault(Number(r.principalPart), d.currency), 0)
    const remaining = d.schedule.length
      ? toDefault(Number(d.schedule[d.schedule.length - 1].remainingPrincipal), d.currency)
      : toDefault(Number(d.principal), d.currency)
    const paidCount = d.schedule.filter((s) => s.paid).length
    const monthlyPrincipalAvg = paidCount > 0 ? paidPrincipal / paidCount : 0
    return {
      originalPrincipal: toDefault(Number(d.principal), d.currency),
      remainingPrincipal: Math.max(0, roundMoney(remaining)),
      monthlyPrincipalAvg,
    }
  })
  const totalDebtPrincipal = roundMoney(debtInputs.reduce((s, d) => s + d.remainingPrincipal, 0))

  const stage = currentStabilityStage(
    { saved: reserveSaved, oneMonthTarget, threeMonthTarget },
    totalDebtPrincipal
  )
  const debtFree = debtFreeProjection(debtInputs, now)
  const currentNet = netPosition(reserveSaved, goalSavings, totalDebtPrincipal)

  // Net-position trend anchored to the current net, reconstructed backward from
  // the last N closes' netChange (approximation for months without a close).
  const recentCloses = closes.slice(-TREND_MONTHS)
  const trend: { month: string; net: number }[] = []
  let running = currentNet
  for (let i = recentCloses.length - 1; i >= 0; i--) {
    trend[i] = { month: recentCloses[i].plan.month, net: roundMoney(running) }
    running = roundMoney(running - Number(recentCloses[i].netChange))
  }
  if (trend.length === 0) trend.push({ month: toMonthKey(now), net: currentNet })

  const verdictHistory = recentCloses.map((c) => ({
    month: c.plan.month,
    verdict: c.verdict as StabilityProgress['verdictHistory'][number]['verdict'],
    netChange: Number(c.netChange),
  }))

  const reserveProgress = {
    paidOrSavedPct: threeMonthTarget > 0 ? Math.min(100, roundMoney((reserveSaved / threeMonthTarget) * 100)) : 0,
    remaining: Math.max(0, roundMoney(threeMonthTarget - reserveSaved)),
    projectedDate: null as Date | null,
  }

  return {
    stage,
    reserve: { saved: reserveSaved, oneMonthTarget, threeMonthTarget },
    debtFree: { paidOrSavedPct: debtFree.paidPct, remaining: debtFree.remaining, projectedDate: debtFree.projectedDate },
    reserveProgress,
    netPosition: currentNet,
    netPositionTrend: trend,
    verdictHistory,
    defaultCurrency: context.defaultCurrency,
  }
}

/** The whole dashboard view model (§6.1) in one call. */
export async function getDashboardData(): Promise<PlanActionResult<DashboardData>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const userId = session.user.id
    const now = new Date()
    const month = toMonthKey(now)

    const context = await getCurrencyContext(userId)
    const stability = await computeStabilityProgress(userId, now)

    const planRow = await prisma.monthlyPlan.findUnique({
      where: { userId_month: { userId, month } },
      select: { id: true },
    })
    const planView = planRow ? await buildPlanView(userId, planRow.id, now) : null

    let liveVerdict: DashboardData['liveVerdict'] = null
    let completionPct: number | null = null
    if (planView && planView.plan.status !== 'DRAFT') {
      const monthStart = monthStartOf(month)
      const actuals = await gatherMonthActuals(userId, monthStart, endOfMonth(monthStart), context)
      const v = calcVerdict({
        debtPrincipalPaid: actuals.debtPrincipalPaidTotal,
        reserveNet: actuals.reserveNet,
        goalsNet: actuals.goalsNet,
        newDebtPrincipal: actuals.newDebtPrincipal,
      })
      liveVerdict = { kind: v.verdict, netChange: v.netChange, components: v.components }
      completionPct = computeCompletionPct(
        planView.allocations.map((a) => ({
          kind: a.kind,
          refId: a.refId,
          label: a.label,
          planned: a.planned,
          actual: actualForAllocation(a, actuals),
        }))
      )
    }

    // Debts summary (remaining principal + next installment)
    const [debts, otherGoals] = await Promise.all([
      prisma.debt.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { schedule: { orderBy: { seq: 'asc' } } },
      }),
      prisma.goal.findMany({
        where: { userId, status: 'ACTIVE', isEmergencyFund: false },
        include: { contributions: { select: { amount: true } } },
        orderBy: { priority: 'asc' },
      }),
    ])

    const toDefault = (amount: number, currency: string) =>
      convertCurrency(amount, currency as Currency, context.defaultCurrency, context.usdRate, context.eurRate)

    let nextPayment: DashboardData['debts']['nextPayment'] = null
    for (const d of debts) {
      const nextUnpaid = d.schedule.find((s) => !s.paid)
      if (!nextUnpaid) continue
      if (!nextPayment || nextUnpaid.dueDate < nextPayment.dueDate) {
        nextPayment = {
          debtId: d.id,
          debtName: d.name,
          dueDate: nextUnpaid.dueDate,
          amount: Number(nextUnpaid.payment),
          currency: d.currency,
        }
      }
    }

    const otherGoalCards = otherGoals.map((g) => {
      const saved = g.contributions.reduce((s, c) => s + Number(c.amount), 0)
      const target = Number(g.targetAmount)
      const percent = target > 0 ? Math.min(100, roundMoney((saved / target) * 100)) : 0
      return { goalId: g.id, name: g.name, percent, status: g.status as string }
    })

    return {
      success: true,
      data: {
        hasPlan: planView !== null,
        currentMonth: month,
        safeToSpendMonth: planView?.safeToSpendMonth ?? 0,
        safeToSpendDay: planView?.safeToSpendDay ?? 0,
        spentFree: planView?.spentFree ?? 0,
        daysLeft: planView?.daysLeft ?? getDaysInMonth(now),
        planStatus: planView?.plan.status ?? null,
        completionPct,
        liveVerdict,
        stability,
        debts: {
          totalRemainingPrincipal: roundMoney(
            debts.reduce((s, d) => {
              const rem = d.schedule.length ? Number(d.schedule[d.schedule.length - 1].remainingPrincipal) : Number(d.principal)
              return s + toDefault(rem, d.currency)
            }, 0)
          ),
          nextPayment,
        },
        otherGoals: otherGoalCards,
        defaultCurrency: context.defaultCurrency,
      },
    }
  } catch (error) {
    console.error('Error in getDashboardData:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load dashboard' }
  }
}
