/**
 * Month-close core (Phase 4 §7.6 / R4, Phase 4b achievement).
 *
 * Session-free close logic shared by the `closeMonth` Server Action (interactive
 * ritual) and the monthly cron auto-close. Computes actuals → completion % →
 * honest verdict → goal-driven achievement, then persists MonthClose +
 * allocation actuals + status CLOSED atomically. Re-closing a closed month is
 * rejected. Callers pass an already-resolved userId; there is no auth here.
 */

import { endOfMonth } from 'date-fns'
import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import { calcVerdict } from '@/lib/services/verdict'
import { computeCompletionPct } from '@/lib/services/month-close'
import {
  actualForAllocation,
  buildCloseLines,
  buildSetAside,
  computePlannedNetChange,
  gatherMonthActuals,
  serializeAllocation,
  serializePlan,
} from '@/lib/services/month-actuals'
import { monthStartOf } from '@/lib/services/plan-input'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import type {
  ClosePreview,
  CloseDecision,
  PlanConclusion,
} from '@/types/plan-types'

export type CloseResult =
  | { ok: true; data: ClosePreview }
  | { ok: false; error: string }

/**
 * Close one plan for a user (no auth). Returns the close preview data on
 * success, or an error string if the plan is missing / already closed.
 */
export async function closePlanForUser(
  userId: string,
  planId: string,
  decision: CloseDecision = { conclusions: [] }
): Promise<CloseResult> {
  const plan = await prisma.monthlyPlan.findFirst({
    where: { id: planId, userId },
    include: { allocations: true, close: true },
  })
  if (!plan) return { ok: false, error: 'Plan not found or access denied' }
  if (plan.status === 'CLOSED' || plan.close) {
    return { ok: false, error: 'This month is already closed' }
  }

  const serPlan = serializePlan(plan)
  const allocations = plan.allocations.map(serializeAllocation)
  const monthStart = monthStartOf(plan.month)
  const context = await getCurrencyContext(userId)
  const actuals = await gatherMonthActuals(
    userId,
    monthStart,
    endOfMonth(monthStart),
    context
  )

  const lines = buildCloseLines(allocations, actuals)
  const completionPct = computeCompletionPct(
    lines.map((l) => ({
      kind: l.kind,
      refId: l.refId,
      label: l.label,
      planned: l.planned,
      actual: l.actual,
    }))
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
  const setAside = buildSetAside(allocations, serPlan, actuals)

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
        requiredSetAside: setAside.requiredSetAside,
        actualSetAside: setAside.actualSetAside,
        achieved: setAside.achieved,
        conclusions: acceptedConclusions as unknown as object,
      },
    })
    await tx.monthlyPlan.update({
      where: { id: planId },
      data: { status: 'CLOSED', actualIncome: actuals.incomeTotal },
    })
  })

  return {
    ok: true,
    data: {
      plan: serPlan,
      lines,
      proposedConclusions: acceptedConclusions,
      verdict: {
        kind: verdict.verdict,
        netChange: verdict.netChange,
        components: verdict.components,
      },
      plannedNetChange,
      completionPct,
      requiredSetAside: setAside.requiredSetAside,
      actualSetAside: setAside.actualSetAside,
      achieved: setAside.achieved,
      defaultCurrency: context.defaultCurrency,
    },
  }
}
