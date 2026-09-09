/**
 * Goal serialization, emergency-fund bootstrap and overview builder (Phase 3).
 * DATA-ACCESS + ASSEMBLY LAYER — userId-first, no session, no revalidation.
 * Shared by lib/actions/goal-actions.ts and the MCP server. The pure math
 * lives in goal-math.ts / goal-plan-impact.ts.
 */

import type { Goal, GoalContribution } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { getServerTranslator } from '@/i18n/server-translator'
import {
  calcGoalProgress,
  calcReserveTarget,
  roundMoney,
  type GoalProgress,
} from '@/lib/services/goal-math'
import { computeMandatoryMonthly } from '@/lib/services/reserve-target-service'
import { gatherPlanInput, toMonthKey } from '@/lib/services/plan-input'
import { computeGoalWhatIf } from '@/lib/services/goal-plan-impact'
import type {
  GoalListItem,
  GoalsOverview,
  GoalWhatIf,
  ReserveExplanation,
  SerializedContribution,
  SerializedGoal,
} from '@/types/goal-types'

// --- serialization helpers ---------------------------------------------------

export function serializeGoal(goal: Goal): SerializedGoal {
  // Strip any included relation (e.g. `contributions`) so raw Decimal amounts
  // never ride along into the client payload via the spread below.
  const { contributions: _contributions, ...scalars } = goal as Goal & {
    contributions?: unknown
  }
  return {
    ...scalars,
    targetAmount: Number(goal.targetAmount),
    monthlyContribution:
      goal.monthlyContribution === null ? null : Number(goal.monthlyContribution),
  }
}

export function serializeContribution(c: GoalContribution): SerializedContribution {
  return { ...c, amount: Number(c.amount) }
}

export function computeProgress(
  goal: Goal,
  contributions: { amount: unknown }[],
  now: Date = new Date()
): GoalProgress {
  return calcGoalProgress(
    {
      targetAmount: Number(goal.targetAmount),
      targetDate: goal.targetDate,
      monthlyContribution:
        goal.monthlyContribution === null
          ? null
          : Number(goal.monthlyContribution),
    },
    contributions.map((c) => ({ amount: Number(c.amount) })),
    now
  )
}

/** Reserve explanation ("1 month of mandatory expense = target / stage"). */
export function reserveExplanation(goal: Goal): ReserveExplanation | undefined {
  if (!goal.isEmergencyFund) return undefined
  const stage = goal.reserveStage ?? 1
  const target = Number(goal.targetAmount)
  return {
    stage,
    mandatoryMonthly: stage > 0 ? roundMoney(target / stage) : 0,
  }
}

// --- emergency fund creation (idempotent) ------------------------------------

/**
 * Create the reserve goal for a user if it does not exist yet (idempotent).
 * Stage 1, priority 1, target derived from mandatory monthly expense. Plain
 * helper (not an action) so getGoals can guarantee the fund on first load.
 */
export async function ensureReserveExists(userId: string): Promise<void> {
  const existing = await prisma.goal.findFirst({
    where: { userId, isEmergencyFund: true },
    select: { id: true },
  })
  if (existing) return

  const [{ mandatoryMonthly, context }, t] = await Promise.all([
    computeMandatoryMonthly(userId),
    getServerTranslator('Goals'),
  ])

  // Guard against a race (two first-loads): unique-ish create, ignore dupes
  try {
    await prisma.goal.create({
      data: {
        userId,
        name: t('reserveName'),
        targetAmount: calcReserveTarget(mandatoryMonthly, 1),
        currency: context.defaultCurrency,
        priority: 1,
        isEmergencyFund: true,
        reserveStage: 1,
      },
    })
  } catch (error) {
    // If a concurrent request already created it, that's fine
    const stillMissing = await prisma.goal.count({
      where: { userId, isEmergencyFund: true },
    })
    if (stillMissing === 0) throw error
  }
}

// --- overview ----------------------------------------------------------------

/**
 * Goals overview (reserve first, then by priority) with progress and, for
 * PROPOSED goals, the Safe-to-Spend what-if. Ensures the emergency fund exists.
 */
export async function buildGoalsOverview(userId: string, now: Date = new Date()): Promise<GoalsOverview> {
  await ensureReserveExists(userId)

  const [goals, preference] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      include: { contributions: { select: { amount: true } } },
      orderBy: [{ isEmergencyFund: 'desc' }, { priority: 'asc' }],
    }),
    prisma.notificationPreference.findUnique({
      where: { userId },
      select: { defaultCurrency: true },
    }),
  ])

  const items: GoalListItem[] = goals.map((goal) => ({
    goal: serializeGoal(goal),
    progress: computeProgress(goal, goal.contributions, now),
    reserve: reserveExplanation(goal),
  }))

  // For proposed (wishlist) goals, preview how approving each would lower this
  // month's Safe-to-Spend. The plan input already excludes proposed goals, so
  // appending a candidate to the waterfall gives an honest before/after. Only
  // gather the (heavier) plan input when there is at least one proposed goal.
  const hasProposed = goals.some(
    (g) => g.status === 'PROPOSED' && !g.isEmergencyFund
  )
  if (hasProposed) {
    try {
      const gathered = await gatherPlanInput(userId, toMonthKey(now))
      for (let i = 0; i < goals.length; i++) {
        const g = goals[i]
        if (g.status !== 'PROPOSED' || g.isEmergencyFund) continue
        const saved = roundMoney(
          g.contributions.reduce((s, c) => s + Number(c.amount), 0)
        )
        const remaining = Math.max(0, roundMoney(Number(g.targetAmount) - saved))
        const monthlyContribution =
          g.monthlyContribution === null ? 0 : Number(g.monthlyContribution)
        const impact = computeGoalWhatIf(gathered.input, {
          monthlyContribution,
          remaining,
          priority: g.priority,
        })
        const whatIf: GoalWhatIf = {
          safeBefore: impact.safeBefore,
          safeAfter: impact.safeAfter,
          deltaMonthly: impact.deltaMonthly,
        }
        items[i].whatIf = whatIf
      }
    } catch (error) {
      // What-if is a nicety — never fail the whole overview over it.
      console.error('Error computing proposed-goal what-if:', error)
    }
  }

  return {
      goals: items,
      defaultCurrency: preference?.defaultCurrency || 'GEL',
  }
}
