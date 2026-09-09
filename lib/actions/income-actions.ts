'use server'

/**
 * Server Actions for Income (Phase 1)
 * BUSINESS LOGIC LAYER — orchestration only (auth → service → revalidate).
 * The userId-first logic lives in lib/services/income-service.ts and is shared
 * with the MCP tools.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import {
  archiveIncomeSourceForUser,
  buildIncomeOverview,
  createIncomeSourceForUser,
  recordIncomeForUser,
  updateIncomeSourceForUser,
} from '@/lib/services/income-service'
import { toActionResult } from '@/lib/services/outcome'
import type {
  CreateIncomeSourceInput,
  IncomeOverview,
  RecordIncomeInput,
  SerializedIncomeSource,
  UpdateIncomeSourceInput,
} from '@/types/income-types'
import type { SerializedTransaction } from '@/types/transaction-types'

export interface IncomeActionResult<T> {
  success: boolean
  data?: T
  error?: string
}

function revalidateIncomePages(): void {
  revalidatePath('/income')
  revalidatePath('/plan')
  revalidatePath('/dashboard')
}

/**
 * Create an income source. STABLE sources require an expected amount.
 */
export async function createIncomeSource(
  input: CreateIncomeSourceInput
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await createIncomeSourceForUser(session.user.id, input)
    if (outcome.ok) revalidateIncomePages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in createIncomeSource:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create income source',
    }
  }
}

/**
 * Update an income source (name, type, expected amount/day, active flag).
 */
export async function updateIncomeSource(
  id: string,
  input: UpdateIncomeSourceInput
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await updateIncomeSourceForUser(session.user.id, id, input)
    if (outcome.ok) revalidateIncomePages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in updateIncomeSource:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update income source',
    }
  }
}

/**
 * Archive an income source (soft delete — history stays in the ledger).
 */
export async function archiveIncomeSource(
  id: string
): Promise<IncomeActionResult<SerializedIncomeSource>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await archiveIncomeSourceForUser(session.user.id, id)
    if (outcome.ok) revalidateIncomePages()
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in archiveIncomeSource:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update income source',
    }
  }
}

/**
 * Record an income fact into the ledger. Returns the updated month total.
 */
export async function recordIncome(
  input: RecordIncomeInput
): Promise<IncomeActionResult<{ transaction: SerializedTransaction; monthTotal: number }>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const outcome = await recordIncomeForUser(session.user.id, input)
    if (outcome.ok) {
      revalidatePath('/income')
      revalidatePath('/dashboard')
    }
    return toActionResult(outcome)
  } catch (error) {
    console.error('Error in recordIncome:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record income',
    }
  }
}

/**
 * Everything the /income page needs: sources, current-month facts,
 * and the conservative next-month forecast (R2).
 */
export async function getIncomeOverview(): Promise<IncomeActionResult<IncomeOverview>> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    return { success: true, data: await buildIncomeOverview(session.user.id, new Date()) }
  } catch (error) {
    console.error('Error in getIncomeOverview:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load income overview',
    }
  }
}
