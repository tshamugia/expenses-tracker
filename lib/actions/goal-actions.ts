'use server'

/**
 * Server Actions for Goals & the Emergency Fund (Phase 3)
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * The userId-first logic lives in lib/services/goal-service.ts and is shared
 * with the MCP tools; the pure math in lib/services/goal-math.ts.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import {
  advanceReserveStageForUser,
  approveGoalForUser,
  archiveGoalForUser,
  contributeToGoalForUser,
  createGoalForUser,
  getGoalDetailForUser,
  reorderGoalsForUser,
  updateGoalForUser,
  withdrawFromGoalForUser,
} from '@/lib/services/goal-service'
import { buildGoalsOverview, ensureReserveExists } from '@/lib/services/goal-overview'
import { toActionResult } from '@/lib/services/outcome'
import { recalcReserveTargetForUser } from '@/lib/services/reserve-target-service'
import type {
  ContributeInput,
  CreateGoalInput,
  GoalDetail,
  GoalsOverview,
  SerializedGoal,
  UpdateGoalInput,
  WithdrawInput,
} from '@/types/goal-types'

export interface GoalActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

function revalidateGoalPages(extra: string[] = []): void {
  revalidatePath('/goals')
  revalidatePath('/plan')
  revalidatePath('/dashboard')
  for (const path of extra) revalidatePath(path)
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

/**
 * Create a user goal (starts on the wishlist as PROPOSED).
 */
export async function createGoal(
  input: CreateGoalInput
): Promise<GoalActionResult<SerializedGoal>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await createGoalForUser(session.user.id, input)
    if (outcome.ok) {
      revalidatePath('/goals')
      revalidatePath('/dashboard')
    }
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in createGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create goal',
    }
  }
}

/**
 * Approve a proposed (wishlist) goal: promote it to ACTIVE so it enters the
 * monthly plan's waterfall. `planRefreshed` says whether the current month's
 * plan was recomputed (a CLOSED month is left untouched).
 */
export async function approveGoal(
  id: string
): Promise<GoalActionResult<{ goal: SerializedGoal; planRefreshed: boolean }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await approveGoalForUser(session.user.id, id)
    if (outcome.ok) revalidateGoalPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in approveGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve goal',
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

    const outcome = await updateGoalForUser(session.user.id, id, input)
    if (outcome.ok) revalidateGoalPages()
    return toActionResult(outcome)
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

    const outcome = await archiveGoalForUser(session.user.id, id)
    if (outcome.ok) revalidateGoalPages()
    return toActionResult(outcome)
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

    const outcome = await reorderGoalsForUser(session.user.id, orderedIds)
    if (!outcome.ok) return { success: false, error: outcome.error }

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
    const data = await buildGoalsOverview(session.user.id, new Date())
    return { success: true, data }
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
    return toActionResult(await getGoalDetailForUser(session.user.id, id))
  } catch (error) {
    console.error('Error in getGoalDetail:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load goal',
    }
  }
}

// --- contributions & withdrawals ---------------------------------------------

/**
 * Contribute to a goal (mirrored into the ledger as an EXPENSE — atomic).
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

    const outcome = await contributeToGoalForUser(session.user.id, goalId, input)
    if (outcome.ok) revalidateGoalPages(['/expenses'])
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in contributeToGoal:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to contribute',
    }
  }
}

/**
 * Withdraw from a goal (requires a reason; mirrored into the ledger as INCOME).
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

    const outcome = await withdrawFromGoalForUser(session.user.id, goalId, input)
    if (outcome.ok) revalidateGoalPages(['/income'])
    return toActionResult(outcome)
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

    const outcome = await advanceReserveStageForUser(session.user.id, goalId)
    if (outcome.ok) revalidateGoalPages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in advanceReserveStage:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to advance stage',
    }
  }
}
