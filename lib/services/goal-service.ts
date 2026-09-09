/**
 * Goals & the emergency fund — userId-first business logic (no session, no
 * revalidation). Shared by the goal Server Actions and the MCP tools.
 *
 * - Goal CRUD + priority ordering (the reserve is protected server-side)
 * - Contributions / withdrawals mirrored into the unified Transaction ledger
 * - The emergency fund: undeletable, auto target, stage advancement
 *
 * The pure math lives in lib/services/goal-math.ts.
 */

import { differenceInCalendarMonths } from 'date-fns'
import prisma from '@/lib/db/prisma'
import {
  calcReserveTarget,
  requiredMonthlyContribution,
  roundMoney,
} from '@/lib/services/goal-math'
import {
  computeProgress,
  reserveExplanation,
  serializeContribution,
  serializeGoal,
} from '@/lib/services/goal-overview'
import {
  notifyGoalAchieved,
  notifyReserveStageReached,
  notifyReserveWithdrawal,
} from '@/lib/services/notification-service'
import { fail, ok, type Outcome } from '@/lib/services/outcome'
import { regenerateCurrentPlan } from '@/lib/services/plan-generation'
import { SUPPORTED_CURRENCIES } from '@/lib/services/quick-add'
import { computeMandatoryMonthly } from '@/lib/services/reserve-target-service'
import type {
  ContributeInput,
  CreateGoalInput,
  GoalDetail,
  SerializedGoal,
  UpdateGoalInput,
  WithdrawInput,
} from '@/types/goal-types'

export function validateGoalInput(input: CreateGoalInput): string | null {
  if (!input.name?.trim()) return 'Goal name is required'
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return 'Target amount must be greater than zero'
  }
  const currency = input.currency || 'GEL'
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return 'Unsupported currency'
  }
  if (
    input.monthlyContribution != null &&
    (!Number.isFinite(input.monthlyContribution) || input.monthlyContribution <= 0)
  ) {
    return 'Monthly contribution must be greater than zero'
  }
  if (
    input.targetDate != null &&
    (!(input.targetDate instanceof Date) || isNaN(input.targetDate.getTime()))
  ) {
    return 'Invalid target date'
  }
  return null
}

/**
 * Create a user goal. When a target date is given the required monthly
 * contribution is derived and stored as the plan (so the goal can later fall
 * "behind"); a contribution-only goal keeps no deadline. New goals go to the
 * end of the priority order (after the reserve) and start as PROPOSED.
 */
export async function createGoalForUser(
  userId: string,
  input: CreateGoalInput,
  now: Date = new Date()
): Promise<Outcome<SerializedGoal>> {
  const validationError = validateGoalInput(input)
  if (validationError) return fail(validationError)

  const currency = input.currency || 'GEL'
  const targetAmount = roundMoney(input.targetAmount)
  const targetDate = input.targetDate ?? null
  let monthlyContribution = input.monthlyContribution ?? null

  // Deadline given but no explicit plan → lock in the required contribution
  if (targetDate && monthlyContribution == null) {
    const monthsLeft = differenceInCalendarMonths(targetDate, now)
    monthlyContribution = requiredMonthlyContribution(targetAmount, monthsLeft)
  }

  const maxPriority = await prisma.goal.aggregate({
    where: { userId },
    _max: { priority: true },
  })
  const priority = Math.max(2, (maxPriority._max.priority ?? 1) + 1)

  const goal = await prisma.goal.create({
    data: {
      userId,
      name: input.name.trim(),
      targetAmount,
      currency,
      targetDate,
      monthlyContribution,
      priority,
      // A new goal starts on the wishlist: full analytics, but excluded from
      // the plan (and Safe-to-Spend) until the user approves it.
      status: 'PROPOSED',
    },
  })

  return ok(serializeGoal(goal))
}

/**
 * Approve a proposed (wishlist) goal: promote it to ACTIVE so it enters the
 * monthly plan's waterfall. Refreshes the current month's plan (a CLOSED month
 * is left untouched — `planRefreshed` tells the caller).
 */
export async function approveGoalForUser(
  userId: string,
  id: string
): Promise<Outcome<{ goal: SerializedGoal; planRefreshed: boolean }>> {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return fail('Goal not found or access denied')
  if (existing.isEmergencyFund) return fail('The emergency fund is managed automatically')
  if (existing.status !== 'PROPOSED') return fail('Only proposed goals can be approved')

  const updated = await prisma.goal.update({ where: { id }, data: { status: 'ACTIVE' } })

  // Recompute the current month's plan so Safe-to-Spend reflects the newly-
  // active goal. Never throws; false for a closed month.
  const planRefreshed = await regenerateCurrentPlan(userId)

  return ok({ goal: serializeGoal(updated), planRefreshed })
}

/**
 * Update a user goal. The emergency fund is managed automatically and rejects
 * manual edits (target/date/priority) here.
 */
export async function updateGoalForUser(
  userId: string,
  id: string,
  input: UpdateGoalInput
): Promise<Outcome<SerializedGoal>> {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return fail('Goal not found or access denied')
  if (existing.isEmergencyFund) return fail('The emergency fund is managed automatically')

  if (input.name !== undefined && !input.name.trim()) return fail('Goal name is required')
  if (
    input.targetAmount !== undefined &&
    (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0)
  ) {
    return fail('Target amount must be greater than zero')
  }
  if (
    input.monthlyContribution != null &&
    (!Number.isFinite(input.monthlyContribution) || input.monthlyContribution <= 0)
  ) {
    return fail('Monthly contribution must be greater than zero')
  }
  if (
    input.targetDate != null &&
    (!(input.targetDate instanceof Date) || isNaN(input.targetDate.getTime()))
  ) {
    return fail('Invalid target date')
  }

  const goal = await prisma.goal.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      targetAmount: input.targetAmount !== undefined ? roundMoney(input.targetAmount) : undefined,
      targetDate: input.targetDate !== undefined ? input.targetDate : undefined,
      monthlyContribution:
        input.monthlyContribution !== undefined ? input.monthlyContribution : undefined,
    },
  })

  // A changed target/date/contribution changes this goal's required set-aside
  // → re-derive the current month's plan (Phase 4b event-driven refresh).
  await regenerateCurrentPlan(userId)

  return ok(serializeGoal(goal))
}

/**
 * Archive a goal (soft delete — ledger history stays intact).
 * The emergency fund cannot be archived.
 */
export async function archiveGoalForUser(userId: string, id: string): Promise<Outcome<void>> {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return fail('Goal not found or access denied')
  if (existing.isEmergencyFund) return fail('The emergency fund cannot be deleted')

  await prisma.goal.update({ where: { id }, data: { status: 'ARCHIVED' } })

  // Removing an active goal frees up its set-aside → re-derive the plan.
  await regenerateCurrentPlan(userId)

  return ok(undefined)
}

/**
 * Reorder goal priorities. The reserve stays #1; the given ids are assigned
 * 2,3,4… in order. Ids that are the reserve, proposed, or belong to another
 * user are ignored. Returns the ids that were actually reordered.
 */
export async function reorderGoalsForUser(
  userId: string,
  orderedIds: string[]
): Promise<Outcome<{ orderedIds: string[] }>> {
  // Only active goals carry a plan priority; proposed (wishlist) goals are
  // excluded so approving one later doesn't reshuffle the active order.
  const goals = await prisma.goal.findMany({
    where: {
      userId,
      isEmergencyFund: false,
      status: { in: ['ACTIVE', 'ACHIEVED'] },
    },
    select: { id: true },
  })
  const owned = new Set(goals.map((g) => g.id))
  const ordered = orderedIds.filter((id) => owned.has(id))

  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.goal.update({ where: { id }, data: { priority: index + 2 } })
    )
  )

  return ok({ orderedIds: ordered })
}

/** Full detail for one goal: the contribution/withdrawal ledger + progress. */
export async function getGoalDetailForUser(
  userId: string,
  id: string
): Promise<Outcome<GoalDetail>> {
  const goal = await prisma.goal.findFirst({
    where: { id, userId },
    include: { contributions: { orderBy: { date: 'asc' } } },
  })
  if (!goal) return fail('Goal not found or access denied')

  return ok({
    goal: serializeGoal(goal),
    contributions: goal.contributions.map(serializeContribution),
    progress: computeProgress(goal, goal.contributions),
    reserve: reserveExplanation(goal),
  })
}

// --- contributions & withdrawals ---------------------------------------------

/** Sum of a goal's signed contributions (saved so far). */
async function sumSaved(goalId: string): Promise<number> {
  const agg = await prisma.goalContribution.aggregate({
    where: { goalId },
    _sum: { amount: true },
  })
  return roundMoney(Number(agg._sum.amount ?? 0))
}

/**
 * Contribute to a goal: record a positive GoalContribution and mirror it into
 * the ledger as an EXPENSE (money moved from spendable into savings) — atomic.
 * Crossing the target fires the milestone: reserve → stage notification (stays
 * ACTIVE); normal goal → status ACHIEVED + notification.
 */
export async function contributeToGoalForUser(
  userId: string,
  goalId: string,
  input: ContributeInput,
  now: Date = new Date()
): Promise<Outcome<{ achieved: boolean }>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail('Amount must be greater than zero')
  }

  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) return fail('Goal not found or access denied')

  const amount = roundMoney(input.amount)
  const date = input.date ?? now
  const target = Number(goal.targetAmount)

  const prevSaved = await sumSaved(goalId)

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'EXPENSE',
        amount,
        currency: goal.currency,
        date,
        description: goal.name,
        entrySource: 'MANUAL',
      },
    })
    await tx.goalContribution.create({
      data: { goalId, amount, date, transactionId: transaction.id },
    })
  })

  const newSaved = roundMoney(prevSaved + amount)
  const crossed = target > 0 && prevSaved < target && newSaved >= target
  let achieved = false

  if (crossed) {
    if (goal.isEmergencyFund) {
      try {
        await notifyReserveStageReached(userId, goal.reserveStage ?? 1)
      } catch (error) {
        console.error('Error notifying reserve stage:', error)
      }
    } else {
      achieved = true
      await prisma.goal.update({ where: { id: goalId }, data: { status: 'ACHIEVED' } })
      try {
        await notifyGoalAchieved(userId, goal.name)
      } catch (error) {
        console.error('Error notifying goal achieved:', error)
      }
    }
  }

  // A contribution lowers the goal's remaining balance → its required
  // set-aside for the rest of the month shrinks. Re-derive the plan.
  await regenerateCurrentPlan(userId)

  return ok({ achieved })
}

/**
 * Withdraw from a goal: a deliberate action requiring a reason. Records a
 * negative GoalContribution and mirrors it into the ledger as INCOME (money
 * returned to spendable) — atomic. Cannot exceed the amount saved.
 */
export async function withdrawFromGoalForUser(
  userId: string,
  goalId: string,
  input: WithdrawInput,
  now: Date = new Date()
): Promise<Outcome<void>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail('Amount must be greater than zero')
  }
  if (!input.reason?.trim()) return fail('A reason is required to withdraw')

  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) return fail('Goal not found or access denied')

  const amount = roundMoney(input.amount)
  const reason = input.reason.trim()
  const date = input.date ?? now

  const saved = await sumSaved(goalId)
  if (amount > saved) return fail('Cannot withdraw more than the saved amount')

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'INCOME',
        amount,
        currency: goal.currency,
        date,
        description: `${goal.name} — withdrawal`,
        entrySource: 'MANUAL',
      },
    })
    await tx.goalContribution.create({
      data: { goalId, amount: -amount, date, reason, transactionId: transaction.id },
    })
    // Re-open an achieved goal that dropped back below its target
    if (goal.status === 'ACHIEVED' && saved - amount < Number(goal.targetAmount)) {
      await tx.goal.update({ where: { id: goalId }, data: { status: 'ACTIVE' } })
    }
  })

  try {
    await notifyReserveWithdrawal(userId, {
      goalName: goal.name,
      amount,
      currency: goal.currency,
      reason,
    })
  } catch (error) {
    console.error('Error notifying withdrawal:', error)
  }

  // A withdrawal raises the goal's remaining balance → its required set-aside
  // grows again. Re-derive the plan.
  await regenerateCurrentPlan(userId)

  return ok(undefined)
}

// --- reserve management ------------------------------------------------------

/**
 * Advance the reserve from the 1-month stage to the 3-month stage (user
 * confirmation). Retargets to 3× mandatory monthly and re-activates the fund.
 */
export async function advanceReserveStageForUser(
  userId: string,
  goalId: string
): Promise<Outcome<SerializedGoal>> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, isEmergencyFund: true },
  })
  if (!goal) return fail('Emergency fund not found')
  if (goal.reserveStage === 3) return fail('Already at the 3-month stage')

  const { mandatoryMonthly } = await computeMandatoryMonthly(userId)
  const newTarget = calcReserveTarget(mandatoryMonthly, 3)

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { reserveStage: 3, targetAmount: newTarget, status: 'ACTIVE' },
  })

  // A larger reserve target raises the reserve's required set-aside → re-derive.
  await regenerateCurrentPlan(userId)

  return ok(serializeGoal(updated))
}
