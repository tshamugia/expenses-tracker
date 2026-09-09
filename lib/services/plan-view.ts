/**
 * Plan / dashboard view-model builders (Phase 4 §6).
 * DATA-ACCESS + ASSEMBLY LAYER — userId-first, no session, no revalidation.
 * Shared by the Server Actions in lib/actions/plan-actions.ts and by the MCP
 * server (lib/services/mcp-data.ts), so both surfaces show the same numbers.
 * The money math itself lives in the pure engines (plan-engine, verdict,
 * stability, month-actuals); this module only gathers and assembles.
 */

import {
  differenceInCalendarDays,
  endOfMonth,
  getDaysInMonth,
} from 'date-fns'
import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import type { DeficitInfo } from '@/lib/services/plan-engine'
import { calcVerdict } from '@/lib/services/verdict'
import { computeCompletionPct } from '@/lib/services/month-close'
import {
  actualForAllocation,
  buildSetAside,
  gatherMonthActuals,
  serializeAllocation,
  serializePlan,
} from '@/lib/services/month-actuals'
import {
  currentStabilityStage,
  debtFreeProjection,
  netPosition,
} from '@/lib/services/stability'
import { splitWindfall } from '@/lib/services/windfall'
import { monthStartOf, toMonthKey } from '@/lib/services/plan-input'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import { convertCurrency, type Currency } from '@/lib/utils/currency-conversion'
import type {
  DashboardData,
  PlanView,
  SerializedAllocation,
  SerializedPlan,
  StabilityProgress,
  WindfallProposal,
} from '@/types/plan-types'

const TREND_MONTHS = 6

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

export async function buildPlanView(
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

  const setAside = buildSetAside(allocations, serPlan, actuals)

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
    setAside,
    defaultCurrency: context.defaultCurrency,
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

// --- stability + dashboard ---------------------------------------------------

/**
 * The stability path: current stage, main-goal cards (debt-free + 3-month
 * reserve), net position and its 6-month trend, and the verdict history.
 */
export async function computeStabilityProgress(
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

/** The whole dashboard view model (§6.1) for one user, as of `now`. */
export async function buildDashboardData(userId: string, now: Date): Promise<DashboardData> {
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
    hasPlan: planView !== null,
    currentMonth: month,
    safeToSpendMonth: planView?.safeToSpendMonth ?? 0,
    safeToSpendDay: planView?.safeToSpendDay ?? 0,
    spentFree: planView?.spentFree ?? 0,
    daysLeft: planView?.daysLeft ?? getDaysInMonth(now),
    planStatus: planView?.plan.status ?? null,
    completionPct,
    requiredSetAside: planView?.setAside.requiredSetAside ?? 0,
    actualSetAside: planView?.setAside.actualSetAside ?? 0,
    achieved: planView?.setAside.achieved ?? false,
    feasible: planView?.setAside.feasible ?? true,
    shortfall: planView?.setAside.shortfall ?? 0,
    liveVerdict,
    windfall: planView?.windfall ?? null,
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
  }
}
