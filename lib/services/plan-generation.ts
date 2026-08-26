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
 * Generate + persist a DRAFT plan for one user and month. Idempotent for drafts;
 * a CONFIRMED/CLOSED month is left untouched (returns skipped).
 */
export async function generatePlanForUser(
  userId: string,
  month: string
): Promise<GenerateResult> {
  const existing = await prisma.monthlyPlan.findUnique({
    where: { userId_month: { userId, month } },
    select: { id: true, status: true },
  })
  if (existing && existing.status !== 'DRAFT') {
    return { planId: null, skipped: true, reason: existing.status === 'CLOSED' ? 'closed' : 'confirmed' }
  }

  const gathered = await gatherPlanInput(userId, month)
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
        status: 'DRAFT',
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
