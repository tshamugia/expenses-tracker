/**
 * Plan-input gatherer (Phase 4). Server-side glue: assembles everything the pure
 * `generatePlan` waterfall needs for one user and month — forecast, mandatory
 * obligations, variable targets, debt installments, reserve, goals and the prior
 * month's conclusions. Not a Server Action; imported by plan-actions and cron.
 */

import { endOfMonth, getDaysInMonth, startOfMonth, subMonths } from 'date-fns'
import prisma from '@/lib/db/prisma'
import { computeIncomeForecastForUser } from '@/lib/services/income-forecast-service'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import { roundMoney } from '@/lib/services/amortization'
import type { Conclusion, PlanInput } from '@/lib/services/plan-engine'
import type { PlanConclusion } from '@/types/plan-types'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'

/** First calendar day of a "YYYY-MM" month string. */
export function monthStartOf(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/** Format a Date as "YYYY-MM". */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export interface GatheredPlanInput {
  input: PlanInput
  currency: string
  month: string
  monthStart: Date
  monthEnd: Date
}

/**
 * Gather the full plan input for `month`. Category targets use the soft monthly
 * limit when set, else the 3-month average spend. Debt installments are the rows
 * scheduled to fall due in the month. Prior conclusions come from the previous
 * month's close.
 */
export async function gatherPlanInput(
  userId: string,
  month: string
): Promise<GatheredPlanInput> {
  const monthStart = monthStartOf(month)
  const monthEnd = endOfMonth(monthStart)
  const daysInMonth = getDaysInMonth(monthStart)

  const context = await getCurrencyContext(userId)
  const toDefault = (amount: number, currency: string) =>
    convertCurrency(
      amount,
      currency as Currency,
      context.defaultCurrency,
      context.usdRate,
      context.eurRate
    )

  // 3-month average spend per category (completed months before `monthStart`)
  const windowStart = startOfMonth(subMonths(monthStart, 3))
  const windowEnd = endOfMonth(subMonths(monthStart, 1))

  const [
    { forecast },
    recurringExpenses,
    categories,
    priorSpend,
    debtItems,
    goals,
  ] = await Promise.all([
    computeIncomeForecastForUser(userId, monthStart, context),
    prisma.expense.findMany({
      where: { userId, isRecurring: true },
      select: { id: true, title: true, amount: true, currency: true },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, categoryName: true, kind: true, monthlyLimit: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { not: null },
        date: { gte: windowStart, lte: windowEnd },
      },
      select: { categoryId: true, amount: true, currency: true },
    }),
    prisma.debtScheduleItem.findMany({
      where: {
        debt: { userId, status: 'ACTIVE' },
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        payment: true,
        debtId: true,
        debt: { select: { name: true, currency: true } },
      },
    }),
    prisma.goal.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { contributions: { select: { amount: true } } },
    }),
  ])

  // Average monthly spend per category over the 3-month window
  const spend3mo = new Map<string, number>()
  for (const t of priorSpend) {
    if (!t.categoryId) continue
    spend3mo.set(
      t.categoryId,
      (spend3mo.get(t.categoryId) ?? 0) + toDefault(Number(t.amount), t.currency)
    )
  }
  const categoryTarget = (id: string, limit: number | null): number => {
    if (limit !== null && limit > 0) return roundMoney(limit)
    return roundMoney((spend3mo.get(id) ?? 0) / 3)
  }

  // MANDATORY — recurring expenses (refId = expenseId) + FIXED categories
  const mandatoryFixed: PlanInput['mandatoryFixed'] = []
  for (const e of recurringExpenses) {
    mandatoryFixed.push({
      label: e.title,
      amount: toDefault(Number(e.amount), e.currency),
      refId: e.id,
    })
  }
  for (const c of categories) {
    if (c.kind !== 'FIXED') continue
    const amount = categoryTarget(c.id, c.monthlyLimit === null ? null : Number(c.monthlyLimit))
    if (amount <= 0) continue
    mandatoryFixed.push({ label: c.categoryName, amount, refId: c.id })
  }

  // VARIABLE — variable-category targets
  const variableTargets: PlanInput['variableTargets'] = []
  for (const c of categories) {
    if (c.kind === 'FIXED') continue
    const amount = categoryTarget(c.id, c.monthlyLimit === null ? null : Number(c.monthlyLimit))
    if (amount <= 0) continue
    variableTargets.push({ categoryId: c.id, label: c.categoryName, amount })
  }

  // DEBT — installments scheduled to fall due this month
  const debtInstallments: PlanInput['debtInstallments'] = debtItems.map((it) => ({
    debtId: it.debtId,
    label: it.debt.name,
    amount: toDefault(Number(it.payment), it.debt.currency),
  }))

  // RESERVE + GOALS
  let reserve: PlanInput['reserve'] = null
  const planGoals: PlanInput['goals'] = []
  for (const g of goals) {
    const saved = roundMoney(g.contributions.reduce((s, c) => s + Number(c.amount), 0))
    const target = Number(g.targetAmount)
    const remaining = Math.max(0, roundMoney(target - saved))
    const monthlyContribution = g.monthlyContribution === null ? 0 : Number(g.monthlyContribution)
    if (g.isEmergencyFund) {
      reserve = {
        goalId: g.id,
        label: g.name,
        monthlyContribution,
        remaining,
      }
    } else {
      planGoals.push({
        goalId: g.id,
        label: g.name,
        monthlyContribution,
        remaining,
        priority: g.priority,
      })
    }
  }

  // Conclusions from the previous month's close
  const prevMonth = toMonthKey(subMonths(monthStart, 1))
  const prevPlan = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month: prevMonth } },
    include: { close: true },
  })
  const conclusions: Conclusion[] = []
  if (prevPlan?.close?.conclusions) {
    const raw = prevPlan.close.conclusions as unknown as PlanConclusion[]
    for (const c of Array.isArray(raw) ? raw : []) {
      if (c.type === 'raise_limit') {
        conclusions.push({ type: 'raise_limit', categoryId: c.categoryId, delta: c.delta, note: c.note })
      }
    }
  }

  return {
    input: {
      forecast,
      mandatoryFixed,
      variableTargets,
      debtInstallments,
      reserve,
      goals: planGoals,
      conclusions,
      daysInMonth,
    },
    currency: context.defaultCurrency,
    month,
    monthStart,
    monthEnd,
  }
}
