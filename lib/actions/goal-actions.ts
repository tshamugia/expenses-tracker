'use server'

/**
 * Server Actions for Goals & the Emergency Fund (Phase 3)
 * BUSINESS LOGIC LAYER
 * - Goal CRUD + priority ordering (the reserve is protected server-side)
 * - Contributions / withdrawals mirrored into the unified Transaction ledger
 * - The emergency fund: idempotent creation, auto target, stage advancement
 *
 * The pure math lives in lib/services/goal-math.ts; these actions only
 * orchestrate (auth → fetch → engine → persist → revalidate).
 */

import { revalidatePath } from 'next/cache'
import { differenceInCalendarMonths } from 'date-fns'
import type { Goal, GoalContribution } from '@prisma/client'
import { auth } from '@/auth'
import prisma from '@/lib/db/prisma'
import { getServerTranslator } from '@/i18n/server-translator'
import {
  calcGoalProgress,
  calcReserveTarget,
  requiredMonthlyContribution,
  roundMoney,
  type GoalProgress,
} from '@/lib/services/goal-math'
import {
  computeMandatoryMonthly,
  recalcReserveTargetForUser,
} from '@/lib/services/reserve-target-service'
import {
  notifyGoalAchieved,
  notifyReserveStageReached,
  notifyReserveWithdrawal,
} from '@/lib/services/notification-service'
import type {
  ContributeInput,
  CreateGoalInput,
  GoalDetail,
  GoalListItem,
  GoalsOverview,
  ReserveExplanation,
  SerializedContribution,
  SerializedGoal,
  UpdateGoalInput,
  WithdrawInput,
} from '@/types/goal-types'

export interface GoalActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

const SUPPORTED_CURRENCIES = ['GEL', 'USD', 'EUR']

// --- serialization helpers ---------------------------------------------------

function serializeGoal(goal: Goal): SerializedGoal {
  return {
    ...goal,
    targetAmount: Number(goal.targetAmount),
    monthlyContribution:
      goal.monthlyContribution === null ? null : Number(goal.monthlyContribution),
  }
}

function serializeContribution(c: GoalContribution): SerializedContribution {
  return { ...c, amount: Number(c.amount) }
}

function computeProgress(
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
function reserveExplanation(goal: Goal): ReserveExplanation | undefined {
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
async function ensureReserveExists(userId: string): Promise<void> {
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

/**
 * Public action: ensure the current user's emergency fund exists.
 * Safe to call on login / first page load; idempotent.
 */
export async function ensureEmergencyFund(): Promise<GoalActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    await ensureReserveExists(session.user.id)
    return { success: true }
  } catch (error) {
    console.error('Error in ensureEmergencyFund:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to ensure fund',
    }
  }
}

// --- CRUD --------------------------------------------------------------------

function validateGoalInput(input: CreateGoalInput): string | null {
  if (!input.name?.trim()) return 'Goal name is required'
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return 'Target amount must be greater than zero'
  }
  const currency = input.currency || 'GEL'
  if (!SUPPORTED_CURRENCIES.includes(currency)) return 'Unsupported currency'
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
 * end of the priority order (after the reserve).
 */
export async function createGoal(
  input: CreateGoalInput
): Promise<GoalActionResult<SerializedGoal>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const validationError = validateGoalInput(input)
    if (validationError) {
      return { success: false, error: validationError }
    }

    const currency = input.currency || 'GEL'
    const targetAmount = roundMoney(input.targetAmount)
    const targetDate = input.targetDate ?? null
    let monthlyContribution = input.monthlyContribution ?? null

    // Deadline given but no explicit plan → lock in the required contribution
    if (targetDate && monthlyContribution == null) {
      const monthsLeft = differenceInCalendarMonths(targetDate, new Date())
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
      },
    })

    revalidatePath('/goals')
    revalidatePath('/dashboard')

    return { success: true, data: serializeGoal(goal) }
  } catch (error) {
    console.error('Error in createGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create goal',
    }
  }
}

/**
 * Update a user goal. The emergency fund is managed automatically and rejects
 * manual edits (target/date/priority) here.
 */
export async function updateGoal(
  id: string,
  input: UpdateGoalInput
): Promise<GoalActionResult<SerializedGoal>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const existing = await prisma.goal.findFirst({ where: { id, userId } })
    if (!existing) {
      return { success: false, error: 'Goal not found or access denied' }
    }
    if (existing.isEmergencyFund) {
      return {
        success: false,
        error: 'The emergency fund is managed automatically',
      }
    }

    if (input.name !== undefined && !input.name.trim()) {
      return { success: false, error: 'Goal name is required' }
    }
    if (
      input.targetAmount !== undefined &&
      (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0)
    ) {
      return { success: false, error: 'Target amount must be greater than zero' }
    }
    if (
      input.monthlyContribution != null &&
      (!Number.isFinite(input.monthlyContribution) ||
        input.monthlyContribution <= 0)
    ) {
      return {
        success: false,
        error: 'Monthly contribution must be greater than zero',
      }
    }

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        targetAmount:
          input.targetAmount !== undefined
            ? roundMoney(input.targetAmount)
            : undefined,
        targetDate: input.targetDate !== undefined ? input.targetDate : undefined,
        monthlyContribution:
          input.monthlyContribution !== undefined
            ? input.monthlyContribution
            : undefined,
      },
    })

    revalidatePath('/goals')
    revalidatePath('/dashboard')

    return { success: true, data: serializeGoal(goal) }
  } catch (error) {
    console.error('Error in updateGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update goal',
    }
  }
}

/**
 * Archive a goal (soft delete — ledger history stays intact).
 * The emergency fund cannot be archived.
 */
export async function archiveGoal(id: string): Promise<GoalActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const existing = await prisma.goal.findFirst({ where: { id, userId } })
    if (!existing) {
      return { success: false, error: 'Goal not found or access denied' }
    }
    if (existing.isEmergencyFund) {
      return { success: false, error: 'The emergency fund cannot be deleted' }
    }

    await prisma.goal.update({ where: { id }, data: { status: 'ARCHIVED' } })

    revalidatePath('/goals')
    revalidatePath('/dashboard')

    return { success: true }
  } catch (error) {
    console.error('Error in archiveGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive goal',
    }
  }
}

/**
 * Reorder goal priorities. The reserve stays #1; the given ids are assigned
 * 2,3,4… in order. Ids that are the reserve or belong to another user are
 * ignored.
 */
export async function reorderGoals(
  orderedIds: string[]
): Promise<GoalActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const goals = await prisma.goal.findMany({
      where: { userId, isEmergencyFund: false, status: { not: 'ARCHIVED' } },
      select: { id: true },
    })
    const owned = new Set(goals.map((g) => g.id))
    const ordered = orderedIds.filter((id) => owned.has(id))

    await prisma.$transaction(
      ordered.map((id, index) =>
        prisma.goal.update({ where: { id }, data: { priority: index + 2 } })
      )
    )

    revalidatePath('/goals')
    return { success: true }
  } catch (error) {
    console.error('Error in reorderGoals:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reorder goals',
    }
  }
}

// --- queries -----------------------------------------------------------------

/**
 * Goals overview: the reserve (always first) + active goals in priority order,
 * each with a computed progress snapshot. Ensures the reserve exists first.
 */
export async function getGoals(): Promise<GoalActionResult<GoalsOverview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

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

    const now = new Date()
    const items: GoalListItem[] = goals.map((goal) => ({
      goal: serializeGoal(goal),
      progress: computeProgress(goal, goal.contributions, now),
      reserve: reserveExplanation(goal),
    }))

    return {
      success: true,
      data: {
        goals: items,
        defaultCurrency: preference?.defaultCurrency || 'GEL',
      },
    }
  } catch (error) {
    console.error('Error in getGoals:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load goals',
    }
  }
}

/**
 * Full detail for one goal: the contribution/withdrawal ledger + progress.
 */
export async function getGoalDetail(
  id: string
): Promise<GoalActionResult<GoalDetail>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const goal = await prisma.goal.findFirst({
      where: { id, userId },
      include: { contributions: { orderBy: { date: 'asc' } } },
    })
    if (!goal) {
      return { success: false, error: 'Goal not found or access denied' }
    }

    return {
      success: true,
      data: {
        goal: serializeGoal(goal),
        contributions: goal.contributions.map(serializeContribution),
        progress: computeProgress(goal, goal.contributions),
        reserve: reserveExplanation(goal),
      },
    }
  } catch (error) {
    console.error('Error in getGoalDetail:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load goal',
    }
  }
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
export async function contributeToGoal(
  goalId: string,
  input: ContributeInput
): Promise<GoalActionResult<{ achieved: boolean }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }

    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!goal) {
      return { success: false, error: 'Goal not found or access denied' }
    }

    const amount = roundMoney(input.amount)
    const date = input.date ?? new Date()
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
        await prisma.goal.update({
          where: { id: goalId },
          data: { status: 'ACHIEVED' },
        })
        try {
          await notifyGoalAchieved(userId, goal.name)
        } catch (error) {
          console.error('Error notifying goal achieved:', error)
        }
      }
    }

    revalidatePath('/goals')
    revalidatePath('/dashboard')
    revalidatePath('/expenses')

    return { success: true, data: { achieved } }
  } catch (error) {
    console.error('Error in contributeToGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to contribute',
    }
  }
}

/**
 * Withdraw from a goal: a deliberate action requiring a reason. Records a
 * negative GoalContribution and mirrors it into the ledger as INCOME (money
 * returned to spendable) — atomic. Cannot exceed the amount saved.
 */
export async function withdrawFromGoal(
  goalId: string,
  input: WithdrawInput
): Promise<GoalActionResult<void>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' }
    }
    if (!input.reason?.trim()) {
      return { success: false, error: 'A reason is required to withdraw' }
    }

    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
    if (!goal) {
      return { success: false, error: 'Goal not found or access denied' }
    }

    const amount = roundMoney(input.amount)
    const reason = input.reason.trim()
    const date = input.date ?? new Date()

    const saved = await sumSaved(goalId)
    if (amount > saved) {
      return { success: false, error: 'Cannot withdraw more than the saved amount' }
    }

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
        data: {
          goalId,
          amount: -amount,
          date,
          reason,
          transactionId: transaction.id,
        },
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

    revalidatePath('/goals')
    revalidatePath('/dashboard')
    revalidatePath('/income')

    return { success: true }
  } catch (error) {
    console.error('Error in withdrawFromGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw',
    }
  }
}

// --- reserve management ------------------------------------------------------

/**
 * Recompute the current user's reserve target now (manual "refresh" button).
 * Same engine as the daily cron; notifies on a >±10% move.
 */
export async function recalcReserveTarget(): Promise<
  GoalActionResult<{ newTarget: number; changed: boolean }>
> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const result = await recalcReserveTargetForUser(session.user.id)
    if (!result) {
      return { success: false, error: 'No emergency fund to recompute' }
    }

    revalidatePath('/goals')
    return {
      success: true,
      data: { newTarget: result.newTarget, changed: result.changed },
    }
  } catch (error) {
    console.error('Error in recalcReserveTarget:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to recompute',
    }
  }
}

/**
 * Advance the reserve from the 1-month stage to the 3-month stage (user
 * confirmation). Retargets to 3× mandatory monthly and re-activates the fund.
 */
export async function advanceReserveStage(
  goalId: string
): Promise<GoalActionResult<SerializedGoal>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    const userId = session.user.id

    const goal = await prisma.goal.findFirst({
      where: { id: goalId, userId, isEmergencyFund: true },
    })
    if (!goal) {
      return { success: false, error: 'Emergency fund not found' }
    }
    if (goal.reserveStage === 3) {
      return { success: false, error: 'Already at the 3-month stage' }
    }

    const { mandatoryMonthly } = await computeMandatoryMonthly(userId)
    const newTarget = calcReserveTarget(mandatoryMonthly, 3)

    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: { reserveStage: 3, targetAmount: newTarget, status: 'ACTIVE' },
    })

    revalidatePath('/goals')
    revalidatePath('/dashboard')

    return { success: true, data: serializeGoal(updated) }
  } catch (error) {
    console.error('Error in advanceReserveStage:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to advance stage',
    }
  }
}
