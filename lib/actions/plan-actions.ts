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
import { endOfMonth } from 'date-fns'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { roundMoney } from '@/lib/services/amortization'
import { generatePlanForUser } from '@/lib/services/plan-generation'
import { closePlanForUser } from '@/lib/services/plan-close'
import { calcVerdict } from '@/lib/services/verdict'
import {
  computeCompletionPct,
  proposeConclusions,
} from '@/lib/services/month-close'
import {
  buildCloseLines,
  buildSetAside,
  computePlannedNetChange,
  gatherMonthActuals,
  serializeAllocation,
  serializePlan,
} from '@/lib/services/month-actuals'
import { monthStartOf, toMonthKey } from '@/lib/services/plan-input'
import {
  buildDashboardData,
  buildPlanView,
  computeStabilityProgress,
} from '@/lib/services/plan-view'
import { getCurrencyContext } from '@/lib/services/spend-status-service'
import type {
  ClosePreview,
  CloseDecision,
  ConfirmAdjustment,
  DashboardData,
  PlanView,
  StabilityProgress,
} from '@/types/plan-types'

export interface PlanActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

// --- generate / confirm ------------------------------------------------------

/**
 * (Re)generate the current month's active plan from the goals (Phase 4b). The
 * plan is automatic, so this is just a manual refresh; a CLOSED month is
 * protected. Callers normally never need this — `getActivePlan` generates on
 * first view — but it backs an explicit "refresh" affordance.
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

    const gen = await generatePlanForUser(userId, targetMonth, now)
    if (gen.skipped || !gen.planId) {
      return {
        success: false,
        error: 'This month is already closed — it can no longer be regenerated',
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

    // Phase 4b — the plan is automatic: if the month has none yet, generate it
    // from the current goals/income so the user never has to "create" one.
    if (!plan) {
      const gen = await generatePlanForUser(userId, targetMonth, now)
      if (gen.skipped || !gen.planId) return { success: true, data: null }
      return { success: true, data: await buildPlanView(userId, gen.planId, now) }
    }

    return { success: true, data: await buildPlanView(userId, plan.id, now) }
  } catch (error) {
    console.error('Error in getActivePlan:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load plan' }
  }
}

// --- month close -------------------------------------------------------------

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
    const setAside = buildSetAside(allocations, serPlan, actuals)

    return {
      success: true,
      data: {
        plan: serPlan,
        lines,
        proposedConclusions: proposed,
        verdict: { kind: verdict.verdict, netChange: verdict.netChange, components: verdict.components },
        plannedNetChange,
        completionPct,
        requiredSetAside: setAside.requiredSetAside,
        actualSetAside: setAside.actualSetAside,
        achieved: setAside.achieved,
        defaultCurrency: context.defaultCurrency,
      },
    }
  } catch (error) {
    console.error('Error in getClosePreview:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to preview close' }
  }
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

    const result = await closePlanForUser(session.user.id, planId, decision)
    if (!result.ok) return { success: false, error: result.error }

    revalidatePath('/plan')
    revalidatePath('/dashboard')

    return { success: true, data: result.data }
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

/** The whole dashboard view model (§6.1) in one call. */
export async function getDashboardData(): Promise<PlanActionResult<DashboardData>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }
    const data = await buildDashboardData(session.user.id, new Date())
    return { success: true, data }
  } catch (error) {
    console.error('Error in getDashboardData:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load dashboard' }
  }
}
