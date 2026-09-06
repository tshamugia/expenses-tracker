/**
 * Month-actuals aggregation & serialization (Phase 4 / 4b).
 *
 * Shared money-math extracted from the plan Server Actions so it can be reused
 * without an auth session — notably by the cron auto-close (a `'use server'`
 * file may only export async functions, so these helpers cannot live there).
 *
 * Nothing here deals with auth; callers pass an already-resolved userId and a
 * CurrencyContext. Pure-ish: the only side effect is reading the ledger.
 */

import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import { deltaPct } from '@/lib/services/month-close'
import type { CurrencyContext } from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type { MonthlyPlan, PlanAllocation } from '@prisma/client'
import type {
  SerializedAllocation,
  SerializedPlan,
  SetAsideLine,
  SetAsidePlan,
} from '@/types/plan-types'

// --- serialization -----------------------------------------------------------

export function serializePlan(plan: MonthlyPlan): SerializedPlan {
  // Callers often fetch the plan with its relations included (`allocations`,
  // `close`). Strip them before spreading so their raw Decimal fields never ride
  // along into a Client Component — those relations are serialized separately.
  const {
    allocations: _allocations,
    close: _close,
    user: _user,
    ...rest
  } = plan as MonthlyPlan & {
    allocations?: unknown
    close?: unknown
    user?: unknown
  }
  return {
    ...rest,
    forecastIncome: Number(plan.forecastIncome),
    forecastStable: Number(plan.forecastStable),
    forecastVariable: Number(plan.forecastVariable),
    actualIncome: plan.actualIncome === null ? null : Number(plan.actualIncome),
    safeToSpend: Number(plan.safeToSpend),
  }
}

export function serializeAllocation(a: PlanAllocation): SerializedAllocation {
  return {
    ...a,
    planned: Number(a.planned),
    actual: a.actual === null ? null : Number(a.actual),
  }
}

// --- month actuals (shared by live view + close) -----------------------------

export interface MonthActuals {
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
export async function gatherMonthActuals(
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
export function actualForAllocation(a: SerializedAllocation, actuals: MonthActuals): number {
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

// --- close-line & set-aside builders -----------------------------------------

export function buildCloseLines(
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

/** What the plan intended to move the net position by (debt+reserve+goal plans). */
export function computePlannedNetChange(allocations: SerializedAllocation[]): number {
  return roundMoney(
    allocations
      .filter((a) => a.kind === 'DEBT' || a.kind === 'RESERVE' || a.kind === 'GOAL')
      .reduce((s, a) => s + a.planned, 0)
  )
}

/**
 * The goal-driven set-aside summary (Phase 4b): X (reserve + goals) vs what was
 * actually set aside this month, plus per-goal lines and feasibility against the
 * money left after obligations.
 */
export function buildSetAside(
  allocations: SerializedAllocation[],
  plan: SerializedPlan,
  actuals: MonthActuals
): SetAsidePlan {
  const setAsideAllocs = allocations.filter(
    (a) => a.kind === 'RESERVE' || a.kind === 'GOAL'
  )
  const requiredSetAside = roundMoney(
    setAsideAllocs.reduce((s, a) => s + a.planned, 0)
  )
  const actualSetAside = roundMoney(actuals.reserveNet + actuals.goalsNet)
  const obligations = roundMoney(
    allocations
      .filter((a) => a.kind === 'MANDATORY' || a.kind === 'DEBT')
      .reduce((s, a) => s + a.planned, 0)
  )
  const availableForGoals = roundMoney(plan.forecastIncome - obligations)
  const shortfall = Math.max(0, roundMoney(requiredSetAside - availableForGoals))
  const lines: SetAsideLine[] = setAsideAllocs.map((a) => {
    const saved = roundMoney(a.refId ? actuals.contribByGoal.get(a.refId) ?? 0 : 0)
    return {
      refId: a.refId,
      label: a.label,
      kind: a.kind as 'RESERVE' | 'GOAL',
      required: a.planned,
      saved,
      achieved: saved + 1e-6 >= a.planned,
    }
  })
  return {
    requiredSetAside,
    actualSetAside,
    achieved: actualSetAside + 1e-6 >= requiredSetAside,
    obligations,
    availableForGoals,
    feasible: requiredSetAside <= availableForGoals + 1e-9,
    shortfall,
    lines,
  }
}
