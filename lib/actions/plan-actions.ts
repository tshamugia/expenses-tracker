'use server'

/**
 * Server Actions for the Monthly Plan (Phase 4)
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * The userId-first logic lives in lib/services/plan-service.ts (shared with
 * the MCP tools); the money math in the pure engines (plan-engine, verdict,
 * stability, month-close).
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { toActionResult } from '@/lib/services/outcome'
import { closePlanForUser } from '@/lib/services/plan-close'
import { generatePlanForUser } from '@/lib/services/plan-generation'
import { toMonthKey } from '@/lib/services/plan-input'
import {
  buildClosePreview,
  confirmPlanForUser,
  regeneratePlanForUser,
  reopenPlanForUser,
} from '@/lib/services/plan-service'
import {
  buildDashboardData,
  buildPlanView,
  computeStabilityProgress,
} from '@/lib/services/plan-view'
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

function revalidatePlanPages(): void {
  revalidatePath('/plan')
  revalidatePath('/dashboard')
}

// --- generate / confirm ------------------------------------------------------

/**
 * (Re)generate the current month's active plan from the goals (Phase 4b). The
 * plan is automatic, so this is just a manual refresh; a CLOSED month is
 * protected.
 */
export async function generateMonthlyPlan(
  month?: string
): Promise<PlanActionResult<PlanView>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const outcome = await regeneratePlanForUser(session.user.id, month, new Date())
    if (outcome.ok) revalidatePlanPages()
    return toActionResult(outcome)
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
 * (deficit resolution / inline edits). One action — G1: ≤1 minute.
 */
export async function confirmPlan(
  planId: string,
  adjustments: ConfirmAdjustment[] = []
): Promise<PlanActionResult<PlanView>> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

    const outcome = await confirmPlanForUser(session.user.id, planId, adjustments, new Date())
    if (outcome.ok) revalidatePlanPages()
    return toActionResult(outcome)
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

    const outcome = await reopenPlanForUser(session.user.id, planId)
    if (outcome.ok) revalidatePath('/plan')
    return toActionResult(outcome)
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
    return toActionResult(await buildClosePreview(session.user.id, planId))
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

    revalidatePlanPages()

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
    const data = await computeStabilityProgress(session.user.id, new Date())
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
