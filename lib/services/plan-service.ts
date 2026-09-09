/**
 * Monthly plan — userId-first orchestration (no session, no revalidation).
 * Shared by the plan Server Actions and the MCP tools. The money math lives in
 * the pure engines (plan-engine, verdict, stability, month-close); generation
 * in plan-generation, closing in plan-close.
 */

import { endOfMonth } from 'date-fns'
import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import { computeCompletionPct, proposeConclusions } from '@/lib/services/month-close'
import {
  buildCloseLines,
  buildSetAside,
  computePlannedNetChange,
  gatherMonthActuals,
  serializeAllocation,
  serializePlan,
} from '@/lib/services/month-actuals'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { generatePlanForUser } from '@/lib/services/plan-generation'
import { monthStartOf, toMonthKey } from '@/lib/services/plan-input'
import { buildPlanView } from '@/lib/services/plan-view'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import { calcVerdict } from '@/lib/services/verdict'
import type { ClosePreview, ConfirmAdjustment, PlanView } from '@/types/plan-types'

/**
 * (Re)generate a month's plan from the goals/income (Phase 4b). A CLOSED month
 * is protected and reported as an error.
 */
export async function regeneratePlanForUser(
  userId: string,
  month?: string,
  now: Date = new Date()
): Promise<Outcome<PlanView>> {
  const targetMonth = month ?? toMonthKey(now)
  const gen = await generatePlanForUser(userId, targetMonth, now)
  if (gen.skipped || !gen.planId) {
    return fail('This month is already closed — it can no longer be regenerated')
  }
  return ok(await buildPlanView(userId, gen.planId, now))
}

/**
 * Confirm a DRAFT plan into the active plan, applying the user's adjustments
 * (deficit resolution / inline edits). FREE is recomputed from the forecast so
 * Safe to spend stays exact.
 */
export async function confirmPlanForUser(
  userId: string,
  planId: string,
  adjustments: ConfirmAdjustment[] = [],
  now: Date = new Date()
): Promise<Outcome<PlanView>> {
  const plan = await prisma.monthlyPlan.findFirst({
    where: { id: planId, userId },
    include: { allocations: true },
  })
  if (!plan) return fail('Plan not found or access denied')
  if (plan.status === 'CLOSED') return fail('This month is already closed')

  for (const a of adjustments) {
    if (!Number.isFinite(a.planned) || a.planned < 0) {
      return fail('Adjusted amounts must be zero or greater')
    }
  }
  const ownedAllocations = new Set(plan.allocations.map((a) => a.id))
  const unknown = adjustments.find((a) => !ownedAllocations.has(a.allocationId))
  if (unknown) return fail(`Allocation ${unknown.allocationId} does not belong to this plan`)

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
      data: { status: 'CONFIRMED', confirmedAt: now, safeToSpend: free },
    })
  })

  return ok(await buildPlanView(userId, planId, now))
}

/** Reopen a CONFIRMED plan for editing (back to DRAFT). */
export async function reopenPlanForUser(userId: string, planId: string): Promise<Outcome<void>> {
  const plan = await prisma.monthlyPlan.findFirst({
    where: { id: planId, userId },
    select: { id: true, status: true },
  })
  if (!plan) return fail('Plan not found or access denied')
  if (plan.status === 'CLOSED') return fail('This month is already closed')

  await prisma.monthlyPlan.update({
    where: { id: planId },
    data: { status: 'DRAFT', confirmedAt: null },
  })
  return ok(undefined)
}

/** Close preview: plan vs actual, proposed conclusions, verdict — no writes. */
export async function buildClosePreview(
  userId: string,
  planId: string
): Promise<Outcome<ClosePreview>> {
  const plan = await prisma.monthlyPlan.findFirst({
    where: { id: planId, userId },
    include: { allocations: true },
  })
  if (!plan) return fail('Plan not found or access denied')

  const serPlan = serializePlan(plan)
  const allocations = plan.allocations.map(serializeAllocation)
  const monthStart = monthStartOf(plan.month)
  const context = await getCurrencyContext(userId)
  const actuals = await gatherMonthActuals(userId, monthStart, endOfMonth(monthStart), context)

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
  const proposed = proposeConclusions(
    lines
      .filter((l) => l.kind === 'VARIABLE')
      .map((l) => ({ refId: l.refId, label: l.label, planned: l.planned, actual: l.actual }))
  )
  const setAside = buildSetAside(allocations, serPlan, actuals)

  return ok({
    plan: serPlan,
    lines,
    proposedConclusions: proposed,
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
  })
}
