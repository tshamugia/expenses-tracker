/**
 * Plan generation glue (Phase 4). Shared by the `generateMonthlyPlan` Server
 * Action and the monthly cron so both build a DRAFT the same way. Runs the pure
 * waterfall (D3 — our engine) and persists a DRAFT, overwriting an existing
 * draft but never a confirmed/closed month.
 */

import prisma from '@/lib/db/prisma'
import { generatePlan, type PlanResult } from '@/lib/services/plan-engine'
import { gatherPlanInput } from '@/lib/services/plan-input'

export interface GenerateResult {
  planId: string | null
  skipped: boolean
  reason?: 'confirmed' | 'closed'
  result?: PlanResult
}

/**
 * Generate + persist the month's ACTIVE plan for one user (Phase 4b — the plan is
 * fully automatic; there is no manual confirm step). A non-closed month is always
 * regenerated to reflect the current goals/income; a CLOSED month is left
 * untouched (returns skipped). `referenceDate` measures goal deadlines (today when
 * the caller passes it, else the month start).
 */
export async function generatePlanForUser(
  userId: string,
  month: string,
  referenceDate?: Date
): Promise<GenerateResult> {
  const existing = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month } },
    select: { id: true, status: true },
  })
  if (existing && existing.status === 'CLOSED') {
    return { planId: null, skipped: true, reason: 'closed' }
  }

  const gathered = await gatherPlanInput(userId, month, referenceDate)
  const result = generatePlan(gathered.input)

  const created = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.planAllocation.deleteMany({ where: { planId: existing.id } })
      await tx.monthlyPlan.delete({ where: { id: existing.id } })
    }
    return tx.monthlyPlan.create({
      data: {
        userId,
        month,
        // Active immediately — no DRAFT/confirm in the goal-driven model.
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        forecastIncome: gathered.input.forecast.total,
        forecastStable: gathered.input.forecast.stableTotal,
        forecastVariable: gathered.input.forecast.variableEstimate,
        safeToSpend: result.safeToSpendMonth,
        currency: gathered.currency,
        allocations: {
          create: result.allocations.map((al) => ({
            kind: al.kind,
            refId: al.refId,
            label: al.label,
            planned: al.planned,
          })),
        },
      },
      select: { id: true },
    })
  })

  return { planId: created.id, skipped: false, result }
}
